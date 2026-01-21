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
from pydantic import BaseModel, Field, validator
from enum import Enum

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
# Pydantic Models for Strict Schema Validation
# ============================================================================

class CulinaryRole(str, Enum):
    """Culinary role classification for ingredients."""
    PROTEIN_ANCHOR = "protein_anchor"  # Main protein source
    CARB_ANCHOR = "carb_anchor"        # Main carb source
    FAT_SOURCE = "fat_source"          # Primary fat contributor
    BASE = "base"                       # Low-calorie volume (vegetables)
    FLAVOR = "flavor"                   # Herbs, spices, small additions


class IngredientWithRole(BaseModel):
    """Ingredient with nutrition data and culinary role."""
    name: str = Field(..., description="Ingredient name with brand")
    role: CulinaryRole = Field(..., description="Culinary role in the dish")
    calories_per_100g: float = Field(..., ge=0)
    protein_per_100g: float = Field(..., ge=0)
    fat_per_100g: float = Field(..., ge=0)
    carbs_per_100g: float = Field(..., ge=0)
    brand: str = Field(default="", description="Brand name if applicable")


class PortionedIngredient(BaseModel):
    """Ingredient with calculated portion."""
    item: str = Field(..., description="Ingredient name")
    portionSI_gram: float = Field(..., alias="portionSI(gram)", ge=0)
    household_measure: str = Field(..., description="Human-readable measure")
    calories: float = Field(..., ge=0)
    protein: float = Field(..., ge=0)
    fat: float = Field(..., ge=0)
    carbs: float = Field(..., ge=0)
    brand_of_product: str = Field(default="", alias="brand of pruduct")
    
    class Config:
        populate_by_name = True
        validate_by_name = True  # Pydantic v2 renamed allow_population_by_field_name


class ValidatedMeal(BaseModel):
    """Complete meal with validation."""
    meal_name: str
    meal_title: str
    ingredients: List[PortionedIngredient]
    
    @validator('ingredients')
    def validate_ingredient_count(cls, v):
        if len(v) > 7:
            raise ValueError(f"Too many ingredients: {len(v)} (max 7)")
        if len(v) == 0:
            raise ValueError("No ingredients provided")
        return v
    
    def calculate_totals(self) -> Dict[str, float]:
        """Calculate nutrition totals."""
        return {
            "calories": sum(i.calories for i in self.ingredients),
            "protein": sum(i.protein for i in self.ingredients),
            "fat": sum(i.fat for i in self.ingredients),
            "carbs": sum(i.carbs for i in self.ingredients)
        }


# ============================================================================
# DSPy Signatures (Input/Output schemas for each stage)
# ============================================================================

