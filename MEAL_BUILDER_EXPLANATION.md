# Deep Dive: MealBuilderChain.forward() Method

## Overview
The `forward()` method is the **main orchestrator** that builds a complete, nutritionally-accurate meal through a 4-stage pipeline. It takes user preferences, macro targets, and a dish name, then generates a meal with exact portions and nutrition data.

---

## Method Signature & Input

```python
def forward(
    self,
    meal_type: str,                    # "Breakfast", "Lunch", "Dinner", "Snack"
    macro_targets: Dict[str, float],    # {"calories": 500, "protein": 30, "fat": 20, "carbs": 50}
    required_protein_source: str,        # "Chicken", "Tofu", "Eggs", etc.
    preferences: Dict[str, Any],        # User's dietary info
    option_type: str = "MAIN"           # "MAIN" or "ALTERNATIVE"
) -> Dict[str, Any]                     # Complete meal JSON
```

### Example Input:
```python
meal_type = "Lunch"
macro_targets = {
    "calories": 600,
    "protein": 35,
    "fat": 25,
    "carbs": 55
}
required_protein_source = "Chicken"
preferences = {
    "region": "israel",
    "allergies": ["peanuts", "shellfish"],
    "limitations": ["dairy-free"],
    "template_meal_title": "Shakshuka",
    "meal_plan_structure": [
        {"meal": "Lunch", "description": "I want eggs and vegetables"}
    ],
    "avoid_ingredients": ["tomatoes"]  # For variety in alternatives
}
option_type = "MAIN"
```

---

## PHASE 1: Setup & Preference Extraction (Lines 910-970)

### 1.1 Region Extraction & Normalization
```python
region = preferences.get("region", "israel")  # Default to "israel"
region = region.strip().lower()                # "ISRAEL" → "israel"
```

**Why?** Ensures consistent region matching (case-insensitive).

**Example:**
- Input: `"ISRAEL"` → Normalized: `"israel"`
- Input: `"  USA  "` → Normalized: `"usa"`
- Input: `None` → Default: `"israel"`

**Logging:** Only logs once per instance (first meal) since region is the same for all meals.

---

### 1.2 Allergies & Limitations Processing
```python
raw_allergies = preferences.get("allergies", []) or []
allergies_list = [a.strip() for a in raw_allergies if isinstance(a, str) and a.strip()]
allergies_display = ", ".join(allergies_list) if allergies_list else "None"
```

**Example:**
- Input: `["peanuts", "shellfish", "  eggs  "]`
- Processed: `["peanuts", "shellfish", "eggs"]`
- Display: `"peanuts, shellfish, eggs"`

**Why strip?** Removes whitespace that could break matching later.

---

### 1.3 Client Preference Extraction (MAIN meals only)

**For MAIN meals:**
```python
if option_type.upper() == "MAIN":
    # Search meal_plan_structure for this meal type
    for meal_obj in meal_plan_structure:
        if meal_obj.get("meal", "").lower() == meal_type.lower():
            client_preference = meal_obj.get("description", "")
```

**Example:**
```python
meal_plan_structure = [
    {"meal": "Breakfast", "description": "I love oatmeal"},
    {"meal": "Lunch", "description": "I want eggs and vegetables"},
    {"meal": "Dinner", "description": "Something with fish"}
]
meal_type = "Lunch"
# Result: client_preference = "I want eggs and vegetables"
```

**For ALTERNATIVE meals:**
- `client_preference = ""` (ignored for variety)

**Why?** MAIN meals respect user requests; ALTERNATIVE meals provide variety.

---

### 1.4 Template Meal Title (REQUIRED)
```python
template_meal_title = preferences.get("template_meal_title", "")
if not template_meal_title.strip():
    raise ValueError(f"No template_meal_title provided...")
dish_name = template_meal_title.strip()
```

**Example:**
- `template_meal_title = "Shakshuka"` → `dish_name = "Shakshuka"`
- `template_meal_title = ""` → **ERROR** (must be provided)

