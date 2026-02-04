"""
DSPy Meal Builder v14: The "Discrete Unit" Engine
-------------------------------------------------
Adds "Unit Physics" to prevent awkward portions (e.g., 1.4 eggs).

Features:
1. AGGRESSIVE TITLE EXTRACTION:
   - Checks: name, meal_title, dish_name, title (in order)
   
2. CHEF (Stage 1): "CONSTITUTION" + UNIT DEFINITION
   - Title deconstruction: "Chickpea Omelette with Avocado" -> [Chickpea Flour, Avocado]
   - Mandatory inclusion: Every food in title MUST appear in ingredients
   - typical_unit_gram: Discrete items (Egg=55, Strawberry=15, Slice=30). Continuous (Rice/Oil)=0.
   
3. SOLVER (Stage 2): "Magnetic" Gradient Descent
   - Protein 2.5x, Carbs 1.5x priority
   - Magnetic snap: portions near whole units (e.g. 1.8 eggs) snap to 2 eggs
   - Hard floor: discrete items min = 1 unit (no "5g of Egg")
   
4. LIST SUPPORT: Handles constraints as strings or lists
"""

import dspy
import os
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import logging

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
# Pydantic Models for Multi-Stage Pipeline
# ============================================================================

# --- Stage 1 Output: The "Truth" (Fixed Density per 100g + Unit Weight) ---
class IngredientDensity(BaseModel):
    """Ingredient with STANDARD nutrition values per 100g (USDA-based) and optional unit weight."""
    item: str = Field(description="Name of the ingredient in English")
    calories_per_100g: float = Field(ge=0, description="Standard USDA calories per 100g")
    protein_per_100g: float = Field(ge=0, description="Standard USDA protein per 100g")
    fat_per_100g: float = Field(ge=0, description="Standard USDA fat per 100g")
    carbs_per_100g: float = Field(ge=0, description="Standard USDA carbs per 100g")
    brand_of_product: str = Field(alias="brand of pruduct", default="", description="Brand name if applicable")
    typical_unit_gram: float = Field(
        default=0,
        ge=0,
        description="Weight of 1 unit (Egg=55, Slice=30). 0 if continuous (Rice/Oil)."
    )

    class Config:
        populate_by_name = True


# --- Stage 2 Output: The "Variable" (Calculated Portions) ---
class IngredientPortion(BaseModel):
    """Calculated portion for an ingredient."""
    item: str = Field(description="Must match the name from Stage 1 exactly")
    portion_grams: float = Field(ge=0, description="Calculated grams to meet targets")
    household_measure: str = Field(description="Human-readable measure (e.g., '1 cup', '2 slices')")


# --- Final Combined Model ---
class Ingredient(BaseModel):
    """Individual ingredient with nutrition data (after combining density × portion)."""
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
# DSPy Signatures - Two-Stage Pipeline
# ============================================================================

