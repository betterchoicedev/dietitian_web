from flask import Flask, jsonify, request
from flask_cors import CORS
import openai
import os
import json
from dotenv import load_dotenv
from functools import wraps
import logging
import traceback

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = Flask(__name__)
# Configure CORS to allow all origins for development.
# This tells the browser that it's safe for your frontend (running on any port)
# to make requests to this backend.
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize the translator with a specific service URL for better reliability
# translator = Translator(service_urls=['translate.google.com'])

# Dictionary for common ingredient translations (EN -> HE)
# This provides faster, more accurate translations for common items.
# FOOD_TRANSLATIONS_HE = {
#     "chicken breast": "חזה עוף",
#     "salmon fillet": "פילה סלמון",
#     "brown rice": "אורז מלא",
#     "quinoa": "קינואה",
#     "sweet potato": "בטטה",
#     "broccoli": "ברוקולי",
#     "spinach": "תרד",
#     "olive oil": "שמן זית",
#     "almonds": "שקדים",
#     "walnuts": "אגוזי מלך",
#     "greek yogurt": "יוגורט יווני",
#     "oats": "שיבולת שועל",
#     "rolled oats": "שיבולת שועל",
#     "mixed berries": "פירות יער",
#     "egg": "ביצה",
#     "eggs": "ביצים",
#     "whole wheat bread": "לחם חיטה מלאה",
#     "avocado": "אבוקדו",
#     "cottage cheese": "גבינת קוטג'",
#     "tuna": "טונה",
#     "apple": "תפוח",
#     "banana": "בננה",
#     "protein powder": "אבקת חלבון",
#     "milk": "חלב",
#     "honey": "דבש",
#     "chia seeds": "זרעי צ'יה",
#     "low-fat granola": "גרנולה דלת שומן",
#     "non-fat greek yogurt": "יוגורט יווני 0% שומן",
# }

# Set of units and patterns to prevent from being translated
# UNTRANSLATABLE_PATTERNS = re.compile(r'^\d+(\.\d+)?$') # Matches numbers like "100" or "1.5"
# UNTRANSLATABLE_UNITS = {"g", "kg", "ml", "l", "oz", "cup", "cups", "tbsp", "tsp"}

def load_user_preferences():
    try:
        with open("../public/data.json", "r", encoding="utf-8") as file:
            data = json.load(file)
            return {
                "calories_per_day": data["dailyTotalCalories"],
                "macros": data["macros"],
                "allergies": data["client"].get("food_allergies", []),
                "limitations": data["client"].get("food_limitations", []),
                "diet_type": "personalized",
                "meal_count": len(data["meals"])
            }
    except FileNotFoundError:
        logger.error("data.json file not found")
        raise Exception("Configuration file not found")
    except json.JSONDecodeError:
        logger.error("Invalid JSON in data.json")
        raise Exception("Invalid configuration file")

# Azure OpenAI config
openai.api_type = "azure"
openai.api_base = os.getenv("AZURE_OPENAI_API_BASE")
openai.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
openai.api_key = os.getenv("AZURE_OPENAI_API_KEY")

deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "obi1")

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not openai.api_key:
            logger.error("API key not configured")
            return jsonify({"error": "Service not configured properly"}), 503
        return f(*args, **kwargs)
    return decorated_function

def generate_menu_with_azure(user_preferences):
    try:
        system_prompt = (
    "You are a professional dietitian AI. Generate a 1-day meal plan with  meals: Breakfast, Morning Snack, Lunch, Afternoon Snack, Dinner.\n\n"
    "Requirements:\n"
    "- Total daily calories must be within ±5% of the user's target.\n"
    "- Total protein, fat, and carbs must each be within ±5% of target.\n"
    "- Each meal must include both `main` and `alternative` options.\n"
    "- Each option must contain:\n"
    "   - `name`\n"
    "   - `ingredients`: list of ingredients, where each ingredient includes:\n"
    "       - `item`, `quantity`, `unit`, AND:\n"
    "       - `calories`, `protein`, `fat`, and `carbs` — specific to that ingredient.\n"
    "   - `nutrition`: total for the meal, automatically calculated by summing the ingredients' values.\n\n"
    "After generating all meals, VERIFY that the daily totals (calories, protein, fat, carbs) are within ±5% of the user's goal.\n"
    "If not, regenerate until it is correct.\n\n"
    "Respond ONLY with valid JSON:\n"
    "- `meal_plan`: 5 meals with full details.\n"
    "- `totals`: {calories, protein, fat, carbs} — summed across the day.\n"
    "- `note`: general advice or note to the user.\n"
)