**Why required?** The system doesn't generate dish names; it uses the template's dish name and builds ingredients for it.

---

## PHASE 2: Stage 1 - Generate Ingredient List (Lines 972-1231)

### 2.1 Build Guidance Prompts

**Macro Guidance:**
```python
macro_guidance = f"MACRO REQUIREMENTS: protein={target_protein}g, fat={target_fat}g, carbs={target_carbs}g. "
if target_fat >= 5:
    macro_guidance += "⚠️ Fat is {target_fat}g - YOU MUST include fat sources..."
```

**Example:**
- If `target_fat = 25g`:
  - Guidance: `"MACRO REQUIREMENTS: protein=35g, fat=25g, carbs=55g. ⚠️ Fat is 25g - YOU MUST include fat sources like: nuts, olive oil, avocado..."`

**Regional Guidance:**
```python
if region.lower() == "israel":
    regional_guidance = "USE ISRAELI BRANDS: Tnuva, Strauss, Angel, Achla, Osem..."
elif region.lower() == "usa":
    regional_guidance = "USE USA BRANDS: Dannon, Kraft, Land O'Lakes..."
```

**Example:**
- Region: `"israel"` → System will use "Tnuva Cottage Cheese 5%" instead of "Dannon Yogurt"
- Region: `"usa"` → System will use "Dannon Yogurt" instead of "Tnuva Cottage Cheese"

**Safety Guidance:**
```python
safety_guidance = f"ALLERGIES FIRST: ABSOLUTELY FORBIDDEN ingredients = {allergies_display}. "
```

**Combined Prompt:**
```python
enhanced_client_pref = safety_guidance + regional_guidance + macro_guidance + client_preference
```

**Example Result:**
```
"ALLERGIES FIRST: ABSOLUTELY FORBIDDEN ingredients = peanuts, shellfish. Dietary limitations: dairy-free. 
🌍 REGIONAL INGREDIENTS (CRITICAL): Client is in 'ISRAEL'. You MUST use ingredients and brands from ISRAEL ONLY. 
USE ISRAELI BRANDS: Tnuva, Strauss, Angel, Achla, Osem...
MACRO REQUIREMENTS: protein=35g, fat=25g, carbs=55g. ⚠️ Fat is 25g - YOU MUST include fat sources...
I want eggs and vegetables"
```

---

### 2.2 Call LLM to Generate Ingredients
```python
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
```

**What happens:** DSPy calls Claude with the `MealNaming` signature, which instructs Claude to:
1. Generate 7 or fewer ingredients
2. Use regional brands
3. Respect allergies/limitations
4. Include client-requested foods
5. Match macro targets

**Example LLM Response:**
```json
{
  "ingredients": "[\"Eggs\", \"Tnuva Cottage Cheese 5%\", \"Angel Whole Wheat Bread\", \"Olive Oil\", \"Bell Peppers\", \"Onions\", \"Cumin\"]"
}
```

---

### 2.3 Parse & Validate Ingredients
```python
ingredients_list = json.loads(naming_result.ingredients)
```

**Error Handling:**
- If JSON fails, tries Python literal parsing (handles single quotes)
- If both fail, raises error

**Example:**
- LLM returns: `"['Eggs', 'Bread']"` (Python format)
- Code tries `json.loads()` → fails
- Falls back to `ast.literal_eval()` → succeeds
- Result: `["Eggs", "Bread"]`

---

### 2.4 Regional Brand Verification
```python
if region.lower() == "usa":
    israeli_brands = ["tnuva", "strauss", "angel", "achla", "osem"]
    found_israeli = [brand for brand in israeli_brands if brand in ingredients_str]
    if found_israeli:
        logger.error(f"❌ ERROR: Found Israeli brands in USA meal: {found_israeli}")
```

