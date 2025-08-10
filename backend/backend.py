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
import datetime
from dotenv import load_dotenv
load_dotenv()
# Import libraries for Hebrew text support
try:
    from bidi.algorithm import get_display
    from arabic_reshaper import reshape
    BIDI_SUPPORT = True
except ImportError:
    BIDI_SUPPORT = False
    logger.warning("Bidirectional text support not available. Install arabic-reshaper and python-bidi for Hebrew support.")
import requests
from copy import deepcopy
import re
from supabase import create_client, Client


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


# Initialize Supabase client
supabase_url = os.getenv("supabaseUrl")
supabase_key = os.getenv("supabaseKey")
supabase: Client = create_client(supabase_url, supabase_key)

@app.route("/api/translate-recipes", methods=["POST"])
def api_translate_recipes():
    data = request.get_json()
    recipes = data.get("recipes", [])
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

    # 1. Gather every string you want to translate from recipes structure
    texts = []
    paths = []
    
    for gi, group in enumerate(recipes):
        # Translate group name
        texts.append(group.get("group", ""))
        paths.append(("groups", gi, "group"))
        
        for ri, recipe in enumerate(group.get("recipes", [])):
            # Translate recipe title
            texts.append(recipe.get("title", ""))
            paths.append(("groups", gi, "recipes", ri, "title"))
            
            # Translate recipe tips
            if recipe.get("tips"):
                texts.append(recipe.get("tips", ""))
                paths.append(("groups", gi, "recipes", ri, "tips"))
            
            # Translate recipe instructions
            for ii, instruction in enumerate(recipe.get("instructions", [])):
                texts.append(instruction)
                paths.append(("groups", gi, "recipes", ri, "instructions", ii))
            
            # Translate recipe ingredients
            for ii, ingredient in enumerate(recipe.get("ingredients", [])):
                texts.append(ingredient)
                paths.append(("groups", gi, "recipes", ri, "ingredients", ii))
            
            # Translate recipe tags
            for ti, tag in enumerate(recipe.get("tags", [])):
                texts.append(tag)
                paths.append(("groups", gi, "recipes", ri, "tags", ti))

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
    
    # 4. Restore placeholders with Hebrew terms and apply to new structure
    new_recipes = deepcopy(recipes)
    for idx, trans_item in enumerate(translations):
        translated = trans_item["translations"][0]["text"]
        # Replace placeholders with Hebrew
        for ph, heb in placeholder_map[idx].items():
            translated = translated.replace(ph, heb)
        
        # Apply translation to the correct path in new_recipes
        path = paths[idx]
        obj = new_recipes
        for key in path[:-1]:
            if isinstance(key, int):
                obj = obj[key]
            elif key == "groups":
                continue  # Skip the "groups" prefix
            else:
                obj = obj[key]
        
        # Set the translated value
        final_key = path[-1]
        if isinstance(obj, list) and isinstance(final_key, int):
            obj[final_key] = translated
        else:
            obj[final_key] = translated

    # Clean ingredient names before returning (if recipes contain ingredient data)
    cleaned_recipes = clean_ingredient_names({"recipes": new_recipes}).get("recipes", new_recipes)
    return jsonify({"recipes": cleaned_recipes})

@app.route("/api/translate-text", methods=["POST"])
def api_translate_text():
    """Simple text translation endpoint for translating user preferences and other text"""
    try:
        data = request.get_json()
        text = data.get("text", "")
        target = data.get("targetLang", "he")
        
        if not text or not text.strip():
            return jsonify({"translatedText": text})
        
        # Custom translation mapping for food-related terms
        custom_terms = [
            {"en": "Based on", "he": "מבוסס על"},
            {"en": "food log entries", "he": "רשומות יומן מזון"},
            {"en": "this user frequently consumes", "he": "משתמש זה צורך לעתים קרובות"},
            {"en": "Meal patterns", "he": "דפוסי ארוחות"},
            {"en": "times", "he": "פעמים"},
            {"en": "Breakfast", "he": "ארוחת בוקר"},
            {"en": "Lunch", "he": "ארוחת צהריים"},
            {"en": "Dinner", "he": "ארוחת ערב"},
            {"en": "Snack", "he": "חטיף"},
            {"en": "Morning Snack", "he": "חטיף בוקר"},
            {"en": "Afternoon Snack", "he": "חטיף צהריים"},
            {"en": "Evening Snack", "he": "חטיף ערב"},
            {"en": "Mid-Morning Snack", "he": "חטיף אמצע בוקר"},
            {"en": "Mid-Afternoon Snack", "he": "חטיף אמצע צהריים"},
            {"en": "Late Night Snack", "he": "חטיף לילה מאוחר"},
            {"en": "entries", "he": "רשומות"},
            {"en": "entry", "he": "רשומה"},
            {"en": "frequently", "he": "לעתים קרובות"},
            {"en": "consumes", "he": "צורך"},
            {"en": "user", "he": "משתמש"},
            {"en": "patterns", "he": "דפוסים"},
            {"en": "meal", "he": "ארוחה"},
            {"en": "meals", "he": "ארוחות"},
        ]
        
        # Sort terms by length of English phrase, descending (longest first)
        custom_terms.sort(key=lambda t: -len(t["en"]))
        
        custom_map = {t["en"].lower(): t["he"] for t in custom_terms}
        custom_words = [t["en"] for t in custom_terms]
        
        # For Hebrew: replace mapped phrases/words with placeholders, send to Azure, then restore
        if target == "he":
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
            
            text_for_azure = text
            for en_word in custom_words:
                pattern = r'(?<!\w)'+re.escape(en_word)+r'(?!\w)'
                text_for_azure = re.sub(pattern, repl_func, text_for_azure, flags=re.IGNORECASE)
        
        # For English: send Hebrew text directly to Azure without custom replacements
        elif target == "en":
            text_for_azure = text
            ph_map = {}
        
        else:
            text_for_azure = text
            ph_map = {}
        
        # Call Azure Translator
        endpoint = os.getenv("AZURE_TRANSLATOR_ENDPOINT")
        key = os.getenv("AZURE_TRANSLATOR_KEY")
        region = os.getenv("AZURE_TRANSLATOR_REGION")
        
        if not all([endpoint, key, region]):
            logger.error("Azure Translator environment variables not configured")
            return jsonify({"error": "Translation service not configured"}), 500
        
        url = f"{endpoint}/translate?api-version=3.0&to={target}"
        headers = {
            "Ocp-Apim-Subscription-Key": key,
            "Ocp-Apim-Subscription-Region": region,
            "Content-Type": "application/json"
        }
        body = [{"Text": text_for_azure}]
        
        resp = requests.post(url, headers=headers, json=body)
        resp.raise_for_status()
        translations = resp.json()
        
        if not translations:
            return jsonify({"translatedText": text})
        
        translated = translations[0]["translations"][0]["text"]
        
        # Replace placeholders with Hebrew terms
        for ph, heb in ph_map.items():
            translated = translated.replace(ph, heb)
        
        return jsonify({"translatedText": translated})
        
    except Exception as e:
        logger.error(f"Error in text translation: {str(e)}")
        return jsonify({"error": f"Translation failed: {str(e)}"}), 500

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
                texts.append(ing.get("household_measure", ""))
                paths.append(("meals", mi, optKey, "ingredients", ii, "household_measure"))
        alternatives = meal.get("alternatives", [])
        for ai, alt in enumerate(alternatives):
            texts.append(alt.get("meal_title", ""))
            paths.append(("meals", mi, "alternatives", ai, "meal_title"))
            for ii, ing in enumerate(alt.get("ingredients", [])):
                texts.append(ing.get("item", ""))
                paths.append(("meals", mi, "alternatives", ai, "ingredients", ii, "item"))
                texts.append(ing.get("household_measure", ""))
                paths.append(("meals", mi, "alternatives", ai, "ingredients", ii, "household_measure"))

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

    # Clean ingredient names before returning
    cleaned_menu = clean_ingredient_names(new_menu)
    return jsonify(cleaned_menu)