#         system_prompt = (
#     "You are a professional dietitian AI. Generate a 1-day meal plan with 5 meals: Breakfast, Morning Snack, Lunch, Afternoon Snack, Dinner.\n\n"
#     "Requirements:\n"
#     "- Total daily calories must be within ±5% of the user's target.\n"
#     "- Total protein, fat, and carbs must each be within ±5% of target.\n"
#     "- Each meal must have `main` and `alternative` options, each with:\n"
#     "  - `name`, `ingredients` (list of {item, quantity, unit}), and `nutrition` ({calories, protein, fat, carbs}).\n\n"
#     "After generating all meals, you MUST calculate and VERIFY that total calories and macros are within range. If not, regenerate until they are.\n\n"
#     "Respond ONLY with valid JSON:\n"
#     "- `meal_plan`: list of 5 meals\n"
#     "- `totals`: {calories, protein, fat, carbs}\n"
#     "- `note`: advice or tips\n"
# )







        user_prompt = {
    "role": "user",
    "content": f"""
Generate a daily meal plan with exactly {user_preferences['meal_count']} meals.

Strictly follow these nutritional goals:
- ✅ Total Calories: {user_preferences['calories_per_day']} kcal (must be within ±5%)
- ✅ Protein: {user_preferences['macros']['protein']}g (±5%)
- ✅ Fat: {user_preferences['macros']['fat']}g (±5%)
- ✅ Carbs: {user_preferences['macros']['carbs']}g (±5%)

Dietary restrictions:
- Allergies: {', '.join(user_preferences['allergies']) if user_preferences['allergies'] else 'None'}
- Food Limitations: {', '.join(user_preferences['limitations']) if user_preferences['limitations'] else 'None'}
"""
}



        response = openai.ChatCompletion.create(
            engine=deployment,
            messages=[
                {"role": "system", "content": system_prompt},
                user_prompt
            ],
            temperature=0.7
        )

        return response["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"Error generating menu: {str(e)}")
        raise

@app.route("/api/menu", methods=["GET"])
@require_api_key
def get_generated_menu():
    try:
        user_preferences = load_user_preferences()
        print("user_preferences:\n", user_preferences)
        result = generate_menu_with_azure(user_preferences)
        print("Azure response:\n", result)  # 👈 for debugging
        return jsonify({"generated_menu": result})
    except Exception as e:
        logger.error(f"Error in /api/menu endpoint: {str(e)}")
        print("❌ Error generating menu:", str(e))  # 👈 this will print the real cause
        return jsonify({"error": "Failed to generate menu"}), 500

@app.route("/api/template", methods=["POST"])
def api_template():
    try:
        preferences = load_user_preferences()
        logger.info("🔹 Received user preferences for template:\n%s", json.dumps(preferences, indent=2))

        system_prompt = (
    "You are a professional dietitian AI. "
    "Given user preferences (daily calories, macros, number of meals), "
    "generate a meal template: an array of meals. "
    "For each meal, provide BOTH a main and an alternative option. "
    "Each option must include: `name`, `calories`, `protein`, `fat`, `carbs`, and `main_protein_source`. "
    "The nutrition values (calories, protein, fat, carbs) for the alternative should match the main meal as closely as possible (within ±5%). "
    "Distribute macros and calories sensibly across meals. "
    "Respond ONLY with valid JSON in this format:\n"
    "{ \"template\": [ "
    "{\"meal\": \"Breakfast\","
    "\"main\": {\"name\": \"Omelet & Toast\", \"calories\": 400, ... },"
    "\"alternative\": {\"name\": \"Greek Yogurt Bowl\", \"calories\": 400, ... }"
    "}, ... ]} "
    "\n\n"
    "IMPORTANT: Set the macro targets for each meal according to the typical macro profile of the main protein source."
    " Do NOT set a low fat target for salmon or beef meals – allow higher fat where realistic."
    " For Dinner, if using salmon, set protein target to 40-50g and fat to 25-35g; for lean beef, allow fat 20-30g. "
    "Distribute total daily protein and fat according to the main protein in each meal so no meal requires an unrealistic macro split."
)



        user_prompt = {
            "role": "user",
            "content": f"User preferences: {json.dumps(preferences)}"
        }

        logger.info("🧠 Sending to OpenAI (/template):\nSystem: %s\nUser: %s", system_prompt, user_prompt["content"])

        response = openai.ChatCompletion.create(
            engine=deployment,
            messages=[{"role": "system", "content": system_prompt}, user_prompt],
            temperature=0.3
        )

        result = response["choices"][0]["message"]["content"]
        logger.info("✅ Raw response from OpenAI (/template):\n%s", result)

        try:
            parsed = json.loads(result)
            logger.info("✅ Parsed template successfully.")
            return jsonify(parsed)
        except json.JSONDecodeError:
            logger.error("❌ JSON decode error in /api/template:\n%s", result)
            return jsonify({"error": "Invalid JSON from OpenAI", "raw": result}), 500
    except Exception as e:
        logger.error("❌ Exception in /api/template:\n%s", traceback.format_exc())
        return jsonify({"error": str(e)}), 500

def calculate_totals(meals):
    totals = {"calories": 0, "protein": 0, "fat": 0, "carbs": 0}
    for meal in meals:
        for option_key in ["main", "alternative"]:
            option = meal.get(option_key)
            if option and option.get("nutrition"):
                for macro in totals:
                    value = option["nutrition"].get(macro)

@app.route("/api/build-menu", methods=["POST"])
def api_build_menu():
    try:
        data = request.json
        template = data.get("template")
        preferences = load_user_preferences()
        if not template:
            return jsonify({"error": "Missing template"}), 400

        # ✅ Validate the template before building meals
        val_res = app.test_client().post("/api/validate-template", json={"template": template})
        val_data = val_res.get_json()

        if not val_data.get("is_valid"):
            logger.warning("❌ Template validation failed before menu build: %s", {
                "main": val_data.get("issues_main"),
                "alternative": val_data.get("issues_alt"),
            })
            return jsonify({"error": "Template validation failed", "validation": val_data}), 400

        logger.info("🔹 Building menu meal by meal, option by option...")
        full_menu = []

        for template_meal in template:
            meal_name = template_meal.get("meal")

            # Build MAIN option
            main_built = None
            main_feedback = None
            main_macros = template_meal.get("main", {})
            main_protein_source = main_macros.get("main_protein_source")
            for attempt in range(6):
                logger.info(f"🧠 Building MAIN for meal '{meal_name}', attempt {attempt + 1}")
                main_prompt = (
                    "You are a professional dietitian AI. "
                    "Given a meal template for one meal and user preferences, build the **main option only** for this meal. "
                    "The meal you generate MUST have the EXACT name as provided in 'meal_name'. "
                    "Provide: `meal_name`,`meal_title`, `ingredients` (list of {item, quantity, unit, calories, protein, fat, carbs}), and `nutrition` (sum of ingredients). "
                    "Macros must match the template within ±30%. Respond only with valid JSON."
                )
                main_content = {
                    "meal_name": meal_name,
                    "macro_targets": {
                        "calories": main_macros.get("calories"),
                        "protein": main_macros.get("protein"),
                        "fat": main_macros.get("fat"),
                        "carbs": main_macros.get("carbs"),
                    },
                    "main_protein_source": main_protein_source,
                    "preferences": preferences,
                    "INSTRUCTIONS": "Build only the main option as specified above."
                }
                if main_feedback:
                    main_content["feedback"] = main_feedback

                response = openai.ChatCompletion.create(
                    engine=deployment,
                    messages=[
                        {"role": "system", "content": main_prompt},
                        {"role": "user", "content": json.dumps(main_content)}
                    ],
                    temperature=0.3
                )
                raw_main = response["choices"][0]["message"]["content"]
                try:
                    parsed = json.loads(raw_main)
                    main_candidate = parsed.get("main") or parsed  # GPT might just return the main object
                    logger.error(main_candidate)
                except Exception:
                    logger.error(f"❌ JSON parse error for MAIN '{meal_name}':\n{raw_main}")
                    main_feedback = ["Invalid JSON from GPT"]
                    continue

                # Validate main
                validate_payload = {
                    "template": [{"main": main_macros}],
                    "menu": [{"main": main_candidate}]
                }
                val_res = app.test_client().post(
                    "/api/validate-menu",
                    json=validate_payload
                )
                val_data = val_res.get_json()
                is_valid = val_data.get("is_valid")
                issues = val_data.get("issues", [])

                if is_valid:
                    logger.info(f"✅ MAIN for meal '{meal_name}' passed validation.")
                    main_built = main_candidate
                    break
                else:
                    logger.warning(f"❌ MAIN for meal '{meal_name}' failed validation: {issues}")
                    main_feedback = issues

            if not main_built:
                logger.error(f"❌ Could not build valid MAIN for '{meal_name}' after 6 attempts.")
                main_built = {"name": "Error: Could not build main", "ingredients": [], "nutrition": {}}

            # Build ALTERNATIVE option
            alt_built = None
            alt_feedback = None
            alt_macros = template_meal.get("alternative", {})
            alt_protein_source = alt_macros.get("main_protein_source")
            for attempt in range(6):
                logger.info(f"🧠 Building ALTERNATIVE for meal '{meal_name}', attempt {attempt + 1}")
                alt_prompt = (
                    "You are a professional dietitian AI. "
                    "Given a meal template for one meal and user preferences, build the **alternative option only** for this meal. "
                    "The meal you generate MUST have the EXACT name as provided in 'meal_name'. "
                    "Provide: `meal_name`, `meal_title`, `ingredients` (list of {item, quantity, unit, calories, protein, fat, carbs}), and `nutrition` (sum of ingredients). "
                    "Macros must match the template within ±30%. Respond only with valid JSON."
                )
                alt_content = {
                    "meal_name": meal_name,
                    "macro_targets": {
                        "calories": alt_macros.get("calories"),
                        "protein": alt_macros.get("protein"),
                        "fat": alt_macros.get("fat"),
                        "carbs": alt_macros.get("carbs"),
                    },
                    "main_protein_source": alt_protein_source,
                    "preferences": preferences,
                    "INSTRUCTIONS": "Build only the alternative option as specified above."
                }
                if alt_feedback:
                    alt_content["feedback"] = alt_feedback

                response = openai.ChatCompletion.create(
                    engine=deployment,
                    messages=[
                        {"role": "system", "content": alt_prompt},
                        {"role": "user", "content": json.dumps(alt_content)}
                    ],
                    temperature=0.3
                )
                raw_alt = response["choices"][0]["message"]["content"]
                try:
                    parsed = json.loads(raw_alt)
                    alt_candidate = parsed.get("alternative") or parsed  # GPT might just return the alt object
                    logger.error(alt_candidate)
                except Exception:
                    logger.error(f"❌ JSON parse error for ALTERNATIVE '{meal_name}':\n{raw_alt}")
                    alt_feedback = ["Invalid JSON from GPT"]
                    continue

                # Validate alternative
                validate_payload = {
                    "template": [{"alternative": alt_macros}],
                    "menu": [{"alternative": alt_candidate}]
                }
                val_res = app.test_client().post(
                    "/api/validate-menu",
                    json=validate_payload
                )
                val_data = val_res.get_json()
                is_valid = val_data.get("is_valid")
                issues = val_data.get("issues", [])

                if is_valid:
                    logger.info(f"✅ ALTERNATIVE for meal '{meal_name}' passed validation.")
                    alt_built = alt_candidate
                    break
                else:
                    logger.warning(f"❌ ALTERNATIVE for meal '{meal_name}' failed validation: {issues}")
                    alt_feedback = issues

            if not alt_built:
                logger.error(f"❌ Could not build valid ALTERNATIVE for '{meal_name}' after 6 attempts.")
                alt_built = {"name": "Error: Could not build alternative", "ingredients": [], "nutrition": {}}

            # Combine into meal entry
            meal_obj = {
                "meal": meal_name,
                "main": main_built,
                "alternative": alt_built
            }
            full_menu.append(meal_obj)

        logger.info("✅ Finished building full menu.")
        totals = calculate_totals(full_menu)
        return jsonify({"menu": full_menu, "totals": totals})

    except Exception as e:
        logger.error("❌ Exception in /api/build-menu:\n%s", traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/api/validate-menu", methods=["POST"])
def api_validate_menu():
    try:
        data = request.json
        template = data.get("template")
        menu = data.get("menu")

        if not template or not menu or not isinstance(template, list) or not isinstance(menu, list):
            return jsonify({"is_valid": False, "issues": ["Missing or invalid template/menu"]}), 400

        macros = ["calories", "protein", "fat", "carbs"]

        def get_allowed_margin(val):
            val = float(val)
            if val <= 10:
                return 0.6
            elif val <= 20:
                return 0.5
            elif val <= 30:
                return 0.4
            else:
                return 0.3  # 30% margin for anything above 30
        issues = []

        # --- Main option feedback ---
        template_main = template[0].get("main")
        menu_main = menu[0].get("main")
        if template_main and menu_main:
            for macro in macros:
                tmpl_val = float(template_main.get(macro, 0))
                menu_val = float(menu_main.get("nutrition", {}).get(macro, 0))
                if tmpl_val == 0:
                    continue
                margin = get_allowed_margin(tmpl_val)
                if abs(menu_val - tmpl_val) / tmpl_val > margin:
                    direction = "Reduce" if menu_val > tmpl_val else "Increase"
                    issues.append(
                        f"{macro.capitalize()} is out of range for main: got {menu_val}g, target is {tmpl_val}g (allowed ±{int(margin*100)}%). {direction} {macro.lower()} ingredients."
                    )

        # --- Alternative option feedback ---
        template_alt = template[0].get("alternative")
        menu_alt = menu[0].get("alternative")
        if template_alt and menu_alt:
            for macro in macros:
                tmpl_val = float(template_alt.get(macro, 0))
                menu_val = float(menu_alt.get("nutrition", {}).get(macro, 0))
                if tmpl_val == 0:
                    continue
                margin = get_allowed_margin(tmpl_val)
                if abs(menu_val - tmpl_val) / tmpl_val > margin:
                    direction = "Reduce" if menu_val > tmpl_val else "Increase"
                    issues.append(
                        f"{macro.capitalize()} is out of range for alternative: got {menu_val}g, target is {tmpl_val}g (allowed ±{int(margin*100)}%). {direction} {macro.lower()} ingredients."
                    )

        is_valid = len(issues) == 0

        return jsonify({
            "is_valid": is_valid,
            "issues": issues,
        })

    except Exception as e:
        logger.error("❌ Exception in /api/validate-menu:\n%s", traceback.format_exc())
        return jsonify({"is_valid": False, "issues": [str(e)]}), 500





@app.route("/api/validate-template", methods=["POST"])
def api_validate_template():
    try:
        data = request.json
        template = data.get("template")
        preferences = load_user_preferences()

        if not template or not isinstance(template, list):
            return jsonify({"error": "Invalid or missing template"}), 400

        logger.info("🔍 Validating template totals (main & alternative)...")

        # Calculate total macros for main and alternative
        total_main = {"calories": 0, "protein": 0, "fat": 0, "carbs": 0}
        total_alt = {"calories": 0, "protein": 0, "fat": 0, "carbs": 0}
        for meal in template:
            main = meal.get("main", {})
            alt = meal.get("alternative", {})
            for macro in total_main:
                total_main[macro] += float(main.get(macro, 0))
                total_alt[macro] += float(alt.get(macro, 0))

        # Get target macros from preferences
        def parse_macro(value):
            return float(str(value).replace("g", "").strip())

        target_macros = {
            "calories": float(preferences["calories_per_day"]),
            "protein": parse_macro(preferences["macros"]["protein"]),
            "fat": parse_macro(preferences["macros"]["fat"]),
            "carbs": parse_macro(preferences["macros"]["carbs"]),
        }

        def is_out_of_range(actual, target, margin=0.3):
            if target == 0:
                return False
            return abs(actual - target) / target > margin

        # Collect issues for main and alternative
        issues_main = []
        issues_alt = []

        for macro in total_main:
            # MAIN
            actual_main = round(total_main[macro], 1)
            expected = target_macros.get(macro, 0)
            if is_out_of_range(actual_main, expected):
                percent_off = round((actual_main - expected) / expected * 100, 1)
                issues_main.append(
                    f"Main: Total {macro}: {actual_main} vs target {expected} ({percent_off:+}%)"
                )
            # ALT
            actual_alt = round(total_alt[macro], 1)
            if is_out_of_range(actual_alt, expected):
                percent_off = round((actual_alt - expected) / expected * 100, 1)
                issues_alt.append(
                    f"Alternative: Total {macro}: {actual_alt} vs target {expected} ({percent_off:+}%)"
                )

        is_valid_main = len(issues_main) == 0
        is_valid_alt = len(issues_alt) == 0
        is_valid = is_valid_main and is_valid_alt

        # Logging for debugging
        logger.info(f"Validation summary (main): totals={total_main}, targets={target_macros}, issues={issues_main}")
        logger.info(f"Validation summary (alternative): totals={total_alt}, targets={target_macros}, issues={issues_alt}")

        if not is_valid:
            logger.warning("❌ Template validation failed. Main valid: %s, Alt valid: %s", is_valid_main, is_valid_alt)
            if issues_main:
                logger.warning("Main issues: %s", issues_main)
            if issues_alt:
                logger.warning("Alternative issues: %s", issues_alt)
        else:
            logger.info("✅ Template validation PASSED for both main and alternative.")

        return jsonify({
            "is_valid": is_valid,
            "is_valid_main": is_valid_main,
            "is_valid_alt": is_valid_alt,
            "issues_main": issues_main,
            "issues_alt": issues_alt,
            "totals_main": {k: round(v, 1) for k, v in total_main.items()},
            "totals_alt": {k: round(v, 1) for k, v in total_alt.items()},
            "targets": target_macros
        })

    except Exception as e:
        logger.error("❌ Exception in /api/validate-template:\n%s", traceback.format_exc())
        return jsonify({"error": str(e)}), 500




if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "False").lower() == "true")