**Example:**
- Region: `"usa"`
- Ingredients: `["Tnuva Cottage Cheese", "Dannon Yogurt"]`
- Detection: Finds `"tnuva"` in ingredients
- **ERROR LOGGED** (bug - wrong region brands)

---

### 2.5 Safety Check: Remove Prohibited Ingredients
```python
prohibited_terms = self._build_prohibited_terms(allergies_list, limitations_list, avoid_ingredients)

def violates_restriction(ingredient: str) -> Optional[str]:
    norm_ing = self._normalize_term(ingredient)  # "Peanut Butter" → "peanut butter"
    for term in prohibited_terms:
        if term in norm_ing:
            return term
    return None
```

**Example:**
- Allergies: `["peanuts"]`
- Ingredient: `"Peanut Butter"`
- Normalized: `"peanut butter"`
- Prohibited terms: `["peanut", "peanuts"]`
- Match found: `"peanut"` in `"peanut butter"`
- **RAISES ERROR** (safety violation)

**Why raise error?** Allergies are critical - if LLM suggests an allergen, it's a serious bug.

---

### 2.6 Culinary Logic Validation
```python
validation_prompt = f"""Does the dish name match the ingredients, considering dietary restrictions?

Dish name: "{dish_name}"
Ingredients: {ingredients_list}
Allergies: {allergies_display}
...
"""
```

**Example Scenarios:**

**Scenario 1: VALID**
- Dish: `"Shakshuka"`
- Ingredients: `["Eggs", "Bell Peppers", "Onions"]`
- Allergies: `["tomatoes"]`
- LLM Response: `"VALID"` (adapted shakshuka without tomatoes due to allergy)

**Scenario 2: INVALID**
- Dish: `"Pasta Carbonara"`
- Ingredients: `["Chicken", "Rice", "Vegetables"]`
- Allergies: `[]`
- LLM Response: `"INVALID: Pasta Carbonara requires pasta, eggs, cheese"`
- **RAISES ERROR** (culinary logic broken)

---

### 2.7 Ingredient Count Reduction (if > 7)
```python
if len(ingredients_list) > MAX_INGREDIENTS:  # MAX_INGREDIENTS = 7
    # Strategy: Combine spices, remove minor ingredients
```

**Example:**
- Original: `["Eggs", "Bread", "Olive Oil", "Bell Peppers", "Onions", "Cumin", "Paprika", "Salt", "Pepper"]` (9 ingredients)
- Process:
  1. Separate spices: `["Cumin", "Paprika", "Salt", "Pepper"]`
  2. Main ingredients: `["Eggs", "Bread", "Olive Oil", "Bell Peppers", "Onions"]`
  3. Combine spices: `"Spices (Cumin, Paprika, Salt, Pepper)"`
  4. Final: `["Eggs", "Bread", "Olive Oil", "Bell Peppers", "Onions", "Spices (Cumin, Paprika, Salt, Pepper)"]` (6 ingredients)

**Why limit?** Backend validator has hard limit of 7 ingredients.

---

## PHASE 3: Stage 2 - Nutrition Lookup (Lines 1233-1271)

### 3.1 Look Up Nutrition Per 100g
```python
for ingredient in ingredients_list:
    query = ingredient  # "Tnuva Cottage Cheese 5%"
    nutrition_100g = self.nutrition_lookup.forward(query, 100.0)  # Try Gemini first
    
    if nutrition_100g is None:
        nutrition_100g = self._claude_nutrition_fallback(query)  # Fallback to Claude
```

**Example:**
- Ingredient: `"Tnuva Cottage Cheese 5%"`
- Gemini lookup: Returns `None` (disabled or timeout)
- Claude fallback: Searches web, returns:
  ```json
  {
    "calories": 85,
    "protein_g": 12.5,
    "fat_g": 2.5,
    "carbohydrates_g": 4.0
  }
  ```
- Stored as per-100g data (not scaled yet)

---

### 3.2 Extract Brand Information
```python
product_name, brand = self._extract_brand_from_ingredient(ingredient)
```

