from flask import Flask, jsonify, request

from flask_cors import CORS

from openai import AzureOpenAI

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

    """

    Translate menu text while preserving nutritional values and measurements.

    

    This endpoint translates ingredient names and household measures but preserves

    the original nutritional values (calories, protein, fat, carbs) and gram amounts

    to prevent values from changing during translation.

    """

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

    # 4. Restore placeholders with Hebrew terms and preserve nutritional values

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



    # 5. Preserve original nutritional values and gram amounts after translation

    # This prevents nutritional values from changing during translation

    if menu.get("meals"):

        for mi, meal in enumerate(menu.get("meals", [])):

            original_meal = menu["meals"][mi]

            translated_meal = new_menu["meals"][mi]

            

            # Preserve values for main and alternative options

            for optKey in ("main", "alternative"):

                if optKey in original_meal and optKey in translated_meal:

                    original_opt = original_meal[optKey]

                    translated_opt = translated_meal[optKey]

                    

                    if "ingredients" in original_opt and "ingredients" in translated_opt:

                        for ii, original_ing in enumerate(original_opt["ingredients"]):

                            if ii < len(translated_opt["ingredients"]):

                                translated_ing = translated_opt["ingredients"][ii]

                                

                                # Preserve nutritional values and gram amounts

                                nutritional_fields = ["calories", "protein", "fat", "carbs", "portionSI(gram)"]

                                for field in nutritional_fields:

                                    if field in original_ing:

                                        translated_ing[field] = original_ing[field]

                                

                                # Preserve other important fields that shouldn't change

                                preserve_fields = ["brand of pruduct", "UPC"]

                                for field in preserve_fields:

                                    if field in original_ing:

                                        translated_ing[field] = original_ing[field]

            

            # Preserve values for alternatives array if it exists

            if "alternatives" in original_meal and "alternatives" in translated_meal:

                for ai, original_alt in enumerate(original_meal["alternatives"]):

                    if ai < len(translated_meal["alternatives"]):

                        translated_alt = translated_meal["alternatives"][ai]

                        

                        if "ingredients" in original_alt and "ingredients" in translated_alt:

                            for ii, original_ing in enumerate(original_alt["ingredients"]):

                                if ii < len(translated_alt["ingredients"]):

                                    translated_ing = translated_alt["ingredients"][ii]

                                    

                                    # Preserve nutritional values and gram amounts

                                    nutritional_fields = ["calories", "protein", "fat", "carbs", "portionSI(gram)"]

                                    for field in nutritional_fields:

                                        if field in original_ing:

                                            translated_ing[field] = original_ing[field]

                                    

                                    # Preserve other important fields

                                    preserve_fields = ["brand of pruduct", "UPC"]

                                    for field in preserve_fields:

                                        if field in original_ing:

                                            translated_ing[field] = original_ing[field]



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

        selected_fields = 'user_code,food_allergies,daily_target_total_calories,recommendations,food_limitations,goal,number_of_meals,client_preference,macros,region,meal_plan_structure'

        

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

        calories_per_day = user_data.get("daily_target_total_calories")

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



        # Parse recommendations - handle both string and array formats
        recommendations = parse_array_field(user_data.get("recommendations", []))

        preferences = {

            "calories_per_day": calories_per_day,

            "macros": macros,

            "allergies": allergies,

            "limitations": limitations,

            "diet_type": "personalized",

            "meal_count": meal_count,

            "client_preference": client_preference,

            "region": user_data.get("region", "israel"),  # Default to israel if not specified

            "meal_plan_structure": meal_plan_structure,

            "recommendations": recommendations

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

client = AzureOpenAI(

    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"),

    azure_endpoint=os.getenv("AZURE_OPENAI_API_BASE"),

    api_key=os.getenv("AZURE_OPENAI_API_KEY"),

)



deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "obi2")



def require_api_key(f):

    @wraps(f)

    def decorated_function(*args, **kwargs):

        if not os.getenv("AZURE_OPENAI_API_KEY"):

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

**CRITICAL: ALL OUTPUT MUST BE IN ENGLISH ONLY**
• All meal names MUST be in English (e.g., "Breakfast", "Lunch", "Dinner", "Morning Snack")
• All dish names MUST be in English (e.g., "Scrambled Eggs with Toast", "Grilled Chicken Salad")
• All protein sources MUST be in English (e.g., "eggs", "chicken", "yogurt", "salmon")
• NEVER use Hebrew, Arabic, or any other language
• Even for regional foods, use English names (e.g., "Pita Bread" not "פיתה", "Hummus" not "חומוס")

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
**DO NOT CHANGE THE DAILY CALORIES, PROTEIN, AND FAT**

• Use the supplied *meal_structure* to distribute calories, protein, and fat.

  For each meal *i*:


    1. protein_i = daily_protein × (calories_pct_i ÷ 100)

    2. fat_i = daily_fat × (calories_pct_i ÷ 100)

    3. Round to the nearest whole number



──────────────────  MAIN vs ALTERNATIVE MEALS  ───────────────────────

Alternative meal rule:Each alternative must differ from its main meal in all of the following:(1) protein source (2) carb base (3) cooking method (4) flavour profile.Never repeat the same core ingredient in both options.



──────────────────────────  PREFERENCE LOGIC  ─────────────────────────

• Omit anything in food_allergies or "dislikes …" items.• Feature every "likes / loves …" item exactly once across the day.• Do not repeat the same primary ingredient across meals.



────────────────────  ADDITIONAL GENERATION RULES  ───────────────────

• For every meal output two options (main & alternative) using everyday ingredients that respect restrictions, allergies, and preferences.

• Focus on practical, realistic meal options with clear main protein sources.



──────────────────────────  RESPONSE FORMAT  ──────────────────────────

Return valid JSON only – no Markdown fences, no commentary.
**REMEMBER: ALL text fields (meal, name, main_protein_source) MUST be in ENGLISH only.**

Schema:



