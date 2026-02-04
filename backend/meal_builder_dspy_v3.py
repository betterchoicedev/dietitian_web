"""
DSPy Meal Architect & Builder (v3.1) - Two-Stage Pipeline
----------------------------------------------------------
Stage 1 (Architect): Skeleton Structure → Specific Menu with Dish Names
Stage 2 (Builder): Menu → Exact Ingredients with Portions

Key Features:
- Generates creative dish names from simple descriptions
- Enforces user constraints at both stages
- Uses ChainOfThought for better reasoning
- Calculates precise portions to hit macro targets
"""

import dspy
import os
import json
import logging
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
logger = logging.getLogger(__name__)

# Global configuration tracking
_dspy_configured = False
_dspy_lock = None

try:
    import threading
    _dspy_lock = threading.Lock()
except ImportError:
    _dspy_lock = None

# ============================================================================
# 1. Pydantic Models (The Schema)
# ============================================================================

# --- Phase 1: Template Models (The Menu) ---
class MealOptionTemplate(BaseModel):
    """A specific dish concept (e.g., 'Quinoa Salad with Tofu')."""
    name: str = Field(description="Creative and appetizing name of the dish")
    main_protein_source: str = Field(description="The primary protein ingredient")
    calories: float = Field(ge=0)
    protein: float = Field(ge=0)
    fat: float = Field(ge=0)
    
    class Config:
        populate_by_name = True


class MealTemplateItem(BaseModel):
    """Container for Main and Alternative choices for one meal slot."""
    meal: str = Field(description="Meal name (e.g. Breakfast)")
    main: MealOptionTemplate
    alternative: MealOptionTemplate


class DailyTemplate(BaseModel):
    """The generated list of meal templates."""
    meals: List[MealTemplateItem]


# --- Phase 2: Ingredient Models (The Recipe) ---
class Ingredient(BaseModel):
    """Individual ingredient with nutrition data."""
    item: str = Field(description="Name of the ingredient")
    fat: float = Field(ge=0, description="Fat in grams")
    carbs: float = Field(ge=0, description="Carbohydrates in grams")
    protein: float = Field(ge=0, description="Protein in grams")
    calories: float = Field(ge=0, description="Total calories")
    portionSI_gram: float = Field(alias="portionSI(gram)", ge=0, description="Portion size in grams")
    brand_of_product: str = Field(alias="brand of pruduct", default="", description="Brand name if applicable")
    household_measure: str = Field(description="Human-readable measure (e.g., '1 cup', '2 tbsp')")
    
    class Config:
        populate_by_name = True


class Nutrition(BaseModel):
    """Nutrition totals."""
    fat: float = Field(ge=0)
    carbs: float = Field(ge=0)
    protein: float = Field(ge=0)
    calories: float = Field(ge=0)


class DetailedOption(BaseModel):
    """A single meal option with full details."""
    meal_name: str = Field(description="Meal type (e.g., 'Breakfast', 'Lunch')")
    nutrition: Nutrition = Field(description="Calculated nutrition totals")
    meal_title: str = Field(description="Name of the dish")
    ingredients: List[Ingredient] = Field(description="List of ingredients with portions")
    main_protein_source: str = Field(description="Primary protein source")


class MealEntry(BaseModel):
    """Main meal and alternative option."""
    main: DetailedOption = Field(description="Primary meal option")
    meal: str = Field(description="Meal type identifier")
    alternative: DetailedOption = Field(description="Alternative meal option")


class FullMealPlan(BaseModel):
    """Complete meal plan for the day."""
    note: str = Field(default="", description="Optional notes about the plan")
    meals: List[MealEntry] = Field(description="All meals for the day")
    totals: Nutrition = Field(description="Daily nutrition totals")


# ============================================================================
# 2. DSPy Signatures
# ============================================================================