**Example:**
- Input: `"Tnuva Cottage Cheese 5%"`
- Extracted: `product_name = "Cottage Cheese 5%"`, `brand = "Tnuva"`
- Stored in `nutrition_per_100g[ingredient]` with brand info

---

## PHASE 4: Stage 2.5 - Classify Culinary Roles (Lines 1273-1315)

### 4.1 Role Classification
```python
role = self._classify_culinary_role(
    ingredient_name=ingredient,
    required_protein_source=required_protein_source,
    nutrition_per_100g=nutrition_data
)
```

**Classification Logic:**

**PROTEIN_ANCHOR:**
- Keywords: `"chicken"`, `"egg"`, `"tofu"`, etc.
- AND protein% > 25% of calories
- Example: `"Eggs"` with 13g protein/100g, 155 cal → protein% = (13*4)/155 = 33.5% → **PROTEIN_ANCHOR**

**CARB_ANCHOR:**
- Keywords: `"rice"`, `"pasta"`, `"bread"`, etc.
- AND carbs% > 40% of calories
- Example: `"Angel Whole Wheat Bread"` with 45g carbs/100g, 250 cal → carbs% = (45*4)/250 = 72% → **CARB_ANCHOR**

**FAT_SOURCE:**
- Keywords: `"oil"`, `"avocado"`, `"nuts"`, etc.
- AND (fat% > 40% OR fat > 15g/100g)
- Example: `"Olive Oil"` with 100g fat/100g → **FAT_SOURCE**

**BASE:**
- Keywords: `"lettuce"`, `"cucumber"`, `"tomato"`, etc.
- AND calories < 50/100g
- Example: `"Bell Peppers"` with 20 cal/100g → **BASE**

**FLAVOR:**
- Keywords: `"spice"`, `"cumin"`, `"salt"`, etc.
- Example: `"Cumin"` → **FLAVOR**

**Example Classification:**
```
Ingredients with roles:
- "Eggs": protein_anchor (33.5% protein)
- "Angel Whole Wheat Bread": carb_anchor (72% carbs)
- "Olive Oil": fat_source (100% fat)
- "Bell Peppers": base (20 cal/100g)
- "Onions": base (40 cal/100g)
- "Cumin": flavor
```

---

### 4.2 Ensure Protein Anchor Exists
```python
if role_counts.get(CulinaryRole.PROTEIN_ANCHOR.value, 0) == 0:
    # Find highest protein ingredient and promote it
    max_protein_ing = max(ingredients_with_roles, key=lambda x: x["protein_per_100g"])
    max_protein_ing["role"] = CulinaryRole.PROTEIN_ANCHOR.value
```

**Example:**
- If no protein anchor found, and `"Tnuva Cottage Cheese 5%"` has highest protein (12.5g/100g)
- **Promoted to PROTEIN_ANCHOR** (critical for meal structure)

---

## PHASE 5: Stage 3 - Calculate Portions (Lines 1317-1531)

### 5.1 Iterative Refinement Loop
```python
max_refinement_attempts = 3
for refinement_attempt in range(max_refinement_attempts):
    # Calculate portions
    # Validate
    # If invalid, retry with feedback
```

**Why iterative?** Portions must hit macro targets exactly. If first attempt misses, retry with feedback.

---

### 5.2 Portion Calculation (LLM Call)
```python
portion_result = self.calculate_portions(
    dish_name=dish_name,
    ingredients_with_roles=json.dumps(ingredients_with_roles),
    macro_targets=json.dumps(macro_targets),
    required_protein_source=required_protein_source,
    feedback_from_validation=feedback_text  # Empty on first attempt
)
```

**What LLM Does:**
1. **Anchor-based strategy:**
   - Start with PROTEIN_ANCHOR: Calculate grams to meet protein target
   - Then CARB_ANCHOR: Calculate grams to meet carb target (minus carbs from protein)
   - Then FAT_SOURCE: Fill remaining calories with fat
   - Then BASE & FLAVOR: Add vegetables and spices (macro-neutral)