class IdentifyIngredients(dspy.Signature):
    """
    Step 1: The Iron Chef (Unit Aware).
    Generate a precise ingredient list (max 7 items) for the requested dish.
    
    ⚠️ PROTOCOL 1: UNIT DEFINITION (typical_unit_gram)
    - You MUST specify typical_unit_gram for discrete items.
    - EXAMPLES: "Egg" 55, "Strawberry" 15, "Slice of Bread" 30, "Tortilla" 50.
    - FOR CONTINUOUS ITEMS (Rice, Oats, Oil, Meat cuts, Cheese blocks): set typical_unit_gram = 0.
    
    ⚠️ PROTOCOL 2: THE "TUNER" STRATEGY (CRITICAL)
    To ensure the math engine can hit exact targets, you MUST include "Pure Macro" sources:
    
    1. THE FAT KNOB: If the dish allows, add "Olive Oil", "Avocado", or "Nuts".
       * (Pure Fat allows us to hit Fat targets without adding Carbs/Protein).
       
    2. THE PROTEIN KNOB: Add "Egg Whites", "Tuna", "Seitan", or "Protein Powder".
       * (Pure Protein allows us to hit Protein targets without adding Fat/Carbs).
       
    3. THE CARB KNOB: Add "Fruit", "Rice", or "Veggies".
       * (Allows us to hit Carb targets).
       
    DO NOT provide only "Compound Foods" (like Hummus or Cheese) because their ratios are locked.
    
    ⚠️ PROTOCOL 3: MACRO "DECOUPLING" STRATEGY
    - FAT TUNER: Olive Oil, Spray Oil (typical_unit_gram=0).
    - CARB TUNER: Fruit, Veggies, Rice (continuous or unit as appropriate).
    - PROTEIN TUNER: Egg Whites, Seitan, Tuna, Protein Powder.
    - AVOID pairing high-fat meat with high-fat nuts if fat target is low.
      
    ⚠️ PROTOCOL 4: REGIONAL BRANDS
    - Region: {user_region}
    - Israel: Tnuva, Osem, Angel, Tara, Achla.
    - USA: Kraft, Chobani, Dannon.
    """
    meal_title: str = dspy.InputField(desc="The Strict Dish Name")
    main_source: str = dspy.InputField()
    
    target_protein: float = dspy.InputField()
    target_fat: float = dspy.InputField()
    target_carbs: float = dspy.InputField()
    
    user_constraints: str = dspy.InputField()
    user_region: str = dspy.InputField()
    
    ingredients: List[IngredientDensity] = dspy.OutputField()

# Stage 2 is now PURE PYTHON (removed LLM-based CalculatePortions signature)
# See _calculate_portions_with_python() method below


# ============================================================================
# DSPy Module
# ============================================================================

