"""
DSPy-based meal builder pipeline.
Orchestrates multi-stage meal generation with specialized predictors.

Pipeline stages:
1. Generate regional ingredient list for template-provided dish name
2. Look up nutrition data per 100g (Gemini → Claude fallback)
3. Calculate portions iteratively to hit macro targets
4. Assemble and validate final JSON with auto-correction

Key features:
- Uses template dish names (no generation needed)
- Prioritizes popular, regional ingredients based on client location
- Multi-stage validation and correction for accuracy
"""

import dspy
import json
import os
from typing import List, Dict, Any, Optional
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Global flag to track if DSPy has been configured
_dspy_configured = False
_dspy_lock = None

try:
    import threading
    _dspy_lock = threading.Lock()
except ImportError:
    _dspy_lock = None


# ============================================================================
# DSPy Signatures (Input/Output schemas for each stage)
# ============================================================================

class MealNaming(dspy.Signature):
    """Generate ingredient list (max 7 items) for a given dish.
    
    ⚠️ CRITICAL: ONLY USE REAL, EXISTING, POPULAR INGREDIENTS FROM THE CLIENT'S REGION.
    
    0. REGIONAL & POPULAR INGREDIENTS PRIORITY:
       • Focus on ingredients that are COMMONLY AVAILABLE and POPULAR in the client's region
       • Use brands and products that locals would actually recognize and buy
       • For Israel: Tnuva dairy, Angel bread, Achla hummus, Osem products, etc.
       • For USA: Common US brands (Kraft, Dannon, etc.) and generic produce
       • ONLY use exotic/rare ingredients if the dish name specifically requires them
       • When in doubt, choose the most mainstream, accessible option
    
    1. REAL INGREDIENTS ONLY - VERIFY EVERYTHING:
       • Before suggesting ANY ingredient, verify it's a REAL, COMMONLY AVAILABLE food item in that region
       • Use web search if unsure about ingredient existence or availability - search online to confirm each ingredient is real
    
    2. Client requests are mandatory. Read client_preference FIRST and include every food they explicitly mentioned (even if bilingual).
    3. Allergies/limitations override everything. If a client request conflicts → ignore the request and stay safe.
    4. Dish name = promise. Before finalizing ingredients ask:
       • What dish am I building?
       • What core ingredients define it?
       • Are those ingredients REAL and available in the client's region? Search online if needed to verify.
       • Are those ingredients in my list? If not, add them. (Shakshuka needs tomato base, Carbonara needs pasta/egg/cheese, etc.)
       • If a core ingredient is banned (allergy/limitation) → use clearly adapted version with REAL substitutes.
    5. Ingredient naming conventions:
       • For GENERIC items (no brand needed): Use simple names like "Eggs", "Olive oil", "Cherry tomatoes", "Avocado", "Whole wheat bread", "Salmon", "Chicken breast"
       • For BRANDED/PROCESSED items (typically sold with brands): Include REGIONAL brand + product specification:
         - ⚠️ IF region='israel': ONLY use Israeli brands: "Tnuva Cottage Cheese 5%", "Strauss Yogurt", "Yotvata Milk", "Hummus Achla", "Angel Whole Wheat Bread", "Osem Pasta"
         - ⚠️ IF region='usa': ONLY use USA brands: "Dannon Yogurt", "Kraft Cheese", "Land O'Lakes Butter", "Cheerios", "Quaker Oats"
         - ⚠️ NEVER mix regions: Don't use Tnuva in USA meals or Dannon in Israeli meals
       • Format: "[Regional Brand] [Product Name] [Variant if needed]" - e.g., "Tnuva Cottage Cheese 5%" (Israel), "Kraft Cheese" (USA)
    6. After core items, add complementary ingredients to hit macros using whole foods and REGIONAL brand names popular in that area.
       • Always verify each complementary ingredient is REAL, POPULAR and commonly available in the region before including it
    7. Output EVERYTHING in English only (ingredients list).
    
    SEARCH THE WEB: If you're uncertain whether an ingredient exists, is popular, or is commonly available in the region, search the internet to verify before including it in the output.
    """
    
    meal_type = dspy.InputField(desc="Type of meal")
    dish_name = dspy.InputField(desc="Name of dish to build (provided by template)")
    macro_targets = dspy.InputField(desc="Target macros: {calories, protein, fat, carbs}")
    required_protein_source = dspy.InputField(desc="Required protein source")
    region = dspy.InputField(desc="Client's region (e.g., 'israel', 'usa'). Use brands and ingredients POPULAR in this region.")
    allergies = dspy.InputField(desc="Allergies to avoid")
    limitations = dspy.InputField(desc="Dietary limitations")
    avoid_ingredients = dspy.InputField(desc="Ingredients to avoid for variety")
    client_preference = dspy.InputField(desc="Client's meal description (may be Hebrew/English). Parse and include ALL foods mentioned.")
    
    ingredients = dspy.OutputField(desc='JSON array of REAL, POPULAR, REGIONAL ingredient names (max 7). CRITICAL: Match brands to region EXACTLY - Israel=Tnuva/Strauss/Angel/Achla/Osem, USA=Dannon/Kraft/Land O\'Lakes/Cheerios. NEVER use Israeli brands for USA clients or vice versa. Only include ingredients that actually exist, are POPULAR, and can be found in stores in the client\'s region. Prioritize mainstream/common ingredients unless dish requires specific items. For GENERIC items (eggs, vegetables, meat): use simple names like "Eggs", "Olive oil", "Cherry tomatoes", "Avocado", "Salmon". For BRANDED/PROCESSED items (dairy, packaged foods): include REGIONAL brand + product like "Tnuva Cottage Cheese 5%" (Israel ONLY), "Dannon Yogurt" (USA ONLY), "Angel Whole Wheat Bread" (Israel ONLY). Use real, POPULAR brands from the client\'s region only. VERIFY each ingredient is real and popular in that region - search online if unsure. NO fictional, rare, or made-up ingredients. Include ALL client-requested foods + complementary items.')


class PortionCalculation(dspy.Signature):
    """Calculate portion sizes for ALL ingredients to hit macro targets.
    
    CULINARY LOGIC - Identify ingredient roles:
    1. Analyze the dish_name to identify what defines the dish
    2. Assign each ingredient a ROLE and appropriate portion range:
       - MAIN/BASE ingredients: 100-200g (the core component that defines the dish)
       - PROTEIN ingredients: 100-200g for meat/fish, 2-3 units for eggs, 150-250g for dairy
       - SUPPORTING ingredients: 30-100g (vegetables, grains, legumes)
       - TOPPINGS: 5-30g (garnishes, nuts, seeds)
       - SAUCES/OILS: 5-20g (dressings, cooking oils)
    
    PRACTICAL PORTIONS - Make it cookable:
    • DISCRETE items (eggs, slices, containers, units): Use WHOLE numbers only
    • FLEXIBLE items (vegetables, sauces, grains, oils, spreads): Can use any weight
    • STRATEGY: Set discrete items to whole numbers first, then adjust flexible items to hit macro targets
    
    VERIFICATION:
    • Check proportions are realistic for the dish type
    • Ensure accompaniments are proportional to main components
    • Confirm the dish remains recognizable and balanced
    
    Calculate total macros → adjust flexible ingredients iteratively to hit targets (keep discrete items whole).
    
    ⚠️ CRITICAL: ALL OUTPUT MUST BE IN ENGLISH (ingredient names, brands, household measures)
    """
    
    dish_name = dspy.InputField(desc="Name of the dish")
    ingredients = dspy.InputField(desc="List of ingredients with nutrition per 100g")
    macro_targets = dspy.InputField(desc="Target macros for ENTIRE MEAL")
    required_protein_source = dspy.InputField(desc="Main protein source")
    
    portions = dspy.OutputField(desc="JSON in ENGLISH ONLY (no Hebrew/Arabic): {ingredient: {portionSI(gram): <number>, household_measure: '<text in English>', brand of pruduct: '<brand in English, e.g. Tnuva not תנובה>'}}")


class NutritionLookup(dspy.Signature):
    """Look up accurate nutrition data for an ingredient at a specific portion size."""
    
    ingredient_query = dspy.InputField(desc="Full ingredient name with brand")
    portion_grams = dspy.InputField(desc="Portion size in grams")
    
    nutrition_data = dspy.OutputField(desc="JSON with calories, protein_g, fat_g, carbohydrates_g for this portion")


class MealAssembly(dspy.Signature):
    """Assemble final meal JSON with validation. ALL OUTPUT MUST BE IN ENGLISH ONLY."""
    
    meal_type = dspy.InputField(desc="Type of meal")
    dish_name = dspy.InputField(desc="Name of dish")
    ingredients_with_portions = dspy.InputField(desc="Ingredients with portions")
    ingredients_with_nutrition = dspy.InputField(desc="Nutrition data per ingredient")
    macro_targets = dspy.InputField(desc="Target macros")
    
    reasoning = dspy.OutputField(desc="Validate totals match targets within allowed ranges")
    final_meal_json = dspy.OutputField(desc="""JSON schema - ALL TEXT FIELDS MUST BE IN ENGLISH (NO HEBREW):
{"meal_name": "<meal_type>", "meal_title": "<dish_name>", "ingredients": [{"item": "<name IN ENGLISH>", "portionSI(gram)": X, "household_measure": "<text IN ENGLISH>", "calories": X, "protein": X, "fat": X, "carbs": X, "brand of pruduct": "<real brand IN ENGLISH>"}]}
Constraints: Max 7 ingredients, use EXACT field names (portionSI(gram), brand of pruduct), real brand names in English (Tnuva not תנובה, Achla not אחלה, Angel not אנג'ל), ALL text in English only

CRITICAL BRAND EXTRACTION:
- If ingredient item contains a brand (e.g., "Tnuva Cottage Cheese 5%"), extract the brand to "brand of pruduct" field (e.g., "Tnuva")
- For "Tnuva Cottage Cheese 5%" → item: "Cottage Cheese 5%" or keep full name, brand of pruduct: "Tnuva"
- For "Hummus Achla" → item: "Hummus", brand of pruduct: "Achla"
- For generic items (e.g., "Eggs", "Olive oil") → brand of pruduct: "" (empty string)
- Always extract brand from ingredient names and populate "brand of pruduct" field - NEVER leave it empty if ingredient contains a brand""")