def load_user_preferences(user_code=None):
    """
    Load user preferences from Supabase chat_users table.
    If user_code is not provided, falls back to first user or default values.
    """
    try:
        # logger.info(f"🔍 Loading user preferences for user_code: {user_code}")
        # logger.info(f"Supabase URL: {supabase_url}")
        # logger.info(f"Supabase Key exists: {bool(supabase_key)}")
        
        # Define the specific fields we need to reduce data transfer
        selected_fields = 'user_code,food_allergies,dailyTotalCalories,recommendations,food_limitations,goal,number_of_meals,client_preference,macros,region,meal_plan_structure'
        
        if user_code:
            # Fetch specific user by user_code
            # logger.info(f"Fetching user with user_code: {user_code}")
            response = supabase.table('chat_users').select(selected_fields).eq('user_code', user_code).execute()
            # logger.info(f"Supabase response: {response}")
            if response.data:
                user_data = response.data[0]
                # logger.info(f"Found user: {user_data.get('user_code')}")
            else:
                logger.warning(f"No user found with user_code: {user_code}")
                raise Exception(f"User not found: {user_code}")
        else:
            # Fallback: get first user or use default values
            logger.info("No user_code provided, fetching first user")
            response = supabase.table('chat_users').select(selected_fields).limit(1).execute()
            logger.info(f"Fallback supabase response: {response}")
            if response.data:
                user_data = response.data[0]
                logger.info(f"Using fallback user: {user_data.get('user_code')}")
            else:
                logger.warning("No users found in chat_users table, using default values")
                return {
                    "calories_per_day": 2000,
                    "macros": {"protein": "150g", "fat": "80g", "carbs": "250g"},
                    "allergies": [],
                    "limitations": [],
                    "diet_type": "personalized",
                    "meal_count": 5,
                    "client_preference": {},
                    "region": "israel",  # Default region
                    "meal_plan_structure": {}
                }

        # Debug: Log the raw user data
        # logger.info(f"Raw user data from Supabase: {json.dumps(user_data, indent=2, default=str, ensure_ascii=False)}")

        # Parse macros - handle both string and object formats
        macros = user_data.get("macros", {})
        if isinstance(macros, str):
            try:
                macros = json.loads(macros)
            except:
                macros = {"protein": "150g", "fat": "80g", "carbs": "250g"}
        elif not macros:  # Handle None or empty
            macros = {"protein": "150g", "fat": "80g", "carbs": "250g"}

        # Parse arrays - handle both string and array formats
        def parse_array_field(field_value):
            if isinstance(field_value, list):
                return field_value
            elif isinstance(field_value, str):
                try:
                    return json.loads(field_value)
                except:
                    return field_value.split(',') if field_value else []
            else:
                return []

        allergies = parse_array_field(user_data.get("food_allergies", []))
        limitations = parse_array_field(user_data.get("food_limitations", []))

        # Parse client_preference
        client_preference = user_data.get("client_preference", {})
        if isinstance(client_preference, str):
            try:
                client_preference = json.loads(client_preference)
            except:
                client_preference = {}

        # Parse meal_plan_structure
        meal_plan_structure = user_data.get("meal_plan_structure", {})
        if isinstance(meal_plan_structure, str):
            try:
                meal_plan_structure = json.loads(meal_plan_structure)
            except:
                meal_plan_structure = {}

        # Ensure we have valid values with proper defaults
        calories_per_day = user_data.get("dailyTotalCalories")
        if calories_per_day is None:
            calories_per_day = 2000
        else:
            try:
                calories_per_day = float(calories_per_day)
            except (ValueError, TypeError):
                calories_per_day = 2000

        meal_count = user_data.get("number_of_meals")
        if meal_count is None:
            meal_count = 5
        else:
            try:
                meal_count = int(meal_count)
            except (ValueError, TypeError):
                meal_count = 5

        preferences = {
            "calories_per_day": calories_per_day,
            "macros": macros,
            "allergies": allergies,
            "limitations": limitations,
            "diet_type": "personalized",
            "meal_count": meal_count,
            "client_preference": client_preference,
            "region": user_data.get("region", "israel"),  # Default to israel if not specified
            "meal_plan_structure": meal_plan_structure
        }

        # logger.info(f"✅ Loaded user preferences for user_code: {user_data.get('user_code')}")
        # logger.info(f"Final preferences: {json.dumps(preferences, indent=2, ensure_ascii=False)}")
        
        # Validate that essential fields are not None
        if preferences["calories_per_day"] is None:
            logger.error("❌ calories_per_day is None after processing!")
        if preferences["macros"] is None:
            logger.error("❌ macros is None after processing!")
        
        return preferences

    except Exception as e:
        # logger.error(f"Error loading user preferences: {str(e)}")
        # logger.error(f"Error traceback: {traceback.format_exc()}")
        raise Exception(f"Failed to load user preferences: {str(e)}")

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



@app.route("/api/template", methods=["POST"])
def api_template():
    max_retries = 4  # Build 4 templates before giving up
    previous_issues = []  # Track issues from previous attempts
    
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"🔄 Attempt {attempt}/{max_retries} to generate template")
            if previous_issues:
                logger.info(f"📋 Previous issues to address: {previous_issues}")
            
            data = request.get_json()
            user_code = data.get("user_code") if data else None
            preferences = load_user_preferences(user_code)
            # logger.info("🔹 Received user preferences for template:\n%s", json.dumps(preferences, indent=2, ensure_ascii=False))

            region = preferences.get('region', 'israel').lower()
            
            # Region-specific ingredient instructions
            region_instructions = {
                'israel': "Focus on Israeli cuisine and products. Use Israeli brands (Tnuva, Osem, Strauss, Elite, Telma) and local foods (hummus, falafel, tahini, pita, sabich, shakshuka). IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 250g containers, yogurt in 150g-200g containers, hummus in 400g containers, pita bread is typically 60-80g per piece, Israeli cheese slices are 20-25g each, Bamba comes in 80g bags, Bissli in 100g bags. Use realistic Israeli portion sizes.",
                'us': "Focus on American cuisine and products. Use American brands (Kraft, General Mills, Kellogg's, Pepsi) and typical American foods (bagels, cereals, sandwiches, burgers, mac and cheese). IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 16oz (454g) containers, yogurt in 6-8oz (170-227g) containers, cream cheese in 8oz (227g) packages, American cheese slices are 21g each, bagels are 95-105g each.",
                'uk': "Focus on British cuisine and products. Use British brands (Tesco, Sainsbury's, Heinz UK, Cadbury) and typical British foods (beans on toast, fish and chips, bangers and mash). IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 300g containers, yogurt in 150-170g pots, British cheese slices are 25g each, bread slices are 35-40g each.",
                'canada': "Focus on Canadian cuisine and products. Use Canadian brands (Loblaws, President's Choice, Tim Hortons) and typical Canadian foods (maple syrup dishes, poutine elements). IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 500g containers, yogurt in 175g containers, Canadian cheese slices are 22g each.",
                'australia': "Focus on Australian cuisine and products. Use Australian brands (Woolworths, Coles, Arnott's, Vegemite) and typical Australian foods. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 250g containers, yogurt in 170g tubs, Australian cheese slices are 25g each."
            }
            
            region_instruction = region_instructions.get(region, region_instructions['israel'])

            # Build system prompt with previous issues feedback
            previous_issues_text = ""
            if previous_issues:
                previous_issues_text = f"""
**CRITICAL: PREVIOUS ATTEMPT FAILURES TO AVOID:**
{chr(10).join([f"• {issue}" for issue in previous_issues])}

**IMPORTANT: The above issues caused previous template generation to fail.**
**You MUST address these specific problems in your new template.**
**If the previous template had macro distribution issues, adjust your calculations accordingly.**
**If there were dietary restriction violations, ensure strict compliance.**
"""

            system_prompt = f"""
You are an expert nutritionist creating meal templates for users with specific dietary needs.

{region_instructions}

──────────────────────  MEAL STRUCTURE & NAMING  ─────────────────────
• Always include the three main meals – Breakfast, Lunch, Dinner – unless
the user specifies a different pattern (e.g., two meals a day, six meals, etc.).• Add snacks exactly where the user prefers (before/after any main meal).🔹 Meal names must be unique – no duplicates across the day.• If the user supplies custom names/times, honour them exactly.• If the user provides no names at all, generate clear, logical defaults (e.g., "Breakfast", "Morning Snack", "Lunch", "Afternoon Snack", "Dinner", "Pre-Workout Snack") while respecting how many meals were requested (1 – 10).

• Main meals = Breakfast, Lunch, Dinner.
Anything else is treated as a snack.

───────────────────────────  NEW INPUTS  ────────────────────────────
• meal_structure  – array of objects, each with:
    – meal            (string, unique)
    – calories_pct    (number, 0-100, sums to 100)

──────────────────  CALORIE & MACRO DISTRIBUTION  ───────────────────
• Use the supplied *meal_structure* to distribute calories, protein, and fat.
  For each meal *i*:
    1. kcal_i = daily_calories × (calories_pct_i ÷ 100)
    2. protein_i = daily_protein × (calories_pct_i ÷ 100)
    3. fat_i = daily_fat × (calories_pct_i ÷ 100)
    4. Round to the nearest whole number

──────────────────  MAIN vs ALTERNATIVE MEALS  ───────────────────────
Alternative meal rule:Each alternative must differ from its main meal in all of the following:(1) protein source (2) carb base (3) cooking method (4) flavour profile.Never repeat the same core ingredient in both options.

──────────────────────────  PREFERENCE LOGIC  ─────────────────────────
• Omit anything in food_allergies or "dislikes …" items.• Feature every "likes / loves …" item exactly once across the day.• Do not repeat the same primary ingredient across meals.

────────────────────  ADDITIONAL GENERATION RULES  ───────────────────
• For every meal output two options (main & alternative) using everyday ingredients that respect restrictions, allergies, and preferences.
• Focus on practical, realistic meal options with clear main protein sources.

──────────────────────────  RESPONSE FORMAT  ──────────────────────────
Return valid JSON only – no Markdown fences, no commentary.Schema:

{{
"template": [
{{
"meal": "",
"main": {{
"name": "",
"calories": ,
"protein": ,
"fat": ,
"main_protein_source": ""
}},
"alternative": {{
"name": "",
"calories": ,
"protein": ,
"fat": ,
"main_protein_source": ""
}}
}},
… one object per meal …
]
}}

──────────────────────────────  EXAMPLE  ──────────────────────────────
(Shortened to two meals for illustration – use the full list in practise)

{{
"template": [
{{
"meal": "Breakfast",
"main": {{
"name": "Scrambled Eggs with Toast",
"calories": 500,
"protein": 38,
"fat": 21,
"main_protein_source": "eggs"
}},
"alternative": {{
"name": "Greek Yogurt with Berries",
"calories": 500,
"protein": 38,
"fat": 21,
"main_protein_source": "yogurt"
}}
}},
{{
"meal": "Lunch",
"main": {{
"name": "Grilled Chicken & Quinoa Salad",
"calories": 600,
"protein": 45,
"fat": 20,
"main_protein_source": "chicken"
}},
"alternative": {{
"name": "Baked Salmon with Sweet Potato",
"calories": 600,
"protein": 45,
"fat": 20,
"main_protein_source": "salmon"
}}
}}
]
}}

Generate meal options that are practical, delicious, and respect all dietary restrictions and preferences.
"""



            user_prompt = {
                "role": "user",
                "content": f"User preferences: {json.dumps(preferences, ensure_ascii=False)}"
            }

            # logger.info("🧠 Sending to OpenAI (/template):\nSystem: %s\nUser: %s", system_prompt, user_prompt["content"])

            response = openai.ChatCompletion.create(
                engine=deployment,
                messages=[{"role": "system", "content": system_prompt}, user_prompt],
                temperature=0.3
            )

            result = response["choices"][0]["message"]["content"]
            logger.info("✅ Raw response from OpenAI (/template):\n%s", result)

            try:
                parsed = json.loads(result)
                logger.info("✅ Parsed template successfully on attempt %d.", attempt)
                
                # Add debugging for template structure
                template = parsed.get("template", [])
                if template:
                    # logger.info(f"🔍 Template has {len(template)} meals")
                    for i, meal in enumerate(template):
                        meal_name = meal.get('meal', 'Unknown')
                        # logger.info(f"🔍 Meal {i+1}: {meal_name}")
                    
                    meal_count = preferences.get('meal_count', 5)
                    logger.info(f"✅ Meal names validated for {meal_count} meals")
                
                # Validate the template before returning
                if template:
                    # Test validation to catch issues early
                    val_res = app.test_client().post("/api/validate-template", json={
                        "template": template, 
                        "user_code": user_code
                    })
                    val_data = val_res.get_json()
                    
                    if val_data.get("is_valid"):
                        logger.info("✅ Template passes validation on attempt %d.", attempt)
                        return jsonify(parsed)
                    else:
                        # Collect issues for next attempt
                        main_issues = val_data.get("issues_main", [])
                        alt_issues = val_data.get("issues_alt", [])
                        main_alt_issues = val_data.get("issues_main_alt", [])
                        similarity_issues = val_data.get("issues_similarity", [])
                        new_issues = main_issues + alt_issues + main_alt_issues + similarity_issues
                        
                        if new_issues:
                            previous_issues = new_issues
                            logger.warning("❌ Template validation failed on attempt %d. Issues: %s", attempt, new_issues)
                            
                            if attempt < max_retries:
                                logger.info(f"🔄 Retrying template generation with issues feedback...")
                                continue
                            else:
                                logger.warning("⚠️ Returning template despite validation failure after all attempts")
                                return jsonify(parsed)
                        else:
                            return jsonify(parsed)
                else:
                    logger.error("❌ No template found in parsed response")
                    if attempt < max_retries:
                        previous_issues = ["No template structure found in response"]
                        continue
                    else:
                        return jsonify({"error": "No valid template generated after all attempts"}), 500
                        
            except json.JSONDecodeError:
                logger.error("❌ JSON decode error in /api/template (attempt %d):\n%s", attempt, result)
                if attempt < max_retries:
                    previous_issues = ["Invalid JSON response from AI"]
                    logger.info(f"🔄 Retrying template generation due to JSON decode error...")
                    continue
                else:
                    return jsonify({"error": "Invalid JSON from OpenAI after all attempts", "raw": result}), 500
                    
        except Exception as e:
            logger.error("❌ Exception in /api/template (attempt %d):\n%s", attempt, traceback.format_exc())
            if attempt < max_retries:
                previous_issues = [f"Exception occurred: {str(e)}"]
                logger.info(f"🔄 Retrying template generation due to exception...")
                continue
            else:
                return jsonify({"error": str(e)}), 500
    
    # If we get here, all attempts failed
    logger.error("❌ All %d attempts to generate template failed", max_retries)
    return jsonify({"error": f"Failed to generate template after {max_retries} attempts"}), 500