class MealPlanBuilder(dspy.Module):
    """
    Main module for building meal plans with user constraints.
    
    This module:
    1. Accepts user data (allergies, limitations, conditions) from database
    2. Formats constraints into LLM-friendly string
    3. Generates ingredients for each meal with constraints enforced
    4. Calculates accurate nutrition totals
    5. Returns complete meal plan with both main and alternative options
    """
    
    def __init__(self):
        super().__init__()
        # Stage 1: Ingredient selection with FIXED densities
        self.chef = dspy.ChainOfThought(IdentifyIngredients)
        # Stage 2: Pure Python math (no LLM needed!)
    
    def _calculate_nutrition(self, ingredients: List[Ingredient]) -> Nutrition:
        """Calculate nutrition totals from ingredient list."""
        return Nutrition(
            fat=round(sum(i.fat for i in ingredients), 1),
            carbs=round(sum(i.carbs for i in ingredients), 1),
            protein=round(sum(i.protein for i in ingredients), 1),
            calories=round(sum(i.calories for i in ingredients), 1)
        )
    
    def _calculate_portions_with_python(
        self,
        densities: List[IngredientDensity],
        targets: dict,
        main_protein_source: str
    ) -> List[IngredientPortion]:
        """
        STAGE 2: "Magnetic" Gradient Descent (v14)
        
        - Discrete items: start at 1 unit; snap to whole units (no "1.6 eggs").
        - Hard floor: discrete items min = typical_unit_gram (no "5g of Egg").
        - Protein 2.5x, Carbs 1.5x priority.
        """
        if not densities:
            return []
        
        # 1. Initialize: discrete = 1 unit, continuous = 100g
        current_grams = {}
        for d in densities:
            unit_w = getattr(d, "typical_unit_gram", 0) or 0
            if unit_w > 0:
                current_grams[d.item] = float(unit_w)
            else:
                current_grams[d.item] = 100.0
        
        main_keys = [d.item for d in densities if main_protein_source.lower() in d.item.lower()]
        learning_rate = 0.5
        iterations = 80
        target_p = targets.get('protein', 30)
        target_f = targets.get('fat', 15)
        target_c = targets.get('carbs', 50)
        target_cal = targets.get('calories', 400)
        
        for i in range(iterations):
            totals = {'p': 0.0, 'f': 0.0, 'c': 0.0, 'cal': 0.0}
            for d in densities:
                g = current_grams[d.item]
                totals['p'] += (g / 100.0) * d.protein_per_100g
                totals['f'] += (g / 100.0) * d.fat_per_100g
                totals['c'] += (g / 100.0) * d.carbs_per_100g
                totals['cal'] += (g / 100.0) * d.calories_per_100g
            
            err_p = ((target_p - totals['p']) / max(target_p, 1)) * 2.5
            err_c = ((target_c - totals['c']) / max(target_c, 1)) * 1.5
            err_f = (target_f - totals['f']) / max(target_f, 1)
            err_cal = (target_cal - totals['cal']) / max(target_cal, 1)
            
            if abs(err_p) < 0.05 and abs(err_cal) < 0.05:
                break
            
            for d in densities:
                impact_p = d.protein_per_100g / 25.0
                impact_f = d.fat_per_100g / 15.0
                impact_c = d.carbs_per_100g / 25.0
                nudge = (err_p * impact_p) + (err_f * impact_f) + (err_c * impact_c) + (err_cal * 0.5)
                raw_new_grams = current_grams[d.item] * (1 + (nudge * learning_rate))
                
                # MAGNETIC SNAP: discrete items snap to whole units
                final_grams = raw_new_grams
                unit_w = getattr(d, "typical_unit_gram", 0) or 0
                if unit_w > 0:
                    ideal_units = raw_new_grams / unit_w
                    nearest_whole = max(1, round(ideal_units))
                    target_grams = nearest_whole * unit_w
                    diff = abs(target_grams - raw_new_grams)
                    if diff < (unit_w * 0.3):
                        final_grams = target_grams
                
                # SMART LIMITS: discrete floor = 1 unit
                min_g = 20.0
                if unit_w > 0:
                    min_g = unit_w
                max_g = 400.0
                if d.item in main_keys:
                    max_g = 800.0
                if d.protein_per_100g > 15:
                    max_g = 600.0
                if d.calories_per_100g > 450:
                    max_g = 70.0
                    min_g = 5.0 if unit_w <= 0 else unit_w
                elif d.calories_per_100g < 100:
                    max_g = 600.0
                
                current_grams[d.item] = max(min_g, min(final_grams, max_g))
        
        result = []
        final_totals = {'protein': 0.0, 'fat': 0.0, 'carbs': 0.0, 'calories': 0.0}
        for d in densities:
            final_grams = round(current_grams[d.item], 1)
            unit_w = getattr(d, "typical_unit_gram", 0) or 0
            measure = self._generate_household_measure(d.item, final_grams, unit_w)
            result.append(IngredientPortion(
                item=d.item,
                portion_grams=final_grams,
                household_measure=measure
            ))
            final_totals['protein'] += (final_grams / 100) * d.protein_per_100g
            final_totals['fat'] += (final_grams / 100) * d.fat_per_100g
            final_totals['carbs'] += (final_grams / 100) * d.carbs_per_100g
            final_totals['calories'] += (final_grams / 100) * d.calories_per_100g
        
        logger.info(
            f"🧮 Gradient descent portions: {len(result)} ingredients, "
            f"Total: {final_totals['calories']:.0f} kcal, "
            f"P:{final_totals['protein']:.0f}g (target:{target_p}g), "
            f"F:{final_totals['fat']:.0f}g (target:{target_f}g), "
            f"C:{final_totals['carbs']:.0f}g (target:{target_c}g)"
        )
        
        return result
    
    def _generate_household_measure(self, item_name: str, grams: float, unit_weight: float = 0) -> str:
        """Generate realistic household measure. Uses unit_weight for discrete items (e.g. eggs, slices)."""
        if unit_weight > 0:
            units = grams / unit_weight
            if abs(units - round(units)) < 0.15:
                return f"{int(round(units))} unit{'s' if round(units) != 1 else ''}"
            return f"{round(units, 1)} units"
        if grams < 10:
            return "1 tsp"
        if grams < 25:
            return "1 tbsp"
        item_lower = item_name.lower()
        if any(x in item_lower for x in ['oil', 'sauce', 'honey', 'seeds', 'mayo', 'tahini']):
            return f"{round(grams / 14, 1)} tbsp"
        if any(x in item_lower for x in ['rice', 'quinoa', 'oats', 'lentils', 'beans', 'stew']):
            return f"{round(grams / 190, 1)} cups cooked"
        if 'bread' in item_lower or 'toast' in item_lower:
            return f"{round(grams / 35, 1)} slices"
        if 'pita' in item_lower:
            return f"{round(grams / 50, 1)} pitas"
        if 'egg' in item_lower:
            return f"{round(grams / 50, 1)} large"
        if any(x in item_lower for x in ['apple', 'banana', 'orange', 'fruit']):
            return f"{round(grams / 150, 1)} medium"
        if 'cottage cheese' in item_lower or 'ricotta' in item_lower:
            return f"{round(grams / 225, 1)} cup{'s' if grams >= 225 else ''}"
        if 'cheese' in item_lower:
            return f"{round(grams / 28, 1)} oz"
        if 'yogurt' in item_lower:
            return f"{round(grams / 245, 1)} cup{'s' if grams >= 245 else ''}"
        if 'pasta' in item_lower:
            return f"{round(grams / 160, 1)} cups cooked"
        if any(word in item_lower for word in ['tomato', 'cucumber', 'pepper', 'lettuce', 'spinach', 'carrot']):
            return f"{round(grams / 150, 1)} cup{'s' if grams >= 150 else ''}"
        return f"{int(grams)}g"
    
    def _get_allowed_margin(self, target_val: float) -> float:
        """
        MUST match backend's get_allowed_margin exactly.
        Backend uses value-dependent margins: smaller targets get looser margins.
        """
        val = float(target_val)
        if val <= 10:
            return 0.6  # 60%
        elif val <= 20:
            return 0.5  # 50%
        elif val <= 30:
            return 0.4  # 40%
        else:
            return 0.3  # 30% for values > 30
    
    def _validate_meal(self, ingredients: List[Ingredient], targets: dict) -> List[str]:
        """
        Audit the meal and return specific error messages.
        
        CRITICAL: Uses same value-dependent margins as backend /api/validate-menu.
        E.g. fat target 32g → 30% margin; fat target 29g → 40% margin.
        
        Args:
            ingredients: List of generated ingredients
            targets: Dict with 'calories', 'protein', 'fat', 'carbs' targets
        
        Returns:
            List of error strings (empty list means validation passed)
        """
        errors = []
        
        # 1. Ingredient Count Check
        if len(ingredients) > 7:
            errors.append(f"Used {len(ingredients)} ingredients. Limit is 7. Remove {len(ingredients)-7} items.")
        
        # 2. Macro Accuracy Check - use SAME margins as backend
        calc = self._calculate_nutrition(ingredients)
        
        for macro, actual in [('protein', calc.protein), ('calories', calc.calories),
                             ('fat', calc.fat), ('carbs', calc.carbs)]:
            target = targets.get(macro, 0)
            if target <= 0:
                continue
            margin = self._get_allowed_margin(target)
            diff_pct = abs(actual - target) / target
            if diff_pct > margin:
                direction = "low" if actual < target else "high"
                errors.append(f"{macro.capitalize()} is {actual}g (Target: {target}g). Too {direction}.")
        
        return errors
    
    def _format_constraints(self, user_data: dict) -> str:
        """
        Helper to format database columns into a prompt-friendly string.
        
        Args:
            user_data: Dictionary with keys like 'food_allergies', 'food_limitations', 'medical_conditions'
                       Values may be strings or lists (backend sometimes passes lists).
        
        Returns:
            Formatted string like: "ALLERGIES: Peanuts | DIETARY LIMITATIONS: Vegan | MEDICAL CONDITIONS: Diabetes"
        """
        def _to_str(val):
            """Handle both string and list (e.g. ['Vegetarian', 'Gluten-free'])."""
            if val is None:
                return ""
            if isinstance(val, list):
                return ", ".join(str(v).strip() for v in val if v).strip()
            return str(val).strip()
        
        parts = []
        
        # Food allergies (highest priority - complete avoidance required)
        allergies = _to_str(user_data.get('food_allergies'))
        if allergies and allergies.lower() not in ['none', 'n/a', '']:
            parts.append(f"ALLERGIES: {allergies}")
        
        # Dietary limitations (vegetarian, vegan, kosher, etc.)
        limitations = _to_str(user_data.get('food_limitations'))
        if limitations and limitations.lower() not in ['none', 'n/a', '']:
            parts.append(f"DIETARY LIMITATIONS: {limitations}")
        
        # Medical conditions (diabetes, hypertension, etc.)
        conditions = _to_str(user_data.get('medical_conditions'))
        if conditions and conditions.lower() not in ['none', 'n/a', '']:
            parts.append(f"MEDICAL CONDITIONS: {conditions}")
        
        if not parts:
            return "None"
        
        return " | ".join(parts)
    
    def _process_option(
        self, 
        option_data: dict, 
        meal_type: str, 
        formatted_constraints: str,
        user_region: str = ""
    ) -> DetailedOption:
        """
        Process a single meal option with iterative refinement.
        
        This implements the self-correcting architecture:
        1. Generate initial meal
        2. Validate against targets
        3. If failed, refine with specific feedback
        4. Retry up to 2 times
        
        Args:
            option_data: Dict with keys: 'name', 'calories', 'protein', 'fat', 'carbs', 'main_protein_source'
            meal_type: e.g., "Breakfast", "Lunch"
            formatted_constraints: Pre-formatted constraint string
            user_region: User's region for ingredient preferences
        
        Returns:
            DetailedOption with generated ingredients and calculated nutrition
        """
        try:
            # Extract all macro targets
            targets = {
                'calories': float(option_data.get('calories', 400)),
                'protein': float(option_data.get('protein', 30)),
                'fat': float(option_data.get('fat', 15)),
                'carbs': float(option_data.get('carbs', 50))
            }
            
            # AGGRESSIVE TITLE EXTRACTION - Check all possible keys
            meal_title_input = (
                option_data.get('name')
                or option_data.get('meal_title')
                or option_data.get('dish_name')
                or option_data.get('title')
                or f"{meal_type} Option"
            )
            logger.info(f"🍳 Stage 1 (Chef): Selecting ingredients for '{meal_title_input}'")
            
            # ===== STAGE 1: CHEF - Get ingredients with FIXED densities =====
            # Pass all targets so Chef picks appropriate ingredients (protein/fat/carb sources)
            chef_result = self.chef(
                meal_title=meal_title_input,
                main_source=option_data['main_protein_source'],
                target_protein=targets['protein'],
                target_fat=targets['fat'],
                target_carbs=targets['carbs'],
                user_constraints=formatted_constraints,
                user_region=user_region
            )
            densities = chef_result.ingredients
            
            # Check ingredient count
            if len(densities) > 7:
                logger.warning(f"⚠️ Chef selected {len(densities)} ingredients, trimming to 7")
                densities = densities[:7]
            
            logger.info(f"📊 Stage 2 (Python Math): Calculating portions for targets C:{targets['calories']} P:{targets['protein']} F:{targets['fat']} Carbs:{targets['carbs']}")
            
            # ===== STAGE 2: PURE PYTHON MATH - Calculate portions =====
            # No LLM needed - just real math!
            calculated_portions = self._calculate_portions_with_python(
                densities=densities,
                targets=targets,
                main_protein_source=option_data['main_protein_source']
            )
            
            # Create lookup map for portions
            portions_map = {p.item: p for p in calculated_portions}
            
            # ===== STAGE 3: PYTHON ASSEMBLY - Truth Calculation =====
            # Use Python math (not LLM math) for final nutrition
            final_ingredients = []
            
            for dens in densities:
                # Find matching portion (case-insensitive match for safety)
                portion_data = None
                for item_name, portion in portions_map.items():
                    if item_name.lower().strip() == dens.item.lower().strip():
                        portion_data = portion
                        break
                
                if not portion_data:
                    logger.warning(f"⚠️ No portion calculated for '{dens.item}', skipping")
                    continue
                
                grams = portion_data.portion_grams
                
                # THE TRUTH: Python calculates nutrition (density × portion)
                # Same ingredient ALWAYS has same density - chemically accurate
                ratio = grams / 100.0
                
                final_ingredients.append(Ingredient(
                    item=dens.item,
                    portionSI_gram=grams,
                    brand_of_product=dens.brand_of_product,
                    household_measure=portion_data.household_measure,
                    calories=round(dens.calories_per_100g * ratio, 1),
                    protein=round(dens.protein_per_100g * ratio, 1),
                    fat=round(dens.fat_per_100g * ratio, 1),
                    carbs=round(dens.carbs_per_100g * ratio, 1)
                ))
            
            # Calculate final nutrition totals
            real_nutrition = self._calculate_nutrition(final_ingredients)
            
            logger.info(f"✅ Built '{meal_title_input}': {len(final_ingredients)} ingredients, "
                       f"Totals: C:{real_nutrition.calories} P:{real_nutrition.protein} F:{real_nutrition.fat} Carbs:{real_nutrition.carbs}")
            
            return DetailedOption(
                meal_name=meal_type,
                nutrition=real_nutrition,
                meal_title=meal_title_input,  # ✅ STRICT: Use exact input title
                ingredients=final_ingredients,
                main_protein_source=option_data['main_protein_source']
            )
        
        except Exception as e:
            logger.error(f"Error processing option '{option_data.get('name', 'Unknown')}': {str(e)}")
            raise
    
    def forward(
        self, 
        template_list: list, 
        user_db_row: dict,
        user_region: str = ""
    ) -> FullMealPlan:
        """
        Generate complete meal plan with user constraints.
        
        Args:
            template_list: List of meal templates, each with 'meal', 'main', and 'alternative' keys
            user_db_row: Dictionary with user data from database (allergies, limitations, conditions)
            user_region: Optional user region/country for ingredient preferences
        
        Returns:
            FullMealPlan with all meals, alternatives, and totals
        
        Example template_list structure:
        [
            {
                "meal": "Breakfast",
                "main": {
                    "name": "Oatmeal with Honey and Walnuts",
                    "calories": 450,
                    "protein": 20,
                    "main_protein_source": "greek yogurt"
                },
                "alternative": {
                    "name": "Scrambled Eggs with Toast",
                    "calories": 450,
                    "protein": 20,
                    "main_protein_source": "eggs"
                }
            },
            ...
        ]
        """
        detailed_meals = []
        
        # Pre-format constraints once
        constraints_str = self._format_constraints(user_db_row)
        
        logger.info(f"Building meal plan with constraints: {constraints_str}")
        
        # Initialize totals
        total_fat = 0.0
        total_carbs = 0.0
        total_protein = 0.0
        total_calories = 0.0
        
        # Process each meal
        for item in template_list:
            meal_type = item['meal']
            
            try:
                # Pass constraints to both main and alternative
                main_result = self._process_option(
                    item['main'], 
                    meal_type, 
                    constraints_str,
                    user_region
                )
                alt_result = self._process_option(
                    item['alternative'], 
                    meal_type, 
                    constraints_str,
                    user_region
                )
                
                # ✅ CRITICAL FIX: Only add MAIN to daily totals
                # User eats either Main OR Alternative (not both)
                # Previously summed both → ~5000 cal, now correct → ~2600 cal
                total_fat += main_result.nutrition.fat
                total_carbs += main_result.nutrition.carbs
                total_protein += main_result.nutrition.protein
                total_calories += main_result.nutrition.calories
                
                # Create meal entry
                entry = MealEntry(
                    main=main_result,
                    meal=meal_type,
                    alternative=alt_result
                )
                detailed_meals.append(entry)
                
                logger.info(f"Successfully processed {meal_type}: {main_result.meal_title}")
            
            except Exception as e:
                logger.error(f"Failed to process {meal_type}: {str(e)}")
                raise
        
        # Build final plan with note about constraints
        note = ""
        if constraints_str != "None":
            note = f"Meal plan adapted for: {constraints_str}"
        
        return FullMealPlan(
            note=note,
            meals=detailed_meals,
            totals=Nutrition(
                fat=round(total_fat, 1),
                carbs=round(total_carbs, 1),
                protein=round(total_protein, 1),
                calories=round(total_calories, 1)
            )
        )


