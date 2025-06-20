from flask import Flask, jsonify, request
from flask_cors import CORS
import openai
import os
import json
from dotenv import load_dotenv
from functools import wraps
import logging
from googletrans import Translator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Allow all origins for development
# Configure CORS with specific origin
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}})

translator = Translator()

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
    "You are a professional dietitian AI. Generate a 1-day meal plan with 5 meals: Breakfast, Morning Snack, Lunch, Afternoon Snack, Dinner.\n\n"
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

def translate_menu(menu, target_lang):
    def translate_field(field):
        if isinstance(field, str):
            return translator.translate(field, dest=target_lang).text
        if isinstance(field, list):
            return [translate_field(item) for item in field]
        if isinstance(field, dict):
            return {k: translate_field(v) for k, v in field.items()}
        return field
    return translate_field(menu)

@app.post('/api/translate-menu')
async def translate_menu_endpoint(request: request):
    data = await request.json()
    menu = data['menu']
    target_lang = data.get('targetLang', 'he')
    translated_menu = translate_menu(menu, target_lang)
    return translated_menu

import traceback  # ← ADD this at the top if not already imported

@app.route("/api/template", methods=["POST"])
def api_template():
    try:
        preferences = load_user_preferences()
        logger.info("🔹 Received user preferences for template:\n%s", json.dumps(preferences, indent=2))

        system_prompt = (
            "You are a professional dietitian AI. "
            "Given user preferences (daily calories, macros, number of meals), "
            "generate a meal template: an array of meals, each with: "
            "`name`, `calories`, `protein`, `fat`, `carbs`, and `main_protein_source`. "
            "Distribute macros and calories sensibly across meals. "
            "Respond ONLY with valid JSON: {template: [ ... ]}"
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

        logger.info("🔹 Building menu meal by meal...")
        full_menu = []

        for template_meal in template:
            meal_name = template_meal.get("name")
            meal_built = None
            feedback = None
            logger.info("TEMPLATE FOR MENU GENERATION:\n%s", json.dumps(template, indent=2))
            for attempt in range(4):
                # 1. Build this meal using GPT
                system_prompt = (
                    "You are a professional dietitian AI. "
                    "Given a meal template for one meal and user preferences, build a meal plan for ONLY THIS MEAL. "
                    "Provide: `meal`, `main`, and `alternative` options. "
                    "Each option must have: `name`, `ingredients` (list of {item, quantity, unit, calories, protein, fat, carbs}), and `nutrition` (sum of ingredients). "
                    "Ensure the meal approximately matches the template macros (within ±30%) and avoids allergens/limitations. "
                    "If feedback is provided, use it to improve the meal. "
                    "Respond ONLY with valid JSON: {meal: { ... }}"
                )
                user_content = {
                    "meal_name": template_meal.get("name"),
                    "macro_targets": {
                    "calories": template_meal.get("calories"),
                    "protein": template_meal.get("protein"),
                    "fat": template_meal.get("fat"),
                    "carbs": template_meal.get("carbs"),
                    },
                     "main_protein_source": template_meal.get("main_protein_source"),
                     "preferences": preferences,
                }
                if feedback:
                    user_content["feedback"] = feedback

                logger.info(f"🧠 Building meal '{meal_name}', attempt {attempt + 1}")

                response = openai.ChatCompletion.create(
                    engine=deployment,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(user_content)}
                    ],
                    temperature=0.7
                )

                raw_meal = response["choices"][0]["message"]["content"]
                try:
                    parsed = json.loads(raw_meal)
                    built_meal = parsed.get("meal") or parsed  # GPT might just return the meal object
                except Exception:
                    logger.error(f"❌ JSON parse error for meal '{meal_name}':\n{raw_meal}")
                    feedback = ["Invalid JSON from GPT"]
                    continue

                # 2. Validate this meal (call your validator, but with just this meal in the menu list)
                validate_payload = {
                    "template": [template_meal],
                    "menu": [built_meal]
                }
                val_res = app.test_client().post(
                    "/api/validate-menu",
                    json=validate_payload
                )
                val_data = val_res.get_json()
                is_valid = val_data.get("is_valid")
                issues = val_data.get("issues", [])

                if is_valid:
                    logger.info(f"✅ Meal '{meal_name}' passed validation.")
                    meal_built = built_meal
                    break
                else:
                    logger.warning(f"❌ Meal '{meal_name}' failed validation: {issues}")
                    feedback = issues

            # If after 4 tries still not valid, add note or placeholder
            if meal_built:
                full_menu.append(meal_built)
            else:
                logger.error(f"❌ Could not build valid meal for '{meal_name}' after 4 attempts. Adding fallback.")
                full_menu.append({
                    "meal": meal_name,
                    "main": {"name": "Error: Could not build meal", "ingredients": [], "nutrition": {}},
                    "alternative": {"name": "Error: Could not build meal", "ingredients": [], "nutrition": {}},
                    "note": f"Failed to build valid meal after 4 attempts. See issues: {feedback}"
                })
                

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
        preferences = load_user_preferences()

        logger.info("🔹 Received request for /api/validate-menu")
        logger.info("Template:\n%s", json.dumps(template, indent=2))
        logger.info("Menu:\n%s", json.dumps(menu, indent=2))

        if not template or not menu:
            return jsonify({"error": "Missing template or menu"}), 400

        def is_out_of_range(actual, target, margin=0.3):
            if target == 0: return False  # avoid div-by-zero
            return abs(actual - target) / target > margin

        issues = []

        for template_meal in template:
            meal_name = template_meal.get("name")
            target = {
                "calories": template_meal.get("calories", 0),
                "protein": template_meal.get("protein", 0),
                "fat": template_meal.get("fat", 0),
                "carbs": template_meal.get("carbs", 0)
            }

            # Find the corresponding meal in the menu
            menu_meal = next((m for m in menu if m.get("name") == meal_name or m.get("meal") == meal_name or m.get("meal_name") == meal_name), None)

            if not menu_meal:
                issues.append(f"{meal_name}: meal not found in menu.")
                continue

            for option_key in ["main", "alternative"]:
                option = menu_meal.get(option_key)
                if not option or not option.get("nutrition"):
                    issues.append(f"{meal_name} ({option_key}): missing nutrition data.")
                    continue

                nutrition = option["nutrition"]
                for macro in ["calories", "protein", "fat", "carbs"]:
                    actual = round(nutrition.get(macro, 0), 1)
                    expected = target.get(macro, 0)
                    if is_out_of_range(actual, expected):
                        percent_off = round((actual - expected) / expected * 100, 1) if expected != 0 else 0
                        issues.append(
                            f"{meal_name}: {macro} in {option_key} is {actual} vs target {expected} ({percent_off:+}%)"
                        )

        is_valid = len(issues) == 0

        logger.info("✅ Validation complete. is_valid = %s", is_valid)
        return jsonify({
            "is_valid": is_valid,
            "issues": issues,
            "original_menu": menu
        })

    except Exception as e:
        logger.error("❌ Exception in /api/validate-menu:\n%s", traceback.format_exc())
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "False").lower() == "true")