2. **Example Calculation:**
   ```
   Target: 35g protein, 55g carbs, 25g fat, 600 cal
   
   Step 1: Protein Anchor (Eggs, 13g protein/100g)
   - Need: 35g protein
   - Portion: (35 / 13) * 100 = 269g eggs
   - Provides: 35g protein, 0g carbs, 18g fat, 417 cal
   
   Step 2: Carb Anchor (Bread, 45g carbs/100g)
   - Need: 55g carbs (already have 0g from eggs)
   - Portion: (55 / 45) * 100 = 122g bread
   - Provides: 12g protein, 55g carbs, 3g fat, 305 cal
   
   Step 3: Fat Source (Olive Oil)
   - Current: 417 + 305 = 722 cal
   - Need: 600 cal (we're over! Need to reduce)
   - Actually, we need to fill remaining fat: 25g - 18g - 3g = 4g fat
   - Olive oil: 100g fat/100g
   - Portion: (4 / 100) * 100 = 4g olive oil
   - Provides: 0g protein, 0g carbs, 4g fat, 36 cal
   
   Step 4: Base & Flavor
   - Bell Peppers: 50g (low cal, adds volume)
   - Onions: 30g
   - Cumin: 2g
   ```

**LLM Returns:**
```json
{
  "calculated_portions": "{\"Eggs\": {\"portionSI(gram)\": 269, \"household_measure\": \"4 large eggs\", \"brand of pruduct\": \"\"}, \"Angel Whole Wheat Bread\": {\"portionSI(gram)\": 122, \"household_measure\": \"2 slices\", \"brand of pruduct\": \"Angel\"}, ...}",
  "culinary_reasoning": "Started with protein anchor (eggs) to meet 35g protein target. Added bread for carbs. Used olive oil to fill remaining fat. Added vegetables for volume."
}
```

---

### 5.3 Calculate Actual Nutrition from Portions
```python
for ingredient, portion_info in portions_dict.items():
    portion_grams = portion_info.get("portionSI(gram)", 0)  # 269g
    scale_factor = portion_grams / 100.0  # 2.69
    
    nutrition_data[ingredient] = {
        "calories": round(per_100g["calories_per_100g"] * scale_factor, 1),  # 155 * 2.69 = 417
        "protein": round(per_100g["protein_per_100g"] * scale_factor, 1),    # 13 * 2.69 = 35
        "fat": round(per_100g["fat_per_100g"] * scale_factor, 1),            # 11 * 2.69 = 29.6
        "carbs": round(per_100g["carbs_per_100g"] * scale_factor, 1)        # 1.1 * 2.69 = 3.0
    }
```

**Example:**
- Ingredient: `"Eggs"`
- Portion: `269g`
- Per 100g: `155 cal, 13g protein, 11g fat, 1.1g carbs`
- Scaled: `417 cal, 35g protein, 29.6g fat, 3.0g carbs`

---

### 5.4 Validation (Stage 3.5)
```python
# Calculate totals
total_calories = sum(ing.get("calories", 0) for ing in temp_meal["ingredients"])
total_protein = sum(ing.get("protein", 0) for ing in temp_meal["ingredients"])
# ... etc

# Call validation LLM
validation_result = self.validate_meal(
    dish_name=dish_name,
    meal_plan=json.dumps(temp_meal),
    macro_targets=json.dumps(macro_targets),
    allowed_margins=json.dumps(allowed_margins)
)
```

**Validation Checks:**
1. **Mathematical:** Are totals within allowed margins?
2. **Culinary Scale:** Is total weight 200-850g?
3. **Fat Ratio:** Is fat < 45% of calories?
4. **Compliance:** ≤ 7 ingredients?