def calculate_totals(meals):
    totals = {"calories": 0, "protein": 0, "fat": 0, "carbs": 0}
    for meal in meals:
        for option_key in ["main", "alternative"]:
            option = meal.get(option_key)
            if option and option.get("nutrition"):
                for macro in totals:
                    value = option["nutrition"].get(macro, 0)
                    totals[macro] += float(value)
    return totals

# ---------- Helpers & Prompt (top-level) ----------

MEAL_BUILDER_PROMPT = """You are a professional HEALTHY dietitian AI.

TASK
Build the {option_type} option for ONE meal using the exact macro targets provided.
Return JSON ONLY (no markdown, no comments).

OUTPUT SCHEMA (object)
{{
  "meal_name": "<exactly the provided meal_name>",
  "meal_title": "<dish name in English>",
  "ingredients": [
    {{
      "item": "<ingredient name in English>",
      "portionSI(gram)": <number>,
      "household_measure": "<realistic local measure in English>",
      "calories": <int>,
      "protein": <int>,
      "fat": <int>,
      "carbs": <int>,
      "brand of pruduct": "<real brand name in English>"
    }}
  ],
  "nutrition": {{ "calories": <int>, "protein": <int>, "fat": <int>, "carbs": <int> }}
}}

HARD RULES
• **ENGLISH ONLY** for all names/measures/brands (keep meal_name as given).
• Prioritize whole foods; avoid ultra-processed snacks unless explicitly liked in preferences.
• If snacks are requested, prefer fruit, veg, nuts, yogurt, cottage cheese, hummus, whole-grain crackers.
• Respect ALL dietary restrictions and allergies.
• If kosher: never mix meat + dairy; avoid non-kosher meats (pork, shellfish); use kosher-suitable brands.
• ≤ 7 ingredients per dish; simple methods (grill, bake, steam, sauté).
• Use realistic regional pack sizes and brands:
  {region_instruction}

MACRO TARGETS
• EXACTLY match these targets (0% tolerance): {macro_targets}.
• The primary protein for this option MUST be: {required_protein_source} (include it clearly as an ingredient).
• Ingredients and total nutrition must sum to the exact targets.

VARIETY / DIFFERENTIATION
• Avoid these protein sources: {avoid_proteins}.
• Avoid these core ingredients (substring match): {avoid_ingredients}.

VALIDATION
• No narrative text. Return only the JSON object described above.
• Do not add keys not listed in the schema.
"""

def _strip_markdown_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("```", 1)[-1]
        if "```" in s:
            s = s.rsplit("```", 1)[0]
    return s.strip()

def _region_instruction_from_prefs(preferences: dict) -> str:
    region = (preferences.get('region') or 'israel').lower()
    mapping = {
        'israel': ("Use Israeli brands (Tnuva, Osem, Strauss, Elite, Telma). "
                   "Typical packs: cottage cheese 250g; yogurt 150–200g; hummus 400g; "
                   "pita 60–80g; cheese slices 20–25g; Bamba 80g; Bissli 100g."),
        'us': ("Use US brands (Kraft, General Mills, Kellogg's). Packs: cottage cheese 16oz/454g; "
               "yogurt 6–8oz/170–227g; cream cheese 8oz/227g; cheese slices 21g; bagel 95–105g."),
        'uk': ("Use UK brands (Tesco, Sainsbury's, Heinz UK). Packs: cottage cheese 300g; yogurt 150–170g; "
               "cheese slices 25g; bread slices 35–40g."),
        'canada': ("Use Canadian brands (Loblaws, President's Choice). Packs: cottage cheese 500g; "
                   "yogurt 175g; cheese slices 22g."),
        'australia': ("Use Australian brands (Woolworths, Coles, Arnott's). Packs: cottage cheese 250g; "
                      "yogurt 170g; cheese slices 25g.")
    }
    return mapping.get(region, mapping['israel'])

def _build_option_with_retries(
    option_type: str,
    meal_name: str,
    macro_targets: dict,
    required_protein_source: str,
    preferences: dict,
    user_code: str,
    region_instruction: str,
    avoid_proteins=None,
    avoid_ingredients=None,
    max_attempts: int = 6
):
    avoid_proteins = avoid_proteins or []
    avoid_ingredients = avoid_ingredients or []

    for i in range(max_attempts):
        logger.info(f"🧠 Building {option_type} for '{meal_name}', attempt {i+1}")

        prompt = MEAL_BUILDER_PROMPT.format(
            option_type=option_type,
            region_instruction=region_instruction,
            macro_targets=macro_targets,
            required_protein_source=required_protein_source,
            avoid_proteins=avoid_proteins,
            avoid_ingredients=avoid_ingredients
        )

        user_payload = {
            "meal_name": meal_name,        # must be echoed exactly
            "preferences": preferences
        }

        response = openai.ChatCompletion.create(
            engine=deployment,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)}
            ],
            temperature=0.3
        )
        raw = _strip_markdown_fences(response["choices"][0]["message"]["content"])

        try:
            candidate = json.loads(raw)
        except Exception as e:
            logger.warning(f"❌ JSON parse error for {option_type} '{meal_name}': {e}")
            continue

        # Wrap for validator
        tpl_key = "main" if option_type.upper() == "MAIN" else "alternative"
        wrapped_template = [{tpl_key: macro_targets}]
        wrapped_menu = [{tpl_key: candidate}]

        val_res = app.test_client().post(
            "/api/validate-menu",
            json={"template": wrapped_template, "menu": wrapped_menu, "user_code": user_code}
        )
        val = val_res.get_json() or {}
        if val.get("is_valid"):
            logger.info(f"✅ {option_type} for '{meal_name}' passed validation.")
            return candidate
        else:
            logger.warning(f"❌ {option_type} for '{meal_name}' failed validation: {val.get('issues', [])}")

    return None


# ---------- Route ----------