class GenerateMealTemplate(dspy.Signature):
    """
    You are a Creative Nutrition Architect designing appealing, constraint-aware meals.
    
    Convert the 'meal_plan_structure' (skeleton with descriptions and calories) 
    into a specific Daily Menu with concrete dish names.
    
    CRITICAL RULES:
    1. STRICTLY follow the 'description' in the structure (e.g., if it says "Soup", create a soup dish)
    2. Match the Calorie target for each meal (±5%)
    3. Ensure 'Main' and 'Alternative' are DISTINCT culinary options (different cuisines/styles)
    4. ABSOLUTELY RESPECT all User Constraints:
       - ALLERGIES: Complete avoidance (e.g., no peanuts if allergic)
       - DIETARY LIMITS: Follow restrictions (e.g., vegetarian = no meat)
       - MEDICAL: Adjust for conditions (e.g., diabetes = low sugar)
    5. Create appetizing, realistic dish names (not just ingredient lists)
    6. Specify the main_protein_source for each dish
    7. Estimate realistic protein and fat targets based on calories and dish type
    
    EXAMPLES:
    - Skeleton: "Salad with protein" → Menu: "Mediterranean Chickpea Salad with Feta"
    - Skeleton: "Soup" + Vegan → Menu: "Creamy Coconut Lentil Soup" (not "Chicken Soup")
    - Skeleton: "Breakfast with eggs" + Gluten-Free → Menu: "Veggie Scramble with Sweet Potato Hash"
    """
    user_constraints: str = dspy.InputField(
        desc="User's allergies, dietary limitations, and medical conditions"
    )
    user_goal: str = dspy.InputField(
        desc="User's nutrition goal (e.g., Weight Loss, Muscle Gain, Maintenance)"
    )
    meal_plan_structure: str = dspy.InputField(
        desc="JSON skeleton: [{meal, calories, description, calories_pct}, ...]"
    )
    user_region: str = dspy.InputField(
        default="",
        desc="User's region for culturally appropriate dishes"
    )
    
    reasoning: str = dspy.OutputField(
        desc="Brief explanation of dish choices and how they respect constraints"
    )
    daily_template_json: str = dspy.OutputField(
        desc="""JSON array of meal templates following this EXACT schema:
[{
  "meal": "Breakfast",
  "main": {
    "name": "Dish name",
    "main_protein_source": "primary protein",
    "calories": 450.0,
    "protein": 30.0,
    "fat": 15.0
  },
  "alternative": {
    "name": "Different dish name",
    "main_protein_source": "different protein",
    "calories": 450.0,
    "protein": 30.0,
    "fat": 15.0
  }
}, ...]

CRITICAL: Return ONLY valid JSON, no markdown, no explanations."""
    )


class GenerateIngredients(dspy.Signature):
    """
    You are a Precision Nutritionist calculating exact ingredient portions.
    
    Given a dish title and target macros, determine the EXACT ingredients and portions
    needed to hit the nutritional targets.
    
    MATH INSTRUCTIONS (CRITICAL):
    1. List 3-7 ingredients that make up this dish
    2. For each ingredient, calculate 'portionSI(gram)' to match targets:
       - Start with realistic base portions
       - Calculate calories per gram for each ingredient
       - Adjust portions until sum matches target_calories (±5%)
       - Ensure protein sum is close to target_protein (±10%)
    3. Include fat and carbs for each ingredient
    4. Provide household_measure (e.g., "1 cup", "2 tbsp", "100g")
    
    CONSTRAINT RULES (ABSOLUTE):
    - STRICTLY EXCLUDE any ingredients from 'user_constraints'
    - If dish name implies forbidden ingredient, SUBSTITUTE:
      * "Pasta" + Gluten-Free → "Gluten-Free Pasta" or "Zucchini Noodles"
      * "Peanut Butter" + Peanut Allergy → "Almond Butter"
      * "Honey" + Diabetes → "Stevia" or small portion berries
      * "Chicken" + Vegetarian → "Tofu" or "Tempeh"
    
    REGIONAL PREFERENCES:
    - Use local brands when specified (e.g., Tnuva, Strauss for Israel)
    - Adapt to regional food availability
    
    OUTPUT FORMAT:
    Return a JSON array of ingredients with this EXACT schema:
    [
      {
        "item": "Ingredient name",
        "portionSI(gram)": 150.0,
        "household_measure": "1 cup",
        "calories": 120.0,
        "protein": 8.0,
        "fat": 5.0,
        "carbs": 15.0,
        "brand of pruduct": "Brand name or empty string"
      },
      ...
    ]
    """
    meal_title: str = dspy.InputField(desc="Name of the dish to build")
    target_calories: float = dspy.InputField(desc="Target total calories for this meal")
    target_protein: float = dspy.InputField(desc="Target protein in grams")
    target_fat: float = dspy.InputField(desc="Target fat in grams")
    main_source: str = dspy.InputField(desc="The primary protein source")
    user_constraints: str = dspy.InputField(
        desc="Allergies, dietary limitations, medical conditions to respect"
    )
    user_region: str = dspy.InputField(
        default="",
        desc="User's region for local ingredient/brand preferences"
    )
    
    reasoning: str = dspy.OutputField(
        desc="Step-by-step calculation showing how portions were determined"
    )
    ingredients_json: str = dspy.OutputField(
        desc="JSON array of ingredients with exact portions (no markdown, pure JSON)"
    )