**Example:**
- Totals: `620 cal, 38g protein, 28g fat, 58g carbs`
- Targets: `600 cal, 35g protein, 25g fat, 55g carbs`
- Allowed margins: `30%` for each
- Calories: `|620-600|/600 = 3.3%` ✅ (within 30%)
- Protein: `|38-35|/35 = 8.6%` ✅ (within 30%)
- Fat: `|28-25|/25 = 12%` ✅ (within 30%)
- Carbs: `|58-55|/55 = 5.5%` ✅ (within 30%)
- **VALID** ✅

**If Invalid:**
```python
feedback_for_portions = f"""VALIDATION FAILED - ADJUST PORTIONS:

{validation_feedback}

CURRENT TOTALS:
- Calories: 620 (target: 600)
- Protein: 38g (target: 35g)
- Fat: 28g (target: 25g)
- Carbs: 58g (target: 55g)

Use the feedback above to recalculate portions."""
```

**Retry:** Loop back to portion calculation with feedback (up to 3 attempts).

---

## PHASE 6: Stage 4 - Assemble Final Meal (Lines 1533-1796)

### 6.1 Build Assembly Instructions
```python
assembly_instruction = f"""
Current totals: {json.dumps(current_totals)}
Target totals: {json.dumps(macro_targets)}
Allowed ranges (must be WITHIN these ranges):
  Calories: 420.0 - 780.0 (target: 600)
  Protein: 24.5g - 45.5g (target: 35g)
  ...
"""
```

**Purpose:** Tell Claude exactly what ranges are acceptable and how to adjust if needed.

---

### 6.2 Final Assembly (LLM Call)
```python
assembly_result = self.assemble_meal(
    meal_type=meal_type,
    dish_name=dish_name,
    ingredients_with_portions=json.dumps(portions_dict) + "\n\n" + assembly_instruction,
    ingredients_with_nutrition=json.dumps(nutrition_data),
    macro_targets=json.dumps(macro_targets)
)
```

**What LLM Does:**
1. Takes portions and nutrition data
2. Checks if totals are within allowed ranges
3. If not, adjusts portions proportionally
4. Formats final JSON with all required fields

**Example Output:**
```json
{
  "final_meal_json": "{\"meal_name\": \"Lunch\", \"meal_title\": \"Shakshuka\", \"ingredients\": [{\"item\": \"Eggs\", \"portionSI(gram)\": 269, \"household_measure\": \"4 large eggs\", \"calories\": 417, \"protein\": 35, \"fat\": 29.6, \"carbs\": 3.0, \"brand of pruduct\": \"\"}, ...]}"
}
```

---

### 6.3 Post-Processing: Brand Extraction
```python
for ing in ingredients:
    item_name = ing.get("item", "")
    brand_field = ing.get("brand of pruduct", "").strip()
    
    if not brand_field and item_name:
        _, extracted_brand = self._extract_brand_from_ingredient(item_name)
        if extracted_brand:
            ing["brand of pruduct"] = extracted_brand
```

**Example:**
- Item: `"Tnuva Cottage Cheese 5%"`
- Brand field: `""` (empty)
- Extraction: Finds `"Tnuva"` in name
- Result: `brand of pruduct = "Tnuva"`

---

### 6.4 Programmatic Correction (if macros still off)

**Why needed?** Sometimes LLM's adjustments aren't precise enough.

**Correction Strategy:**
```python
# 1. Identify problematic macro
priority_macro = "fat"  # If fat is 28g but target is 25g

# 2. Calculate scale factor
target_scale = 25 / 28 = 0.893  # Need to reduce by 10.7%

# 3. Use conservative adjustment (50% towards target)
conservative_scale = 1.0 + (0.893 - 1.0) * 0.5 = 0.946  # Only reduce by 5.4%

# 4. Apply to high-contributing ingredients only
for ing in ingredients:
    if ing contributes > 10% to fat:
        old_portion = ing["portionSI(gram)"]
        new_portion = old_portion * 0.946
        # Recalculate nutrition
```