@app.route("/api/build-menu", methods=["POST"])
def api_build_menu():
    max_retries = 4  # Try 4 times before giving up

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"🔄 Attempt {attempt}/{max_retries} to build menu")

            data = request.json or {}
            template = data.get("template")
            user_code = data.get("user_code")

            if not template:
                return jsonify({"error": "Missing template"}), 400
            if not user_code:
                return jsonify({"error": "Missing user_code"}), 400

            preferences = load_user_preferences(user_code) or {}
            region_instruction = _region_instruction_from_prefs(preferences)

            # ✅ Validate the template before building meals
            val_res = app.test_client().post("/api/validate-template", json={"template": template, "user_code": user_code})
            val_data = val_res.get_json() or {}

            if not val_data.get("is_valid"):
                logger.warning("❌ Template validation failed on attempt %d: %s", attempt, {
                    "main": val_data.get("issues_main"),
                    "alternative": val_data.get("issues_alt"),
                })

                # Try to regenerate a template if we have retries left
                if attempt < max_retries:
                    logger.info(f"🔄 Regenerating template for attempt {attempt + 1}")
                    try:
                        template_res = app.test_client().post("/api/template", json={"user_code": user_code})
                        if template_res.status_code == 200:
                            template_data = template_res.get_json() or {}
                            if template_data.get("template"):
                                template = template_data["template"]
                                logger.info(f"✅ Generated new template for attempt {attempt + 1}")
                                continue  # retry with the new template
                            else:
                                logger.error("❌ New template generation returned invalid data")
                        else:
                            logger.error(f"❌ Template regeneration failed with status {template_res.status_code}")
                    except Exception as template_error:
                        logger.error(f"❌ Error regenerating template: {template_error}")

                if attempt == max_retries:
                    return jsonify({
                        "error": "Template validation failed after all attempts",
                        "validation": val_data,
                        "attempts_made": max_retries,
                        "failure_type": "template_validation_failed",
                        "main_issues": val_data.get("issues_main", []),
                        "alternative_issues": val_data.get("issues_alt", []),
                        "main_alt_issues": val_data.get("issues_main_alt", []),
                        "suggestion": "Try regenerating the template with different parameters"
                    }), 400
                else:
                    continue  # next attempt

            logger.info("🔹 Building menu meal by meal, option by option...")
            full_menu = []

            for template_meal in template:
                meal_name = template_meal.get("meal")

                # ---- MAIN ----
                main_macros = template_meal.get("main", {})
                main_required_protein = main_macros.get("main_protein_source")

                main_targets = {
                    "calories": main_macros.get("calories"),
                    "protein":  main_macros.get("protein"),
                    "fat":      main_macros.get("fat"),
                    "carbs":    main_macros.get("carbs"),
                }

                # Basic guardrails
                if any(v is None for k, v in main_targets.items()):
                    return jsonify({
                        "error": f"Template missing macro targets for MAIN '{meal_name}'",
                        "targets": main_targets
                    }), 400

                main_built = _build_option_with_retries(
                    option_type="MAIN",
                    meal_name=meal_name,
                    macro_targets=main_targets,
                    required_protein_source=main_required_protein,
                    preferences=preferences,
                    user_code=user_code,
                    region_instruction=region_instruction
                )

                if not main_built:
                    logger.error(f"❌ Could not build valid MAIN for '{meal_name}'.")
                    return jsonify({
                        "error": f"Failed to build main option for '{meal_name}'",
                        "meal_name": meal_name,
                        "target_macros": main_targets,
                        "failure_type": "main_option_build_failed"
                    }), 400

                # ---- ALTERNATIVE ----
                alt_macros = template_meal.get("alternative", {})
                alt_required_protein = alt_macros.get("main_protein_source")

                alt_targets = {
                    "calories": alt_macros.get("calories"),
                    "protein":  alt_macros.get("protein"),
                    "fat":      alt_macros.get("fat"),
                    "carbs":    alt_macros.get("carbs"),
                }

                if any(v is None for k, v in alt_targets.items()):
                    return jsonify({
                        "error": f"Template missing macro targets for ALTERNATIVE '{meal_name}'",
                        "targets": alt_targets
                    }), 400

                # Avoid repeating main's protein/ingredients
                avoid_proteins = [p for p in [main_required_protein] if p]
                avoid_ingredients = []
                for ing in main_built.get("ingredients", []):
                    name = (ing.get("item") or "").strip()
                    if name:
                        avoid_ingredients.append(name)

                alt_built = _build_option_with_retries(
                    option_type="ALTERNATIVE",
                    meal_name=meal_name,
                    macro_targets=alt_targets,
                    required_protein_source=alt_required_protein,
                    preferences=preferences,
                    user_code=user_code,
                    region_instruction=region_instruction,
                    avoid_proteins=avoid_proteins,
                    avoid_ingredients=avoid_ingredients
                )

                if not alt_built:
                    logger.error(f"❌ Could not build valid ALTERNATIVE for '{meal_name}'.")
                    return jsonify({
                        "error": f"Failed to build alternative option for '{meal_name}'",
                        "meal_name": meal_name,
                        "target_macros": alt_targets,
                        "failure_type": "alternative_option_build_failed"
                    }), 400

                full_menu.append({
                    "meal": meal_name,
                    "main": main_built,
                    "alternative": alt_built
                })

            logger.info("✅ Finished building full menu.")
            totals = calculate_totals(full_menu)

            # Clean ingredient names before returning
            cleaned_menu = clean_ingredient_names(full_menu)

            logger.info("Full menu built: %s", json.dumps({"menu": cleaned_menu, "totals": totals}, ensure_ascii=False, indent=2))
            return jsonify({"menu": cleaned_menu, "totals": totals})

        except Exception as e:
            logger.error("❌ Exception in /api/build-menu (attempt %d):\n%s", attempt, traceback.format_exc())
            if attempt == max_retries:
                return jsonify({
                    "error": f"Menu build failed after {max_retries} attempts",
                    "exception": str(e),
                    "attempt": attempt,
                    "max_retries": max_retries,
                    "failure_type": "exception_during_build",
                    "traceback": traceback.format_exc()
                }), 500
            else:
                logger.info("🔄 Retrying menu build due to exception...")
                continue

    # If we get here, all attempts failed
    logger.error("❌ All %d attempts to build menu failed", max_retries)
    return jsonify({
        "error": f"Menu build failed after {max_retries} attempts",
        "attempts_made": max_retries,
        "failure_type": "all_attempts_exhausted",
        "suggestion": "Try regenerating the template or adjusting user preferences"
    }), 500

