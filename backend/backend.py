from flask import Flask, jsonify, request
from flask_cors import CORS
import openai
import os
import json
from dotenv import load_dotenv
from functools import wraps
import logging
import traceback
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from flask import send_file
import datetime
import requests
from copy import deepcopy
import re


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route("/api/translate", methods=["POST"])
def api_translate_menu():
    data = request.get_json()
    menu = data.get("menu", {})
    target = data.get("targetLang", "he")

    # Custom translation mapping for specific food terms (phrases first, then single words)
    custom_terms = [
      {"en": "Whole Wheat Toast", "he": "טוסט חיטה מלאה"},
      {"en": "Egg Wrap", "he": "טורטייה ממולאת ביצה"},
      {"en": "Veggie Wrap", "he": "טורטייה ממולאת ירקות"},
      {"en": "Egg and Veggie Wrap", "he": "טורטייה ממולאת ביצה וירקות"},
      # ... add more phrases as needed ...
      {"en": "Wrap", "he": "טורטייה ממולאת"},
      {"en": "Roll", "he": "לחמנייה"},
      {"en": "Pocket", "he": "כיס פיתה"},
      {"en": "Bar", "he": "חטיף"},
      {"en": "Chips", "he": "צ'יפס / קריספס"},
      {"en": "Biscuit", "he": "ביסקוויט / עוגייה"},
      {"en": "Cookie", "he": "עוגייה"},
      {"en": "Pudding", "he": "פודינג"},
      {"en": "Mousse", "he": "מוס"},
      {"en": "Dressing", "he": "רוטב לסלט"},
      {"en": "Entrée", "he": "מנה עיקרית / מנת פתיחה"},
      {"en": "Starter", "he": "מנה ראשונה"},
      {"en": "Batter", "he": "בלילה"},
      {"en": "Toast", "he": "טוסט"},
      {"en": "Jam", "he": "ריבה"},
      {"en": "Roll-up", "he": "חטיף גליל"},
      {"en": "Popsicle", "he": "ארטיק"},
      {"en": "Cider", "he": "סיידר / מיץ תפוחים"},
      {"en": "Cereal", "he": "דגני בוקר"},
      {"en": "Stew", "he": "תבשיל"},
    ]
    # Sort terms by length of English phrase, descending (longest first)
    custom_terms.sort(key=lambda t: -len(t["en"]))
    custom_map = {t["en"].lower(): t["he"] for t in custom_terms}
    custom_words = [t["en"] for t in custom_terms]

    # 1. Gather every string you want to translate, and remember its "path" in the object
    texts = []
    paths = []
    if menu.get("note"):
        texts.append(menu["note"])
        paths.append(("note",))
    for mi, meal in enumerate(menu.get("meals", [])):
        texts.append(meal.get("meal", ""))
        paths.append(("meals", mi, "meal"))
        for optKey in ("main", "alternative"):
            opt = meal.get(optKey)
            if not opt:
                continue
            texts.append(opt.get("meal_title", ""))
            paths.append(("meals", mi, optKey, "meal_title"))
            for ii, ing in enumerate(opt.get("ingredients", [])):
                texts.append(ing.get("item", ""))
                paths.append(("meals", mi, optKey, "ingredients", ii, "item"))
        alternatives = meal.get("alternatives", [])
        for ai, alt in enumerate(alternatives):
            texts.append(alt.get("meal_title", ""))
            paths.append(("meals", mi, "alternatives", ai, "meal_title"))
            for ii, ing in enumerate(alt.get("ingredients", [])):
                texts.append(ing.get("item", ""))
                paths.append(("meals", mi, "alternatives", ai, "ingredients", ii, "item"))

    # 2. For Hebrew: replace mapped phrases/words with placeholders, send to Azure, then restore
    placeholder_map = []  # List of dicts: {ph: hebrew}
    texts_for_azure = []
    if target == "he":
        for i, t in enumerate(texts):
            orig = t
            ph_map = {}
            ph_idx = 0
            # Replace each mapped phrase/word with a unique placeholder (longest first)
            def repl_func(match):
                nonlocal ph_idx
                en_word = match.group(0)
                ph = f"__CUSTOMWORD{ph_idx}__"
                ph_map[ph] = custom_map[en_word.lower()]
                ph_idx += 1
                return ph
            for en_word in custom_words:
                pattern = r'(?<!\w)'+re.escape(en_word)+r'(?!\w)'
                t = re.sub(pattern, repl_func, t, flags=re.IGNORECASE)
            placeholder_map.append(ph_map)
            texts_for_azure.append(t)
    else:
        texts_for_azure = texts
        placeholder_map = [{} for _ in texts]

    # 3. Call Azure Translator in bulk
    endpoint = os.getenv("AZURE_TRANSLATOR_ENDPOINT")
    key      = os.getenv("AZURE_TRANSLATOR_KEY")
    region   = os.getenv("AZURE_TRANSLATOR_REGION")
    url = f"{endpoint}/translate?api-version=3.0&to={target}"
    headers = {
      "Ocp-Apim-Subscription-Key": key,
      "Ocp-Apim-Subscription-Region": region,
      "Content-Type": "application/json"
    }
    body = [{"Text": t} for t in texts_for_azure]
    translations = []
    if body:
        resp = requests.post(url, headers=headers, json=body)
        resp.raise_for_status()
        translations = resp.json()   # a list, same length as body
    # 4. Restore placeholders with Hebrew terms
    new_menu = deepcopy(menu)
    for idx, trans_item in enumerate(translations):
        translated = trans_item["translations"][0]["text"]
        # Replace placeholders with Hebrew
        for ph, heb in placeholder_map[idx].items():
            translated = translated.replace(ph, heb)
        path = paths[idx]
        obj = new_menu
        for key in path[:-1]:
            obj = obj[key]
        obj[path[-1]] = translated
    return jsonify(new_menu)