**Example:**
- Problem: Fat is `28g`, target is `25g`
- Olive Oil contributes `14g fat` (50% of total)
- Old portion: `15g`
- New portion: `15g * 0.946 = 14.2g`
- New fat from oil: `14.2g` (was 14g)
- Total fat: `27.2g` (closer to 25g)

**Iterative:** Repeats up to 5 times, checking after each adjustment.

**Oscillation Detection:**
```python
if abs(current_totals["calories"] - previous_totals["calories"]) < 5:
    oscillation_detected = True
    break  # Stop correcting
```

**Why?** If totals bounce back and forth (e.g., 600 → 605 → 600 → 605), we're stuck in a loop.

---

## Final Output

**Complete Meal JSON:**
```json
{
  "meal_name": "Lunch",
  "meal_title": "Shakshuka",
  "ingredients": [
    {
      "item": "Eggs",
      "portionSI(gram)": 269,
      "household_measure": "4 large eggs",
      "calories": 417,
      "protein": 35,
      "fat": 29.6,
      "carbs": 3.0,
      "brand of pruduct": ""
    },
    {
      "item": "Angel Whole Wheat Bread",
      "portionSI(gram)": 122,
      "household_measure": "2 slices",
      "calories": 305,
      "protein": 12,
      "fat": 3,
      "carbs": 55,
      "brand of pruduct": "Angel"
    },
    {
      "item": "Olive Oil",
      "portionSI(gram)": 4,
      "household_measure": "1 tsp",
      "calories": 36,
      "protein": 0,
      "fat": 4,
      "carbs": 0,
      "brand of pruduct": ""
    },
    {
      "item": "Bell Peppers",
      "portionSI(gram)": 50,
      "household_measure": "1 medium pepper",
      "calories": 10,
      "protein": 0.5,
      "fat": 0.1,
      "carbs": 2.4,
      "brand of pruduct": ""
    },
    {
      "item": "Onions",
      "portionSI(gram)": 30,
      "household_measure": "1/4 medium onion",
      "calories": 12,
      "protein": 0.3,
      "fat": 0,
      "carbs": 2.8,
      "brand of pruduct": ""
    },
    {
      "item": "Cumin",
      "portionSI(gram)": 2,
      "household_measure": "1/2 tsp",
      "calories": 8,
      "protein": 0.4,
      "fat": 0.5,
      "carbs": 0.9,
      "brand of pruduct": ""
    }
  ]
}
```

**Totals:** `788 cal, 48.2g protein, 37.2g fat, 64.1g carbs`
- Within allowed margins? ✅ (after correction)

---

## Key Design Decisions

1. **4-Stage Pipeline:** Separates concerns (ingredients → nutrition → portions → assembly)
2. **Iterative Refinement:** Retries with feedback if validation fails
3. **Programmatic Correction:** Final safety net if LLM adjustments aren't precise
4. **Regional Branding:** Ensures ingredients are actually available in user's region
5. **Safety First:** Allergies checked at multiple stages (LLM prompt + code validation)
6. **Culinary Roles:** Helps LLM understand ingredient functions for better portioning
7. **Conservative Adjustments:** Only moves 50% towards target to avoid overshooting

---

## Error Handling

- **JSON Parsing:** Falls back to Python literal parsing
- **Nutrition Lookup:** Gemini → Claude fallback
- **Validation Failures:** Retries up to 3 times with feedback
- **Macro Mismatches:** Programmatic correction with oscillation detection
- **Safety Violations:** Raises errors immediately (allergies, culinary logic)

---

This method orchestrates a complex pipeline that ensures meals are:
- ✅ Nutritionally accurate (hits macro targets)
- ✅ Regionally appropriate (uses local brands)
- ✅ Safe (respects allergies/limitations)
- ✅ Culinary logical (dish name matches ingredients)
- ✅ Realistic (reasonable portions, proper structure)