# ============================================================================
# 3. Helper Functions
# ============================================================================

def _format_constraints_helper(user_data: dict) -> str:
    """Format user constraints into a clear string for LLM."""
    parts = []
    
    if user_data.get('food_allergies'):
        allergies = str(user_data['food_allergies']).strip()
        if allergies and allergies.lower() not in ['none', 'n/a', '']:
            parts.append(f"ALLERGIES: {allergies}")
    
    if user_data.get('food_limitations'):
        limitations = str(user_data['food_limitations']).strip()
        if limitations and limitations.lower() not in ['none', 'n/a', '']:
            parts.append(f"DIETARY LIMITS: {limitations}")
    
    if user_data.get('medical_conditions'):
        conditions = str(user_data['medical_conditions']).strip()
        if conditions and conditions.lower() not in ['none', 'n/a', '']:
            parts.append(f"MEDICAL CONDITIONS: {conditions}")
    
    return " | ".join(parts) if parts else "None"


def _parse_json_safely(json_str: str, expected_type: str = "object") -> Any:
    """
    Parse JSON from LLM output, handling markdown code blocks and other formatting.
    """
    if not json_str:
        return None
    
    # Remove markdown code blocks
    json_str = json_str.strip()
    if json_str.startswith("```"):
        # Remove opening ```json or ```
        lines = json_str.split('\n')
        if lines[0].startswith("```"):
            lines = lines[1:]
        # Remove closing ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        json_str = '\n'.join(lines)
    
    # Remove any leading/trailing whitespace
    json_str = json_str.strip()
    
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON: {e}")
        logger.error(f"Raw string: {json_str[:500]}...")
        return None


# ============================================================================
# 4. DSPy Modules
# ============================================================================