@app.route('/api/menu-pdf', methods=['POST'])
def generate_menu_pdf():
    data = request.json
    menu = data.get("menu", {})

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    y = height - 40
    margin = 40
    card_width = min(520, width - 2*margin)
    card_padding = 18
    card_height = 90
    line_height = 13
    first_page = True
    client_name = "OBI"
    today_str = datetime.datetime.now().strftime("%Y-%m-%d")

    # --- Colors ---
    green_bg = colors.HexColor("#e6f9f0")
    green_accent = colors.HexColor("#22c55e")
    blue_bg = colors.HexColor("#e0f2fe")
    blue_accent = colors.HexColor("#2563eb")
    yellow_accent = colors.HexColor("#facc15")
    orange_accent = colors.HexColor("#fb923c")
    border_color = colors.HexColor("#d1fae5")

    def draw_logo(y):
        logo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../public/logo-placeholder.png'))
        if os.path.exists(logo_path):
            try:
                logo = ImageReader(logo_path)
                c.drawImage(logo, width/2-40, y-60, width=80, height=80, mask='auto')
            except Exception:
                pass
        return y - 80

    def draw_copyright():
        c.setStrokeColor(border_color)
        c.setLineWidth(1)
        c.line(margin, margin+20, width-margin, margin+20)
        c.setFont("Helvetica", 10)
        c.setFillColor(colors.grey)
        c.drawCentredString(width/2, margin+8, "© BetterChoice 2025")

    def draw_title(y):
        c.setFont("Helvetica-Bold", 24)
        c.setFillColor(green_accent)
        c.drawCentredString(width/2, y, "BetterChoice - Meal Plan")
        y -= 30
        c.setFont("Helvetica", 14)
        c.setFillColor(colors.black)
        c.drawCentredString(width/2, y, "Personalized Nutrition Menu")
        y -= 18
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(green_accent)
        c.drawCentredString(width/2, y, f"Client: {client_name}")
        y -= 14
        c.setFont("Helvetica", 11)
        c.setFillColor(colors.grey)
        c.drawCentredString(width/2, y, f"Date: {today_str}")
        y -= 12
        c.setStrokeColor(border_color)
        c.setLineWidth(2)
        c.line(margin, y, width-margin, y)
        y -= 20
        return y

    # Draw logo and title only on the first page
    if first_page:
        y = draw_logo(y)
        y = draw_title(y)
        first_page = False

    # --- Daily Totals Card ---
    if "totals" in menu:
        totals = menu["totals"]
        c.setFillColor(green_bg)
        c.roundRect((width-card_width)/2, y-60, card_width, 60, 12, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 15)
        c.setFillColor(green_accent)
        c.drawString((width-card_width)/2+card_padding, y-18, "Daily Totals")
        c.setFont("Helvetica-Bold", 13)
        x0 = (width-card_width)/2+card_padding
        c.setFillColor(green_accent)
        c.drawString(x0, y-38, f"{totals.get('calories', 0)} kcal")
        c.setFillColor(orange_accent)
        c.drawString(x0+120, y-38, f"Carbs: {totals.get('carbs', 0)}g")
        c.setFillColor(yellow_accent)
        c.drawString(x0+240, y-38, f"Fat: {totals.get('fat', 0)}g")
        c.setFillColor(blue_accent)
        c.drawString(x0+340, y-38, f"Protein: {totals.get('protein', 0)}g")
        y -= 60 + 20

    # --- Meals as Cards ---
    if "meals" in menu:
        for meal in menu["meals"]:
            # --- Calculate total height needed for this meal box ---
            main_ings = meal.get('main', {}).get('ingredients', [])
            alt_ings = meal.get('alternative', {}).get('ingredients', [])
            main_card_height = max(card_height, card_padding*2 + line_height*len(main_ings))
            alt_card_height = max(card_height, card_padding*2 + line_height*len(alt_ings))
            other_alts = meal.get('alternatives', [])
            other_alt_heights = []
            for alt in other_alts:
                alt_ings = alt.get('ingredients', [])
                other_alt_heights.append(max(card_height, card_padding*2 + line_height*len(alt_ings)))
            # Height for meal header, main, alt, label, all alternatives, and paddings
            meal_header_height = 38
            label_height = 18 if other_alts else 0
            total_meal_height = (
                meal_header_height + main_card_height + 18 + alt_card_height + 24 +
                label_height + sum(h + 18 for h in other_alt_heights) + 10
            )
            # --- Page break if not enough space ---
            if y - total_meal_height < margin + 40:
                draw_copyright()
                c.showPage()
                y = height - 40
            # --- Start of meal box (invisible, but reserve space) ---
            box_top = y
            # Meal Header
            meal_name = meal.get('meal', '')
            c.setFont("Helvetica-Bold", 18)
            c.setFillColor(green_accent)
            c.drawString(margin, y, meal_name)
            y -= 10
            c.setStrokeColor(border_color)
            c.setLineWidth(1)
            c.line(margin, y, width-margin, y)
            y -= 10
            # Main Option Card
            main = meal.get('main', {})
            c.setFillColor(green_bg)
            c.roundRect((width-card_width)/2, y-main_card_height, card_width, main_card_height, 12, fill=1, stroke=0)
            c.setFont("Helvetica-Bold", 13)
            c.setFillColor(green_accent)
            c.drawString((width-card_width)/2+card_padding, y-20, "Main Option")
            y_main_title = y-36
            main_title = main.get('meal_title')
            if main_title:
                c.setFont("Helvetica", 11)
                c.setFillColor(colors.HexColor("#4ade80"))
                c.drawString((width-card_width)/2+card_padding, y_main_title, main_title)
                y_macros = y_main_title - 14
            else:
                y_macros = y-36
            main_nut = main.get('nutrition', {})
            nut_x = (width+card_width)/2-card_padding
            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(green_accent)
            c.drawRightString(nut_x-270, y_macros, f"{main_nut.get('calories', 0)} kcal")
            c.setFillColor(orange_accent)
            c.drawRightString(nut_x-180, y_macros, f"Carbs: {main_nut.get('carbs', 0)}g")
            c.setFillColor(yellow_accent)
            c.drawRightString(nut_x-90, y_macros, f"Fat: {main_nut.get('fat', 0)}g")
            c.setFillColor(blue_accent)
            c.drawRightString(nut_x, y_macros, f"Protein: {main_nut.get('protein', 0)}g")
            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(colors.black)
            ing_y = y_macros - 18
            for ing in main_ings:
                c.drawString((width-card_width)/2+card_padding+10, ing_y, f"• {ing.get('item','')}   {ing.get('quantity','')} {ing.get('unit','')}")
                ing_y -= line_height + 2
            y -= main_card_height + 18
            # Alternative Option Card (first alternative)
            alt_opt = meal.get('alternative', {})
            c.setFillColor(blue_bg)
            c.roundRect((width-card_width)/2, y-alt_card_height, card_width, alt_card_height, 12, fill=1, stroke=0)
            c.setFont("Helvetica-Bold", 13)
            c.setFillColor(blue_accent)
            c.drawString((width-card_width)/2+card_padding, y-20, "Alternative 1")
            y_alt_title = y-36
            alt_title = alt_opt.get('meal_title')
            if alt_title:
                c.setFont("Helvetica", 11)
                c.setFillColor(colors.HexColor("#38bdf8"))
                c.drawString((width-card_width)/2+card_padding, y_alt_title, alt_title)
                y_alt_macros = y_alt_title - 14
            else:
                y_alt_macros = y-36
            alt_nut = alt_opt.get('nutrition', {})
            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(green_accent)
            c.drawRightString(nut_x-270, y_alt_macros, f"{alt_nut.get('calories', 0)} kcal")
            c.setFillColor(orange_accent)
            c.drawRightString(nut_x-180, y_alt_macros, f"Carbs: {alt_nut.get('carbs', 0)}g")
            c.setFillColor(yellow_accent)
            c.drawRightString(nut_x-90, y_alt_macros, f"Fat: {alt_nut.get('fat', 0)}g")
            c.setFillColor(blue_accent)
            c.drawRightString(nut_x, y_alt_macros, f"Protein: {alt_nut.get('protein', 0)}g")
            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(colors.black)
            ing_y = y_alt_macros - 18
            for ing in alt_ings:
                c.drawString((width-card_width)/2+card_padding+10, ing_y, f"• {ing.get('item','')}   {ing.get('quantity','')} {ing.get('unit','')}")
                ing_y -= line_height + 2
            y -= alt_card_height + 24
            # Render all other alternatives
            if other_alts:
                c.setFont("Helvetica-Bold", 13)
                c.setFillColor(blue_accent)
                c.drawString(margin, y, "Other Alternatives:")
                y -= 16
                for alt_idx, alt in enumerate(other_alts):
                    alt_ings = alt.get('ingredients', [])
                    alt_card_height = max(card_height, card_padding*2 + line_height*len(alt_ings))
                    c.setFillColor(blue_bg)
                    c.roundRect((width-card_width)/2, y-alt_card_height, card_width, alt_card_height, 12, fill=1, stroke=0)
                    c.setFont("Helvetica-Bold", 13)
                    c.setFillColor(blue_accent)
                    c.drawString((width-card_width)/2+card_padding, y-20, f"Alternative {alt_idx+2}")
                    alt_title = alt.get('meal_title')
                    if alt_title:
                        c.setFont("Helvetica", 11)
                        c.setFillColor(colors.HexColor("#38bdf8"))
                        c.drawString((width-card_width)/2+card_padding, y-36, alt_title)
                    alt_nut = alt.get('nutrition', {})
                    c.setFont("Helvetica-Bold", 11)
                    c.setFillColor(green_accent)
                    c.drawRightString(nut_x-270, y-36, f"{alt_nut.get('calories', 0)} kcal")
                    c.setFillColor(orange_accent)
                    c.drawRightString(nut_x-180, y-36, f"Carbs: {alt_nut.get('carbs', 0)}g")
                    c.setFillColor(yellow_accent)
                    c.drawRightString(nut_x-90, y-36, f"Fat: {alt_nut.get('fat', 0)}g")
                    c.setFillColor(blue_accent)
                    c.drawRightString(nut_x, y-36, f"Protein: {alt_nut.get('protein', 0)}g")
                    c.setFont("Helvetica-Bold", 11)
                    c.setFillColor(colors.black)
                    ing_y = y-54
                    for ing in alt_ings:
                        c.drawString((width-card_width)/2+card_padding+10, ing_y, f"• {ing.get('item','')}   {ing.get('quantity','')} {ing.get('unit','')}")
                        ing_y -= line_height + 2
                    y -= alt_card_height + 18
            # --- End of meal box ---
            y = box_top - total_meal_height  # move y down by reserved height for next meal

    draw_copyright()

    c.save()
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name="meal_plan.pdf",
        mimetype="application/pdf"
    )


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
    "Provide: `meal_name`, `meal_title`, `ingredients` (list of objects with keys "
      "`item`, `quantity`, `unit`, `calories`, `protein`, `fat`, `carbs`,`brand of pruduct`), "
    "and `nutrition` (sum of ingredients). "
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
    "Provide: `meal_name`, `meal_title`, `ingredients` (list of objects with keys "
      "`item`, `quantity`, `unit`, `calories`, `protein`, `fat`, `carbs`,`brand of pruduct`), "
    "and `nutrition` (sum of ingredients). "
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
        # Log the entire menu and totals for debugging
        for meal in full_menu:
            for section in ("main", "alternative"):
                block = meal.get(section, {})
                for ing in block.get("ingredients", []):
                    brand = ing.get("brand of pruduct", "")
                    name  = ing.get("item", "")
                    # Log what we’re about to look up
                    app.logger.info(f"Looking up UPC for brand={brand!r}, name={name!r}")

                    try:
                        resp = requests.get(
                            "https://dietitian-web.onrender.com/api/ingredient-upc",  # removed extra slash
                            params={"brand": brand, "name": name},
                            timeout=5
                        )
                        app.logger.info(f"UPC lookup HTTP {resp.status_code} — URL: {resp.url}")
                        app.logger.info(f"UPC lookup response body: {resp.text}")

                        resp.raise_for_status()
                        data = resp.json()
                        ing["UPC"] = data.get("upc")
                        app.logger.info(f"Parsed UPC: {ing['UPC']!r}")

                    except Exception as e:
                        ing["UPC"] = None
                        app.logger.warning(f"UPC lookup failed for {brand!r} {name!r}: {e}")
        logger.info("Full menu built: %s", json.dumps({"menu": full_menu, "totals": totals}, ensure_ascii=False, indent=2))
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