class MealNaming(dspy.Signature):
    """You are a Regional Culinary Expert and Professional Nutritionist specializing in localized grocery sourcing. Your goal is to generate a precise ingredient list for a given dish that is safe, regionally accurate, and macro-aligned.

### INPUT DATA:
- **Meal Type:** {{meal_type}}
- **Dish Name:** {{dish_name}}
- **Target Macros:** {{macro_targets}}
- **Required Protein Source:** {{required_protein_source}}
- **Region:** {{region}}
- **Allergies to Avoid:** {{allergies}}
- **Dietary Limitations:** {{limitations}}
- **Ingredients to Avoid for Variety:** {{avoid_ingredients}}
- **Client Preference:** {{client_preference}} (Parse carefully; may be in Hebrew or English)

### MANDATORY REASONING STEPS:
1. **Safety Filter:** Identify all ingredients in {{allergies}} and {{limitations}}. These are strictly forbidden. If a core ingredient of the dish is an allergen, you must select a real-world, regional substitute (e.g., Almond milk for Dairy).
2. **Preference Parsing:** Analyze {{client_preference}}. Translate any Hebrew terms to English. Every food item mentioned by the client MUST be included in the list unless it violates a safety constraint.
3. **Core Identity & Protein:** Identify the essential items that define the {{dish_name}}. You must include the {{required_protein_source}} as the primary protein.
4. **Regional Brand Verification:** - Determine the dominant grocery brands in the specified {{region}}.
    - For Fresh Items (Produce, Eggs, Raw Meat): Use generic names (e.g., "Large Eggs", "Fresh Chicken Breast").
    - For Packaged/Branded Items (Dairy, Breads, Sauces, Oils): Use the web to find a real, popular brand in that specific region.
    - Format branded items as: "[Regional Brand] [Product Name] [Variant]".
5. **Macro Alignment:** Use the {{macro_targets}} to choose specific product versions (e.g., "Low Fat," "Whole Grain," or specific percentage of fat) and quantities that would logically fit these targets.
6. **Web Search Verification:** If you are unsure if a brand exists or is currently sold in the {{region}}, search the web to confirm its availability before including it.
7. **Deduplication:** Review the list for any overlapping ingredients. Each unique food item must appear only ONCE. For example, do not list "Eggs" and "Scrambled Eggs" separately; combine them into a single entry (e.g., "3 Large Eggs").

### STRICT CONSTRAINTS:
- **Atomic Items:** List ingredients as they are purchased, not as they are prepared (e.g., "Raw Chicken Breast" instead of "Grilled Chicken").
- **Maximum 7 Ingredients:** The list must contain exactly (or up to) 7 items total. No more.
- **English Only:** All outputted ingredient names and brand names must be in English.
- **Regional Consistency:** Never mix regions (e.g., do not suggest a US brand for a client in Israel).
- **No Hallucinations:** Every branded item must be a real product that a local could actually buy in a supermarket today.
- **Variety:** Do not include any ingredients listed in {{avoid_ingredients}}.
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
    """Role: Culinary Mathematician & Nutritionist.
    Objective: Calculate precise ingredient weights (grams) to hit macro targets using a prioritized anchor strategy.
    
    ### PHASE 1: ANCHOR-BASED CALCULATION HIERARCHY
    1. PROTEIN ANCHOR (Mandatory Start):
       - Calculate weight to meet the 'protein' target using the protein_anchor.
       - Formula: (target_protein / protein_per_100g) * 100.
       - CONSTRAINT: If the portion exceeds realistic volume (e.g., >250g meat or >4 eggs), cap it and distribute the remaining protein deficit to the ingredient with the next highest protein density.
    
    2. CARB ANCHOR:
       - Calculate weight to meet 'carbs' target after accounting for carbs already present in the protein anchor.
       - Formula: ((target_carbs - carbs_from_protein) / carbs_per_100g) * 100.
    
    3. FAT SOURCES:
       - Use fat_source ingredients to fill the remaining 'calorie' gap.
       - Ensure fat does not exceed 35% of total calories unless the dish is fat-dominant (e.g., Keto).
    
    4. BASE & FLAVOR (Fillers):
       - Add 'Base' (vegetables) at 50g–200g and 'Flavor' at 1g–15g. These are macro-neutral.

    ### PHASE 2: CULINARY PLAUSIBILITY & DISCRETE LOGIC
    - DISCRETE ITEMS: Ingredients like eggs or bread slices must be ROUNDED to the nearest whole number.
    - FLEXIBLE ITEMS: Grains, meats, and oils can use exact decimals (e.g., 32.5g).
    - VOLUME CHECK: Total meal weight must stay between 200g and 850g.
    - RATIO CHECK: The protein anchor should visually be the main component of the plate.

    ### PHASE 3: OUTPUT REQUIREMENTS
    - All output must be in ENGLISH.
    - Ensure 'portionSI' is a numeric value.
    - 'household_measure' should be user-friendly (e.g., "1.5 cups", "2 large eggs", "1 tbsp").
    
    ### PHASE 4: FEEDBACK ADJUSTMENT (if provided)
    - If 'feedback_from_validation' is provided, it contains specific instructions from previous validation attempts.
    - READ the feedback carefully and ADJUST portions accordingly.
    - The feedback will specify which ingredients to reduce/increase and by how much.
    - Example: "Reduce Tnuva White Cheese 5% to 144g and olive oil to 5g" → Use EXACTLY these values.
    - DO NOT ignore feedback - it means previous calculations were incorrect.
    """
    
    dish_name = dspy.InputField(desc="Name of the dish")
    ingredients_with_roles = dspy.InputField(desc="JSON list of ingredients with: name, role (protein_anchor/carb_anchor/fat_source/base/flavor), calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, brand")
    macro_targets = dspy.InputField(desc="Target macros for ENTIRE MEAL: {calories, protein, fat, carbs}")
    required_protein_source = dspy.InputField(desc="Main protein source (must match protein_anchor)")
    feedback_from_validation = dspy.InputField(desc="Optional feedback from validation stage with specific adjustments needed. If provided, MUST follow these instructions exactly.")
    
    calculated_portions = dspy.OutputField(desc="JSON in ENGLISH: {ingredient: {portionSI(gram): <number>, household_measure: '<text>', brand of pruduct: '<brand>'}}")
    culinary_reasoning = dspy.OutputField(desc="Brief explanation of portion logic: which anchors were used first, how ratios maintain dish integrity")


class NutritionLookup(dspy.Signature):
    """Look up accurate nutrition data for an ingredient at a specific portion size."""
    
    ingredient_query = dspy.InputField(desc="Full ingredient name with brand")
    portion_grams = dspy.InputField(desc="Portion size in grams")
    
    nutrition_data = dspy.OutputField(desc="JSON with calories, protein_g, fat_g, carbohydrates_g for this portion")


class MealValidation(dspy.Signature):
    """
    Role: Senior Culinary Auditor & Macro Specialist.
    Objective: Perform a rigorous 4-point audit of the meal plan against targets and culinary standards.

    ### AUDIT PROTOCOL (Internal Monologue):
    1. MATHEMATICAL AUDIT: Calculate the current totals for Calories, Protein, Fat, and Carbs. Compare against `macro_targets` using `allowed_margins`. 
    
    2. CULINARY SCALE AUDIT: 
       - Total weight check: Sum all grams. If < 200g or > 850g, flag as unrealistic.

    3. FAT & SENSORY AUDIT: 
       - Ensure fat isn't overwhelming the dish (target 20-35% of total calories).
       - Flag excessive oil (>20g) or butter (>15g) as "Culinary Implausibility" unless it is a specific high-fat meal.

    4. COMPLIANCE AUDIT: 
       - Confirm the ingredient count is ≤ 7.
       - Confirm all ingredients are in English and include regional brands where required.
    
    ### FEEDBACK GENERATION RULES:
    When providing feedback, distinguish between DISCRETE and FLEXIBLE items:
    - DISCRETE ITEMS: Ingredients like eggs or bread slices must be ROUNDED to the nearest whole number.
    - FLEXIBLE ITEMS: Grains, meats, and oils can use exact decimals (e.g., 32.5g).
    - VOLUME CHECK: Total meal weight must stay between 200g and 850g.
    - RATIO CHECK: The protein anchor should visually be the main component of the plate.
    """
    
    dish_name = dspy.InputField(desc="Name of the dish")
    meal_plan = dspy.InputField(desc="Complete meal with ingredients and portions")
    macro_targets = dspy.InputField(desc="Target macros: {calories, protein, fat, carbs}")
    allowed_margins = dspy.InputField(desc="Allowed deviation margins for each macro")
    
    is_valid = dspy.OutputField(desc="Boolean: true if meal passes all checks, false otherwise")
    feedback = dspy.OutputField(desc="If invalid: Specific instructions on what to adjust. If valid: Brief confirmation. Format: 'ISSUE: description | FIX: specific adjustment with numbers'")


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
    
    def _classify_culinary_role(
        self, 
        ingredient_name: str, 
        required_protein_source: str,
        nutrition_per_100g: Dict[str, float]
    ) -> CulinaryRole:
        """
        Classify ingredient by its culinary role in the dish.
        
        Uses heuristics based on:
        1. Ingredient name and required protein source
        2. Macro ratios (protein%, fat%, carb%)
        3. Common culinary patterns
        """
        name_lower = ingredient_name.lower()
        protein = nutrition_per_100g.get("protein_per_100g", 0)
        fat = nutrition_per_100g.get("fat_per_100g", 0)
        carbs = nutrition_per_100g.get("carbs_per_100g", 0)
        calories = nutrition_per_100g.get("calories_per_100g", 1)  # Avoid div by zero
        
        # Calculate macro percentages (as % of calories)
        protein_pct = (protein * 4) / calories if calories > 0 else 0
        fat_pct = (fat * 9) / calories if calories > 0 else 0
        carbs_pct = (carbs * 4) / calories if calories > 0 else 0
        
        # PROTEIN ANCHOR: High protein foods that match required protein source
        protein_keywords = [
            "chicken", "beef", "turkey", "fish", "salmon", "tuna", "cod", "tilapia",
            "egg", "tofu", "tempeh", "seitan", "protein powder", "cottage cheese",
            "greek yogurt", "quark", "shrimp", "prawns", "lamb", "pork", "duck"
        ]
        required_protein_lower = required_protein_source.lower()
        
        # Check if this is the required protein source
        is_protein_match = any(keyword in name_lower for keyword in protein_keywords)
        is_required_protein = any(word in name_lower for word in required_protein_lower.split())
        
        if (is_protein_match or is_required_protein) and protein_pct > 0.25:
            return CulinaryRole.PROTEIN_ANCHOR
        
        # CARB ANCHOR: High carb foods
        carb_keywords = [
            "rice", "pasta", "bread", "pita", "bagel", "tortilla", "noodle",
            "potato", "sweet potato", "quinoa", "oats", "oatmeal", "couscous",
            "bulgur", "barley", "corn", "polenta", "crackers", "cereal"
        ]
        if any(keyword in name_lower for keyword in carb_keywords) and carbs_pct > 0.40:
            return CulinaryRole.CARB_ANCHOR
        
        # FAT SOURCE: High fat foods
        fat_keywords = [
            "oil", "olive oil", "butter", "ghee", "tahini", "mayo", "mayonnaise",
            "avocado", "nuts", "almond", "walnut", "cashew", "peanut", "seeds",
            "chia", "flax", "sesame", "hummus", "cheese", "cream cheese"
        ]
        if any(keyword in name_lower for keyword in fat_keywords) and (fat_pct > 0.40 or fat > 15):
            return CulinaryRole.FAT_SOURCE
        
        # BASE: Low-calorie vegetables
        base_keywords = [
            "lettuce", "spinach", "kale", "arugula", "cucumber", "tomato",
            "pepper", "bell pepper", "zucchini", "eggplant", "broccoli", "cauliflower",
            "cabbage", "celery", "mushroom", "onion", "garlic", "carrot", "beet"
        ]
        if any(keyword in name_lower for keyword in base_keywords) and calories < 50:
            return CulinaryRole.BASE
        
        # FLAVOR: Herbs, spices, condiments
        flavor_keywords = [
            "spice", "herb", "salt", "pepper", "cumin", "paprika", "oregano",
            "basil", "parsley", "cilantro", "dill", "thyme", "rosemary", "garlic powder",
            "onion powder", "cinnamon", "vanilla", "lemon juice", "lime juice", "vinegar"
        ]
        if any(keyword in name_lower for keyword in flavor_keywords):
            return CulinaryRole.FLAVOR
        
        # Default fallback logic based on macro dominance
        if protein_pct > 0.30:
            return CulinaryRole.PROTEIN_ANCHOR
        elif carbs_pct > 0.50:
            return CulinaryRole.CARB_ANCHOR
        elif fat_pct > 0.50:
            return CulinaryRole.FAT_SOURCE
        elif calories < 40:
            return CulinaryRole.BASE
        else:
            return CulinaryRole.BASE  # Default to base for unclassified items
    
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
        self.validate_meal = dspy.ChainOfThought(MealValidation)
        self.assemble_meal = dspy.ChainOfThought(MealAssembly)
        
        # Custom Gemini lookup
        self.nutrition_lookup = GeminiNutritionLookup()
        
        # Track if we've already logged region (only log once per instance)
        self._region_logged = False
    
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
        
        # Normalize region (handle case sensitivity, whitespace)
        if region:
            region = region.strip().lower()
        else:
            region = "israel"
        
        # Debug logging for region (only once per instance, since it's the same user)
        if not self._region_logged:
            logger.info(f"🌍 Region from preferences: '{region}' (type: {type(region)})")
            if not preferences.get("region") or region == "israel":
                logger.warning(f"⚠️ Using default region 'israel' - check if user's region is set correctly in database")
            self._region_logged = True
        
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
        # STAGE 2.5: Classify culinary roles for each ingredient
        # ======================================================================
        logger.info(f"🧠 Stage 2.5: Classifying culinary roles for ingredients")
        
        ingredients_with_roles = []
        for ingredient, nutrition_data in nutrition_per_100g.items():
            role = self._classify_culinary_role(
                ingredient_name=ingredient,
                required_protein_source=required_protein_source,
                nutrition_per_100g=nutrition_data
            )
            
            ingredient_with_role = {
                "name": ingredient,
                "role": role.value,
                "calories_per_100g": nutrition_data["calories_per_100g"],
                "protein_per_100g": nutrition_data["protein_per_100g"],
                "fat_per_100g": nutrition_data["fat_per_100g"],
                "carbs_per_100g": nutrition_data["carbs_per_100g"],
                "brand": nutrition_data.get("brand", "")
            }
            ingredients_with_roles.append(ingredient_with_role)
            
            logger.info(f"   • {ingredient}: {role.value}")
        
        # Validate role distribution
        role_counts = {}
        for ing in ingredients_with_roles:
            role = ing["role"]
            role_counts[role] = role_counts.get(role, 0) + 1
        
        logger.info(f"   Role distribution: {role_counts}")
        
        # Ensure we have at least one protein anchor (critical)
        if role_counts.get(CulinaryRole.PROTEIN_ANCHOR.value, 0) == 0:
            logger.warning(f"⚠️ No protein anchor detected! Adjusting classification...")
            # Find the ingredient with highest protein and make it protein anchor
            max_protein_ing = max(ingredients_with_roles, key=lambda x: x["protein_per_100g"])
            max_protein_ing["role"] = CulinaryRole.PROTEIN_ANCHOR.value
            logger.info(f"   Promoted '{max_protein_ing['name']}' to protein_anchor")
        
        logger.info(f"✅ Stage 2.5 complete: All ingredients classified by culinary role")
        
        # ======================================================================
        # STAGE 3: Calculate portions using role-based strategy
        # ======================================================================
        max_refinement_attempts = 3  # Use validation feedback loop instead of many refinements
        portions_dict = None
        culinary_reasoning = ""
        feedback_for_portions = None
        
        for refinement_attempt in range(max_refinement_attempts):
            # ==================================================================
            # STAGE 3: Calculate portions using role-based strategy (Claude)
            # ==================================================================
            if refinement_attempt == 0:
                logger.info(f"🧠 Stage 3: Calculating portions for {dish_name} using role-based strategy")
            else:
                logger.info(f"🔄 Stage 3 (retry {refinement_attempt + 1}): Adjusting based on validation feedback")
            
            # Build input with roles and optional feedback
            stage3_input = {
                "ingredients_with_roles": ingredients_with_roles,
                "macro_targets": macro_targets
            }
            
            # Prepare feedback for PortionCalculation
            feedback_text = feedback_for_portions if feedback_for_portions else ""
            if feedback_for_portions:
                logger.info(f"   📋 Applying feedback: {feedback_for_portions[:200]}...")
            
            portion_result = self.calculate_portions(
                dish_name=dish_name,
                ingredients_with_roles=json.dumps(ingredients_with_roles, indent=2),
                macro_targets=json.dumps(macro_targets),
                required_protein_source=required_protein_source,
                feedback_from_validation=feedback_text
            )
            
            culinary_reasoning = portion_result.culinary_reasoning
            logger.info(f"   🤔 Culinary reasoning: {culinary_reasoning}")
            
            # Parse portions JSON with better error handling
            try:
                portions_dict = json.loads(portion_result.calculated_portions)
            except json.JSONDecodeError as e:
                # Fallback: try parsing as Python dict literal
                try:
                    import ast
                    portions_dict = ast.literal_eval(portion_result.calculated_portions)
                    logger.warning(f"⚠️ Portions were in Python format, converted to dict. Please check prompt.")
                except Exception as e2:
                    logger.error(f"❌ Failed to parse portions JSON at Stage 3: {e}")
                    logger.error(f"   Raw portions field: {portion_result.calculated_portions[:500]}")
                    raise
            
            logger.info(f"   ✅ Portions calculated for {len(portions_dict)} ingredients")
            
            # ==================================================================
            # Calculate actual nutrition based on portions
            # ==================================================================
            nutrition_data = {}
            
            for ingredient, portion_info in portions_dict.items():
                # Try correct field name first, fallback to old name
                portion_grams = portion_info.get("portionSI(gram)", portion_info.get("portion_grams", 0))
                
                # Get the per-100g data from ingredients_with_roles
                per_100g = None
                for ing_role in ingredients_with_roles:
                    if ing_role["name"] == ingredient:
                        per_100g = ing_role
                        break
                
                if not per_100g:
                    # Fallback to old nutrition_per_100g dict
                    per_100g = nutrition_per_100g.get(ingredient, {})
                
                # Ensure brand is included
                brand_in_portion = portion_info.get("brand of pruduct", "").strip()
                if not brand_in_portion:
                    brand_from_stage2 = per_100g.get("brand", "")
                    if brand_from_stage2:
                        portion_info["brand of pruduct"] = brand_from_stage2
                
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
            # STAGE 3.5: Validate meal with DSPy assertions
            # ==================================================================
            logger.info(f"🔍 Stage 3.5: Validating meal structure and macros")
            
            # Build meal structure for validation
            temp_meal = {
                "meal_name": meal_type,
                "meal_title": dish_name,
                "ingredients": [
                    {
                        "item": ing_name,
                        **ing_data
                    }
                    for ing_name, ing_data in nutrition_data.items()
                ]
            }
            
            # Calculate totals
            total_calories = sum(ing.get("calories", 0) for ing in temp_meal["ingredients"])
            total_protein = sum(ing.get("protein", 0) for ing in temp_meal["ingredients"])
            total_fat = sum(ing.get("fat", 0) for ing in temp_meal["ingredients"])
            total_carbs = sum(ing.get("carbs", 0) for ing in temp_meal["ingredients"])
            total_weight = sum(ing.get("portionSI(gram)", ing.get("portion_grams", 0)) for ing in temp_meal["ingredients"])
            
            # Calculate allowed margins
            target_cals = macro_targets.get("calories", 0)
            target_protein = macro_targets.get("protein", 0)
            target_fat = macro_targets.get("fat", 0)
            target_carbs = macro_targets.get("carbs", 0)
            
            allowed_margins = {
                "calories": self._get_allowed_margin(target_cals),
                "protein": self._get_allowed_margin(target_protein),
                "fat": self._get_allowed_margin(target_fat),
                "carbs": self._get_allowed_margin(target_carbs)
            }
            
            # DSPy Suggestions for culinary logic
            try:
                # Check 1: Total meal weight plausibility
                dspy.Suggest(
                    200 <= total_weight <= 800,
                    f"Total meal weight ({total_weight:.0f}g) should be between 200-800g for realistic portion. "
                    f"Consider adjusting portions proportionally."
                )
                
                # Check 2: Fat ratio plausibility
                fat_calories = total_fat * 9
                fat_ratio = fat_calories / total_calories if total_calories > 0 else 0
                dspy.Suggest(
                    fat_ratio <= 0.45,
                    f"Fat provides {fat_ratio*100:.0f}% of calories (should be <45%). "
                    f"Reduce fat sources to maintain culinary balance."
                )
                
                # Check 3: Protein anchor should be substantial
                protein_anchor_portions = [
                    ing["portionSI(gram)"] if "portionSI(gram)" in ing else ing.get("portion_grams", 0)
                    for ing in temp_meal["ingredients"]
                    for role_ing in ingredients_with_roles
                    if role_ing["name"] == ing["item"] and role_ing["role"] == CulinaryRole.PROTEIN_ANCHOR.value
                ]
                if protein_anchor_portions:
                    max_protein_portion = max(protein_anchor_portions)
                    dspy.Suggest(
                        max_protein_portion >= 80,
                        f"Protein anchor portion ({max_protein_portion:.0f}g) seems small. "
                        f"Consider increasing to at least 80-100g for a proper meal."
                    )
                
            except Exception as assertion_error:
                # DSPy suggestions failed - log but continue
                logger.warning(f"⚠️ DSPy suggestion triggered: {assertion_error}")
                # Don't break - let validation stage provide feedback
            
            # Call validation stage
            validation_result = self.validate_meal(
                dish_name=dish_name,
                meal_plan=json.dumps(temp_meal, indent=2),
                macro_targets=json.dumps(macro_targets),
                allowed_margins=json.dumps(allowed_margins)
            )
            
            # Parse validation result
            try:
                is_valid = validation_result.is_valid.strip().lower() in ["true", "yes", "valid"]
            except:
                is_valid = False
            
            validation_feedback = validation_result.feedback
            
            logger.info(f"   Validation: {'✅ VALID' if is_valid else '❌ INVALID'}")
            logger.info(f"   Feedback: {validation_feedback}")
            
            if is_valid:
                logger.info(f"✅ Stage 3 complete: Meal validated successfully!")
                logger.info(f"   Totals: {total_calories:.0f}cal, {total_protein:.0f}g protein, {total_fat:.0f}g fat, {total_carbs:.0f}g carbs")
                logger.info(f"   Targets: {target_cals}cal, {target_protein}g protein, {target_fat}g fat, {target_carbs}g carbs")
                break
            else:
                # Validation failed - use feedback for next iteration
                if refinement_attempt == max_refinement_attempts - 1:
                    logger.warning(f"⚠️ '{dish_name}' ({meal_type}) [{option_type.upper()}]: Validation failed after {refinement_attempt + 1} attempts.")
                    logger.warning(f"   Proceeding to Stage 4 for final assembly and programmatic correction.")
                    break
                
                # Prepare feedback for next portion calculation attempt
                feedback_for_portions = f"""VALIDATION FAILED - ADJUST PORTIONS:

{validation_feedback}

CURRENT TOTALS:
- Calories: {total_calories:.0f} (target: {target_cals})
- Protein: {total_protein:.0f}g (target: {target_protein}g)
- Fat: {total_fat:.0f}g (target: {target_fat}g)
- Carbs: {total_carbs:.0f}g (target: {target_carbs}g)
- Total weight: {total_weight:.0f}g

Use the feedback above to recalculate portions."""
                
                logger.warning(f"⚠️ Retry {refinement_attempt + 2}: Adjusting portions based on validation feedback")
        
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