# ============================================================================
# Custom Gemini Module for Nutrition Lookup
# ============================================================================

class GeminiNutritionLookup(dspy.Module):
    """Custom DSPy module that calls the tuned Gemini nutrition lookup using Vertex AI SDK."""
    
    def __init__(self):
        super().__init__()
        from google import genai
        from google.genai import types
        
        # Get configuration from environment
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "europe-west4")
        self.model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
        
        if not project_id:
            raise ValueError("GOOGLE_CLOUD_PROJECT not found in environment. Set GOOGLE_CLOUD_PROJECT in .env")
        
        # Initialize Vertex AI client using Application Default Credentials (ADC)
        # Run: gcloud auth application-default login
        self.client = genai.Client(
            vertexai=True,
            project=project_id,
            location=location
        )
        
        self.system_instruction = """Nutrition data microservice. 

1. Check ingridientsroee_rows.csv first (fuzzy match OK)
2. If not found, search web for nutrition data per 100g
3. Return ONLY this JSON (no text, no markdown):
{"calories": <num>, "protein_g": <num>, "fat_g": <num>, "carbohydrates_g": <num>, "source": "israeli_db" or "web_search"}"""
        
        logger.info(f"✅ Gemini nutrition lookup initialized: {self.model_name} in {project_id}/{location}")
    
    def forward(self, ingredient_query: str, portion_grams: float) -> Dict[str, Any]:
        """
        Query Gemini for nutrition data and scale to portion size.
        Returns dict with calories, protein_g, fat_g, carbohydrates_g.
        With 5-second timeout - returns None if too slow.
        
        DISABLED: Using Claude only for accurate nutrition data.
        """
        return None  # Force Claude fallback
        from google.genai import types
        import signal
        
        def timeout_handler(signum, frame):
            raise TimeoutError("Gemini lookup timed out")
        
        try:
            # Set 5-second timeout (Unix/Linux only, won't work on Windows)
            # For Windows, we'll use a simpler approach with threading
            import threading
            
            result_container = [None]
            exception_container = [None]
            
            def gemini_call():
                try:
                    # Short query - system instruction has the details
                    query_text = f'"{ingredient_query}"'
                    
                    response = self.client.models.generate_content(
                        model=self.model_name,
                        contents=query_text,
                        config=types.GenerateContentConfig(
                            system_instruction=self.system_instruction,
                            temperature=0.0,
                        )
                    )
                    result_container[0] = response
                except Exception as e:
                    exception_container[0] = e
            
            thread = threading.Thread(target=gemini_call)
            thread.daemon = True
            thread.start()
            thread.join(timeout=15.0)  # 15-second timeout (allows time for web search)
            
            if thread.is_alive():
                logger.warning(f"⏱️ Gemini lookup timed out after 15s for '{ingredient_query}' - will use Claude fallback")
                return None  # Signal to use Claude fallback
            
            if exception_container[0]:
                raise exception_container[0]
            
            response = result_container[0]
            if not response:
                logger.warning(f"⚠️ Gemini returned no response for '{ingredient_query}'")
                return None
            
            # Extract text from response
            text_content = response.text
            
            # Log the raw response for debugging
            if not text_content or text_content.strip() == "":
                logger.warning(f"Empty response from Gemini for '{ingredient_query}'")
                logger.warning(f"Full response object: {response}")
                return {"calories": 0, "protein_g": 0, "fat_g": 0, "carbohydrates_g": 0}
            
            logger.debug(f"Gemini response for '{ingredient_query}': {text_content[:200]}...")
            
            # Strip markdown code fences if present
            cleaned_text = text_content.strip()
            if cleaned_text.startswith("```"):
                # Remove opening fence (```json or ```)
                cleaned_text = cleaned_text.split("\n", 1)[1] if "\n" in cleaned_text else cleaned_text[3:]
                # Remove closing fence
                if cleaned_text.endswith("```"):
                    cleaned_text = cleaned_text.rsplit("```", 1)[0]
                cleaned_text = cleaned_text.strip()
            
            # Parse nutrition row JSON
            row = json.loads(cleaned_text)
            
            # Check for the new standardized format first
            if all(key in row for key in ["calories", "protein_g", "fat_g", "carbohydrates_g"]):
                # New format with explicit structure
                source = row.get("source", "unknown")
                
                if source == "unknown":
                    logger.warning(f"⚠️ Gemini: '{ingredient_query}' not found (returned zeros)")
                    return None  # Fall back to Claude
                
                logger.info(f"📍 Data source for '{ingredient_query}': {source}")
                
                # Extract directly (already per 100g)
                calories_per_100g = float(row["calories"])
                protein_per_100g = float(row["protein_g"])
                fat_per_100g = float(row["fat_g"])
                carbs_per_100g = float(row["carbohydrates_g"])
            else:
                # Legacy format (Israeli DB raw format) - validate and extract
                # Check if model explicitly said not found
                if "error" in row and row["error"] == "not_found":
                    logger.warning(f"⚠️ Gemini: '{ingredient_query}' not found in Israeli DB")
                    return None
                
                # Validate that this is actually nutrition data, not translations or garbage
                has_nutrition_fields = any(
                    key in row for key in [
                        "calories_energy", "calories", "protein_g", "protein",
                        "fat_g", "total_fat", "carbohydrates_g", "total_carbohydrate"
                    ]
                )
                
                # Check if it's just translations (has language fields but no nutrition)
                is_translation_dict = any(
                    key in row for key in [
                        "french_name", "spanish_name", "german_name", "chinese_name"
                    ]
                )
                
                if is_translation_dict or not has_nutrition_fields:
                    logger.warning(f"⚠️ Gemini returned non-nutrition data for '{ingredient_query}' (translations or irrelevant data)")
                    return None  # Signal to use Claude fallback
            
                # Helper function to extract numeric value from string (handles "20g", "5.5", etc.)
                def parse_number(value):
                    if value is None:
                        return 0
                    if isinstance(value, (int, float)):
                        return float(value)
                    # Strip units like 'g', 'mg', '%' and convert
                    import re
                    cleaned = re.sub(r'[^\d.]', '', str(value))
                    return float(cleaned) if cleaned else 0
                
                # Extract macros (per 100g in source data)
                # Try tuned model format first, fall back to generic formats
                calories_per_100g = parse_number(
                    row.get("calories_energy") or 
                    row.get("calories") or 
                    0
                )
                
                protein_per_100g = parse_number(
                    row.get("protein_g") or 
                    row.get("protein") or 
                    0
                )
                
                # Handle fat from multiple possible field names
                fat_per_100g = parse_number(
                    row.get("fat_g") or 
                    row.get("total_fat_g") or
                    row.get("total_fat") or 
                    0
                )
                
                # Handle carbs from multiple possible field names
                carbs_per_100g = parse_number(
                    row.get("carbohydrates_g") or 
                    row.get("total_carbohydrate_g") or
                    row.get("total_carbohydrate") or
                    row.get("total_carbohydrates") or
                    0
                )
                
                logger.info(f"📍 Data source for '{ingredient_query}': israeli_db (legacy format)")
            
            # Scale to actual portion
            scale_factor = portion_grams / 100.0
            
            result = {
                "calories": round(calories_per_100g * scale_factor, 1),
                "protein_g": round(protein_per_100g * scale_factor, 1),
                "fat_g": round(fat_per_100g * scale_factor, 1),
                "carbohydrates_g": round(carbs_per_100g * scale_factor, 1)
            }
            
            logger.info(f"✅ Nutrition for '{ingredient_query}' ({portion_grams}g): {result}")
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response for '{ingredient_query}': {e}")
            logger.error(f"Response was: {text_content[:500] if 'text_content' in locals() else 'N/A'}")
            return None  # Signal to use Claude fallback
        except Exception as e:
            logger.error(f"Gemini nutrition lookup failed for '{ingredient_query}': {e}")
            return None  # Signal to use Claude fallback


# ============================================================================
# Main DSPy Meal Builder Chain
# ============================================================================

