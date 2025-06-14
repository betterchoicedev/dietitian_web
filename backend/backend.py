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
    "You are a professional dietitian AI. Based on the user's preferences, generate a personalized one-day meal plan. "
    "The plan must include the following five meals: Breakfast, Morning Snack, Lunch, Afternoon Snack, and Dinner.\n\n"
    "Each entry in the meal plan must follow this structure:\n"
    "- `meal`: the name of the meal (e.g., 'Breakfast', 'Lunch') — do NOT use `name` here\n"
    "- `main`: the main dish, with:\n"
    "   - `name`: the dish name\n"
    "   - `ingredients`: a list where each ingredient is an object using ONLY these keys: `item`, `quantity`, and `unit`. "
    "Do NOT use `ingredient` as a key.\n"
    "   - `nutrition`: an object with numeric values for `calories`, `protein`, `fat`, and `carbs`\n"
    "- `alternative`: same structure as `main`\n\n"
    "At the top level of the JSON, include:\n"
    "- `meal_plan`: the list of all meals described above\n"
    "- `totals`: an object summarizing total daily macros using ONLY the keys: `calories`, `protein`, `fat`, and `carbs`\n"
    "- `note`: a string providing advice or tips related to the plan\n\n"
    "The response must be strictly formatted as valid JSON. Do not return text, explanations, or additional formatting outside the JSON."
)



        user_prompt = {
            "role": "user",
            "content": f"""
Generate a {user_preferences['meal_count']}-meal daily plan for someone with:
- Daily Calorie Goal: {user_preferences['calories_per_day']}
- Macros: {user_preferences['macros']}
- Allergies: {', '.join(user_preferences['allergies']) or 'None'}
- Food Limitations: {', '.join(user_preferences['limitations']) or 'None'}
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
        result = generate_menu_with_azure(user_preferences)
        print("Azure response:\n", result)  # 👈 for debugging
        return jsonify({"generated_menu": result})
    except Exception as e:
        logger.error(f"Error in /api/menu endpoint: {str(e)}")
        print("❌ Error generating menu:", str(e))  # 👈 this will print the real cause
        return jsonify({"error": "Failed to generate menu"}), 500

if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "False").lower() == "true")