class MealTemplateArchitect(dspy.Module):
    """
    Stage 1: Convert Skeleton Structure → Specific Menu with Dish Names
    
    Takes a simple structure like:
    [{"meal": "Breakfast", "calories": 450, "description": "Eggs with vegetables"}]
    
    Returns a detailed template with:
    [{"meal": "Breakfast", "main": {...}, "alternative": {...}}]
    """
    
    def __init__(self):
        super().__init__()
        # Use ChainOfThought for better reasoning
        self.architect = dspy.ChainOfThought(GenerateMealTemplate)
    
    def forward(
        self, 
        user_data: dict, 
        structure_list: list,
        user_region: str = ""
    ) -> List[Dict[str, Any]]:
        """
        Generate meal templates from skeleton structure.
        
        Args:
            user_data: User profile with constraints
            structure_list: List of meal skeletons with descriptions
            user_region: User's region for dish preferences
        
        Returns:
            List of meal template dictionaries
        """
        try:
            structure_str = json.dumps(structure_list, ensure_ascii=False, indent=2)
            constraints = _format_constraints_helper(user_data)
            
            logger.info("🏗️ Architecting meal templates...")
            logger.info(f"   Constraints: {constraints}")
            logger.info(f"   Structure: {structure_str[:200]}...")
            
            prediction = self.architect(
                user_constraints=constraints,
                user_goal=user_data.get('goal', 'General Health'),
                meal_plan_structure=structure_str,
                user_region=user_region
            )
            
            # Parse the JSON output
            template_data = _parse_json_safely(prediction.daily_template_json, "array")
            
            if not template_data:
                logger.error("Failed to parse template JSON from LLM")
                return []
            
            logger.info(f"✅ Generated {len(template_data)} meal templates")
            return template_data
        
        except Exception as e:
            logger.error(f"Error in MealTemplateArchitect: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return []


class MealIngredientBuilder(dspy.Module):
    """
    Stage 2: Convert Menu → Exact Ingredients with Portions
    
    Takes a menu template with dish names and targets.
    Returns detailed meals with exact ingredient portions.
    """
    
    def __init__(self):
        super().__init__()
        # Use ChainOfThought for mathematical reasoning
        self.generator = dspy.ChainOfThought(GenerateIngredients)
    
    def forward(
        self, 
        template_list: list, 
        user_data: dict, 
        region: str = ""
    ) -> FullMealPlan:
        """
        Build detailed meal plan with ingredients from templates.
        
        Args:
            template_list: List of meal templates with dish names
            user_data: User profile with constraints
            region: User's region for ingredient preferences
        
        Returns:
            FullMealPlan with detailed ingredients
        """
        detailed_meals = []
        constraints = _format_constraints_helper(user_data)
        
        logger.info("🔧 Building ingredients for each meal...")
        
        # Track daily totals (from main meals only)
        totals = {"fat": 0.0, "carbs": 0.0, "protein": 0.0, "calories": 0.0}
        
        for item in template_list:
            meal_type = item['meal']
            
            try:
                # Process Main option
                logger.info(f"   Building MAIN for {meal_type}...")
                main_res = self._process_option(
                    item['main'], 
                    meal_type, 
                    constraints, 
                    region
                )
                
                # Process Alternative option
                logger.info(f"   Building ALTERNATIVE for {meal_type}...")
                alt_res = self._process_option(
                    item['alternative'], 
                    meal_type, 
                    constraints, 
                    region
                )
                
                # Add Main to daily totals
                totals["fat"] += main_res.nutrition.fat
                totals["carbs"] += main_res.nutrition.carbs
                totals["protein"] += main_res.nutrition.protein
                totals["calories"] += main_res.nutrition.calories
                
                detailed_meals.append(MealEntry(
                    main=main_res, 
                    meal=meal_type, 
                    alternative=alt_res
                ))
                
                logger.info(f"   ✅ Completed {meal_type}")
            
            except Exception as e:
                logger.error(f"   ❌ Failed to build {meal_type}: {str(e)}")
                raise
        
        return FullMealPlan(
            note=f"Goal: {user_data.get('goal', 'Health')}. Constraints: {constraints}",
            meals=detailed_meals,
            totals=Nutrition(**{k: round(v, 1) for k, v in totals.items()})
        )
    
    def _process_option(
        self, 
        option: Dict[str, Any], 
        meal_type: str, 
        constraints: str, 
        region: str
    ) -> DetailedOption:
        """
        Process a single meal option (main or alternative).
        
        Args:
            option: Template with name, calories, protein, fat
            meal_type: Meal slot name
            constraints: Formatted constraint string
            region: User region
        
        Returns:
            DetailedOption with ingredients
        """
        try:
            # Call LLM with ChainOfThought
            pred = self.generator(
                meal_title=option['name'],
                target_calories=float(option['calories']),
                target_protein=float(option['protein']),
                target_fat=float(option.get('fat', 20.0)),
                main_source=option['main_protein_source'],
                user_constraints=constraints,
                user_region=region
            )
            
            # Parse ingredients JSON
            ingredients_data = _parse_json_safely(pred.ingredients_json, "array")
            
            if not ingredients_data:
                raise ValueError("Failed to parse ingredients JSON")
            
            # Convert to Ingredient objects
            ingredients = []
            for ing_dict in ingredients_data:
                try:
                    # Ensure all required fields exist
                    ing = Ingredient(
                        item=ing_dict.get('item', 'Unknown'),
                        **{k: ing_dict.get(k, 0.0) for k in ['calories', 'protein', 'fat', 'carbs']},
                        **{'portionSI(gram)': ing_dict.get('portionSI(gram)', 0.0)},
                        **{'brand of pruduct': ing_dict.get('brand of pruduct', '')},
                        household_measure=ing_dict.get('household_measure', '')
                    )
                    ingredients.append(ing)
                except Exception as e:
                    logger.warning(f"Failed to parse ingredient: {ing_dict}, error: {e}")
            
            if not ingredients:
                raise ValueError("No valid ingredients generated")
            
            # Calculate real nutrition totals (re-verify the math)
            real_nut = Nutrition(
                fat=round(sum(i.fat for i in ingredients), 1),
                carbs=round(sum(i.carbs for i in ingredients), 1),
                protein=round(sum(i.protein for i in ingredients), 1),
                calories=round(sum(i.calories for i in ingredients), 1)
            )
            
            return DetailedOption(
                meal_name=meal_type,
                nutrition=real_nut,
                meal_title=option['name'],
                ingredients=ingredients,
                main_protein_source=option['main_protein_source']
            )
        
        except Exception as e:
            logger.error(f"Error processing option '{option.get('name', 'Unknown')}': {str(e)}")
            raise


# ============================================================================
# 5. The Master System
# ============================================================================

class FullMealSystem(dspy.Module):
    """
    Complete two-stage meal generation system.
    
    Stage 1: Skeleton → Menu (creative dish names)
    Stage 2: Menu → Ingredients (precise portions)
    """
    
    def __init__(self):
        super().__init__()
        self.step1_architect = MealTemplateArchitect()
        self.step2_builder = MealIngredientBuilder()
    
    def forward(
        self, 
        user_data: dict, 
        meal_plan_structure: list, 
        user_region: str = "Israel"
    ) -> FullMealPlan:
        """
        Generate complete meal plan from skeleton structure.
        
        Args:
            user_data: User profile with constraints and goals
            meal_plan_structure: Skeleton with meal descriptions
            user_region: User's region for preferences
        
        Returns:
            FullMealPlan with detailed ingredients
        """
        logger.info(f"🚀 Starting Full Meal Generation for Region: {user_region}")
        
        # Stage 1: Design the Menu
        logger.info("📋 Stage 1: Architecting the Menu...")
        template_objects = self.step1_architect(user_data, meal_plan_structure, user_region)
        
        if not template_objects:
            raise ValueError("Failed to generate meal templates")
        
        # Stage 2: Calculate Ingredients
        logger.info("🔢 Stage 2: Calculating Portions & Ingredients...")
        final_plan = self.step2_builder(template_objects, user_data, user_region)
        
        logger.info("✅ Meal plan generation complete!")
        return final_plan


# ============================================================================
# 6. Configuration
# ============================================================================

def configure_dspy(force: bool = False) -> bool:
    """
    Configure DSPy with Azure OpenAI.
    
    Args:
        force: Force reconfiguration even if already configured
    
    Returns:
        True if configuration successful, False otherwise
    """
    global _dspy_configured
    
    if _dspy_configured and not force:
        return True
    
    if _dspy_lock:
        _dspy_lock.acquire()
    
    try:
        if _dspy_configured and not force:
            return True
        
        # Azure OpenAI configuration
        deployment = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'obi2')
        api_base = os.getenv('AZURE_OPENAI_API_BASE')
        api_key = os.getenv('AZURE_OPENAI_API_KEY')
        api_version = os.getenv('AZURE_OPENAI_API_VERSION', '2024-12-01-preview')
        
        if not api_key:
            logger.error("AZURE_OPENAI_API_KEY not found in environment")
            return False
        
        if not api_base:
            logger.error("AZURE_OPENAI_API_BASE not found in environment")
            return False
        
        # DSPy requires azure/ prefix for Azure OpenAI models
        lm = dspy.LM(
            model=f"azure/{deployment}",
            api_base=api_base,
            api_key=api_key,
            api_version=api_version,
            max_tokens=2048,
            temperature=0.7
        )
        dspy.configure(lm=lm)
        
        _dspy_configured = True
        logger.info(f"✅ DSPy v3 configured with Azure OpenAI: {deployment}")
        return True
    
    except Exception as e:
        logger.error(f"Failed to configure DSPy: {str(e)}")
        return False
    
    finally:
        if _dspy_lock:
            _dspy_lock.release()