class MealBuilderChain(dspy.Module):
    def _normalize_term(self, term: Optional[str]) -> str:
        """Lowercase and strip non-alphanumeric characters for safe comparisons."""
        if not term or not isinstance(term, str):
            return ""
        term = term.lower()
        cleaned_chars = []
        for ch in term:
            if ch.isalnum():
                cleaned_chars.append(ch)
            elif ch.isspace():
                cleaned_chars.append(" ")
            else:
                cleaned_chars.append(" ")
        cleaned = "".join(cleaned_chars)
        return " ".join(cleaned.split())
    
    def _extract_brand_from_ingredient(self, ingredient: str) -> tuple[str, str]:
        """
        Extract brand and product name from ingredient string.
        Handles multiple formats:
        - "Brand Product Variant" (e.g., "Tnuva Cottage Cheese 5%")
        - "Product, Brand" (e.g., "Cottage Cheese, Tnuva")
        - Generic items (no brand, e.g., "Eggs", "Olive oil")
        
        Returns: (product_name, brand_name)
        """
        if not ingredient:
            return ("", "")
        
        ingredient = ingredient.strip()
        
        # Known Israeli/regional brands (case-insensitive matching)
        # Comprehensive list of Israeli food brands
        known_brands = [
            # Major dairy brands
            "Tnuva", "Strauss", "Yotvata", "Tara", "Gad", "Yoplait", "Danone",
            "Milky", "Rivage", "Shamenet", "Gvina Levana",
            # Hummus and spreads
            "Achla", "Abu Gosh", "Sabra", "Tzabar", "Houmous Achla", "Al Arz",
            # Bread and baked goods
            "Angel", "Berman", "Lechem Achai", "Beigel Beigel", "Krembo",
            "Berman Bread", "Angel Bakery", "Lechem Achai Bakery",
            # Snacks and packaged foods
            "Osem", "Telma", "Elite", "Bamba", "Bissli", "Doritos", "Lay's",
            "Tapuchips", "Klik", "Kariot", "Kornfleks", "Cornflakes",
            # Pasta and grains
            "Pastolina", "Barilla", "Rummo", "Osem Pasta",
            # Canned goods and ready meals
            "Prigat", "Prima", "Tivall", "Gefen", "Haddar", "Maya",
            # Oils and condiments
            "Haifa", "Shemen", "Yad Mordechai", "Shemen Haaretz", "Shemen Hazait",
            "Wissotzky", "Elite Coffee", "Nespresso",
            # Meat and poultry
            "Zoglowek", "Soglowek", "Tiv Taam", "Adom Adom",
            # Beverages
            "Coca Cola", "Pepsi", "Fanta", "Sprite", "Tempo", "Primor",
            "Soda Stream", "Schweppes", "Kinley",
            # Frozen foods
            "Tivall", "Zoglowek", "Tnuva Frozen",
            # International brands commonly found in Israel
            "Nestle", "Unilever", "Danone", "Kraft", "Heinz", "Mondelēz",
            # Baby food and formula
            "Materna", "Remedia", "Milupa", "Similac", "Aptamil",
            # Coffee and tea chains (food products)
            "Aroma", "Landwer", "Cofix",
            # Additional Israeli food brands
            "Shahar", "Roladin", "Maya", "Gefen", "Haddar",
            "Tara Dairy", "Gad Dairy", "Yotvata Dairy"
        ]
        
        # Format 1: "Product, Brand" (comma-separated)
        if "," in ingredient:
            parts = [p.strip() for p in ingredient.split(",")]
            if len(parts) == 2:
                # Check if second part is a known brand
                potential_brand = parts[1]
                for brand in known_brands:
                    if brand.lower() in potential_brand.lower():
                        return (parts[0], brand)  # Return standardized brand name
                # If not a known brand, assume second part is brand anyway
                return (parts[0], parts[1])
        
        # Format 2: "Brand Product Variant" (brand at start)
        ingredient_lower = ingredient.lower()
        for brand in known_brands:
            brand_lower = brand.lower()
            if ingredient_lower.startswith(brand_lower):
                # Extract product name after brand
                product_part = ingredient[len(brand):].strip()
                return (product_part, brand)
        
        # Format 3: Brand might be in the middle or end (less common)
        # Check if any known brand appears in the ingredient
        for brand in known_brands:
            if brand.lower() in ingredient_lower:
                # Try to extract - brand might be first word
                words = ingredient.split()
                if words and words[0].lower() == brand.lower():
                    product_part = " ".join(words[1:])
                    return (product_part, brand)
        
        # No brand found - generic ingredient
        return (ingredient, "")
    
    def _build_prohibited_terms(
        self,
        allergies_list: List[str],
        limitations_list: List[str],
        avoid_ingredients: List[str]
    ) -> List[str]:
        """Build a normalized list of restricted terms from allergies, limitations, and avoid lists."""
        prohibited_terms = []
        
        def add_term(term: str):
            normalized = self._normalize_term(term)
            if not normalized or normalized in {"none", "na", "n/a"}:
                return
            if normalized not in prohibited_terms:
                prohibited_terms.append(normalized)
            # Add individual words for better coverage (e.g., "gluten free" -> "gluten")
            for part in normalized.split():
                if len(part) >= 3 and part not in prohibited_terms:
                    prohibited_terms.append(part)
        
        for term in (allergies_list or []):
            add_term(term)
        for term in (limitations_list or []):
            add_term(term)
        for term in (avoid_ingredients or []):
            add_term(term)
        
        return prohibited_terms
    
    """
    Full meal building pipeline:
    1. Generate regional ingredient list for template dish (Claude)
    2. Look up nutrition data per 100g for each ingredient (Gemini → Claude fallback)
    3. Calculate portions and household measures (Claude iterative)
    4. Assemble and validate final JSON (Claude with CoT + auto-correction)
    """
    
    def __init__(self):
        super().__init__()
        
        # Stage predictors
        self.name_ingredients = dspy.ChainOfThought(MealNaming)
        self.calculate_portions = dspy.ChainOfThought(PortionCalculation)
        self.assemble_meal = dspy.ChainOfThought(MealAssembly)
        
        # Custom Gemini lookup
        self.nutrition_lookup = GeminiNutritionLookup()
    
    def _get_allowed_margin(self, value: float) -> float:
        """
        Calculate allowed margin based on macro value.
        Lower values get higher tolerance because small differences matter less.
        """
        if value <= 10:
            return 0.6  # 60% tolerance
        elif value <= 20:
            return 0.5  # 50% tolerance
        elif value <= 30:
            return 0.4  # 40% tolerance
        else:
            return 0.3  # 30% tolerance
    
    def _claude_nutrition_fallback(self, ingredient_query: str) -> Dict[str, Any]:
        """
        Use Claude with web search to find nutrition data when Gemini fails.
        No timeout - give it as much time as needed for accuracy.
        Calls Azure OpenAI directly to avoid DSPy nesting issues.
        """
        try:
            logger.debug(f"🔍 Using Claude web search for '{ingredient_query}'...")
            
            # Import OpenAI client
            from openai import AzureOpenAI
            
            # Get Azure OpenAI configuration
            deployment = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'obi2')
            api_base = os.getenv("AZURE_OPENAI_API_BASE")
            api_key = os.getenv("AZURE_OPENAI_API_KEY")
            api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
            
            if not api_base or not api_key:
                logger.error("Azure OpenAI credentials not found in environment")
                return None
            
            # Create client
            client = AzureOpenAI(
                azure_endpoint=api_base,
                api_key=api_key,
                api_version=api_version
            )
            
            # Build prompt - be very explicit about the exact ingredient
            prompt = f"""You must find nutrition data for THIS EXACT INGREDIENT: "{ingredient_query}"

CRITICAL: Return nutrition data for "{ingredient_query}" ONLY. Do not substitute with similar ingredients.

Search the web for accurate nutrition data per 100 grams for "{ingredient_query}".

Return ONLY this JSON (no text, no markdown, no explanations):
{{"calories": <number>, "protein_g": <number>, "fat_g": <number>, "carbohydrates_g": <number>}}

The data must be for "{ingredient_query}" specifically, not a similar or substitute ingredient."""
            
            # Call Claude directly with retry logic for rate limits
            import time
            max_retries = 3
            retry_delay = 3  # Start with 3 seconds
            
            for attempt in range(max_retries):
                try:
                    response = client.chat.completions.create(
                        model=deployment,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.0,
                        max_tokens=500
                    )
                    break  # Success, exit retry loop
                except Exception as e:
                    error_str = str(e)
                    if "429" in error_str or "RateLimit" in error_str or "rate limit" in error_str.lower():
                        if attempt < max_retries - 1:
                            wait_time = retry_delay * (2 ** attempt)  # Exponential backoff: 3s, 6s, 12s
                            logger.warning(f"⚠️ Rate limit hit for '{ingredient_query}', waiting {wait_time}s before retry {attempt + 1}/{max_retries}")
                            time.sleep(wait_time)
                            continue
                    # If not a rate limit error, or we've exhausted retries, raise
                    raise
            
            # Extract response
            content = response.choices[0].message.content.strip()
            
            # Log raw response for debugging (first 200 chars)
            logger.debug(f"Claude raw response for '{ingredient_query}': {content[:200]}...")
            
            # Parse JSON from response
            cleaned = content
            if cleaned.startswith("```"):
                # Remove markdown code fences
                cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned.rsplit("```", 1)[0].strip()
            
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError as e:
                logger.error(f"❌ Claude returned invalid JSON for '{ingredient_query}': {e}")
                logger.error(f"   Raw content: {content[:500]}")
                return None
            
            # Validate we got actual numbers
            if all(isinstance(data.get(k), (int, float)) for k in ["calories", "protein_g", "fat_g", "carbohydrates_g"]):
                # Basic sanity check - values should be reasonable per 100g
                calories = float(data["calories"])
                fat = float(data["fat_g"])
                
                # Check for obviously wrong values
                if calories > 1000 or fat > 150:
                    logger.warning(f"⚠️ Suspicious values from Claude for '{ingredient_query}': {data}")
                
                logger.debug(f"✅ Claude found nutrition for '{ingredient_query}': {data}")
                return {
                    "calories": float(data["calories"]),
                    "protein_g": float(data["protein_g"]),
                    "fat_g": float(data["fat_g"]),
                    "carbohydrates_g": float(data["carbohydrates_g"])
                }
            else:
                logger.error(f"❌ Claude returned invalid data structure for '{ingredient_query}': {data}")
                return None
            
        except Exception as e:
            logger.error(f"❌ Claude fallback failed for '{ingredient_query}': {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
    
    def forward(
        self,
        meal_type: str,
        macro_targets: Dict[str, float],
        required_protein_source: str,
        preferences: Dict[str, Any],
        option_type: str = "MAIN"
    ) -> Dict[str, Any]:
        """
        Execute the full meal building pipeline.
        
        Args:
            meal_type: Type of meal (Breakfast, Lunch, etc.)
            macro_targets: Dict with calories, protein, fat, carbs
            required_protein_source: Required protein for this meal
            preferences: User preferences dict containing:
                - allergies: List of allergens to avoid
                - limitations: Dietary restrictions
                - region: Client's region (e.g., 'israel', 'usa') for regional ingredients
                - template_meal_title: Dish name from template (REQUIRED)
                - client_preference: Client's meal description (MAIN only)
            option_type: "MAIN" or "ALTERNATIVE" - MAIN uses client preferences, ALTERNATIVE ignores them
        
        Returns:
            Complete meal dict with ingredients and nutrition
        
        Note:
            - Dish name comes from template (preferences['template_meal_title'])
            - Ingredients are selected based on client's region with popular/common items prioritized
            - Stage 1 generates ingredient list (not dish name)
        """
        
        # Extract preferences
        region = preferences.get("region", "israel")
        
        # Debug logging for region
        logger.info(f"🌍 Region from preferences: '{region}' (type: {type(region)})")
        if not region or region.strip().lower() == "israel":
            logger.warning(f"⚠️ Using default region 'israel' - check if user's region is set correctly in database")
        
        # Normalize region (handle case sensitivity, whitespace)
        if region:
            region = region.strip().lower()
        else:
            region = "israel"
            logger.warning(f"⚠️ Region was empty/None, defaulting to 'israel'")
        
        raw_allergies = preferences.get("allergies", []) or []
        raw_limitations = preferences.get("limitations", []) or []
        allergies_list = [a.strip() for a in raw_allergies if isinstance(a, str) and a.strip()]
        limitations_list = [l.strip() for l in raw_limitations if isinstance(l, str) and l.strip()]
        allergies_display = ", ".join(allergies_list) if allergies_list else "None"
        limitations_display = ", ".join(limitations_list) if limitations_list else "None"
        avoid_ingredients = preferences.get("avoid_ingredients", []) or []
        
        # Extract client preference for THIS specific meal from meal_plan_structure.
        # MAIN uses client preferences; ALTERNATIVE historically ignored them for variety.
        # However, if the menu "template" supplies an explicit dish title (template_meal_title),
        # we MUST follow it for BOTH MAIN and ALTERNATIVE so the generated meal matches the template.
        meal_plan_structure = preferences.get("meal_plan_structure", [])
        client_preference = ""
        template_meal_title = preferences.get("template_meal_title", "")
        
        if option_type.upper() == "MAIN":
            # Only extract preferences for MAIN meals
            if meal_plan_structure and isinstance(meal_plan_structure, list):
                # Find the meal object that matches this meal_type
                for meal_obj in meal_plan_structure:
                    if isinstance(meal_obj, dict):
                        meal_name = meal_obj.get("meal", "")
                        # Match meal names (case-insensitive)
                        if meal_name.lower() == meal_type.lower():
                            # Found it! Extract the description
                            client_preference = meal_obj.get("description", "")
                            if client_preference:
                                logger.info(f"✅ Found client preference for {meal_type} MAIN in meal_plan_structure")
                            break
            
            # Fallback to old client_preference field if it exists
            if not client_preference:
                client_preference_raw = preferences.get("client_preference", "")
                if isinstance(client_preference_raw, dict):
                    if "text" in client_preference_raw:
                        client_preference = client_preference_raw["text"]
                    elif "preferences" in client_preference_raw:
                        client_preference = client_preference_raw["preferences"]
                elif isinstance(client_preference_raw, str):
                    client_preference = client_preference_raw
        else:
            # ALTERNATIVE meal - ignore free-text client preferences for variety,
            # BUT still enforce template-provided title if available.
            logger.info(f"🔀 ALTERNATIVE meal - ignoring client preferences for variety (template title may still be enforced)")
        
        # ======================================================================
        # STAGE 1: Generate ingredient list for the dish (Claude)
        # ======================================================================
        
        # Use template dish name directly if provided, otherwise generate error
        if isinstance(template_meal_title, str) and template_meal_title.strip():
            dish_name = template_meal_title.strip()
            logger.info(f"🧠 Stage 1: Building ingredients for '{dish_name}' ({meal_type}) [{option_type.upper()}]")
        else:
            # Template should always provide dish name
            raise ValueError(f"No template_meal_title provided for {meal_type}. Template must specify dish name.")
        
        logger.info(f"🎯 Macro targets: {macro_targets}")
        logger.info(f"🌍 Region for ingredient selection: '{region}' (will prioritize popular ingredients from this region)")
        logger.warning(f"⚠️ IMPORTANT: Using region='{region}' - verify this matches user's actual location in database")
        
        # Log client preferences
        if client_preference and client_preference.strip():
            # Truncate for display
            pref_display = client_preference[:500] if len(client_preference) <= 500 else client_preference[:497] + "..."
            logger.warning(f"⚠️ CLIENT PREFERENCES FOR {meal_type.upper()} MAIN MEAL (MANDATORY):")
            logger.warning(f"   {pref_display}")
            logger.warning(f"   → All requested foods from this description MUST be included in ingredients!")
        else:
            if option_type.upper() == "ALTERNATIVE":
                logger.info(f"📋 Client preferences for {meal_type} ALTERNATIVE: Ignoring for variety")
            else:
                logger.info(f"📋 Client preferences for {meal_type} MAIN: None (empty description)")
        
        logger.info(f"🥩 Required protein: {required_protein_source}")
        
        # Build explicit macro guidance for Claude
        target_fat = macro_targets.get("fat", 0)
        target_protein = macro_targets.get("protein", 0)
        target_carbs = macro_targets.get("carbs", 0)
        
        macro_guidance = f"MACRO REQUIREMENTS: protein={target_protein}g, fat={target_fat}g, carbs={target_carbs}g. "
        if target_fat >= 5:
            macro_guidance += f"⚠️ Fat is {target_fat}g - YOU MUST include fat sources like: nuts, nut butter (almond/peanut), olive oil, avocado, fatty fish, seeds, or real butter. "
        if target_protein >= 25:
            macro_guidance += f"Protein is {target_protein}g - ensure substantial protein source. "
        
        logger.info(f"📐 Macro guidance being sent: {macro_guidance}")
        
        # Build regional guidance with specific brand examples
        regional_guidance = f"🌍 REGIONAL INGREDIENTS (CRITICAL): Client is in '{region.upper()}'. You MUST use ingredients and brands from {region.upper()} ONLY. "
        
        if region.lower() == "usa":
            regional_guidance += "USE USA BRANDS: Dannon, Kraft, Land O'Lakes, Cheerios, Quaker, etc. "
            regional_guidance += "DO NOT USE Israeli brands like Tnuva, Strauss, Angel, Achla, Osem. "
        elif region.lower() == "israel":
            regional_guidance += "USE ISRAELI BRANDS: Tnuva, Strauss, Angel, Achla, Osem, Yotvata, etc. "
            regional_guidance += "DO NOT USE American brands unless they're also common in Israel. "
        else:
            regional_guidance += f"Use brands and products commonly found in {region} stores. "
        
        regional_guidance += "Prioritize POPULAR, MAINSTREAM ingredients that locals would actually buy. "
        regional_guidance += "ONLY use exotic/rare ingredients if the dish specifically requires them. "
        
        safety_guidance = f"ALLERGIES FIRST: ABSOLUTELY FORBIDDEN ingredients = {allergies_display}. " \
                          f"Dietary limitations: {limitations_display}. If a requested ingredient conflicts with these, " \
                          f"IGNORE the request. Allergies and limitations ALWAYS override preferences."
        
        enhanced_client_pref = safety_guidance + " " + regional_guidance + macro_guidance + (client_preference if client_preference else "")
        
        naming_result = self.name_ingredients(
            meal_type=meal_type,
            dish_name=dish_name,
            macro_targets=json.dumps(macro_targets),
            required_protein_source=required_protein_source,
            region=region,
            allergies=allergies_display,
            limitations=limitations_display,
            avoid_ingredients=json.dumps(avoid_ingredients),
            client_preference=enhanced_client_pref
        )
        
        # Parse ingredients JSON with better error handling
        try:
            ingredients_list = json.loads(naming_result.ingredients)
        except json.JSONDecodeError as e:
            # Fallback: try parsing as Python list literal (in case LLM returned single quotes)
            try:
                import ast
                ingredients_list = ast.literal_eval(naming_result.ingredients)
                logger.warning(f"⚠️ Ingredients were in Python format, converted to list. Please check prompt.")
            except Exception as e2:
                logger.error(f"❌ Failed to parse ingredients JSON at Stage 1: {e}")
                logger.error(f"   Raw ingredients field: {naming_result.ingredients[:500]}")
                raise
        
        logger.info(f"✅ Stage 1 complete: '{dish_name}' with {len(ingredients_list)} regional ingredients")
        logger.info(f"   Generated ingredients (from {region.upper()}): {ingredients_list}")
        
        # Verify regional brands
        ingredients_str = " ".join(ingredients_list).lower()
        if region.lower() == "usa":
            israeli_brands = ["tnuva", "strauss", "angel", "achla", "osem", "yotvata"]
            found_israeli = [brand for brand in israeli_brands if brand in ingredients_str]
            if found_israeli:
                logger.error(f"❌ ERROR: Found Israeli brands in USA meal: {found_israeli}")
                logger.error(f"   This is a bug - user is in USA but got Israeli ingredients!")
        elif region.lower() == "israel":
            usa_brands = ["dannon", "kraft", "land o'lakes", "cheerios", "quaker"]
            found_usa = [brand for brand in usa_brands if brand in ingredients_str]
            if found_usa:
                logger.warning(f"⚠️ Found USA brands in Israeli meal: {found_usa} (may be OK if common in Israel)")
        
        # Check if client preferences for this meal were followed
        if client_preference and client_preference.strip():
            logger.info(f"   ℹ️ Client requested description: {client_preference[:150]}...")
            logger.info(f"   ℹ️ Claude should have interpreted and included relevant foods from this")
        
        # ======================================================================
        # SAFETY: Remove ingredients that violate allergies/limitations
        # ======================================================================
        prohibited_terms = self._build_prohibited_terms(allergies_list, limitations_list, avoid_ingredients)
        
        def violates_restriction(ingredient: str) -> Optional[str]:
            norm_ing = self._normalize_term(ingredient)
            for term in prohibited_terms:
                if term and term in norm_ing:
                    return term
            return None
        
        cleaned_ingredients = []
        for ingredient in ingredients_list:
            violation = violates_restriction(ingredient)
            if violation:
                error_msg = (
                    f"❌ SAFETY ERROR: Ingredient '{ingredient}' conflicts with restriction '{violation}'. "
                    "Allergies and limitations have highest priority."
                )
                logger.error(error_msg)
                raise ValueError(error_msg)
            cleaned_ingredients.append(ingredient)
        
        ingredients_list = cleaned_ingredients
        
        # ======================================================================
        # VALIDATION: Ask LLM to validate dish name matches ingredients
        # ======================================================================
        logger.info(f"🔍 Validating culinary logic: Does '{dish_name}' match ingredients {ingredients_list}?")
        
        # Quick validation prompt - just yes/no answer
        validation_prompt = f"""Does the dish name match the ingredients, considering dietary restrictions?

Dish name: "{dish_name}"
Ingredients: {ingredients_list}
Allergies: {allergies_display}
Dietary Limitations: {limitations_display}

REASONING PROCESS:
1. What are the core/defining ingredients of "{dish_name}"?
2. Are those core ingredients present in the ingredients list?
3. If a core ingredient is missing:
   - Is it missing because of allergies or dietary limitations? → VALID (acceptable substitution/adaptation)
   - Is it missing for no good reason? → INVALID (culinary logic error)

Answer ONLY with:
- "VALID" if the dish name matches the ingredients (core ingredients are present OR missing for valid dietary reasons)
- "INVALID: [reason]" if the dish name doesn't match (missing core ingredients for no valid reason)

Examples:
- "Shakshuka" with ingredients ["Eggs", "Bread", "Hummus"], allergies: none → INVALID: Shakshuka requires tomatoes/tomato sauce
- "Shakshuka" with ingredients ["Eggs", "Bell Peppers", "Onions"], allergies: "tomatoes" → VALID: Adapted shakshuka due to tomato allergy
- "Pasta Carbonara" with ingredients ["Chicken", "Rice", "Vegetables"], allergies: none → INVALID: Pasta Carbonara requires pasta, eggs, cheese
- "Greek Salad" with ingredients ["Cucumber", "Olives", "Olive Oil"], limitations: "dairy-free" → VALID: Feta omitted due to dairy restriction
"""
        
        try:
            # Call Azure OpenAI directly for quick validation
            from openai import AzureOpenAI
            
            deployment = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'obi2')
            api_base = os.getenv("AZURE_OPENAI_API_BASE")
            api_key = os.getenv("AZURE_OPENAI_API_KEY")
            api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
            
            if api_base and api_key:
                client = AzureOpenAI(
                    azure_endpoint=api_base,
                    api_key=api_key,
                    api_version=api_version
                )
                
                response = client.chat.completions.create(
                    model=deployment,
                    messages=[{"role": "user", "content": validation_prompt}],
                    temperature=0.0,
                    max_tokens=200
                )
                
                validation_result = response.choices[0].message.content.strip()
                logger.info(f"   Validation result: {validation_result}")
                
                if validation_result.startswith("INVALID"):
                    error_msg = f"❌ CULINARY LOGIC ERROR: {validation_result}\n"
                    error_msg += f"   Dish: '{dish_name}'\n"
                    error_msg += f"   Ingredients: {ingredients_list}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)
                else:
                    logger.info(f"✅ Culinary logic validation passed")
            else:
                logger.warning("⚠️ Azure OpenAI credentials not found, skipping validation")
                
        except Exception as e:
            # If validation fails for technical reasons, log but don't block
            if "CULINARY LOGIC ERROR" in str(e):
                # This is our intentional error - re-raise it
                raise
            else:
                logger.warning(f"⚠️ Validation check failed (technical): {e}")
                logger.warning("   Proceeding without validation...")
        
        # ======================================================================
        # VALIDATE INGREDIENT COUNT: Backend has hard limit of 7 ingredients
        # ======================================================================
        MAX_INGREDIENTS = 7
        
        if len(ingredients_list) > MAX_INGREDIENTS:
            logger.warning(f"⚠️ Stage 1 generated {len(ingredients_list)} ingredients (limit is {MAX_INGREDIENTS}). Reducing...")
            
            # Strategy: Combine spices/seasonings, remove minor ingredients
            # Keep: protein source, main carbs, main fats, vegetables
            # Combine: spices, herbs, seasonings into one "spices" entry
            
            spices_keywords = ["salt", "pepper", "cumin", "paprika", "garlic", "onion powder", "herbs", "spices", "seasoning"]
            main_ingredients = []
            spices_list = []
            
            for ing in ingredients_list:
                ing_lower = ing.lower()
                is_spice = any(keyword in ing_lower for keyword in spices_keywords)
                
                if is_spice:
                    spices_list.append(ing)
                else:
                    main_ingredients.append(ing)
            
            # Combine spices into one entry if we have multiple
            if len(spices_list) > 0:
                if len(spices_list) == 1:
                    main_ingredients.append(spices_list[0])
                else:
                    # Combine multiple spices
                    spices_combined = ", ".join(spices_list)
                    main_ingredients.append(f"Spices ({spices_combined})")
            
            # If still too many, remove the least important (usually vegetables or small additions)
            while len(main_ingredients) > MAX_INGREDIENTS:
                # Remove last ingredient (usually added last, less important)
                removed = main_ingredients.pop()
                logger.info(f"   Removed ingredient to meet limit: {removed}")
            
            ingredients_list = main_ingredients
            logger.info(f"✅ Reduced to {len(ingredients_list)} ingredients: {ingredients_list}")
        
        logger.info(f"✅ Stage 1 complete: {dish_name} with {len(ingredients_list)} ingredients")
        
        # ======================================================================
        # STAGE 2 (NEW): Look up nutrition per 100g for each ingredient FIRST
        # ======================================================================
        logger.info(f"🧠 Stage 2: Looking up nutrition data per 100g via Gemini")
        
        # Get nutrition per 100g for each ingredient (no portions yet)
        nutrition_per_100g = {}
        
        for ingredient in ingredients_list:
            # Extract brand and product name from ingredient
            product_name, brand = self._extract_brand_from_ingredient(ingredient)
            
            # For query, use full ingredient name (might include brand for better search results)
            query = ingredient  # Use full name for better nutrition lookup
            
            # Look up nutrition per 100g (use dummy 100g portion)
            nutrition_100g = self.nutrition_lookup.forward(query, 100.0)
            
            # If Gemini failed, use Claude with web search (no timeout, no generic estimates)
            if nutrition_100g is None:
                # Gemini is disabled, fall back to Claude (no need to log this every time)
                nutrition_100g = self._claude_nutrition_fallback(query)
                
                # If both Gemini AND Claude failed, we cannot proceed
                if nutrition_100g is None:
                    raise Exception(f"❌ Could not find nutrition data for '{ingredient}' after trying Gemini and Claude. Cannot proceed with inaccurate data.")
            
            # Store per-100g data with extracted brand info
            nutrition_per_100g[ingredient] = {
                "ingredient_name": product_name if product_name else ingredient,  # Product name without brand
                "full_ingredient_name": ingredient,  # Full name as provided
                "brand": brand,
                "calories_per_100g": nutrition_100g["calories"],
                "protein_per_100g": nutrition_100g["protein_g"],
                "fat_per_100g": nutrition_100g["fat_g"],
                "carbs_per_100g": nutrition_100g["carbohydrates_g"]
            }
        
        logger.info(f"✅ Stage 2 complete: Nutrition data per 100g retrieved for all {len(nutrition_per_100g)} ingredients")
        
        # ======================================================================
        # STAGE 3: Calculate portions using nutrition data (iterative with Claude)
        # ======================================================================
        max_refinement_attempts = 5  # Increased from 3 to give more chances to hit targets
        portions_dict = None
        feedback_for_portions = None
        
        for refinement_attempt in range(max_refinement_attempts):
            # ==================================================================
            # STAGE 3: Calculate portions with nutrition data (Claude)
            # ==================================================================
            if refinement_attempt == 0:
                logger.info(f"🧠 Stage 3: Calculating portions for {dish_name} (WITH nutrition data)")
            else:
                logger.info(f"🔄 Stage 3 (attempt {refinement_attempt + 1}): Refining portions based on feedback")
            
            # Build prompt with nutrition data AND feedback
            instruction_text = f"""Calculate portions to hit target macros for the COMPLETE MEAL.

DISH NAME: {dish_name}
TARGET MACROS FOR ENTIRE MEAL: {json.dumps(macro_targets)}
NUTRITION DATA PER 100g FOR EACH INGREDIENT: {json.dumps(nutrition_per_100g, indent=2)}

CULINARY LOGIC - Analyze ingredient roles:
1. Identify what defines "{dish_name}" and determine each ingredient's role
2. Assign portions by ROLE:
   - MAIN/BASE: 100-200g (the core component that defines the dish)
   - PROTEIN ({required_protein_source}): 100-200g meat/fish, 2-3 units eggs (100-150g), 150-250g dairy
   - SUPPORTING: 30-100g (vegetables, grains, legumes)
   - TOPPINGS: 5-30g (garnishes, nuts, seeds)
   - OILS/SAUCES: 5-20g (dressings, cooking oils)

PRACTICAL PORTIONS (humans must be able to measure):
• DISCRETE items = WHOLE numbers only: eggs, slices, containers, units
• FLEXIBLE items = any weight: vegetables, sauces, grains, oils, spreads
• STRATEGY: Set discrete items to whole numbers first, then adjust flexible items to hit macros

VERIFICATION:
• Check portions create a balanced, recognizable version of "{dish_name}"
• Ensure accompaniments are proportional to main components
• Confirm all ingredient roles work together logically

CALCULATE & ADJUST:
1. Sum macros from logical portions
2. Adjust FLEXIBLE ingredients iteratively (not discrete) to hit targets
3. Return JSON: {{"ingredient": {{"portionSI(gram)": X, "household_measure": "text", "brand of pruduct": "brand"}}}}"""
            
            portion_prompt_data = {
                "dish_name": dish_name,
                "ingredients": ingredients_list,
                "nutrition_per_100g": nutrition_per_100g,
                "target_macros": macro_targets,
                "instruction": instruction_text
            }
            
            if feedback_for_portions:
                portion_prompt_data["feedback"] = feedback_for_portions
            
            portion_result = self.calculate_portions(
                dish_name=dish_name,
                ingredients=json.dumps(portion_prompt_data),
                macro_targets=json.dumps(macro_targets),
                required_protein_source=required_protein_source
            )
            
            # Parse portions JSON with better error handling
            try:
                portions_dict = json.loads(portion_result.portions)
            except json.JSONDecodeError as e:
                # Fallback: try parsing as Python dict literal
                try:
                    import ast
                    portions_dict = ast.literal_eval(portion_result.portions)
                    logger.warning(f"⚠️ Portions were in Python format, converted to dict. Please check prompt.")
                except Exception as e2:
                    logger.error(f"❌ Failed to parse portions JSON at Stage 3: {e}")
                    logger.error(f"   Raw portions field: {portion_result.portions[:500]}")
                    raise
            
            logger.info(f"✅ Stage 3 complete: Portions calculated for '{dish_name}' ({meal_type}) [{option_type.upper()}]")
            
            # ==================================================================
            # Calculate actual nutrition based on portions
            # ==================================================================
            nutrition_data = {}
            
            for ingredient, portion_info in portions_dict.items():
                # Try correct field name first, fallback to old name
                portion_grams = portion_info.get("portionSI(gram)", portion_info.get("portion_grams", 0))
                
                # Get the per-100g data
                per_100g = nutrition_per_100g.get(ingredient, {})
                
                # Ensure brand is included - extract from ingredient name if missing from portion_info
                brand_in_portion = portion_info.get("brand of pruduct", "").strip()
                if not brand_in_portion:
                    # Try to get brand from nutrition_per_100g (extracted in Stage 2)
                    brand_from_stage2 = per_100g.get("brand", "").strip()
                    if brand_from_stage2:
                        portion_info["brand of pruduct"] = brand_from_stage2
                        logger.info(f"   ✅ Added brand '{brand_from_stage2}' to portion info for '{ingredient}'")
                    else:
                        # Extract brand from ingredient name directly as fallback
                        _, extracted_brand = self._extract_brand_from_ingredient(ingredient)
                        if extracted_brand:
                            portion_info["brand of pruduct"] = extracted_brand
                            logger.info(f"   ✅ Extracted and added brand '{extracted_brand}' to portion info for '{ingredient}'")
                
                # Calculate scaled nutrition
                scale_factor = portion_grams / 100.0
                
                nutrition_data[ingredient] = {
                    **portion_info,
                    "calories": round(per_100g.get("calories_per_100g", 0) * scale_factor, 1),
                    "protein": round(per_100g.get("protein_per_100g", 0) * scale_factor, 1),
                    "fat": round(per_100g.get("fat_per_100g", 0) * scale_factor, 1),
                    "carbs": round(per_100g.get("carbs_per_100g", 0) * scale_factor, 1)
                }
            
            # ==================================================================
            # Calculate totals and check if they match targets
            # ==================================================================
            total_calories = sum(ing.get("calories", 0) for ing in nutrition_data.values())
            total_protein = sum(ing.get("protein", 0) for ing in nutrition_data.values())
            total_fat = sum(ing.get("fat", 0) for ing in nutrition_data.values())
            total_carbs = sum(ing.get("carbs", 0) for ing in nutrition_data.values())
            
            target_cals = macro_targets.get("calories", 0)
            target_protein = macro_targets.get("protein", 0)
            target_fat = macro_targets.get("fat", 0)
            target_carbs = macro_targets.get("carbs", 0)
            
            # Check if within acceptable range using dynamic margins
            # Lower values get higher tolerance (e.g., 10g protein → 60%, 50g protein → 30%)
            cals_ok = abs(total_calories - target_cals) / target_cals <= self._get_allowed_margin(target_cals) if target_cals > 0 else True
            protein_ok = abs(total_protein - target_protein) / target_protein <= self._get_allowed_margin(target_protein) if target_protein > 0 else True
            fat_ok = abs(total_fat - target_fat) / target_fat <= self._get_allowed_margin(target_fat) if target_fat > 0 else True
            carbs_ok = abs(total_carbs - target_carbs) / target_carbs <= self._get_allowed_margin(target_carbs) if target_carbs > 0 else True
            
            if cals_ok and protein_ok and fat_ok and carbs_ok:
                logger.info(f"✅ Macro targets achieved for '{dish_name}' ({meal_type}) [{option_type.upper()}]: Calories: {total_calories:.1f}/{target_cals}, Protein: {total_protein:.1f}/{target_protein}g, Fat: {total_fat:.1f}/{target_fat}g, Carbs: {total_carbs:.1f}/{target_carbs}g")
                break
            else:
                # If this is the last attempt, let Claude (Stage 4) handle the adjustment
                if refinement_attempt == max_refinement_attempts - 1:
                    logger.warning(f"⚠️ '{dish_name}' ({meal_type}) [{option_type.upper()}]: Portions still off after {refinement_attempt + 1} attempts. Letting Claude macro agent adjust portions directly.")
                    break  # Let Stage 4 fix it
                
                # Build detailed feedback for next iteration with FULL meal context
                feedback_parts = []
                if not cals_ok:
                    diff = total_calories - target_cals
                    feedback_parts.append(f"Calories: {total_calories:.1f} vs target {target_cals} ({diff:+.1f})")
                if not protein_ok:
                    diff = total_protein - target_protein
                    feedback_parts.append(f"Protein: {total_protein:.1f}g vs target {target_protein}g ({diff:+.1f}g)")
                if not fat_ok:
                    diff = total_fat - target_fat
                    feedback_parts.append(f"Fat: {total_fat:.1f}g vs target {target_fat}g ({diff:+.1f}g)")
                if not carbs_ok:
                    diff = total_carbs - target_carbs
                    feedback_parts.append(f"Carbs: {total_carbs:.1f}g vs target {target_carbs}g ({diff:+.1f}g)")
                
                # Build complete meal breakdown showing CURRENT STATE
                current_meal_breakdown = []
                current_meal_breakdown.append("CURRENT MEAL STATE:")
                for ing_name, ing_data in nutrition_data.items():
                    portion = ing_data.get("portionSI(gram)", ing_data.get("portion_grams", 0))
                    cals = ing_data.get("calories", 0)
                    prot = ing_data.get("protein", 0)
                    fat_val = ing_data.get("fat", 0)
                    carbs_val = ing_data.get("carbs", 0)
                    current_meal_breakdown.append(
                        f"  • {ing_name}: {portion}g → {cals:.1f}cal, {prot:.1f}g protein, {fat_val:.1f}g fat, {carbs_val:.1f}g carbs"
                    )
                
                current_meal_breakdown.append(f"\nTOTALS: {total_calories:.1f}cal, {total_protein:.1f}g protein, {total_fat:.1f}g fat, {total_carbs:.1f}g carbs")
                current_meal_breakdown.append(f"TARGETS: {target_cals}cal, {target_protein}g protein, {target_fat}g fat, {target_carbs}g carbs")
                current_meal_breakdown.append("\nPROBLEMS:")
                current_meal_breakdown.extend([f"  • {part}" for part in feedback_parts])
                
                # Add specific guidance on which ingredients to adjust
                adjustment_guidance = []
                adjustment_guidance.append("\nADJUSTMENT STRATEGY:")
                if not fat_ok and total_fat > target_fat:
                    # Find high-fat contributors
                    fat_contributors = [(name, data.get("fat", 0), data.get("portionSI(gram)", data.get("portion_grams", 0))) 
                                       for name, data in nutrition_data.items()]
                    fat_contributors.sort(key=lambda x: x[1], reverse=True)
                    top_fat = fat_contributors[:3]
                    adjustment_guidance.append(f"  • Fat is too high. Top contributors: {', '.join([f'{name} ({fat}g fat from {portion}g)' for name, fat, portion in top_fat])}")
                    adjustment_guidance.append(f"    → Reduce portions of these high-fat ingredients")
                
                if not protein_ok:
                    if total_protein > target_protein:
                        adjustment_guidance.append(f"  • Protein is too high. Reduce protein source portion.")
                    else:
                        adjustment_guidance.append(f"  • Protein is too low. Increase protein source portion.")
                
                if not carbs_ok:
                    if total_carbs > target_carbs:
                        adjustment_guidance.append(f"  • Carbs are too high. Reduce carb sources (bread, rice, etc.).")
                    else:
                        adjustment_guidance.append(f"  • Carbs are too low. Increase carb sources.")
                
                feedback_for_portions = "\n".join(current_meal_breakdown) + "\n" + "\n".join(adjustment_guidance)
                logger.warning(f"⚠️ '{dish_name}' ({meal_type}) [{option_type.upper()}]: Macro targets not met on attempt {refinement_attempt + 1}: {feedback_parts}")
        
        # ======================================================================
        # STAGE 4: Assemble final meal JSON with validation (Claude + CoT)
        # ======================================================================
        logger.info(f"🧠 Stage 4: Assembling and validating final meal JSON for '{dish_name}' ({meal_type}) [{option_type.upper()}]")
        
        # Calculate current totals to pass to Claude
        current_totals = {
            "calories": sum(ing.get("calories", 0) for ing in nutrition_data.values()),
            "protein": sum(ing.get("protein", 0) for ing in nutrition_data.values()),
            "fat": sum(ing.get("fat", 0) for ing in nutrition_data.values()),
            "carbs": sum(ing.get("carbs", 0) for ing in nutrition_data.values())
        }
        
        # Calculate dynamic margins for each macro
        margin_cals = self._get_allowed_margin(macro_targets.get("calories", 0)) * 100
        margin_protein = self._get_allowed_margin(macro_targets.get("protein", 0)) * 100
        margin_fat = self._get_allowed_margin(macro_targets.get("fat", 0)) * 100
        margin_carbs = self._get_allowed_margin(macro_targets.get("carbs", 0)) * 100
        
        # Calculate exact allowed ranges for clarity
        margin_cals_val = self._get_allowed_margin(target_cals)
        margin_protein_val = self._get_allowed_margin(target_protein)
        margin_fat_val = self._get_allowed_margin(target_fat)
        margin_carbs_val = self._get_allowed_margin(target_carbs)
        
        allowed_ranges = {
            "calories": [target_cals * (1 - margin_cals_val), target_cals * (1 + margin_cals_val)],
            "protein": [target_protein * (1 - margin_protein_val), target_protein * (1 + margin_protein_val)],
            "fat": [target_fat * (1 - margin_fat_val), target_fat * (1 + margin_fat_val)],
            "carbs": [target_carbs * (1 - margin_carbs_val), target_carbs * (1 + margin_carbs_val)]
        }
        
        # Add instruction for Claude to adjust portions if needed
        assembly_instruction = f"""
Current totals: {json.dumps(current_totals)}
Target totals: {json.dumps(macro_targets)}
Allowed ranges (must be WITHIN these ranges):
  Calories: {allowed_ranges['calories'][0]:.1f} - {allowed_ranges['calories'][1]:.1f} (target: {target_cals})
  Protein: {allowed_ranges['protein'][0]:.1f}g - {allowed_ranges['protein'][1]:.1f}g (target: {target_protein}g)
  Fat: {allowed_ranges['fat'][0]:.1f}g - {allowed_ranges['fat'][1]:.1f}g (target: {target_fat}g)
  Carbs: {allowed_ranges['carbs'][0]:.1f}g - {allowed_ranges['carbs'][1]:.1f}g (target: {target_carbs}g)

CRITICAL MATH CHECK:
- Current fat: {current_totals['fat']:.1f}g
- Allowed fat range: {allowed_ranges['fat'][0]:.1f}g - {allowed_ranges['fat'][1]:.1f}g
- Is {current_totals['fat']:.1f} BETWEEN {allowed_ranges['fat'][0]:.1f} and {allowed_ranges['fat'][1]:.1f}? If NO, adjust portions!

If current totals are OUTSIDE the allowed ranges, you MUST adjust portionSI(gram) for ingredients proportionally.

CALCULATION METHOD:
1. For each problematic macro, calculate: scale_factor = target / current
2. Identify which ingredients contribute most to the problem (e.g., if fat is too high, reduce high-fat ingredients like oil, butter, cheese)
3. Apply scale_factor to those ingredients' portionSI(gram)
4. Recalculate nutrition: new_nutrition = (nutrition_per_100g * new_portionSI / 100)
5. Verify new totals are WITHIN allowed ranges

Example: If fat is 42g but allowed max is 37.8g, and olive oil contributes 14g fat:
  - Scale factor = 27g (target) / 42g (current) = 0.643
  - If olive oil is 15g, reduce to: 15g * 0.643 = 9.6g
  - Recalculate: new_fat = (100g fat/100g * 9.6g) = 9.6g fat from oil

Keep portions culinary reasonable, but accuracy is more important than perfect portions.
"""
        
        assembly_result = self.assemble_meal(
            meal_type=meal_type,
            dish_name=dish_name,
            ingredients_with_portions=json.dumps(portions_dict) + "\n\n" + assembly_instruction,
            ingredients_with_nutrition=json.dumps(nutrition_data),
            macro_targets=json.dumps(macro_targets)
        )
        
        logger.info(f"🤔 '{dish_name}' ({meal_type}) [{option_type.upper()}]: CoT Reasoning: {assembly_result.reasoning}")
        
        # Parse final meal JSON with better error handling
        try:
            final_meal = json.loads(assembly_result.final_meal_json)
        except json.JSONDecodeError as e:
            # Fallback: try parsing as Python dict literal
            try:
                import ast
                final_meal = ast.literal_eval(assembly_result.final_meal_json)
                logger.warning(f"⚠️ Final meal JSON was in Python format, converted to dict. Please check prompt.")
            except Exception as e2:
                logger.error(f"❌ Failed to parse final_meal_json at Stage 4: {e}")
                logger.error(f"   Raw final_meal_json field: {assembly_result.final_meal_json[:500]}")
                raise
        
        # ======================================================================
        # POST-PROCESSING: Ensure brands are extracted and populated
        # ======================================================================
        ingredients = final_meal.get("ingredients", [])
        
        # Ensure brand is extracted from ingredient names if missing
        for ing in ingredients:
            item_name = ing.get("item", "")
            brand_field = ing.get("brand of pruduct", "").strip()
            
            # If brand field is empty but item name contains a brand, extract it
            if not brand_field and item_name:
                _, extracted_brand = self._extract_brand_from_ingredient(item_name)
                if extracted_brand:
                    ing["brand of pruduct"] = extracted_brand
                    logger.info(f"   ✅ Post-processing: Extracted brand '{extracted_brand}' from '{item_name}'")
        
        # ======================================================================
        # VALIDATION & CORRECTION: Ensure final meal actually meets targets
        # ======================================================================
        
        # CRITICAL: Backend validator has hard limit of 7 ingredients
        MAX_INGREDIENTS = 7
        if len(ingredients) > MAX_INGREDIENTS:
            logger.warning(f"⚠️ Stage 4 returned {len(ingredients)} ingredients (limit is {MAX_INGREDIENTS}). Reducing...")
            # Remove least important ingredients (usually spices or small additions at the end)
            while len(ingredients) > MAX_INGREDIENTS:
                removed = ingredients.pop()
                logger.info(f"   Removed ingredient to meet limit: {removed.get('item', 'unknown')}")
            final_meal["ingredients"] = ingredients
            logger.info(f"✅ Reduced to {len(ingredients)} ingredients")
        
        # Calculate actual totals from final meal
        actual_totals = {
            "calories": sum(ing.get("calories", 0) for ing in ingredients),
            "protein": sum(ing.get("protein", 0) for ing in ingredients),
            "fat": sum(ing.get("fat", 0) for ing in ingredients),
            "carbs": sum(ing.get("carbs", 0) for ing in ingredients)
        }
        
        target_cals = macro_targets.get("calories", 0)
        target_protein = macro_targets.get("protein", 0)
        target_fat = macro_targets.get("fat", 0)
        target_carbs = macro_targets.get("carbs", 0)
        
        # Check if within allowed margins
        cals_ok = abs(actual_totals["calories"] - target_cals) / target_cals <= self._get_allowed_margin(target_cals) if target_cals > 0 else True
        protein_ok = abs(actual_totals["protein"] - target_protein) / target_protein <= self._get_allowed_margin(target_protein) if target_protein > 0 else True
        fat_ok = abs(actual_totals["fat"] - target_fat) / target_fat <= self._get_allowed_margin(target_fat) if target_fat > 0 else True
        carbs_ok = abs(actual_totals["carbs"] - target_carbs) / target_carbs <= self._get_allowed_margin(target_carbs) if target_carbs > 0 else True
        
        if not (cals_ok and protein_ok and fat_ok and carbs_ok):
            logger.warning(f"⚠️ '{dish_name}' ({meal_type}) [{option_type.upper()}]: Claude's final meal doesn't meet targets. Applying programmatic correction...")
            logger.warning(f"   Actual: {actual_totals}")
            logger.warning(f"   Target: {macro_targets}")
            
            # Iterative correction: keep adjusting until we're within margins
            # Use smarter strategy: prioritize calories, use conservative adjustments, detect oscillation
            max_correction_iterations = 5
            previous_totals = None
            oscillation_detected = False
            
            for correction_iter in range(max_correction_iterations):
                # Recalculate current totals (may have changed from previous iteration)
                current_totals_iter = {
                    "calories": sum(ing.get("calories", 0) for ing in ingredients),
                    "protein": sum(ing.get("protein", 0) for ing in ingredients),
                    "fat": sum(ing.get("fat", 0) for ing in ingredients),
                    "carbs": sum(ing.get("carbs", 0) for ing in ingredients)
                }
                
                # Detect oscillation: if totals are bouncing back and forth
                if previous_totals:
                    cals_diff = abs(current_totals_iter["calories"] - previous_totals["calories"])
                    if cals_diff < 5 and correction_iter > 1:  # Very small change suggests oscillation
                        oscillation_detected = True
                        logger.warning(f"⚠️ Oscillation detected at iteration {correction_iter + 1}. Stopping correction.")
                        break
                
                previous_totals = current_totals_iter.copy()
                
                # Check if we're now within margins
                cals_ok_iter = abs(current_totals_iter["calories"] - target_cals) / target_cals <= self._get_allowed_margin(target_cals) if target_cals > 0 else True
                protein_ok_iter = abs(current_totals_iter["protein"] - target_protein) / target_protein <= self._get_allowed_margin(target_protein) if target_protein > 0 else True
                fat_ok_iter = abs(current_totals_iter["fat"] - target_fat) / target_fat <= self._get_allowed_margin(target_fat) if target_fat > 0 else True
                carbs_ok_iter = abs(current_totals_iter["carbs"] - target_carbs) / target_carbs <= self._get_allowed_margin(target_carbs) if target_carbs > 0 else True
                
                if cals_ok_iter and protein_ok_iter and fat_ok_iter and carbs_ok_iter:
                    logger.info(f"✅ Correction iteration {correction_iter + 1}: All macros now within margins!")
                    break
                
                # Identify which macros are off and by how much
                macro_errors = {}
                if not cals_ok_iter:
                    macro_errors["calories"] = (current_totals_iter["calories"] - target_cals) / target_cals
                if not protein_ok_iter:
                    macro_errors["protein"] = (current_totals_iter["protein"] - target_protein) / target_protein
                if not fat_ok_iter:
                    macro_errors["fat"] = (current_totals_iter["fat"] - target_fat) / target_fat
                if not carbs_ok_iter:
                    macro_errors["carbs"] = (current_totals_iter["carbs"] - target_carbs) / target_carbs
                
                logger.info(f"📊 '{dish_name}' ({meal_type}) [{option_type.upper()}]: Correction iteration {correction_iter + 1}: Macro errors: {macro_errors}")
                
                # PRIORITY: Fix calories first (most important), then others
                # Use conservative adjustments (0.85x to 1.15x) to avoid oscillation
                priority_macro = None
                if "calories" in macro_errors:
                    priority_macro = "calories"
                elif macro_errors:
                    # Pick the macro with largest error
                    priority_macro = max(macro_errors.items(), key=lambda x: abs(x[1]))[0]
                
                if not priority_macro:
                    break  # No errors to fix
                
                # Calculate target scale for priority macro only
                current_priority = current_totals_iter[priority_macro]
                target_priority = macro_targets[priority_macro]
                if current_priority > 0:
                    target_scale = target_priority / current_priority
                else:
                    target_scale = 1.0
                
                # Use conservative adjustment: only move 50% towards target to avoid overshooting
                conservative_scale = 1.0 + (target_scale - 1.0) * 0.5
                # Limit to conservative range (0.85x to 1.15x)
                conservative_scale = max(0.85, min(1.15, conservative_scale))
                
                # Only adjust ingredients that contribute significantly to the priority macro
                for ing in ingredients:
                    ing_value = ing.get(priority_macro, 0)
                    total_value = current_totals_iter[priority_macro]
                    
                    if total_value > 0 and ing_value > 0:
                        contribution = ing_value / total_value
                        # Only adjust if this ingredient contributes >10% to the problematic macro
                        if contribution > 0.1:
                            old_portion = ing.get("portionSI(gram)", 0)
                            new_portion = round(old_portion * conservative_scale, 1)
                            
                            if abs(conservative_scale - 1.0) > 0.01:  # Only log if significant change
                                logger.info(f"   '{dish_name}' [{option_type.upper()}]: {ing.get('item')}: {old_portion}g → {new_portion}g (factor: {conservative_scale:.3f}, fixing {priority_macro})")
                            
                            ing["portionSI(gram)"] = new_portion
                            
                            # Recalculate nutrition for this ingredient based on new portion
                            ing_name = ing.get("item", "")
                            per_100g = nutrition_per_100g.get(ing_name, {})
                            
                            if per_100g:
                                scale_factor = new_portion / 100.0
                                ing["calories"] = round(per_100g.get("calories_per_100g", 0) * scale_factor, 1)
                                ing["protein"] = round(per_100g.get("protein_per_100g", 0) * scale_factor, 1)
                                ing["fat"] = round(per_100g.get("fat_per_100g", 0) * scale_factor, 1)
                                ing["carbs"] = round(per_100g.get("carbs_per_100g", 0) * scale_factor, 1)
                            else:
                                # Fallback: scale nutrition proportionally
                                ing["calories"] = round(ing.get("calories", 0) * conservative_scale, 1)
                                ing["protein"] = round(ing.get("protein", 0) * conservative_scale, 1)
                                ing["fat"] = round(ing.get("fat", 0) * conservative_scale, 1)
                                ing["carbs"] = round(ing.get("carbs", 0) * conservative_scale, 1)
            
            # Final recalculation
            corrected_totals = {
                "calories": sum(ing.get("calories", 0) for ing in ingredients),
                "protein": sum(ing.get("protein", 0) for ing in ingredients),
                "fat": sum(ing.get("fat", 0) for ing in ingredients),
                "carbs": sum(ing.get("carbs", 0) for ing in ingredients)
            }
            
            logger.info(f"✅ '{dish_name}' ({meal_type}) [{option_type.upper()}]: Final corrected totals: {corrected_totals}")
        else:
            logger.info(f"✅ '{dish_name}' ({meal_type}) [{option_type.upper()}]: Final meal meets all macro targets: {actual_totals}")
        
        logger.info(f"✅ Stage 4 complete: Final meal JSON assembled and validated for '{dish_name}' ({meal_type}) [{option_type.upper()}]")
        
        return final_meal
    


