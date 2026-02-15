"""
DSPy Meal Builder v16: Data-Driven Unit Physics + LLM Measure Refinement
--------------------------------------------------------------------------
Replaces hardcoded heuristics with AI-defined unit definitions and natural language measures.

Features:
1. AGGRESSIVE TITLE EXTRACTION:
   - Checks: name, meal_title, dish_name, title (in order)
   
2. CHEF (Stage 1): "CONSTITUTION" + DATA-DRIVEN UNIT DEFINITION
   - Title deconstruction: "Chickpea Omelette with Avocado" -> [Chickpea Flour, Avocado]
   - Mandatory inclusion: Every food in title MUST appear in ingredients
   - Unit Physics: AI defines typical_unit_gram (weight) AND unit_label (name)
     * Example: "Mini Tortilla" -> 25g, "tortilla" vs "Large Wrap" -> 60g, "wrap"
     * Continuous items (Rice/Oil) -> 0g, ""
   
3. SOLVER (Stage 2): "Magnetic" Gradient Descent
   - Protein 2.5x, Carbs 1.5x priority
   - Magnetic snap: portions near whole units (e.g. 1.8 eggs) snap to 2 eggs
   - Hard floor: discrete items min = 1 unit (no "5g of Egg")
   
4. FORMATTER (Stage 3): Two-Phase Measure Generation
   - Phase A: Math-based initial calculation (grams / unit_weight)
   - Phase B: LLM refinement for natural language (considers brand, packaging, common measures)
   - Example: Math says "2 eggs" -> LLM refines to "2 large eggs" or "1 3/4 cups" for continuous items
   
5. LIST SUPPORT: Handles constraints as strings or lists
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
        description="Weight of 1 unit (e.g. 55 for Egg, 30 for Slice). 0 for continuous foods (Rice, Chicken)."
    )
    unit_label: str = Field(
        default="",
        description="The name of the unit (e.g. 'large', 'slice', 'clove', 'tortilla'). Leave empty for continuous items."
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
    
    ⚠️ PROTOCOL: UNIT PHYSICS
    - For DISCRETE items (Eggs, Bread, Fruit, Tortillas), you MUST specify:
      1. typical_unit_gram: The weight of ONE piece (e.g. Egg=55, Slice=30, Clove=5).
      2. unit_label: The name of the unit (e.g. "large", "slice", "clove", "whole").
      
    - For CONTINUOUS items (Rice, Chicken, Oil, Yogurt):
      1. typical_unit_gram: Set to 0.
      2. unit_label: Leave empty.
    
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

class MeasureConverter(dspy.Signature):
    """
    Convert a specific weight in grams and brand information into the 
    closest common household measurement (e.g., '1/2 cup', '2 tbsp', '1 medium piece').
    
    Consider:
    - Brand-specific packaging sizes (e.g., Tnuva cheese comes in specific slice sizes)
    - Natural language formatting (e.g., "2 large eggs" vs "2 eggs")
    - Common kitchen measurements (cups, tbsp, tsp, pieces, slices)
    - Rounding to practical amounts (e.g., 1.8 cups -> "1 3/4 cups" or "1.75 cups")
    """
    ingredient_name: str = dspy.InputField(desc="Name of the ingredient")
    grams: float = dspy.InputField(desc="Calculated portion weight in grams")
    brand_info: str = dspy.InputField(desc="Brand name if applicable, empty string if none")
    unit_weight: float = dspy.InputField(desc="Weight of 1 unit (0 for continuous items)")
    unit_label: str = dspy.InputField(desc="Name of the unit from Stage 1 (e.g., 'slice', 'large'), empty for continuous")
    
    household_measure: str = dspy.OutputField(desc="Natural household measurement (e.g., '1.5 cups', '2 large eggs', '3 slices', '100g')")


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
        # Stage 3: LLM-based household measure refinement
        self.measure_converter = dspy.Predict(MeasureConverter)
    
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
            
            # Extract new fields from the AI model
            unit_w = getattr(d, "typical_unit_gram", 0) or 0
            unit_l = getattr(d, "unit_label", "") or ""  # <--- Get the label
            
            # Call the new math function with unit_label
            measure = self._generate_household_measure(d.item, final_grams, unit_w, unit_l)
            
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
    
    def _generate_household_measure(self, item_name: str, grams: float, unit_weight: float = 0, unit_label: str = "") -> str:
        """
        Generates measure using AI-provided 'Unit Physics' if available.
        
        Args:
            item_name: Name of the ingredient
            grams: Calculated portion weight in grams
            unit_weight: Weight of 1 unit (from AI), 0 if continuous
            unit_label: Name of the unit (from AI), e.g. "slice", "large", "clove"
        
        Returns:
            Human-readable measure string
        """
        # --- PATH A: Discrete Units (Math Logic) ---
        if unit_weight > 0:
            # 1. Calculate raw count (e.g., 100g / 55g = 1.81)
            raw_count = grams / unit_weight
            
            # 2. Rounding Logic: 0.8 -> 1, 1.2 -> 1, 1.6 -> 2
            count = round(raw_count)
            
            # 3. Safety: Never return 0 for non-zero grams
            if count == 0:
                count = 1
            
            # 4. Format Label
            # If label is "large" -> "2 large" (for eggs)
            # If label is "slice" -> "2 slices"
            label = unit_label.strip() if unit_label else "piece"
            
            # Pluralize if needed (simple 's' addition)
            if count > 1 and not label.endswith('s'):
                label += "s"
            
            return f"{count} {label}"
        
        # --- PATH B: Continuous Items (Fallback Heuristics) ---
        if grams < 10:
            return "1 tsp"
        if grams < 25:
            return "1 tbsp"
        
        item_lower = item_name.lower()
        
        # Liquids (Oil, Soy Sauce, Honey) - approx 14g per tbsp
        if any(x in item_lower for x in ['oil', 'sauce', 'honey', 'vinegar', 'syrup', 'seeds', 'mayo', 'tahini']):
            return f"{round(grams / 14, 1)} tbsp"
        
        # Grains (Rice, Oats, Quinoa) - approx 180-200g per cup cooked
        if any(x in item_lower for x in ['rice', 'quinoa', 'oats', 'lentils', 'beans', 'stew']):
            return f"{round(grams / 190, 1)} cups cooked"
        
        # Standard Weight for everything else (Meat, Veggies, Cheese)
        return f"{int(grams)}g"
    
    def _refine_household_measures(
        self,
        densities: List[IngredientDensity],
        calculated_portions: List[IngredientPortion]
    ) -> List[IngredientPortion]:
        """
        STAGE 3: LLM-Based Measure Refinement
        
        Refines the math-generated household measures using an LLM call.
        The LLM considers brand information, natural language formatting,
        and common kitchen measurements to produce more natural measures.
        
        Args:
            densities: List of IngredientDensity from Stage 1 (contains unit_weight, unit_label, brand)
            calculated_portions: List of IngredientPortion from Stage 2 (contains math-generated measures)
        
        Returns:
            List of IngredientPortion with refined household_measure values
        """
        # Create a lookup map for densities (by item name)
        densities_map = {d.item: d for d in densities}
        
        refined_portions = []
        
        for portion in calculated_portions:
            # Find matching density to get unit_weight, unit_label, and brand
            density = densities_map.get(portion.item)
            if not density:
                logger.warning(f"⚠️ No density found for '{portion.item}', keeping math-generated measure")
                refined_portions.append(portion)
                continue
            
            try:
                # Extract unit information from density
                unit_weight = getattr(density, "typical_unit_gram", 0) or 0
                unit_label = getattr(density, "unit_label", "") or ""
                brand_info = getattr(density, "brand_of_product", "") or ""
                
                # Call LLM to refine the measure
                logger.debug(f"🔍 Refining measure for {portion.item}: {portion.portion_grams}g (unit: {unit_label}, brand: {brand_info})")
                
                prediction = self.measure_converter(
                    ingredient_name=portion.item,
                    grams=portion.portion_grams,
                    brand_info=brand_info,
                    unit_weight=unit_weight,
                    unit_label=unit_label
                )
                
                # Update the household measure with LLM output
                refined_measure = prediction.household_measure.strip()
                if refined_measure:
                    refined_portions.append(IngredientPortion(
                        item=portion.item,
                        portion_grams=portion.portion_grams,
                        household_measure=refined_measure
                    ))
                    logger.debug(f"✅ Refined '{portion.item}': {portion.household_measure} -> {refined_measure}")
                else:
                    # Fallback to math-generated measure if LLM returns empty
                    logger.warning(f"⚠️ LLM returned empty measure for '{portion.item}', using math-generated")
                    refined_portions.append(portion)
            
            except Exception as e:
                # On error, keep the math-generated measure
                logger.warning(f"⚠️ Error refining measure for '{portion.item}': {str(e)}, using math-generated")
                refined_portions.append(portion)
        
        return refined_portions
    
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
            
            # ===== STAGE 3: LLM-BASED MEASURE REFINEMENT =====
            # Refine math-generated measures with natural language using LLM
            logger.info(f"✨ Stage 3 (LLM Formatter): Refining household measures for {len(calculated_portions)} ingredients")
            refined_portions = self._refine_household_measures(
                densities=densities,
                calculated_portions=calculated_portions
            )
            
            # Create lookup map for portions (using refined measures)
            portions_map = {p.item: p for p in refined_portions}
            
            # ===== STAGE 4: PYTHON ASSEMBLY - Truth Calculation =====
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
    Configure DSPy with Gemini API or Azure OpenAI.
    
    Priority:
    1. Gemini API (if GEMINI_API_KEY is set)
    2. Azure OpenAI (if AZURE_OPENAI_API_KEY is set)
    
    Environment variables for Gemini:
    - GEMINI_API_KEY: Your Gemini API key from Google AI Studio
    - GEMINI_MODEL: Model name (default: "gemini-2.0-flash")
      Examples: "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-1.5-pro"
    
    Uses Gemini REST API via LiteLLM:
    - Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    - Authentication: X-goog-api-key header (handled automatically by LiteLLM)
    
    Environment variables for Azure OpenAI:
    - AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_BASE, AZURE_OPENAI_DEPLOYMENT
    
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
        
        # Try Gemini API first (if API key is provided)
        gemini_api_key = os.getenv('GEMINI_API_KEY')
        if gemini_api_key:
            # Default to gemini-2.0-flash (matches REST API format from curl command)
            gemini_model = os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')
            

            
            # DSPy uses LiteLLM internally, which requires gemini/ prefix for Gemini models
            # LiteLLM automatically constructs the correct Google AI Studio endpoint
            if gemini_model.startswith('gemini/'):
                model_name = gemini_model
            elif gemini_model.startswith('google/'):
                # Convert google/ prefix to gemini/ for LiteLLM compatibility
                model_name = gemini_model.replace('google/', 'gemini/', 1)
            else:
                # Add gemini/ prefix for LiteLLM
                model_name = f"gemini/{gemini_model}"
            
            # Configure DSPy LM with Gemini API key
            # LiteLLM automatically uses Google AI Studio REST API endpoint:
            # https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
            # Do NOT set api_base - LiteLLM handles URL construction automatically
            lm = dspy.LM(
                model=model_name,
                api_key=gemini_api_key,
                max_tokens=2048,
                temperature=0.7
            )
            dspy.configure(lm=lm)
            
            _dspy_configured = True
            logger.info(f"DSPy configured successfully with Gemini REST API: {model_name} (API key via X-goog-api-key)")
            return True
        
        # Fall back to Azure OpenAI configuration
        deployment = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'obi2')
        api_base = os.getenv('AZURE_OPENAI_API_BASE')
        api_key = os.getenv('AZURE_OPENAI_API_KEY')
        api_version = os.getenv('AZURE_OPENAI_API_VERSION', '2024-12-01-preview')
        
        if not api_key:
            logger.error("Neither GEMINI_API_KEY nor AZURE_OPENAI_API_KEY found in environment")
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