@app.route("/api/validate-menu", methods=["POST"])
def api_validate_menu():
    try:
        data = request.json
        template = data.get("template")
        menu = data.get("menu")
        user_code = data.get("user_code")

        if not template or not menu or not isinstance(template, list) or not isinstance(menu, list):
            return jsonify({"is_valid": False, "issues": ["Missing or invalid template/menu"]}), 400

        # Load user preferences for dietary restrictions
        preferences = None
        try:
            preferences = load_user_preferences(user_code)
        except Exception as e:
            logger.warning(f"Could not load user preferences for validation: {e}")
            preferences = {"limitations": []}

        macros = ["calories", "protein", "fat"]

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

        def validate_kosher_ingredients(ingredients, limitations):
            """Validate kosher compliance for ingredients"""
            if "kosher" not in [limit.lower() for limit in limitations]:
                return []
            
            kosher_issues = []
            
            # Define meat and dairy ingredients
            meat_items = ["chicken", "beef", "lamb", "turkey", "duck", "meat", "poultry"]
            dairy_items = ["milk", "cream", "cheese", "yogurt", "butter", "dairy", "parmesan", "mozzarella", "ricotta", "cottage cheese"]
            non_kosher_items = ["pork", "bacon", "ham", "shellfish", "shrimp", "lobster", "crab", "clam", "oyster", "scallop"]
            
            has_meat = False
            has_dairy = False
            meat_ingredients = []
            dairy_ingredients = []
            
            for ingredient in ingredients:
                item_name = ingredient.get("item", "").lower()
                
                # Check for non-kosher ingredients
                for non_kosher in non_kosher_items:
                    if non_kosher in item_name:
                        kosher_issues.append(f"Non-kosher ingredient detected: {ingredient.get('item', '')}")
                
                # Check for meat
                for meat in meat_items:
                    if meat in item_name:
                        has_meat = True
                        meat_ingredients.append(ingredient.get("item", ""))
                        break
                
                # Check for dairy
                for dairy in dairy_items:
                    if dairy in item_name:
                        has_dairy = True
                        dairy_ingredients.append(ingredient.get("item", ""))
                        break
            
            # Check for meat + dairy violation
            if has_meat and has_dairy:
                kosher_issues.append(f"KOSHER VIOLATION: Cannot mix meat and dairy in the same meal. Found meat: {', '.join(meat_ingredients)} and dairy: {', '.join(dairy_ingredients)}")
            
            return kosher_issues

        issues = []

        # --- Main option feedback ---
        template_main = template[0].get("main")
        menu_main = menu[0].get("main")
        if template_main and menu_main:
            # Validate nutritional macros
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
            
            # Validate kosher compliance for main
            main_ingredients = menu_main.get("ingredients", [])
            kosher_issues_main = validate_kosher_ingredients(main_ingredients, preferences.get("limitations", []))
            if kosher_issues_main:
                issues.extend([f"Main option: {issue}" for issue in kosher_issues_main])

        # --- Alternative option feedback ---
        template_alt = template[0].get("alternative")
        menu_alt = menu[0].get("alternative")
        if template_alt and menu_alt:
            # Validate nutritional macros
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
            
            # Validate kosher compliance for alternative
            alt_ingredients = menu_alt.get("ingredients", [])
            kosher_issues_alt = validate_kosher_ingredients(alt_ingredients, preferences.get("limitations", []))
            if kosher_issues_alt:
                issues.extend([f"Alternative option: {issue}" for issue in kosher_issues_alt])

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
        user_code = data.get("user_code")
        
        # logger.info(f"🔍 validate-template called with user_code: {user_code}")
        # logger.info(f"🔍 Request data keys: {list(data.keys()) if data else 'None'}")
        
        preferences = load_user_preferences(user_code)

        if not template or not isinstance(template, list):
            return jsonify({"error": "Invalid or missing template"}), 400

        logger.info("🔍 Validating template totals (main & alternative)...")

        # Calculate total calories, protein, and fat for main and alternative
        total_main = {"calories": 0, "protein": 0, "fat": 0}
        total_alt = {"calories": 0, "protein": 0, "fat": 0}
        for meal in template:
            main = meal.get("main", {})
            alt = meal.get("alternative", {})
            total_main["calories"] += float(main.get("calories", 0))
            total_main["protein"] += float(main.get("protein", 0))
            total_main["fat"] += float(main.get("fat", 0))
            total_alt["calories"] += float(alt.get("calories", 0))
            total_alt["protein"] += float(alt.get("protein", 0))
            total_alt["fat"] += float(alt.get("fat", 0))

        # Get target macros from preferences
        def parse_macro(value):
            if value is None:
                return 0.0
            try:
                return float(str(value).replace("g", "").strip())
            except (ValueError, TypeError):
                return 0.0

        calories_per_day = preferences.get("calories_per_day", 2000)
        if calories_per_day is None:
            calories_per_day = 2000

        # Get protein and fat targets from preferences
        macros = preferences.get("macros", {})
        if not macros:
            macros = {"protein": "150g", "fat": "80g"}

        target_macros = {
            "calories": float(calories_per_day),
            "protein": parse_macro(macros.get("protein", "150g")),
            "fat": parse_macro(macros.get("fat", "80g"))
        }
        
        # Add debug logging
        logger.info(f"🔍 Template validation using user_code: {user_code}")
        logger.info(f"🔍 Loaded preferences calories_per_day: {preferences.get('calories_per_day')}")
        logger.info(f"🔍 Raw protein from preferences: {macros.get('protein')}")
        logger.info(f"🔍 Raw fat from preferences: {macros.get('fat')}")
        logger.info(f"🔍 Parsed target_macros: {target_macros}")

        def is_out_of_range(actual, target, margin=0.05):  # 5% margin
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
                percent_off = round((actual_main - expected) / expected * 100, 3)
                issues_main.append(
                    f"Main: Total {macro}: {actual_main} vs target {expected} ({percent_off:+}%)"
                )
            # ALT
            actual_alt = round(total_alt[macro], 1)
            if is_out_of_range(actual_alt, expected):
                percent_off = round((actual_alt - expected) / expected * 100, 3)
                issues_alt.append(
                    f"Alternative: Total {macro}: {actual_alt} vs target {expected} ({percent_off:+}%)"
                )

        # Check for equality between main and alternative macros
        main_alt_issues = []
        for macro in total_main:
            main_val = round(total_main[macro], 1)
            alt_val = round(total_alt[macro], 1)
            if main_val != alt_val:
                main_alt_issues.append(
                    f"Main vs Alternative {macro} mismatch: Main={main_val}, Alt={alt_val} (PERFECT EQUALITY REQUIRED)"
                )

        is_valid_main = len(issues_main) == 0
        is_valid_alt = len(issues_alt) == 0
        is_valid = is_valid_main and is_valid_alt and len(main_alt_issues) == 0

        # Logging for debugging
        logger.info(f"Validation summary (main): totals={total_main}, targets={target_macros}, issues={issues_main}")
        logger.info(f"Validation summary (alternative): totals={total_alt}, targets={target_macros}, issues={issues_alt}")
        logger.info(f"Validation summary (main vs alt): main_alt_issues={main_alt_issues}")

        if not is_valid:
            logger.warning("❌ Template validation failed. Main valid: %s, Alt valid: %s", is_valid_main, is_valid_alt)
            if issues_main:
                logger.warning("Main issues: %s", issues_main)
            if issues_alt:
                logger.warning("Alternative issues: %s", issues_alt)
            if main_alt_issues:
                logger.warning("Main vs Alternative issues: %s", main_alt_issues)
        else:
            logger.info("✅ Template validation PASSED for both main and alternative.")

        # --- Alternative Similarity Validation ---
        # Check that main and alternative meals are sufficiently different
        similarity_issues = []
        for meal in template:
            meal_name = meal.get("meal", "")
            main_meal = meal.get("main", {})
            alt_meal = meal.get("alternative", {})
            
            # Check for similar protein sources
            main_protein = main_meal.get("main_protein_source", "").lower()
            alt_protein = alt_meal.get("main_protein_source", "").lower()
            if main_protein and alt_protein and main_protein == alt_protein:
                similarity_issues.append(
                    f"{meal_name}: Same protein source '{main_protein}' in both main and alternative - Must use different proteins"
                )

        is_valid_similarity = len(similarity_issues) == 0
        is_valid = is_valid and is_valid_similarity

        return jsonify({
            "is_valid": is_valid,
            "is_valid_main": is_valid_main,
            "is_valid_alt": is_valid_alt,
            "is_valid_similarity": is_valid_similarity,
            "issues_main": issues_main,
            "issues_alt": issues_alt,
            "issues_main_alt": main_alt_issues,
            "issues_similarity": similarity_issues,
            "totals_main": {k: round(v, 1) for k, v in total_main.items()},
            "totals_alt": {k: round(v, 1) for k, v in total_alt.items()},
            "targets": target_macros
        })

    except Exception as e:
        logger.error("❌ Exception in /api/validate-template:\n%s", traceback.format_exc())
        return jsonify({"error": str(e)}), 500



def prepare_upc_lookup_params(brand, name, region="israel"):
    """
    Prepare parameters for UPC lookup based on the user's region.
    """
    if not brand and not name:
        return None, None, None
    
    # Normalize region to handle different variations
    region_normalized = region.lower().strip() if region else "israel"
    israeli_variations = ["israel", "il", "isr", "israeli"]
    is_israeli = region_normalized in israeli_variations
    
    if is_israeli:
        # For Israeli region: combine brand and name but avoid duplication
        brand_lower = brand.lower() if brand else ""
        name_lower = name.lower() if name else ""
        
        # Check if brand is already in the name to avoid duplication
        if brand and brand_lower in name_lower:
            query = name  # Use name as is since it already contains brand
        else:
            # Combine brand and name
            query = f"{brand} {name}".strip()
        
        return "hebrew", {"query": query}, is_israeli
    else:
        # For non-Israeli regions: send brand and name separately
        return "regular", {"brand": brand, "name": name}, is_israeli