# ============================================================================
# Configuration Helper
# ============================================================================

def configure_dspy_backends():
    """
    Configure DSPy LM backend (only once, thread-safe).
    
    ⚠️ MODEL CONFIGURATION NOTE:
    - Uses AZURE_OPENAI_DEPLOYMENT env var (default: "obi2")
    - This controls ALL DSPy stages in meal building:
      * Stage 1: Meal Naming & Ingredients
      * Stage 3: Portion Calculation  
      * Stage 4: Meal Assembly
    - Stage 2 (Nutrition Lookup) uses Gemini (disabled) → falls back to Claude/OBI2
    - To change model for all DSPy stages, set AZURE_OPENAI_DEPLOYMENT env var
    - Gemini is used separately for nutrition lookup only (currently disabled)
    """
    global _dspy_configured
    
    # Check if already configured
    if _dspy_configured:
        return
    
    # Thread-safe configuration
    if _dspy_lock:
        with _dspy_lock:
            if _dspy_configured:
                return
            logger.info("🔧 Configuring DSPy with Azure OpenAI for meal generation")
            _configure_azure_openai()
            _dspy_configured = True
    else:
        # No threading available, configure directly
        if not _dspy_configured:
            logger.info("🔧 Configuring DSPy with Azure OpenAI for meal generation")
            _configure_azure_openai()
            _dspy_configured = True