# ============================================================================
# 7. Public API Functions
# ============================================================================

def build_meal_plan_from_skeleton(
    skeleton_structure: list,
    user_data: dict,
    user_region: str = ""
) -> Dict[str, Any]:
    """
    High-level function to build complete meal plan from skeleton structure.
    
    Args:
        skeleton_structure: List of meal skeletons with descriptions and calories
        user_data: User data with constraints (food_allergies, food_limitations, medical_conditions)
        user_region: Optional user region
    
    Returns:
        Dictionary with complete meal plan
    
    Example:
        skeleton = [
            {
                "meal": "Breakfast",
                "calories": 450,
                "description": "Eggs with vegetables",
                "calories_pct": 25
            },
            ...
        ]
        
        user_data = {
            "goal": "Weight Loss",
            "food_allergies": "Peanuts",
            "food_limitations": "Vegetarian",
            "medical_conditions": "Type 2 Diabetes"
        }
        
        result = build_meal_plan_from_skeleton(skeleton, user_data, "Israel")
    """
    # Configure DSPy if not already done
    if not configure_dspy():
        raise RuntimeError("Failed to configure DSPy")
    
    # Build meal plan
    system = FullMealSystem()
    result = system(
        user_data=user_data,
        meal_plan_structure=skeleton_structure,
        user_region=user_region
    )
    
    # Convert to dictionary with proper aliasing
    return result.model_dump(by_alias=True)