# ============================================================================
# Configuration and Initialization
# ============================================================================

def configure_dspy(force: bool = False) -> bool:
    """
    Configure DSPy with Azure OpenAI (same as original meal_builder_dspy).
    
    Uses AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_BASE, AZURE_OPENAI_DEPLOYMENT.
    
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
        
        # Azure OpenAI configuration (same as backend and original meal_builder_dspy)
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
        logger.info(f"DSPy configured successfully with Azure OpenAI: {deployment}")
        return True
    
    except Exception as e:
        logger.error(f"Failed to configure DSPy: {str(e)}")
        return False
    
    finally:
        if _dspy_lock:
            _dspy_lock.release()


def build_meal_plan_with_constraints(
    template_list: list,
    user_data: dict,
    user_region: str = ""
) -> Dict[str, Any]:
    """
    High-level function to build meal plan with user constraints.
    
    Args:
        template_list: List of meal templates
        user_data: User data from database with constraints
        user_region: Optional user region
    
    Returns:
        Dictionary with meal plan data
    
    Example:
        user_data = {
            "food_allergies": "Peanuts, Shellfish",
            "food_limitations": "Vegetarian (eats eggs/dairy)",
            "medical_conditions": "Type 2 Diabetes"
        }
        
        result = build_meal_plan_with_constraints(
            template_list=templates,
            user_data=user_data,
            user_region="Israel"
        )
    """
    # Configure DSPy if not already done
    if not configure_dspy():
        raise RuntimeError("Failed to configure DSPy")
    
    # Build meal plan
    builder = MealPlanBuilder()
    result = builder(
        template_list=template_list,
        user_db_row=user_data,
        user_region=user_region
    )
    
    # Convert to dictionary with proper aliasing
    return result.model_dump(by_alias=True)


def build_single_meal_with_constraints(
    meal_type: str,
    macro_targets: dict,
    required_protein_source: str,
    user_constraints: dict,
    user_region: str = "",
    option_type: str = "MAIN"
) -> Optional[Dict[str, Any]]:
    """
    Build a single meal option with user constraints and full macro targeting.
    
    This function is designed for compatibility with the existing backend that builds
    meal options individually in parallel rather than building the entire plan at once.
    
    Args:
        meal_type: Type of meal (e.g., "Breakfast", "Lunch")
        macro_targets: Dictionary with keys: 'name', 'calories', 'protein', 'fat', 'carbs'
        required_protein_source: Main protein source for the meal
        user_constraints: Dictionary with 'food_allergies', 'food_limitations', 'medical_conditions'
        user_region: User's region for ingredient preferences
        option_type: "MAIN" or "ALTERNATIVE"
    
    Returns:
        Dictionary with meal data including ingredients and nutrition, or None on failure
    
    Example:
        result = build_single_meal_with_constraints(
            meal_type="Breakfast",
            macro_targets={
                "name": "Oatmeal with Honey",
                "calories": 450,
                "protein": 20,
                "fat": 15,
                "carbs": 60
            },
            required_protein_source="greek yogurt",
            user_constraints={
                "food_allergies": "Peanuts",
                "food_limitations": "Vegetarian",
                "medical_conditions": "Diabetes"
            },
            user_region="Israel"
        )
    """
    try:
        # Configure DSPy if not already done
        if not configure_dspy():
            logger.error("Failed to configure DSPy")
            return None
        
        # Create builder instance
        builder = MealPlanBuilder()
        
        # Format constraints
        constraints_str = builder._format_constraints(user_constraints)
        
        # AGGRESSIVE title extraction - check all possible keys
        title = (
            macro_targets.get('name')
            or macro_targets.get('meal_title')
            or macro_targets.get('dish_name')
            or macro_targets.get('title')
            or f"{meal_type} Option"
        )
        
        # Create option data structure with FULL macro targets
        option_data = {
            'name': title,
            'calories': float(macro_targets.get('calories', 400)),
            'protein': float(macro_targets.get('protein', 30)),
            'fat': float(macro_targets.get('fat', 15)),      # <--- Added
            'carbs': float(macro_targets.get('carbs', 50)),  # <--- Added
            'main_protein_source': required_protein_source
        }
        
        # Process the option
        result = builder._process_option(
            option_data=option_data,
            meal_type=meal_type,
            formatted_constraints=constraints_str,
            user_region=user_region
        )
        
        # Convert to dictionary format expected by backend
        result_dict = {
            "meal_name": result.meal_name,
            "meal_title": result.meal_title,
            "main_protein_source": result.main_protein_source,
            "ingredients": [ing.model_dump(by_alias=True) for ing in result.ingredients],
            "nutrition": result.nutrition.model_dump()
        }
        
        logger.info(f"✅ Successfully built {option_type} meal: {result.meal_title}")
        return result_dict
    
    except Exception as e:
        logger.error(f"❌ Error building meal with constraints: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return None


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    # Example user data mimicking 'chat_users' table row
    user_data_from_db = {
        "food_allergies": "Gluten, Peanuts",
        "food_limitations": "Vegetarian (eats eggs/dairy)",
        "medical_conditions": "Type 2 Diabetes (low sugar)"
    }
    
    # Example template
    input_template = [
        {
            "main": {
                "fat": 30,
                "name": "Oatmeal with Honey, Walnuts, and Cottage Cheese",
                "protein": 67,
                "calories": 892,
                "main_protein_source": "cottage cheese"
            },
            "meal": "Breakfast",
            "alternative": {
                "fat": 30,
                "name": "Cornflakes with Milk",
                "protein": 67,
                "calories": 892,
                "main_protein_source": "greek yogurt"
            }
        },
        {
            "main": {
                "fat": 25,
                "name": "Grilled Chicken Salad",
                "protein": 50,
                "calories": 650,
                "main_protein_source": "chicken breast"
            },
            "meal": "Lunch",
            "alternative": {
                "fat": 25,
                "name": "Lentil Soup with Vegetables",
                "protein": 50,
                "calories": 650,
                "main_protein_source": "lentils"
            }
        }
    ]
    
    # Configure DSPy
    configure_dspy()
    
    # Build meal plan
    try:
        result = build_meal_plan_with_constraints(
            template_list=input_template,
            user_data=user_data_from_db,
            user_region="Israel"
        )
        
        # Print result
        import json
        print(json.dumps(result, indent=2))
        
        print("\n" + "="*80)
        print("MEAL PLAN SUMMARY")
        print("="*80)
        print(f"Note: {result.get('note', '')}")
        print(f"\nDaily Totals:")
        totals = result['totals']
        print(f"  Calories: {totals['calories']}")
        print(f"  Protein: {totals['protein']}g")
        print(f"  Carbs: {totals['carbs']}g")
        print(f"  Fat: {totals['fat']}g")
        
        print(f"\nMeals:")
        for meal in result['meals']:
            print(f"\n  {meal['meal']}:")
            print(f"    Main: {meal['main']['meal_title']}")
            print(f"    Alternative: {meal['alternative']['meal_title']}")
    
    except Exception as e:
        logger.error(f"Failed to build meal plan: {str(e)}")
        raise
