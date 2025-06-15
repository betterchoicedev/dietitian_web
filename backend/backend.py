from flask import Flask, jsonify, request
from flask_cors import CORS
import openai
import os
import json
from dotenv import load_dotenv
from functools import wraps
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Allow all origins for development
# Configure CORS with specific origin
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}})

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
    "- Each meal must have `main` and `alternative` options, each with:\n"
    "  - `name`, `ingredients` (list of {item, quantity, unit}), and `nutrition` ({calories, protein, fat, carbs}).\n\n"
    "After generating all meals, you MUST calculate and VERIFY that total calories and macros are within range. If not, regenerate until they are.\n\n"
    "Respond ONLY with valid JSON:\n"
    "- `meal_plan`: list of 5 meals\n"
    "- `totals`: {calories, protein, fat, carbs}\n"
    "- `note`: advice or tips\n"
)







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

if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "False").lower() == "true")