# ============================================================================
# 8. Example Usage
# ============================================================================

if __name__ == "__main__":
    # Configure DSPy
    configure_dspy()
    
    # Example user profile
    user_profile = {
        "goal": "Muscle Gain",
        "food_allergies": "Gluten",
        "food_limitations": "Kosher",
        "medical_conditions": "None",
    }
    
    # Example skeleton structure
    structure_skeleton = [
        {
            "meal": "Breakfast",
            "calories": 867,
            "description": "פירות/סלט עם ביצים קשות",  # Fruits/salad with hard-boiled eggs
            "calories_pct": 33.3
        },
        {
            "meal": "Lunch",
            "calories": 867,
            "description": "קינואה/מאש/עדשים/אפונה/מרקים/בטטה עם סלט ירקות",  # Quinoa/legumes with vegetable salad
            "calories_pct": 33.3
        },
        {
            "meal": "Dinner",
            "calories": 866,
            "description": "דגים/עוף עם ירקות מבושלים או סלט",  # Fish/chicken with cooked vegetables or salad
            "calories_pct": 33.4
        }
    ]
    
    # Execute
    try:
        result = build_meal_plan_from_skeleton(
            skeleton_structure=structure_skeleton,
            user_data=user_profile,
            user_region="Israel"
        )
        
        # Print result
        print("\n" + "="*80)
        print("GENERATED MEAL PLAN")
        print("="*80)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        print("\n" + "="*80)
        print("DAILY TOTALS")
        print("="*80)
        totals = result['totals']
        print(f"Calories: {totals['calories']}")
        print(f"Protein: {totals['protein']}g")
        print(f"Fat: {totals['fat']}g")
        print(f"Carbs: {totals['carbs']}g")
    
    except Exception as e:
        logger.error(f"Failed to generate meal plan: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