@app.route('/api/enrich-menu-with-upc', methods=['POST'])
def enrich_menu_with_upc():
    """
    Asynchronous endpoint to add UPC codes to an existing menu.
    Takes a menu JSON and returns it with UPC codes added to ingredients.
    """
    try:
        data = request.json
        menu = data.get("menu")
        user_code = data.get("user_code")
        
        if not menu:
            return jsonify({"error": "Missing menu data"}), 400
        
        # Load user preferences to get region
        try:
            preferences = load_user_preferences(user_code)
            region = preferences.get('region', 'israel')
        except Exception as e:
            logger.warning(f"Failed to load user preferences, using default region: {e}")
            region = 'israel'
        
        logger.info(f"🔍 Starting UPC enrichment for menu with region: {region}")
        
        # Process each meal and add UPC codes
        enriched_menu = []
        for meal in menu:
            enriched_meal = meal.copy()
            
            for section in ("main", "alternative"):
                if section in enriched_meal:
                    block = enriched_meal[section].copy()
                    enriched_ingredients = []
                    
                    for ing in block.get("ingredients", []):
                        enriched_ing = ing.copy()
                        brand = enriched_ing.get("brand of pruduct", "")
                        name = enriched_ing.get("item", "")
                        
                        # Log what we're about to look up
                        app.logger.info(f"Looking up UPC for brand={brand!r}, name={name!r}")

                        try:
                            # Determine endpoint and parameters based on region
                            endpoint_type, params, is_israeli = prepare_upc_lookup_params(brand, name, region)
                            
                            if not endpoint_type:
                                enriched_ing["UPC"] = None
                                app.logger.warning(f"No valid parameters for UPC lookup: brand={brand!r}, name={name!r}")
                                enriched_ingredients.append(enriched_ing)
                                continue
                            
                            # Choose the appropriate endpoint
                            if endpoint_type == "hebrew":
                                url = "https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-upc-hebrew"
                                app.logger.info(f"Using Hebrew UPC endpoint for region: {region}")
                            else:
                                url = "https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-upc"
                                app.logger.info(f"Using regular UPC endpoint for region: {region}")
                            
                            resp = requests.get(url, params=params, timeout=30)
                            app.logger.info(f"UPC lookup HTTP {resp.status_code} — URL: {resp.url}")
                            app.logger.info(f"UPC lookup response body: {resp.text}")

                            resp.raise_for_status()
                            upc_data = resp.json()
                            enriched_ing["UPC"] = upc_data.get("upc")
                            app.logger.info(f"Parsed UPC: {enriched_ing['UPC']!r}")

                        except Exception as e:
                            enriched_ing["UPC"] = None
                            app.logger.warning(f"UPC lookup failed for {brand!r} {name!r}: {e}")
                        
                        enriched_ingredients.append(enriched_ing)
                    
                    block["ingredients"] = enriched_ingredients
                    enriched_meal[section] = block
            
            enriched_menu.append(enriched_meal)
        
        # Clean ingredient names before returning
        cleaned_menu = clean_ingredient_names(enriched_menu)
        
        logger.info("✅ UPC enrichment completed.")
        return jsonify({"menu": cleaned_menu})
        
    except Exception as e:
        logger.error("❌ Exception in /api/enrich-menu-with-upc:\n%s", traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/api/batch-upc-lookup', methods=['POST'])
def batch_upc_lookup():
    """
    Streamlined batch UPC lookup endpoint.
    Takes a list of ingredients and returns UPC codes for all of them in one go.
    Much more efficient than individual lookups.
    """
    try:
        data = request.json
        ingredients = data.get("ingredients", [])
        user_code = data.get("user_code")
        
        if not ingredients:
            return jsonify({"error": "Missing ingredients data"}), 400
        
        # Load user preferences to get region
        try:
            preferences = load_user_preferences(user_code)
            region = preferences.get('region', 'israel')
        except Exception as e:
            logger.warning(f"Failed to load user preferences, using default region: {e}")
            region = 'israel'
        
        logger.info(f"🔍 Starting batch UPC lookup for {len(ingredients)} ingredients with region: {region}")
        
        results = []
        
        # Process all ingredients in parallel-like manner (simulate concurrent processing)
        for ingredient in ingredients:
            brand = ingredient.get("brand", "").strip()
            name = ingredient.get("name", "").strip()
            
            if not brand and not name:
                results.append({
                    "brand": brand,
                    "name": name,
                    "upc": None,
                    "error": "Missing brand and name"
                })
                continue
            
            try:
                # Determine endpoint and parameters based on region
                endpoint_type, params, is_israeli = prepare_upc_lookup_params(brand, name, region)
                
                if not endpoint_type:
                    results.append({
                        "brand": brand,
                        "name": name,
                        "upc": None,
                        "error": "No valid parameters"
                    })
                    continue
                
                # Choose the appropriate endpoint
                if endpoint_type == "hebrew":
                    url = "https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-upc-hebrew"
                    logger.info(f"Using Hebrew UPC endpoint for region: {region}")
                else:
                    url = "https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-upc"
                    logger.info(f"Using regular UPC endpoint for region: {region}")
                
                # Use the appropriate UPC lookup service
                resp = requests.get(url, params=params, timeout=30)  # Increased timeout for complex Hebrew searches
                
                if resp.status_code == 200:
                    upc_data = resp.json()
                    upc_code = upc_data.get("upc")
                    
                    results.append({
                        "brand": brand,
                        "name": name,
                        "upc": upc_code
                    })
                    
                    logger.info(f"✅ Found UPC for {brand} {name}: {upc_code}")
                else:
                    results.append({
                        "brand": brand,
                        "name": name,
                        "upc": None,
                        "error": f"HTTP {resp.status_code}"
                    })
                    logger.warning(f"❌ UPC lookup failed for {brand} {name}: HTTP {resp.status_code}")
                    
            except requests.exceptions.Timeout:
                results.append({
                    "brand": brand,
                    "name": name,
                    "upc": None,
                    "error": "Timeout"
                })
                logger.warning(f"⏰ UPC lookup timed out for {brand} {name}")
                
            except Exception as e:
                results.append({
                    "brand": brand,
                    "name": name,
                    "upc": None,
                    "error": str(e)
                })
                logger.warning(f"❌ UPC lookup failed for {brand} {name}: {e}")
        
        successful_lookups = len([r for r in results if r.get("upc")])
        logger.info(f"✅ Batch UPC lookup completed: {successful_lookups}/{len(ingredients)} successful")
        
        return jsonify({
            "results": results,
            "summary": {
                "total": len(ingredients),
                "successful": successful_lookups,
                "failed": len(ingredients) - successful_lookups
            }
        })
        
    except Exception as e:
        logger.error("❌ Exception in /api/batch-upc-lookup:\n%s", traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/api/generate-alternative-meal', methods=['POST'])
def generate_alternative_meal():

#     {
#     "user_code": "BZSJUY",
#     "id": "593fceba-6051-40ff-a37e-2147ed8cdc7c",
#     "meal_name": "Breakfast"
#   }
    data = request.get_json()
    main = data.get('main')
    alternative = data.get('alternative')
    if not main or not alternative:
        return jsonify({'error': 'Missing main or alternative meal'}), 400

    # Load user preferences as in /api/build-menu
    try:
        user_code = data.get("user_code")
        preferences = load_user_preferences(user_code)
    except Exception as e:
        return jsonify({'error': f'Failed to load user preferences: {str(e)}'}), 500

    # Get region-specific instructions
    region = preferences.get('region', 'israel').lower()
    region_instructions = {
        'israel': "Use Israeli products and brands (e.g., Tnuva, Osem, Strauss, Elite, Telma). Include local Israeli foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 250g containers, yogurt in 150g-200g containers, hummus in 400g containers, pita bread is typically 60-80g per piece, Israeli cheese slices are 20-25g each, Bamba comes in 80g bags, Bissli in 100g bags. Use realistic Israeli portion sizes.",
        'us': "Use American products and brands (e.g., Kraft, General Mills, Kellogg's, Pepsi). Include typical American foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 16oz (454g) containers, yogurt in 6-8oz (170-227g) containers, cream cheese in 8oz (227g) packages, American cheese slices are 21g each, bagels are 95-105g each.",
        'uk': "Use British products and brands (e.g., Tesco, Sainsbury's, Heinz UK, Cadbury). Include typical British foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 300g containers, yogurt in 150-170g pots, British cheese slices are 25g each, bread slices are 35-40g each.",
        'canada': "Use Canadian products and brands (e.g., Loblaws, President's Choice, Tim Hortons). Include typical Canadian foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 500g containers, yogurt in 175g containers, Canadian cheese slices are 22g each.",
        'australia': "Use Australian products and brands (e.g., Woolworths, Coles, Arnott's, Vegemite). Include typical Australian foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 250g containers, yogurt in 170g tubs, Australian cheese slices are 25g each."
    }
    region_instruction = region_instructions.get(region, region_instructions['israel'])
    
    # Compose prompt for OpenAI
    system_prompt = (
        "You are a professional HEALTHY dietitian AI. Generate a COMPLETELY DIFFERENT alternative meal that is entirely distinct from both the main meal and the existing alternative. "
        "CRITICAL REQUIREMENTS: "
        "- Create a meal with DIFFERENT main protein source, DIFFERENT cooking method, and DIFFERENT flavor profile "
        "- Use COMPLETELY DIFFERENT ingredients than both the main and existing alternative "
        "- The new meal MUST match the main meal's macros within ±5% tolerance (calories, protein, fat, carbs) "
        f"REGION-SPECIFIC REQUIREMENTS: {region_instruction} "
        "**CRITICAL HEALTHY DIETITIAN RULES:** "
        "• You are a HEALTHY dietitian - prioritize nutritious, whole foods over processed snacks "
        "• NEVER suggest unhealthy processed snacks (like BISLI, Bamba, chips, candy, cookies, etc.) unless the user EXPLICITLY requests them in their preferences "
        "• For snacks, always suggest healthy options like: fruits, vegetables, nuts, yogurt, cottage cheese, hummus, whole grain crackers, etc. "
        "• Only include unhealthy snacks if the user specifically mentions 'likes BISLI', 'loves chips', 'wants candy' etc. in their client_preferences "
        "• Even then, limit unhealthy snacks to maximum 1-2 times per week, not daily "
        "• Focus on balanced nutrition with whole foods, lean proteins, complex carbohydrates, and healthy fats "
        "**CRITICAL: ALWAYS GENERATE ALL CONTENT IN ENGLISH ONLY.** "
        "- All meal names, ingredient names, and descriptions must be in English "
        "- Do not use Hebrew, Arabic, or any other language "
        "- Use English names for all foods, brands, and cooking terms "
        "DIETARY RESTRICTIONS: "
        f"- STRICTLY AVOID all foods in user allergies: {', '.join(preferences.get('allergies', []))} "
        f"- STRICTLY FOLLOW all dietary limitations: {', '.join(preferences.get('limitations', []))} "
        "- If user has 'kosher' limitation, NEVER mix meat with dairy in the same meal "
        "- Use only kosher-certified ingredients and brands if kosher is required "
        "HUMAN-LIKE MEAL REQUIREMENTS: "
        "- Generate SIMPLE, REALISTIC meals that people actually eat daily "
        "- Use common, familiar ingredients and combinations "
        "- Avoid overly complex recipes or unusual ingredient combinations "
        "- Focus on comfort foods, simple sandwiches, basic salads, easy-to-make dishes "
        "- Examples of good meals: grilled chicken with rice, tuna sandwich, yogurt with fruit, simple pasta dishes "
        "- Examples to AVOID: complex multi-ingredient recipes, unusual spice combinations, overly fancy preparations "
        "- Keep ingredients list short (3-6 ingredients max) "
        "- Use realistic portion sizes that match the region's packaging standards "
        "VARIETY REQUIREMENTS: "
        "- Use a DIFFERENT main protein source than both existing meals "
        "- Use a DIFFERENT cooking method (if main is grilled, use baked/steamed/fried) "
        "- Use a DIFFERENT flavor profile (if main is Mediterranean, use Asian/Mexican/Italian) "
        "- Include DIFFERENT vegetables and grains than existing meals "
        "IMPORTANT: For any brand names in ingredients, you MUST use real, specific brand names based on the user's region. "
        "NEVER use 'Generic' or 'generic' as a brand name. Always specify actual commercial brands available in the user's region. "
        "Return ONLY the new alternative meal as valid JSON with: meal_title, ingredients (list of {item, brand of pruduct, household_measure, calories, protein, fat, carbs}), and nutrition (sum of ingredients)."
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
            # Clean ingredient names in the generated alternative meal
            cleaned_alternative = clean_ingredient_names({"alternative": parsed}).get("alternative", parsed)
            # Enrich with UPC codes
            enriched = enrich_alternative_with_upc(cleaned_alternative, user_code, region)
            return jsonify(enriched)
        except Exception:
            logger.error(f"❌ JSON parse error for new alternative meal:\n{raw}")
            return jsonify({"error": "Invalid JSON from OpenAI", "raw": raw}), 500
    except Exception as e:
        logger.error(f"Error generating alternative meal: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Helper function to enrich a single alternative meal with UPC codes
def enrich_alternative_with_upc(alternative, user_code, region):
    # This function mimics the logic in enrich_menu_with_upc but for a single alternative dict
    import requests
    block = alternative.copy()
    enriched_ingredients = []
    access_token = get_azure_access_token()
    headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
    for ing in block.get("ingredients", []):
        enriched_ing = ing.copy()
        brand = enriched_ing.get("brand of pruduct", "")
        name = enriched_ing.get("item", "")
        try:
            logger.info(f"[UPC] Looking up for brand='{brand}', name='{name}', region='{region}'")
            endpoint_type, params, is_israeli = prepare_upc_lookup_params(brand, name, region)
            if not endpoint_type:
                enriched_ing["UPC"] = None
                logger.info(f"[UPC] No valid parameters for lookup: brand='{brand}', name='{name}'")
            else:
                if endpoint_type == "hebrew":
                    url = "https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-upc-hebrew"
                    print("Tenant ID:", os.getenv("AZURE_TENANT_ID"))
                    print("Client ID:", os.getenv("AZURE_CLIENT_ID"))
                    print("Client Secret:", os.getenv("AZURE_CLIENT_SECRET"))
                else:
                    url = "https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-upc"
                logger.info(f"[UPC] Sending request to {url} with params={params}")
                if not access_token:
                    logger.warning("[UPC] No Azure access token available, skipping UPC lookup.")
                    enriched_ing["UPC"] = None
                else:
                    resp = requests.get(url, params=params, headers=headers, timeout=30)
                    logger.info(f"[UPC] HTTP {resp.status_code} — URL: {resp.url}")
                    logger.info(f"[UPC] Response body: {resp.text}")
                    resp.raise_for_status()
                    upc_data = resp.json()
                    enriched_ing["UPC"] = upc_data.get("upc")
                    logger.info(f"[UPC] Parsed UPC: {enriched_ing['UPC']!r}")
        except Exception as e:
            enriched_ing["UPC"] = None
            logger.warning(f"[UPC] UPC lookup failed for {brand!r} {name!r}: {e}")
        enriched_ingredients.append(enriched_ing)
    block["ingredients"] = enriched_ingredients
    logger.info(f"[UPC] Final enriched ingredients: {enriched_ingredients}")
    return block


def clean_ingredient_names(menu):
    """
    Remove brand names from ingredient item names if the brand appears in the item name.
    
    Args:
        menu: List of meals or complete menu structure
        
    Returns:
        Cleaned menu with brand names removed from item names
    """
    def clean_ingredient(ingredient):
        """Clean a single ingredient by removing brand name from item name"""
        if not isinstance(ingredient, dict):
            return ingredient
            
        item = ingredient.get("item", "")
        brand = ingredient.get("brand of pruduct", "")  # Note: keeping the typo as it matches the existing code
        
        if not item or not brand:
            return ingredient
            
        # Create a copy to avoid modifying the original
        cleaned_ingredient = ingredient.copy()
        
        # Case-insensitive brand removal
        item_lower = item.lower().strip()
        brand_lower = brand.lower().strip()
        
        if brand_lower in item_lower:
            # Remove brand name from item, handling various positions
            # Try different patterns: "Brand Item", "Item Brand", "Brand - Item", etc.
            patterns_to_try = [
                f"{brand_lower} ",      # "Brand Item"
                f" {brand_lower}",      # "Item Brand" 
                f"{brand_lower}-",      # "Brand-Item"
                f"-{brand_lower}",      # "Item-Brand"
                f"{brand_lower} - ",    # "Brand - Item"
                f" - {brand_lower}",    # "Item - Brand"
                brand_lower             # Just the brand name itself
            ]
            
            cleaned_item = item
            for pattern in patterns_to_try:
                if pattern in item_lower:
                    # Find the actual case-preserved version to remove
                    start_idx = item_lower.find(pattern)
                    if start_idx != -1:
                        # Remove the pattern and clean up extra spaces/dashes
                        cleaned_item = item[:start_idx] + item[start_idx + len(pattern):]
                        cleaned_item = cleaned_item.strip().strip('-').strip()
                        break
            
            # If we removed something, update the item name
            if cleaned_item and cleaned_item != item:
                cleaned_ingredient["item"] = cleaned_item
                logger.info(f"🧹 Cleaned ingredient: '{item}' -> '{cleaned_item}' (removed brand: {brand})")

                    # 2) Remove any parenthesized content, e.g. "(tnuva) hummus" → "hummus"
            #    \([^)]*\)  matches a '(' plus any non-')' chars up to ')'
            #    Surrounding \s* eats any extra whitespace left behind
            cleaned_item = re.sub(r'\s*\([^)]*\)\s*', ' ', cleaned_item).strip()

            # Update only if it actually changed
            if cleaned_item and cleaned_item != cleaned_ingredient.get("item"):
                cleaned_ingredient["item"] = cleaned_item
                logger.info(f"🧹 Stripped parentheses: '{item}' -> '{cleaned_item}'")
        
        return cleaned_ingredient
    
    def clean_meal_section(section):
        """Clean all ingredients in a meal section (main/alternative)"""
        if not isinstance(section, dict):
            return section
            
        cleaned_section = section.copy()
        ingredients = section.get("ingredients", [])
        
        if ingredients:
            cleaned_ingredients = [clean_ingredient(ing) for ing in ingredients]
            cleaned_section["ingredients"] = cleaned_ingredients
            
        return cleaned_section
    
    def clean_meal(meal):
        """Clean all sections of a meal"""
        if not isinstance(meal, dict):
            return meal
            
        cleaned_meal = meal.copy()
        
        # Clean main and alternative options
        for section_key in ["main", "alternative"]:
            if section_key in meal:
                cleaned_meal[section_key] = clean_meal_section(meal[section_key])
        
        # Clean alternatives array if it exists
        if "alternatives" in meal and isinstance(meal["alternatives"], list):
            cleaned_alternatives = [clean_meal_section(alt) for alt in meal["alternatives"]]
            cleaned_meal["alternatives"] = cleaned_alternatives
            
        return cleaned_meal
    
    # Handle different menu structures
    if isinstance(menu, list):
        # Direct list of meals
        return [clean_meal(meal) for meal in menu]
    elif isinstance(menu, dict) and "meals" in menu:
        # Complete menu structure with meals key
        cleaned_menu = menu.copy()
        cleaned_menu["meals"] = [clean_meal(meal) for meal in menu["meals"]]
        return cleaned_menu
    elif isinstance(menu, dict) and "menu" in menu:
        # Nested menu structure
        cleaned_menu = menu.copy()
        if isinstance(menu["menu"], list):
            cleaned_menu["menu"] = [clean_meal(meal) for meal in menu["menu"]]
        elif isinstance(menu["menu"], dict) and "meals" in menu["menu"]:
            cleaned_menu["menu"] = menu["menu"].copy()
            cleaned_menu["menu"]["meals"] = [clean_meal(meal) for meal in menu["menu"]["meals"]]
        return cleaned_menu
    else:
        # Return as-is if structure is not recognized
        return menu

@app.route('/api/generate-alternative-meal-by-id', methods=['POST'])
def generate_alternative_meal_by_id():
    data = request.get_json()
    user_code = data.get('user_code')
    plan_id = data.get('id')
    meal_name = data.get('meal_name')

    if not user_code or not plan_id or not meal_name:
        return jsonify({'error': 'Missing user_code, id, or meal_name'}), 400

    # Fetch meal plan from Supabase
    try:
        response = supabase.table('meal_plans_and_schemas').select('meal_plan').eq('id', plan_id).single().execute()
        if not response.data:
            return jsonify({'error': f'Meal plan with id {plan_id} not found'}), 404
        meal_plan = response.data['meal_plan']
        if isinstance(meal_plan, str):
            meal_plan = json.loads(meal_plan)
    except Exception as e:
        logger.error(f"Error fetching meal plan: {e}")
        return jsonify({'error': f'Failed to fetch meal plan: {str(e)}'}), 500

    # Find the meal by name
    meals = meal_plan.get('meals', [])
    meal = next((m for m in meals if m.get('meal') == meal_name), None)
    if not meal:
        return jsonify({'error': f'Meal with name {meal_name} not found in plan'}), 404

    main = meal.get('main')
    alternative = meal.get('alternative')
    if not main or not alternative:
        return jsonify({'error': 'Meal is missing main or alternative option'}), 400

    # Load user preferences
    try:
        preferences = load_user_preferences(user_code)
    except Exception as e:
        return jsonify({'error': f'Failed to load user preferences: {str(e)}'}), 500

    # Get region-specific instructions (reuse from /api/generate-alternative-meal)
    region = preferences.get('region', 'israel').lower()
    region_instructions = {
        'israel': "Use Israeli products and brands (e.g., Tnuva, Osem, Strauss, Elite, Telma). Include local Israeli foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 250g containers, yogurt in 150g-200g containers, hummus in 400g containers, pita bread is typically 60-80g per piece, Israeli cheese slices are 20-25g each, Bamba comes in 80g bags, Bissli in 100g bags. Use realistic Israeli portion sizes.",
        'us': "Use American products and brands (e.g., Kraft, General Mills, Kellogg's, Pepsi). Include typical American foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 16oz (454g) containers, yogurt in 6-8oz (170-227g) containers, cream cheese in 8oz (227g) packages, American cheese slices are 21g each, bagels are 95-105g each.",
        'uk': "Use British products and brands (e.g., Tesco, Sainsbury's, Heinz UK, Cadbury). Include typical British foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 300g containers, yogurt in 150-170g pots, British cheese slices are 25g each, bread slices are 35-40g each.",
        'canada': "Use Canadian products and brands (e.g., Loblaws, President's Choice, Tim Hortons). Include typical Canadian foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 500g containers, yogurt in 175g containers, Canadian cheese slices are 22g each.",
        'australia': "Use Australian products and brands (e.g., Woolworths, Coles, Arnott's, Vegemite). Include typical Australian foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 250g containers, yogurt in 170g tubs, Australian cheese slices are 25g each."
    }
    region_instruction = region_instructions.get(region, region_instructions['israel'])

    # Compose prompt for OpenAI (reuse from /api/generate-alternative-meal)
    system_prompt = (
        "You are a professional HEALTHY dietitian AI. Generate a COMPLETELY DIFFERENT alternative meal that is entirely distinct from both the main meal and the existing alternative. "
        "CRITICAL REQUIREMENTS: "
        "- Create a meal with DIFFERENT main protein source, DIFFERENT cooking method, and DIFFERENT flavor profile "
        "- Use COMPLETELY DIFFERENT ingredients than both the main and existing alternative "
        "- The new meal MUST match the main meal's macros within ±5% tolerance (calories, protein, fat, carbs) "
        f"REGION-SPECIFIC REQUIREMENTS: {region_instruction} "
        "**CRITICAL HEALTHY DIETITIAN RULES:** "
        "• You are a HEALTHY dietitian - prioritize nutritious, whole foods over processed snacks "
        "• NEVER suggest unhealthy processed snacks (like BISLI, Bamba, chips, candy, cookies, etc.) unless the user EXPLICITLY requests them in their preferences "
        "• For snacks, always suggest healthy options like: fruits, vegetables, nuts, yogurt, cottage cheese, hummus, whole grain crackers, etc. "
        "• Only include unhealthy snacks if the user specifically mentions 'likes BISLI', 'loves chips', 'wants candy' etc. in their client_preferences "
        "• Even then, limit unhealthy snacks to maximum 1-2 times per week, not daily "
        "• Focus on balanced nutrition with whole foods, lean proteins, complex carbohydrates, and healthy fats "
        "**CRITICAL: ALWAYS GENERATE ALL CONTENT IN ENGLISH ONLY.** "
        "- All meal names, ingredient names, and descriptions must be in English "
        "- Do not use Hebrew, Arabic, or any other language "
        "- Use English names for all foods, brands, and cooking terms "
        "DIETARY RESTRICTIONS: "
        f"- STRICTLY AVOID all foods in user allergies: {', '.join(preferences.get('allergies', []))} "
        f"- STRICTLY FOLLOW all dietary limitations: {', '.join(preferences.get('limitations', []))} "
        "- If user has 'kosher' limitation, NEVER mix meat with dairy in the same meal "
        "- Use only kosher-certified ingredients and brands if kosher is required "
        "HUMAN-LIKE MEAL REQUIREMENTS: "
        "- Generate SIMPLE, REALISTIC meals that people actually eat daily "
        "- Use common, familiar ingredients and combinations "
        "- Avoid overly complex recipes or unusual ingredient combinations "
        "- Focus on comfort foods, simple sandwiches, basic salads, easy-to-make dishes "
        "- Examples of good meals: grilled chicken with rice, tuna sandwich, yogurt with fruit, simple pasta dishes "
        "- Examples to AVOID: complex multi-ingredient recipes, unusual spice combinations, overly fancy preparations "
        "- Keep ingredients list short (3-6 ingredients max) "
        "- Use realistic portion sizes that match the region's packaging standards "
        "VARIETY REQUIREMENTS: "
        "- Use a DIFFERENT main protein source than both existing meals "
        "- Use a DIFFERENT cooking method (if main is grilled, use baked/steamed/fried) "
        "- Use a DIFFERENT flavor profile (if main is Mediterranean, use Asian/Mexican/Italian) "
        "- Include DIFFERENT vegetables and grains than existing meals "
        "IMPORTANT: For any brand names in ingredients, you MUST use real, specific brand names based on the user's region. "
        "NEVER use 'Generic' or 'generic' as a brand name. Always specify actual commercial brands available in the user's region. "
        "Return ONLY the new alternative meal as valid JSON with: meal_title, ingredients (list of {item, brand of pruduct, household_measure, calories, protein, fat, carbs}), and nutrition (sum of ingredients)."
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
            # Clean ingredient names in the generated alternative meal
            cleaned_alternative = clean_ingredient_names({"alternative": parsed}).get("alternative", parsed)
            # Enrich with UPC codes
            enriched = enrich_alternative_with_upc(cleaned_alternative, user_code, region)
            return jsonify(enriched)
        except Exception:
            logger.error(f"❌ JSON parse error for new alternative meal:\n{raw}")
            return jsonify({"error": "Invalid JSON from OpenAI", "raw": raw}), 500
    except Exception as e:
        logger.error(f"Error generating alternative meal: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_azure_access_token():
    import requests
    tenant_id = os.getenv("AZURE_TENANT_ID")
    client_id = os.getenv("AZURE_CLIENT_ID")
    client_secret = os.getenv("AZURE_CLIENT_SECRET")
    scope = os.getenv("AZURE_UPC_SCOPE", "api://sqlservice/.default")
    if not all([tenant_id, client_id, client_secret, scope]):
        logger.error("Azure AD credentials are not set in environment variables.")
        return None
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": scope
    }
    try:
        token_resp = requests.post(token_url, data=token_data)
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")
        if not access_token:
            logger.error(f"Failed to obtain Azure access token: {token_resp.text}")
        return access_token
    except Exception as e:
        logger.error(f"Error requesting Azure access token: {e}")
        return None

@app.route("/api/analyze-eating-habits", methods=["POST"])
def api_analyze_eating_habits():
    try:
        data = request.get_json()
        user_code = data.get("user_code")
        
        if not user_code:
            return jsonify({"error": "user_code is required"}), 400
            
        logger.info(f"🔍 Analyzing eating habits for user_code: {user_code}")
        
        # Get food logs for the user
        food_logs = []
        try:
            # First get the user_id from chat_users table
            user_response = supabase.table('chat_users').select('id').eq('user_code', user_code).single().execute()
            if user_response.data:
                user_id = user_response.data['id']
                
                # Get food logs by user_id
                logs_response = supabase.table('food_logs').select('*').eq('user_id', user_id).order('log_date', desc=True).execute()
                food_logs = logs_response.data or []
                
        except Exception as e:
            logger.error(f"Error fetching food logs: {e}")
            return jsonify({"error": "Failed to fetch food logs"}), 500
        
        if not food_logs:
            return jsonify({"error": "No food logs found for this user"}), 404
            
        # Analyze eating habits
        meal_categories = {
            'breakfast': [],
            'lunch': [],
            'dinner': [],
            'snack': [],
            'morning snack': [],
            'afternoon snack': [],
            'evening snack': [],
            'other': []
        }
        
        # Process each food log
        for log in food_logs:
            meal_label = log.get('meal_label', '').lower()
            food_items = log.get('food_items', [])
            
            # Determine meal category
            category = 'other'
            if 'breakfast' in meal_label:
                category = 'breakfast'
            elif 'lunch' in meal_label:
                category = 'lunch'
            elif 'dinner' in meal_label:
                category = 'dinner'
            elif 'snack' in meal_label:
                if 'morning' in meal_label:
                    category = 'morning snack'
                elif 'afternoon' in meal_label:
                    category = 'afternoon snack'
                elif 'evening' in meal_label:
                    category = 'evening snack'
                else:
                    category = 'snack'
            
            # Extract food items
            if isinstance(food_items, list):
                for item in food_items:
                    if isinstance(item, dict) and item.get('name'):
                        meal_categories[category].append(item['name'].lower().strip())
            elif isinstance(food_items, dict) and food_items.get('name'):
                meal_categories[category].append(food_items['name'].lower().strip())
        
        # Get top 3 most frequent foods for each meal category
        top_foods_by_meal = {}
        for category, foods in meal_categories.items():
            if foods:
                # Count frequency
                food_counts = {}
                for food in foods:
                    food_counts[food] = food_counts.get(food, 0) + 1
                
                # Get top 3
                sorted_foods = sorted(food_counts.items(), key=lambda x: x[1], reverse=True)
                top_foods_by_meal[category] = sorted_foods[:3]
        
        # Create system prompt for LLM
        # Create a simple summary of food habits
        food_habits_summary = []
        for category, top_foods in top_foods_by_meal.items():
            if top_foods:
                foods_list = [f"{food} ({count} times)" for food, count in top_foods]
                food_habits_summary.append(f"{category}: {', '.join(foods_list)}")
        
        habits_text = "; ".join(food_habits_summary) if food_habits_summary else "No specific patterns found"
        
        system_prompt = f"""You are a professional dietitian analyst. Based on the client's food habits, create a comprehensive structured prompt for menu generation.

**CLIENT FOOD HABITS DATA:**
{habits_text}

**TASK:**
Create a detailed, structured prompt that another AI can use to generate personalized menus. Include the following sections:

**EATING HABITS ANALYSIS:**
[Analyze their current eating patterns, meal timing, food preferences, and nutritional habits in 2-3 sentences]

**NUTRITIONAL STRENGTHS:**
[Identify 2-3 positive aspects of their current diet in bullet points]

**AREAS FOR IMPROVEMENT:**
[Identify 2-3 specific areas where their diet could be enhanced in bullet points]

**RECOMMENDED FOODS TO INCLUDE:**
[Suggest 5-8 specific foods they should eat more of based on their current habits and nutritional needs]

**FOODS TO REDUCE OR REPLACE:**
[Suggest 3-5 foods they should eat less of or healthier alternatives]

**MEAL TIMING RECOMMENDATIONS:**
[Provide specific advice about when and how often they should eat]

**PERSONALIZED MENU GUIDELINES:**
[Give specific instructions for menu generation, such as preferred cooking methods, portion sizes, meal structure, etc.]

**IMPORTANT GUIDELINES:**
- Be specific and actionable
- Focus on practical, realistic recommendations
- Consider their current food preferences and habits
- Provide clear instructions for menu generation
- Keep the tone professional but encouraging
- Make recommendations that can be easily implemented in daily meal planning

Write this as a comprehensive, structured prompt that can be directly used as input for menu generation AI."""

        # Call Azure OpenAI to generate the analysis
        try:
            logger.info("🧠 Sending eating habits analysis to OpenAI")
            
            response = openai.ChatCompletion.create(
                deployment_id=deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Please analyze my eating habits and create a comprehensive menu generation prompt."}
                ],
                temperature=0.7,
                max_tokens=2500
            )
            
            analysis_text = response.choices[0].message.content
            logger.info("✅ Generated eating habits analysis successfully")
            
            return jsonify({
                "analysis": analysis_text,
                "analysis_data": {
                    "total_logs": len(food_logs),
                    "top_foods_by_meal": top_foods_by_meal,
                    "unique_foods_count": len(set([food for foods in meal_categories.values() for food in foods]))
                }
            })
            
        except Exception as e:
            logger.error(f"Error calling OpenAI for eating habits analysis: {e}")
            return jsonify({"error": "Failed to generate analysis"}), 500
        
    except Exception as e:
        logger.error(f"Error analyzing eating habits: {e}")
        return jsonify({"error": "Failed to analyze eating habits"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)