@app.route('/api/generate-alternative-meal', methods=['POST'])
def generate_alternative_meal():
    data = request.get_json()
    main = data.get('main')
    alternative = data.get('alternative')
    if not main or not alternative:
        return jsonify({'error': 'Missing main or alternative meal'}), 400

    # Load user preferences as in /api/build-menu
    try:
        preferences = load_user_preferences()
    except Exception as e:
        return jsonify({'error': f'Failed to load user preferences: {str(e)}'}), 500

    # Compose prompt for OpenAI
    system_prompt = (
        "You are a professional dietitian AI. Given a main meal, an existing alternative, and user preferences, generate a new, distinct alternative meal option. "
        "The new alternative should have similar calories and macros, but use different main ingredients than both the main and the current alternative. "
        "Return ONLY the new alternative meal as valid JSON with: meal_title, ingredients (list of {item, quantity, unit, calories, protein, fat, carbs}), and nutrition (sum of ingredients)."
    )
    user_prompt = {
        "role": "user",
        "content": json.dumps({
            "main": main,
            "current_alternative": alternative,
            "user_preferences": preferences
        })
    }
    try:
        response = openai.ChatCompletion.create(
            engine=deployment,
            messages=[
                {"role": "system", "content": system_prompt},
                user_prompt
            ],
            temperature=0.4
        )
        raw = response["choices"][0]["message"]["content"]
        try:
            parsed = json.loads(raw)
            return jsonify(parsed)
        except Exception:
            logger.error(f"❌ JSON parse error for new alternative meal:\n{raw}")
            return jsonify({"error": "Invalid JSON from OpenAI", "raw": raw}), 500
    except Exception as e:
        logger.error(f"Error generating alternative meal: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "False").lower() == "true")