{{

"template": [

{{

"meal": "<English meal name>",

"main": {{

"name": "<English dish name>",

"calories": <number>,

"protein": <number>,

"fat": <number>,

"main_protein_source": "<English protein name>"

}},

"alternative": {{

"name": "<English dish name>",

"calories": <number>,

"protein": <number>,

"fat": <number>,

"main_protein_source": "<English protein name>"

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



            response = client.chat.completions.create(

                model=deployment,

                messages=[{"role": "system", "content": system_prompt}, user_prompt],

                temperature=0.1

            )



            result = response.choices[0].message.content

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

critical: you must out the ingredients true macros and calories, make sure you read the data and not guess.

#    *PRIMARY SUCCESS CRITERIA:*

**Calories and protein from the *template* are **top priority**.**  

**YOU MUST HIT THE MACRO TARGETS WITH 0 % TOLERANCE.**  

**IF YOU MUST make tiny trade-offs, adjust carbs and fat *before* calories or protein.**  

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

• CRITICAL: Cross-check every ingredient's macro values against reliable nutrition databases to ensure accuracy.



VARIETY / DIFFERENTIATION

• Avoid these protein sources: {avoid_proteins}.

• Avoid these core ingredients (substring match): {avoid_ingredients}.

• For ALTERNATIVE, it must differ from MAIN in protein source, carb base, cooking method, and flavour profile.



PREVIOUS ISSUES TO AVOID

{previous_issues_section}



CURRENT VALIDATION FEEDBACK

{validation_feedback_section}



VALIDATION

• No narrative text. Return only the JSON object described above.

• Do not add keys not listed in the schema.

• cross-check every ingredient's macros against its nutrition database - ensure all Macros & Caloriesvalues are accurate.

    

• If you see a previous meal attempt above, analyze what went wrong and fix those specific issues.

• Pay special attention to macro calculations, ingredient accuracy, and dietary restrictions.

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



def _calculate_nutrition_from_ingredients(meal_data):

    """

    Calculate nutrition totals from ingredients and add them to the meal data.

    This ensures perfect accuracy since we calculate it ourselves.

    """

    if not meal_data or "ingredients" not in meal_data:

        return meal_data

    

    # Calculate totals from ingredients

    nutrition = {"calories": 0, "protein": 0, "fat": 0, "carbs": 0}

    

    for ingredient in meal_data.get("ingredients", []):

        nutrition["calories"] += float(ingredient.get("calories", 0))

        nutrition["protein"] += float(ingredient.get("protein", 0))

        nutrition["fat"] += float(ingredient.get("fat", 0))

        nutrition["carbs"] += float(ingredient.get("carbs", 0))

    

    # Round to 1 decimal place for consistency

    for macro in nutrition:

        nutrition[macro] = round(nutrition[macro], 1)

    

    # Add nutrition to meal data

    meal_data["nutrition"] = nutrition

    

    return meal_data



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

    previous_issues = []  # Track issues across attempts

    validation_feedback = ""  # Current validation feedback



    for i in range(max_attempts):

        logger.info(f"🧠 Building {option_type} for '{meal_name}', attempt {i+1}")



        # On first attempt: send full prompt
        # On retry attempts: send focused correction prompt
        if i == 0:
            # FIRST ATTEMPT: Full detailed prompt
            previous_issues_section = "No previous issues to avoid (first attempt)."
            validation_feedback_section = "No current validation issues (first attempt or previous attempt passed validation)."

            prompt = MEAL_BUILDER_PROMPT.format(

                option_type=option_type,

                region_instruction=region_instruction,

                macro_targets=macro_targets,

                required_protein_source=required_protein_source,

                avoid_proteins=avoid_proteins,

                avoid_ingredients=avoid_ingredients,

                previous_issues_section=previous_issues_section,

                validation_feedback_section=validation_feedback_section

            )

            user_payload = {

                "meal_name": meal_name,

                "preferences": preferences

            }
            
        else:
            # RETRY ATTEMPTS: Focused correction prompt
            prompt = f"""

**MEAL CORRECTION REQUIRED**

Your previous meal attempt failed validation. Review the failed meal and issues below, then return a corrected version.

**CORRECTION INSTRUCTIONS:**

* Read the validation issues carefully - they tell you EXACTLY what's wrong *
* Adjust ingredient portions to hit the exact macro targets *
* Fix any dietary restriction violations (kosher, allergies, etc.) *
* Ensure all text fields are in ENGLISH only *
* Use real brand names (not "generic") *
* Keep the same JSON structure*
* Return ONLY the corrected JSON meal (no markdown, no explanations) *


**IMPORTANT REMINDERS:**

* You MUST hit macro targets exactly (calories, protein, fat, carbs) * 
* Target macros: {macro_targets} *
* Maximum 7 ingredients per meal *
* Required protein source: {required_protein_source} *
* Avoid these proteins: {avoid_proteins} *
* Avoid these ingredients: {avoid_ingredients} *
* Regional brands: {region_instruction} *


**EXPECTED OUTPUT FORMAT:**

{{{{

  "meal_name": "{meal_name}",

  "meal_title": "<dish name in English>",

  "ingredients": [

    {{{{

      "item": "<ingredient name in English>",

      "portionSI(gram)": <number>,

      "household_measure": "<realistic measure in English>",

      "calories": <int>,

      "protein": <int>,

      "fat": <int>,

      "carbs": <int>,

      "brand of pruduct": "<real brand name in English>"

    }}}}

  ]

}}}}

"""

            user_payload = validation_feedback  # String with failed meal + issues



        # Construct user message based on attempt type
        if i == 0:
            user_message_content = json.dumps(user_payload, ensure_ascii=False)
        else:
            user_message_content = user_payload  # Already a formatted string

        response = client.chat.completions.create(

            model=deployment,

            messages=[

                {"role": "system", "content": prompt},

                {"role": "user", "content": user_message_content}

            ],

            temperature=0.1

        )

        raw = _strip_markdown_fences(response.choices[0].message.content)



        try:

            candidate = json.loads(raw)

        except Exception as e:

            error_msg = f"JSON parse error: {e}"

            logger.warning(f"❌ {error_msg} for {option_type} '{meal_name}'")

            previous_issues.append(error_msg)

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

            # Automatically calculate and add nutrition totals from ingredients

            candidate = _calculate_nutrition_from_ingredients(candidate)

            return candidate

        else:

            # Collect validation issues for next attempt

            issues = val.get("issues", [])

            failed_meal = val.get("meal_data", {})

            logger.warning(f"❌ {option_type} for '{meal_name}' failed validation. Meal: {json.dumps(failed_meal, ensure_ascii=False)}, Issues: {issues}")

            

            # Add issues to running list

            previous_issues.extend(issues)

            

            # Format validation feedback for next retry
            validation_feedback = f"""

**FAILED MEAL FROM PREVIOUS ATTEMPT:**

{json.dumps(failed_meal, indent=2, ensure_ascii=False) if failed_meal else "N/A"}


**ISSUES TO FIX:**

{chr(10).join([f"• {issue}" for issue in issues])}

"""



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



                # Extract macro targets from template
                calories = main_macros.get("calories")
                protein = main_macros.get("protein")
                fat = main_macros.get("fat")
                
                # Calculate carbs if not provided in template
                # Formula: Carbs = (Calories - (Protein × 4) - (Fat × 9)) ÷ 4
                carbs = main_macros.get("carbs")
                if carbs is None and calories is not None and protein is not None and fat is not None:
                    carbs = (calories - (protein * 4) - (fat * 9)) / 4
                    carbs = round(carbs)  # Round to nearest whole number
                
                main_targets = {

                    "calories": calories,

                    "protein":  protein,

                    "fat":      fat,

                    "carbs":    carbs,

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



                # Extract macro targets from template
                alt_calories = alt_macros.get("calories")
                alt_protein = alt_macros.get("protein")
                alt_fat = alt_macros.get("fat")
                
                # Calculate carbs if not provided in template
                # Formula: Carbs = (Calories - (Protein × 4) - (Fat × 9)) ÷ 4
                alt_carbs = alt_macros.get("carbs")
                if alt_carbs is None and alt_calories is not None and alt_protein is not None and alt_fat is not None:
                    alt_carbs = (alt_calories - (alt_protein * 4) - (alt_fat * 9)) / 4
                    alt_carbs = round(alt_carbs)  # Round to nearest whole number
                
                alt_targets = {

                    "calories": alt_calories,

                    "protein":  alt_protein,

                    "fat":      alt_fat,

                    "carbs":    alt_carbs,

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

        data = request.json or {}

        template = data.get("template")

        menu = data.get("menu")

        user_code = data.get("user_code")



        if not template or not menu or not isinstance(template, list) or not isinstance(menu, list):

            return jsonify({"is_valid": False, "issues": ["Missing or invalid template/menu"]}), 400



        # Load user preferences for dietary restrictions (best-effort)

        try:

            preferences = load_user_preferences(user_code) or {}

        except Exception as e:

            logger.warning(f"Could not load user preferences for validation: {e}")

            preferences = {}



        limitations = [str(x).lower() for x in preferences.get("limitations", [])]

        macros = ["calories", "protein", "fat", "carbs"]

        issues = []



        # Which option are we validating? (builder sends exactly one)

        entry_t = template[0] if template else {}

        entry_m = menu[0] if menu else {}



        def _detect_option(t, m):

            if "main" in t and "main" in m:   return "main"

            if "alternative" in t and "alternative" in m: return "alternative"

            # Graceful fallback

            return "main" if "main" in m else "alternative" if "alternative" in m else None



        option = _detect_option(entry_t, entry_m)

        if option is None:

            return jsonify({"is_valid": False, "issues": ["Could not detect option type (main/alternative)"]}), 400



        tpl = entry_t.get(option) or {}

        mn  = entry_m.get(option) or {}



        # -------- helpers ----------

        def _is_english(s: str) -> bool:

            if not isinstance(s, str):

                return False

            # Allow ASCII printable + basic punctuation; flag Hebrew/Arabic/other letters

            try:

                s.encode("ascii")

                return True

            except Exception:

                return False



        def _num(x, default=None):

            try:

                return float(x)

            except Exception:

                return default



        def _close(a, b, tol=1.0):

            a = _num(a); b = _num(b)

            if a is None or b is None:

                return False

            return abs(a - b) <= tol



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



        def _validate_kosher_ingredients(ingredients, limitations_list):

            if "kosher" not in limitations_list:

                return []

            kosher_issues = []

            meat_items = ["chicken", "beef", "lamb", "turkey", "duck", "meat", "poultry"]

            dairy_items = ["milk", "cream", "cheese", "yogurt", "butter", "dairy", "parmesan", "mozzarella", "ricotta", "cottage cheese"]

            non_kosher_items = ["pork", "bacon", "ham", "shellfish", "shrimp", "lobster", "crab", "clam", "oyster", "scallop"]



            has_meat, has_dairy = False, False

            meat_ings, dairy_ings = [], []



            for ing in ingredients or []:

                item_name = str(ing.get("item", "")).lower()



                # Non-kosher check

                for nk in non_kosher_items:

                    if nk in item_name:

                        kosher_issues.append(f"Non-kosher ingredient detected: {ing.get('item', '')}")



                # Meat/dairy check

                if any(m in item_name for m in meat_items):

                    has_meat = True

                    meat_ings.append(ing.get("item", ""))

                if any(d in item_name for d in dairy_items):

                    has_dairy = True

                    dairy_ings.append(ing.get("item", ""))



            if has_meat and has_dairy:

                kosher_issues.append(

                    f"KOSHER VIOLATION: meat + dairy in the same meal. Meat: {', '.join(meat_ings)}; Dairy: {', '.join(dairy_ings)}"

                )

            return kosher_issues



        # -------- schema checks ----------

        # Required top-level keys in candidate

        for key in ["meal_name", "meal_title", "ingredients"]:

            if key not in mn:

                issues.append(f"Missing key '{key}' in {option} object.")



        # Ingredients list shape

        ingredients = mn.get("ingredients") or []

        if not isinstance(ingredients, list) or len(ingredients) == 0:

            issues.append(f"{option.capitalize()} has no ingredients list.")

        if isinstance(ingredients, list) and len(ingredients) > 7:

            issues.append(f"{option.capitalize()} has more than 7 ingredients (limit is 7).")



        # English-only checks (meal_title, each ingredient.item/household_measure/brand)

        meal_title = mn.get("meal_title")

        if meal_title is None or not _is_english(meal_title):

            issues.append(f"{option.capitalize()} meal_title must be English-only.")



        for idx, ing in enumerate(ingredients or []):

            item = ing.get("item")

            measure = ing.get("household_measure")

            brand = ing.get("brand of pruduct")

            if not _is_english(item or ""):

                issues.append(f"{option.capitalize()} ingredient #{idx+1} 'item' must be English-only.")

            if measure is not None and not _is_english(measure):

                issues.append(f"{option.capitalize()} ingredient #{idx+1} 'household_measure' must be English-only.")

            if brand is None or not _is_english(brand):

                issues.append(f"{option.capitalize()} ingredient #{idx+1} 'brand of pruduct' must be English-only.")

            if isinstance(brand, str) and brand.strip().lower() in ("generic", "no brand", "brand"):

                issues.append(f"{option.capitalize()} ingredient #{idx+1} brand must be a real brand (not 'generic').")



            # numeric fields non-negative

            for mk in ["portionSI(gram)", "calories", "protein", "fat", "carbs"]:

                if mk in ing:

                    v = _num(ing.get(mk), default=None)

                    if v is None:

                        issues.append(f"{option.capitalize()} ingredient #{idx+1} '{mk}' must be numeric.")

                    elif v < 0:

                        issues.append(f"{option.capitalize()} ingredient #{idx+1} '{mk}' cannot be negative.")



        # Template targets presence

        for macro in macros:

            if macro not in tpl:

                issues.append(f"Template for {option} missing target '{macro}'.")



        # -------- ingredient sum validation against template targets (with margins) ----------

        sums = {m: 0.0 for m in macros}

        for ing in ingredients or []:

            for m in macros:

                sums[m] += _num(ing.get(m), 0.0)



        for m in macros:

            target = _num(tpl.get(m), default=None)

            if target is None or target == 0:

                continue

                

            # Check if ingredient sum matches template target within margin

            margin = get_allowed_margin(target)

            if abs(sums[m] - target) / target > margin:

                direction = "Reduce" if sums[m] > target else "Increase"

                issues.append(

                    f"{option.capitalize()} {m}: Sum of ingredients ({round(sums[m],1)}) doesn't match template target ({target}) "

                    f"(allowed ±{int(margin*100)}%). {direction} ingredient {m} values."

                )



        # -------- kosher checks ----------

        kosher_issues = _validate_kosher_ingredients(ingredients, limitations)

        for ki in kosher_issues:

            issues.append(f"{option.capitalize()} option: {ki}")



        is_valid = len(issues) == 0

        return jsonify({

            "is_valid": is_valid, 

            "issues": issues,

            "meal_data": mn,  # Include the actual meal JSON that was validated

            "option_type": option  # Include which option type was validated

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





ALTERNATIVE_GENERATOR_PROMPT = """You are a professional HEALTHY dietitian AI.



TASK

Generate a COMPLETELY DIFFERENT **ALTERNATIVE** meal for one given meal, using the exact macro targets provided.

Return **JSON ONLY** (no markdown, no comments).



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

  ]

}}



HARD RULES

• **ENGLISH ONLY** for all names/measures/brands.

• Prioritize whole foods; avoid ultra-processed snacks unless explicitly liked in preferences.

• Respect ALL dietary restrictions and allergies.

• If kosher: never mix meat + dairy; avoid pork/shellfish; prefer kosher-suitable brands.

• ≤ 7 ingredients; simple methods (grill, bake, steam, sauté).

• Use realistic regional pack sizes & brands:

  {region_instruction}



MACRO TARGETS

• The sum of all ingredients must match these targets within margin: {macro_targets}.

• CRITICAL: Cross-check every ingredient's macro values against reliable nutrition databases to ensure accuracy.



DIFFERENTIATION (from both the given MAIN and CURRENT ALTERNATIVE)

• **Different main protein source** (avoid: {avoid_proteins}).

• **Different carb base** and **different cooking method**.

• **Different flavour profile** (e.g., if Mediterranean, switch to Asian/Mexican/Italian).

• Avoid these core ingredients (substring match): {avoid_ingredients}.



VALIDATION

• Return only the JSON object in the schema above.

• Do not add keys not listed in the schema.

• The validator will sum all ingredient macros and check against targets with appropriate margins.

• If you see a previous meal attempt above, analyze what went wrong and fix those specific issues.

• Pay special attention to macro calculations, ingredient accuracy, and dietary restrictions.

"""



def _extract_macros(meal_obj: dict) -> dict:

    """Tolerant extractor: prefers meal['nutrition'], falls back to top-level keys."""

    if not isinstance(meal_obj, dict):

        return {}

    nutr = meal_obj.get("nutrition") or {}

    if all(k in nutr for k in ("calories", "protein", "fat", "carbs")):

        return {k: nutr.get(k) for k in ("calories", "protein", "fat", "carbs")}

    return {

        "calories": meal_obj.get("calories"),

        "protein":  meal_obj.get("protein"),

        "fat":      meal_obj.get("fat"),

        "carbs":    meal_obj.get("carbs"),

    }



def _collect_avoid_lists(main: dict, current_alt: dict):

    """Collect proteins & ingredients to avoid based on both existing options."""

    avoid_proteins = set()

    for m in (main, current_alt):

        src = m.get("main_protein_source")

        if isinstance(src, str) and src.strip():

            avoid_proteins.add(src.strip())



    def _ing_names(m):

        out = []

        for ing in (m.get("ingredients") or []):

            name = (ing.get("item") or "").strip()

            if name:

                out.append(name)

        # Also avoid words from meal_title to reduce overlap

        mt = (m.get("meal_title") or "").strip()

        if mt:

            out.append(mt)

        return out



    avoid_ingredients = set(_ing_names(main) + _ing_names(current_alt))

    return list(avoid_proteins), list(avoid_ingredients)



def _collect_avoid_lists_from_all_alternatives(main: dict, all_alternatives: list):

    """Collect proteins & ingredients to avoid based on main and ALL alternatives for better duplication avoidance."""

    avoid_proteins = set()

    

    # Add main meal

    if main:

        src = main.get("main_protein_source")

        if isinstance(src, str) and src.strip():

            avoid_proteins.add(src.strip())

    

    # Add all alternatives

    for alt in all_alternatives:

        if alt:

            src = alt.get("main_protein_source")

            if isinstance(src, str) and src.strip():

                avoid_proteins.add(src.strip())



    def _ing_names(m):

        out = []

        for ing in (m.get("ingredients") or []):

            name = (ing.get("item") or "").strip()

            if name:

                out.append(name)

        # Also avoid words from meal_title to reduce overlap

        mt = (m.get("meal_title") or "").strip()

        if mt:

            out.append(mt)

        return out



    avoid_ingredients = set()

    

    # Add main meal ingredients

    if main:

        avoid_ingredients.update(_ing_names(main))

    

    # Add all alternatives ingredients

    for alt in all_alternatives:

        if alt:

            avoid_ingredients.update(_ing_names(alt))

    

    return list(avoid_proteins), list(avoid_ingredients)



@app.route('/api/generate-alternative-meal', methods=['POST'])

def generate_alternative_meal():

    max_attempts = 4

    previous_issues = []  # Track issues across attempts

    validation_feedback = ""  # Current validation feedback

    previous_candidate = None  # Store the failed meal for retry attempts



    data = request.get_json() or {}

    main = data.get('main')

    current_alt = data.get('alternative')  # existing alternative

    all_alternatives = data.get('allAlternatives', [])  # all existing alternatives

    user_code = data.get("user_code")



    if not main or not current_alt:

        return jsonify({'error': 'Missing main or alternative meal'}), 400

    if not user_code:

        return jsonify({'error': 'Missing user_code'}), 500



    # Load preferences & region

    try:

        preferences = load_user_preferences(user_code) or {}

    except Exception as e:

        return jsonify({'error': f'Failed to load user preferences: {str(e)}'}), 500



    region_instruction = _region_instruction_from_prefs(preferences)



    # Macro targets: mirror the MAIN meal's totals (strict)

    macro_targets = _extract_macros(main)

    if any(macro_targets.get(k) is None for k in ("calories", "protein", "fat", "carbs")):

        return jsonify({'error': 'Main meal lacks complete macro totals (calories, protein, fat, carbs).'}), 400



    # Build differentiation constraints using ALL alternatives for better duplication avoidance

    avoid_proteins, avoid_ingredients = _collect_avoid_lists_from_all_alternatives(main, all_alternatives)



    # Try multiple times until it validates

    for attempt in range(1, max_attempts + 1):

        try:

            app.logger.info(f"🧠 Generating NEW ALTERNATIVE (attempt {attempt}/{max_attempts})")



            # FIRST ATTEMPT: Use full detailed prompt

            if attempt == 1:

                # Compose full prompt with all constraints

                system_prompt = ALTERNATIVE_GENERATOR_PROMPT.format(

                    region_instruction=region_instruction,

                    macro_targets=macro_targets,

                    avoid_proteins=avoid_proteins,

                    avoid_ingredients=avoid_ingredients

                )

                enhanced_system_prompt = system_prompt



            # RETRY ATTEMPTS: Use short focused prompt with JSON and issues

            else:

                enhanced_system_prompt = f"""You previously generated an alternative meal that failed validation.

Here is the meal you generated:

{json.dumps(previous_candidate, ensure_ascii=False, indent=2)}



These are the validation issues that need to be fixed:

{validation_feedback}



return a corrected version of this meal as JSON that fixes ALL the issues above.

Keep the same meal structure but adjust the values to pass validation.

Return ONLY valid JSON, no markdown fences or explanations."""



            user_payload = {

                "main": main,

                "current_alternative": current_alt,

                "all_alternatives": all_alternatives,

                "user_preferences": preferences

            }



            response = client.chat.completions.create(

                model=deployment,

                messages=[

                    {"role": "system", "content": enhanced_system_prompt},

                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)}

                ],

                temperature=0

            )

            raw = _strip_markdown_fences(response.choices[0].message.content)



            try:

                candidate = json.loads(raw)

            except Exception as e:

                error_msg = f"JSON parse error: {e}"

                app.logger.warning(f"❌ {error_msg} for NEW ALTERNATIVE")

                previous_issues.append(error_msg)

                if attempt == max_attempts:

                    return jsonify({"error": "Invalid JSON from OpenAI", "raw": raw}), 500

                continue



            # Validate macros against targets using your validator

            tpl = [{"alternative": macro_targets}]

            menu = [{"alternative": candidate}]

            val_res = app.test_client().post(

                "/api/validate-menu",

                json={"template": tpl, "menu": menu, "user_code": user_code}

            )

            val = val_res.get_json() or {}

            if not val.get("is_valid"):

                # Collect validation issues for next attempt

                issues = val.get("issues", [])

                failed_meal = val.get("meal_data", {})

                app.logger.warning(f"❌ NEW ALTERNATIVE failed validation. Meal: {json.dumps(failed_meal, ensure_ascii=False)}, Issues: {issues}")

                

                # Store the failed candidate for retry

                previous_candidate = candidate

                

                # Format validation feedback for next attempt

                validation_feedback = "\n".join([f"• {issue}" for issue in issues])

                previous_issues.extend(issues)

                

                if attempt == max_attempts:

                    return jsonify({

                        "error": "Generated alternative failed validation after all attempts",

                        "issues": issues,

                        "attempts": max_attempts,

                        "previous_issues": previous_issues

                    }), 400

                continue



            # Automatically calculate and add nutrition totals from ingredients

            candidate = _calculate_nutrition_from_ingredients(candidate)



            # Clean & enrich

            cleaned = clean_ingredient_names({"alternative": candidate}).get("alternative", candidate)

            region = (preferences.get('region') or 'israel').lower()

            enriched = enrich_alternative_with_upc(cleaned, user_code, region)



            app.logger.info("✅ NEW ALTERNATIVE generated, validated, and enriched.")

            return jsonify(enriched)



        except Exception as e:

            error_msg = f"Exception occurred: {str(e)}"

            app.logger.error(f"❌ Exception in generate_alternative_meal attempt {attempt}: {e}")

            previous_issues.append(error_msg)

            if attempt == max_attempts:

                return jsonify({

                    "error": "Exception while generating alternative meal",

                    "exception": str(e),

                    "attempts": max_attempts,

                    "previous_issues": previous_issues

                }), 500

            # otherwise loop and retry



    # Fallback (should not reach due to returns above)

    return jsonify({

        "error": "All attempts to generate the alternative meal failed",

        "attempts": max_attempts,

        "previous_issues": previous_issues

    }), 500



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

            "all_alternatives": all_alternatives,

            "user_preferences": preferences

        })

    }

    try:

        response = client.chat.completions.create(

            model=deployment,

            messages=[

                {"role": "system", "content": system_prompt},

                user_prompt

            ],

            temperature=0

        )

        raw = response.choices[0].message.content

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

        

        system_prompt = f"""

You are preparing a concise hand-off note for another diet-planning LLM.



Write **exactly four sentences** in the following style:



• **Sentences 1-2** – Describe the client's dominant eating patterns in third-person  

  (“The client relies heavily on …”).  

• **Sentences 3-4** – State the most impactful improvements, also in third-person  

  (“To improve, the client should …”).  



Guidelines  

- Use third-person only (no “you”).  

- Be practical and specific.  

- No extra headings, lists, or commentary—just four clear sentences.



=== CLIENT FOOD HABIT DATA ===

{habits_text}

"""





        # Call Azure OpenAI to generate the analysis

        try:

            logger.info("🧠 Sending eating habits analysis to OpenAI")

            

            response = client.chat.completions.create(

    model=deployment,

    messages=[

        {"role": "system", "content": system_prompt},

        {"role": "user", "content": "Summarize the habits and suggest improvements."}

    ],

    temperature=0.6,   # a bit lower for crisper language

    max_tokens=250      # plenty for ~4 sentences

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



@app.route("/api/update-user-profile", methods=["POST"])

def api_update_user_profile():

    """

    Update user profile information in the chat_users table.

    Receives: user_code, full_name, email, phone_number, age, date_of_birth, gender

    """

    try:

        data = request.get_json()

        

        # Extract required fields

        user_code = data.get("user_code")

        full_name = data.get("full_name")

        email = data.get("email")

        phone_number = data.get("phone_number")

        age = data.get("age")

        date_of_birth = data.get("date_of_birth")

        gender = data.get("gender")

        

        # Extract additional fields

        language = data.get("language")

        city = data.get("city")

        timezone = data.get("timezone")

        user_language = data.get("user_language")

        activity_level = data.get("Activity_level")

        goal = data.get("goal")

        region = data.get("region")

        

        # Validate required fields

        if not user_code or not full_name or not email:

            return jsonify({"error": "user_code, full_name and email are required fields"}), 400

        

        # Validate email format

        import re

        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

        if not re.match(email_pattern, email):

            return jsonify({"error": "Invalid email format"}), 400

        

        # Validate age if provided

        if age is not None:

            try:

                age = int(age)

                if age < 0 or age > 150:

                    return jsonify({"error": "Age must be between 0 and 150"}), 400

            except (ValueError, TypeError):

                return jsonify({"error": "Age must be a valid number"}), 400

        

        # Validate date_of_birth if provided

        if date_of_birth:

            try:

                # Validate date format (assuming ISO format YYYY-MM-DD)

                datetime.datetime.fromisoformat(date_of_birth)

            except ValueError:

                return jsonify({"error": "Invalid date format. Use YYYY-MM-DD format"}), 400

        

        # Validate gender if provided

        valid_genders = ["male", "female", "other", "prefer_not_to_say"]

        if gender and gender.lower() not in valid_genders:

            return jsonify({"error": f"Gender must be one of: {', '.join(valid_genders)}"}), 400

        

        # Check if user exists by user_code

        try:

            existing_user = supabase.table('chat_users').select('id, email, phone_number').eq('user_code', user_code).execute()

            

            if existing_user.data:

                # User exists, update their profile

                user_id = existing_user.data[0]['id']

                

                # Check for duplicate user_code (should not happen for existing users, but check anyway)

                user_code_check = supabase.table('chat_users').select('id').eq('user_code', user_code).neq('id', user_id).execute()

                if user_code_check.data:

                    return jsonify({"error": f"User code '{user_code}' is already in use by another user"}), 400

                

                # Check for duplicate email

                if email:

                    email_check = supabase.table('chat_users').select('id').eq('email', email).neq('id', user_id).execute()

                    if email_check.data:

                        return jsonify({"error": f"Email '{email}' is already in use by another user"}), 400

                

                # Check for duplicate phone number

                if phone_number:

                    phone_check = supabase.table('chat_users').select('id').eq('phone_number', phone_number).neq('id', user_id).execute()

                    if phone_check.data:

                        return jsonify({"error": f"Phone number '{phone_number}' is already in use by another user"}), 400

                

                # Prepare update data

                update_data = {

                    "full_name": full_name,

                    "email": email,

                    "phone_number": phone_number,

                    "age": age,

                    "date_of_birth": date_of_birth,

                    "gender": gender.lower() if gender else None,

                    "language": language,

                    "city": city,

                    "timezone": timezone,

                    "user_language": user_language,

                    "Activity_level": activity_level,

                    "goal": goal,

                    "region": region,

                }

                

                # Remove None values to avoid overwriting existing data with null

                update_data = {k: v for k, v in update_data.items() if v is not None}

                

                # Update user profile

                response = supabase.table('chat_users').update(update_data).eq('id', user_id).execute()

                

                if response.data:

                    logger.info(f"✅ Updated user profile for user_code: {user_code}")

                    return jsonify({

                        "message": "User profile updated successfully",

                        "user_code": user_code,

                        "action": "updated"

                    })

                else:

                    return jsonify({"error": "Failed to update user profile"}), 500

                    

            else:

                # User doesn't exist, create new user with the provided user_code

                # Check for duplicate user_code

                user_code_check = supabase.table('chat_users').select('id').eq('user_code', user_code).execute()

                if user_code_check.data:

                    return jsonify({"error": f"User code '{user_code}' is already in use"}), 400

                

                # Check for duplicate email

                if email:

                    email_check = supabase.table('chat_users').select('id').eq('email', email).execute()

                    if email_check.data:

                        return jsonify({"error": f"Email '{email}' is already in use by another user"}), 400

                

                # Check for duplicate phone number

                if phone_number:

                    phone_check = supabase.table('chat_users').select('id').eq('phone_number', phone_number).execute()

                    if phone_check.data:

                        return jsonify({"error": f"Phone number '{phone_number}' is already in use by another user"}), 400

                

                # Prepare insert data

                insert_data = {

                    "user_code": user_code,

                    "full_name": full_name,

                    "email": email,

                    "phone_number": phone_number,

                    "age": age,

                    "date_of_birth": date_of_birth,

                    "gender": gender.lower() if gender else None,

                    "platform": "client_web",

                    "verification_code": user_code,

                    "whatsapp_number": phone_number,

                    "language": language,

                    "city": city,

                    "timezone": timezone,

                    "user_language": user_language,

                    "Activity_level": activity_level,

                    "goal": goal,

                    "region": region,

                }

                

                # Remove None values

                insert_data = {k: v for k, v in insert_data.items() if v is not None}

                

                # Insert new user

                response = supabase.table('chat_users').insert(insert_data).execute()

                

                if response.data:

                    logger.info(f"✅ Created new user with user_code: {user_code}")

                    return jsonify({

                        "message": "User profile created successfully",

                        "user_code": user_code,

                        "action": "created"

                    })

                else:

                    return jsonify({"error": "Failed to create user profile"}), 500

                    

        except Exception as e:

            logger.error(f"❌ Database operation failed: {str(e)}")

            return jsonify({"error": f"Database operation failed: {str(e)}"}), 500

            

    except Exception as e:

        logger.error(f"❌ Exception in /api/update-user-profile: {str(e)}")

        logger.error(f"Traceback: {traceback.format_exc()}")

        return jsonify({"error": f"Internal server error: {str(e)}"}), 500



@app.route("/api/update-user-fields", methods=["POST"])

def api_update_user_fields():

    """

    Update specific user fields by user_code.

    Receives: user_code, age, phone_number (optional), full_name (optional), date_of_birth

    """

    try:

        data = request.get_json()

        

        # Extract required fields

        user_code = data.get("user_code")

        age = data.get("age")

        date_of_birth = data.get("date_of_birth")

        

        # Extract optional fields

        phone_number = data.get("phone_number")

        full_name = data.get("full_name")

        

        # Validate required fields

        if not user_code:

            return jsonify({"error": "user_code is required"}), 400

        

        if age is None and date_of_birth is None:

            return jsonify({"error": "At least one of age or date_of_birth must be provided"}), 400

        

        # Validate age if provided

        if age is not None:

            try:

                age = int(age)

                if age < 0 or age > 150:

                    return jsonify({"error": "Age must be between 0 and 150"}), 400

            except (ValueError, TypeError):

                return jsonify({"error": "Age must be a valid number"}), 400

        

        # Validate date_of_birth if provided

        if date_of_birth:

            try:

                # Validate date format (assuming ISO format YYYY-MM-DD)

                datetime.datetime.fromisoformat(date_of_birth)

            except ValueError:

                return jsonify({"error": "Invalid date format. Use YYYY-MM-DD format"}), 400

        

        # Check if user exists by user_code

        try:

            existing_user = supabase.table('chat_users').select('id').eq('user_code', user_code).execute()

            

            if not existing_user.data:

                return jsonify({"error": f"User with user_code '{user_code}' not found"}), 404

            

            user_id = existing_user.data[0]['id']

            

            # Prepare update data

            update_data = {

                "updated_at": datetime.datetime.now().isoformat()

            }

            

            # Add provided fields to update data

            if age is not None:

                update_data["age"] = age

            if date_of_birth is not None:

                update_data["date_of_birth"] = date_of_birth

            if phone_number is not None:

                update_data["phone_number"] = phone_number

            if full_name is not None:

                update_data["full_name"] = full_name

            

            # Update user fields

            response = supabase.table('chat_users').update(update_data).eq('id', user_id).execute()

            

            if response.data:

                logger.info(f"✅ Updated user fields for user_code: {user_code}")

                return jsonify({

                    "message": "User fields updated successfully",

                    "user_code": user_code,

                    "updated_fields": list(update_data.keys()),

                    "updated_data": update_data

                })

            else:

                return jsonify({"error": "Failed to update user fields"}), 500

                    

        except Exception as e:

            logger.error(f"❌ Database operation failed: {str(e)}")

            return jsonify({"error": f"Database operation failed: {str(e)}"}), 500

            

    except Exception as e:

        logger.error(f"❌ Exception in /api/update-user-fields: {str(e)}")

        logger.error(f"Traceback: {traceback.format_exc()}")

        return jsonify({"error": f"Internal server error: {str(e)}"}), 500





@app.route("/api/weight-logs", methods=["GET"])

def api_get_weight_logs():

    """

    Get all weight logs data from Supabase.

    Optional query parameter: user_code to filter by specific user.

    Returns all weight logs ordered by measurement_date descending.

    """

    try:

        # Get optional user_code parameter

        user_code = request.args.get("user_code")



        logger.info(f"🔍 Fetching weight logs{' for user_code: ' + user_code if user_code else ' for all users'}")



        # Build query

        query = supabase.table('weight_logs').select('*').order('measurement_date', desc=True)



        # Filter by user_code if provided

        if user_code:

            query = query.eq('user_code', user_code)



        # Execute query

        response = query.execute()



        if response.data is None:

            logger.warning("❌ No data returned from weight_logs query")

            return jsonify({"error": "No weight logs found"}), 404



        weight_logs = response.data

        logger.info(f"✅ Retrieved {len(weight_logs)} weight log entries")



        # Return the data with summary

        return jsonify({

            "weight_logs": weight_logs,

            "summary": {

                "total_entries": len(weight_logs),

                "user_code": user_code,

                "date_range": {

                    "earliest": weight_logs[-1]["measurement_date"] if weight_logs else None,

                    "latest": weight_logs[0]["measurement_date"] if weight_logs else None

                } if weight_logs else None

            }

        })



    except Exception as e:

        logger.error(f"❌ Exception in /api/weight-logs: {str(e)}")

        logger.error(f"❌ Traceback: {traceback.format_exc()}")

        return jsonify({"error": f"Failed to fetch weight logs: {str(e)}"}), 500





@app.route("/api/weight-logs/<user_code>", methods=["GET"])

def api_get_user_weight_logs(user_code):

    """

    Get weight logs for a specific user by user_code in URL path.

    Alternative endpoint for getting user-specific weight logs.

    """

    try:

        logger.info(f"🔍 Fetching weight logs for user_code: {user_code}")



        # Query for specific user

        response = supabase.table('weight_logs').select('*').eq('user_code', user_code).order('measurement_date', desc=True).execute()



        if response.data is None:

            logger.warning(f"❌ No data returned from weight_logs query for user_code: {user_code}")

            return jsonify({"error": f"No weight logs found for user_code: {user_code}"}), 404



        weight_logs = response.data

        logger.info(f"✅ Retrieved {len(weight_logs)} weight log entries for user_code: {user_code}")



        # Calculate trends and statistics

        trends = {}

        if weight_logs:

            # Weight trend

            weights = [log.get('weight_kg') for log in weight_logs if log.get('weight_kg') is not None]

            if len(weights) > 1:

                weight_change = weights[0] - weights[-1]  # Most recent minus oldest

                trends['weight_change_kg'] = round(weight_change, 2)

                trends['weight_trend'] = 'gaining' if weight_change > 0 else 'losing' if weight_change < 0 else 'stable'



            # Body fat trend

            body_fats = [log.get('body_fat_percentage') for log in weight_logs if log.get('body_fat_percentage') is not None]

            if len(body_fats) > 1:

                body_fat_change = body_fats[0] - body_fats[-1]

                trends['body_fat_change'] = round(body_fat_change, 2)



        # Return the data with summary and trends

        return jsonify({

            "weight_logs": weight_logs,

            "summary": {

                "total_entries": len(weight_logs),

                "user_code": user_code,

                "date_range": {

                    "earliest": weight_logs[-1]["measurement_date"] if weight_logs else None,

                    "latest": weight_logs[0]["measurement_date"] if weight_logs else None

                } if weight_logs else None

            },

            "trends": trends if trends else None

        })



    except Exception as e:

        logger.error(f"❌ Exception in /api/weight-logs/{user_code}: {str(e)}")

        logger.error(f"❌ Traceback: {traceback.format_exc()}")

        return jsonify({"error": f"Failed to fetch weight logs for user_code {user_code}: {str(e)}"}), 500





@app.route("/api/convert-measurement", methods=["POST"])

def api_convert_measurement():

    """

    Convert measurements using AI/LLM for ingredients.

    Supports converting between household measurements and grams.

    """

    try:

        data = request.get_json()



        # Extract parameters

        ingredient = data.get("ingredient", "").strip()

        brand = data.get("brand", "").strip()

        from_measurement = data.get("fromMeasurement", "").strip()

        to_type = data.get("toType", "grams")  # "grams" or "household"

        target_lang = data.get("targetLang", "en")

        region = data.get("region", "israel").lower()



        # Validate required parameters

        if not ingredient:

            return jsonify({"error": "Ingredient name is required"}), 400

        if not from_measurement:

            return jsonify({"error": "From measurement is required"}), 400

        if to_type not in ["grams", "household"]:

            return jsonify({"error": "toType must be 'grams' or 'household'"}), 400



        logger.info(f"🤖 Converting measurement: {ingredient} ({brand}) from '{from_measurement}' to {to_type} for region {region}")



        # Create comprehensive system prompt for measurement conversion

        system_prompt = f"""You are an expert nutritionist and culinary professional specializing in accurate measurement conversions for dietary planning.



**YOUR TASK:**

Convert the given measurement to the requested format using your extensive knowledge of food weights, volumes, and regional serving sizes.



**CONVERSION RULES:**

1. **Weight to Volume Conversions:**

   - Be precise with density considerations (e.g., 1 cup flour ≠ 1 cup sugar in weight)

   - Account for ingredient-specific densities and packing methods

   - Use standard measurement equivalents



2. **Volume to Weight Conversions:**

   - Consider ingredient density and typical packing

   - Account for air space in volume measurements

   - Use realistic, practical weight estimates



3. **Regional Considerations:**

   - Adjust for regional portion sizes and measurement standards

   - Consider local brand packaging and serving sizes

   - Use culturally appropriate measurement units



4. **Precision Guidelines:**

   - Provide realistic, practical measurements

   - Round to appropriate significant figures

   - Consider cooking/preparation effects on weight



**RESPONSE FORMAT:**

Return ONLY a valid JSON object with this exact structure:

{{

  "converted_measurement": "<the converted measurement>",

  "confidence": "<high|medium|low>",

  "method": "<brief explanation of conversion method>",

  "notes": "<any relevant notes about the conversion>"

}}



**EXAMPLES:**

Input: "1 cup rice" → grams

Output: {{"converted_measurement": "185", "confidence": "high", "method": "Standard white rice density conversion", "notes": "Based on uncooked long-grain rice density"}}



Input: "200g chicken breast" → household

Output: {{"converted_measurement": "1 medium breast", "confidence": "medium", "method": "Standard chicken breast weight ranges", "notes": "Typical supermarket chicken breast size"}}"""



        # Create detailed user prompt with regional context

        region_context = {

            'israel': {

                'units': 'Use Israeli/common metric measurements. Consider local market standards.',

                'examples': 'Israeli cottage cheese tubs (250g), hummus containers (400g), pita sizes (60-80g), typical vegetable portions'

            },

            'us': {

                'units': 'Use American customary units (cups, tablespoons, ounces). Consider US market standards.',

                'examples': 'US cottage cheese containers (16oz), yogurt cups (6-8oz), bread slices, typical American portions'

            },

            'uk': {

                'units': 'Use British/metric measurements. Consider UK market standards.',

                'examples': 'UK cottage cheese tubs (300g), yogurt pots (150-170g), bread slices, typical British portions'

            },

            'canada': {

                'units': 'Use Canadian/metric measurements. Consider Canadian market standards.',

                'examples': 'Canadian cottage cheese containers (500g), yogurt containers (175g), typical Canadian portions'

            },

            'australia': {

                'units': 'Use Australian/metric measurements. Consider Australian market standards.',

                'examples': 'Australian cottage cheese tubs (250g), yogurt tubs (170g), typical Australian portions'

            }

        }



        region_info = region_context.get(region, region_context['israel'])



        user_prompt = f"""

**INGREDIENT DETAILS:**

- Name: {ingredient}

- Brand: {brand if brand else 'Generic'}

- Current Measurement: {from_measurement}

- Target Format: {to_type}

- Region: {region}



**REGIONAL CONTEXT:**

{region_info['units']}

{region_info['examples']}



**CONVERSION REQUEST:**

Convert "{from_measurement}" of "{ingredient}" to {to_type} measurement.



**ADDITIONAL CONTEXT:**

- Consider the brand "{brand}" if it affects typical serving sizes

- Use {region} regional standards for portion sizes

- Account for preparation state (raw, cooked, etc.) if mentioned

- Provide practical, realistic measurements that people actually use



Please provide the most accurate conversion based on nutritional and culinary standards."""



        # Call Azure OpenAI

        response = client.chat.completions.create(

            model=deployment,

            messages=[

                {"role": "system", "content": system_prompt},

                {"role": "user", "content": user_prompt}

            ],

            temperature=0.1,  # Low temperature for consistent results

            max_tokens=200

        )



        raw_response = response.choices[0].message.content

        logger.info(f"🤖 Raw AI response: {raw_response}")



        # Parse the JSON response

        try:

            result = json.loads(raw_response.strip())



            # Validate required fields

            required_fields = ["converted_measurement", "confidence", "method"]

            if not all(field in result for field in required_fields):

                logger.warning(f"❌ AI response missing required fields: {result}")

                return jsonify({"error": "AI response missing required fields"}), 500



            # Add additional metadata

            result.update({

                "ingredient": ingredient,

                "brand": brand,

                "from_measurement": from_measurement,

                "to_type": to_type,

                "region": region,

                "timestamp": datetime.datetime.now().isoformat()

            })



            logger.info(f"✅ Successfully converted measurement: {from_measurement} → {result['converted_measurement']}")

            return jsonify(result)



        except json.JSONDecodeError as e:

            logger.error(f"❌ Failed to parse AI response as JSON: {raw_response}")

            logger.error(f"❌ JSON error: {str(e)}")



            # Attempt to extract measurement from non-JSON response

            fallback_measurement = extract_measurement_from_text(raw_response, to_type)

            if fallback_measurement:

                logger.info(f"🔄 Using fallback extraction: {fallback_measurement}")

                return jsonify({

                    "converted_measurement": fallback_measurement,

                    "confidence": "low",

                    "method": "Fallback text extraction",

                    "notes": "Could not parse AI JSON response, used text extraction",

                    "ingredient": ingredient,

                    "from_measurement": from_measurement,

                    "to_type": to_type

                })

            else:

                return jsonify({"error": "Failed to parse AI response"}), 500



    except Exception as e:

        logger.error(f"❌ Exception in measurement conversion: {str(e)}")

        logger.error(f"❌ Traceback: {traceback.format_exc()}")

        return jsonify({"error": f"Measurement conversion failed: {str(e)}"}), 500





def extract_measurement_from_text(text, to_type):

    """

    Fallback function to extract measurement from AI text response when JSON parsing fails.

    """

    try:

        text = text.lower().strip()



        if to_type == "grams":

            # Look for weight measurements in grams

            import re

            gram_patterns = [

                r'(\d+(?:\.\d+)?)\s*g(?:rams?)?',

                r'(\d+(?:\.\d+)?)\s*gram',

                r'about\s*(\d+(?:\.\d+)?)\s*g',

                r'(\d+(?:\.\d+)?)\s*gr',

            ]



            for pattern in gram_patterns:

                match = re.search(pattern, text)

                if match:

                    return match.group(1)



        elif to_type == "household":

            # Look for household measurements

            household_patterns = [

                r'(\d+(?:\.\d+)?)\s*(?:cups?|cups|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|ml|liters?|pieces?|slices?|cloves?|heads?)',

                r'(\d+(?:\.\d+)?)\s*(?:medium|large|small)\s*(\w+)',

                r'about\s*(\d+(?:\.\d+)?)\s*(?:cups?|cups|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|ml|liters?|pieces?|slices?|cloves?|heads?)',

            ]



            for pattern in household_patterns:

                match = re.search(pattern, text)

                if match:

                    return match.group(0).strip()



        return None



    except Exception as e:

        logger.error(f"❌ Error in fallback text extraction: {str(e)}")

        return None





if __name__ == "__main__":

    port = int(os.environ.get("PORT", 8000))

    app.run(host="0.0.0.0", port=port)