def _configure_azure_openai():
    """
    Configure DSPy to use Azure OpenAI (internal use only).
    
    Uses AZURE_OPENAI_DEPLOYMENT env var (default: "obi2").
    This model is used for all DSPy stages in the meal building pipeline.
    """
    deployment = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'obi2')
    api_base = os.getenv("AZURE_OPENAI_API_BASE")
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
    
    # DSPy requires azure/ prefix for Azure OpenAI models
    azure_lm = dspy.LM(
        model=f"azure/{deployment}",
        api_base=api_base,
        api_key=api_key,
        api_version=api_version,
        max_tokens=2048,
        temperature=0.7
    )
    dspy.settings.configure(lm=azure_lm)
    logger.info(f"✅ DSPy configured with Azure OpenAI: {deployment}")


# ============================================================================
# Public API
# ============================================================================

def build_meal_with_dspy(
    meal_type: str,
    macro_targets: Dict[str, float],
    required_protein_source: str,
    preferences: Dict[str, Any],
    max_retries: int = 3,
    option_type: str = "MAIN"
) -> Dict[str, Any]:
    """
    Build a complete meal using the DSPy pipeline.
    
    Args:
        meal_type: Type of meal (Breakfast, Lunch, etc.)
        macro_targets: Target macros (calories, protein, fat, carbs)
        required_protein_source: Required protein source
        preferences: User preferences dict
        max_retries: Max attempts if validation fails
    
    Returns:
        Complete meal dict, or None if all attempts fail
    """
    
    # Ensure DSPy is configured
    configure_dspy_backends()
    
    # Create pipeline
    pipeline = MealBuilderChain()
    
    # Execute with retries
    for attempt in range(max_retries):
        try:
            logger.info(f"🔄 DSPy meal building attempt {attempt + 1}/{max_retries}")
            
            result = pipeline.forward(
                meal_type=meal_type,
                macro_targets=macro_targets,
                required_protein_source=required_protein_source,
                preferences=preferences,
                option_type=option_type
            )
            
            logger.info(f"✅ DSPy pipeline successful on attempt {attempt + 1}")
            return result
            
        except Exception as e:
            logger.error(f"❌ DSPy pipeline failed on attempt {attempt + 1}: {e}")
            import traceback
            logger.error(f"   Traceback: {traceback.format_exc()}")
            if attempt == max_retries - 1:
                logger.error("❌ All DSPy attempts failed")
                return None
            continue
    
    return None


# ============================================================================
# Initialize DSPy on module import
# ============================================================================

try:
    configure_dspy_backends()
except Exception as e:
    logger.warning(f"⚠️ Failed to pre-configure DSPy on import: {e}")

