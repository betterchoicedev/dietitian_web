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
    card_width = width - 2*margin - 20  # Make all frames the same width
    card_padding = 20
    card_height = 90
    line_height = 12
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
        # Create a more elegant totals card with gradient-like effect
        c.setFillColor(green_bg)
        c.roundRect((width-card_width)/2, y-70, card_width, 70, 15, fill=1, stroke=0)
        
        # Add a subtle border
        c.setStrokeColor(green_accent)
        c.setLineWidth(2)
        c.roundRect((width-card_width)/2, y-70, card_width, 70, 15, fill=0, stroke=1)
        
        # Title with smaller, more elegant font
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(green_accent)
        c.drawString((width-card_width)/2+card_padding, y-22, "Daily Nutritional Summary")
        
        # Macro values with smaller, cleaner fonts
        c.setFont("Helvetica-Bold", 11)
        x0 = (width-card_width)/2+card_padding
        
        # Calories
        c.setFillColor(green_accent)
        c.drawString(x0, y-42, f"{totals.get('calories', 0)} kcal")
        
        # Macros with better spacing
        c.setFillColor(orange_accent)
        c.drawString(x0+110, y-42, f"Carbs: {totals.get('carbs', 0)}g")
        c.setFillColor(yellow_accent)
        c.drawString(x0+220, y-42, f"Fat: {totals.get('fat', 0)}g")
        c.setFillColor(blue_accent)
        c.drawString(x0+310, y-42, f"Protein: {totals.get('protein', 0)}g")
        
        # Add a subtle separator line
        c.setStrokeColor(colors.HexColor("#d1fae5"))
        c.setLineWidth(1)
        c.line((width-card_width)/2+card_padding, y-55, (width+card_width)/2-card_padding, y-55)
        
        y -= 70 + 25

    # Helper function to estimate text lines for better height calculation
    def estimate_ingredient_lines(ingredients, max_text_width):
        total_lines = 0
        for ing in ingredients:
            item = ing.get('item', '')
            quantity = ing.get('quantity', '')
            unit = ing.get('unit', '')
            household_measure = ing.get('household_measure', '')
            
            if household_measure:
                ingredient_text = f"{item} - {quantity} {unit} ({household_measure})"
            else:
                ingredient_text = f"{item} - {quantity} {unit}"
            
            # Estimate number of lines this text would wrap to
            if c.stringWidth(ingredient_text, "Helvetica", 9) > max_text_width:
                words = ingredient_text.split()
                lines = 1
                current_line = ""
                
                for word in words:
                    test_line = current_line + (" " if current_line else "") + word
                    if c.stringWidth(test_line, "Helvetica", 9) > max_text_width:
                        if current_line:
                            lines += 1
                            current_line = word
                        else:
                            current_line = word
                    else:
                        current_line = test_line
                
                total_lines += lines
            else:
                total_lines += 1
        
        return total_lines

    # --- Meals as Cards ---
    if "meals" in menu:
        for meal in menu["meals"]:
            # --- Calculate total height needed for this meal box ---
            main_ings = meal.get('main', {}).get('ingredients', [])
            alt_ings = meal.get('alternative', {}).get('ingredients', [])
            
            # More accurate height calculation considering text wrapping
            macro_x = margin + 10 + card_width - 130  # Position where macros start
            max_text_width = macro_x - (margin + 10) - card_padding - 30
            
            main_ing_lines = estimate_ingredient_lines(main_ings, max_text_width) if main_ings else 0
            alt_ing_lines = estimate_ingredient_lines(alt_ings, max_text_width) if alt_ings else 0
            
            main_card_height = max(card_height, card_padding*2 + line_height*main_ing_lines + 35)  # 35 for title + "Ingredients:" label
            alt_card_height = max(card_height, card_padding*2 + line_height*alt_ing_lines + 35)
            
            other_alts = meal.get('alternatives', [])
            other_alt_heights = []
            for alt in other_alts:
                alt_ings = alt.get('ingredients', [])
                alt_ing_lines = estimate_ingredient_lines(alt_ings, max_text_width) if alt_ings else 0
                other_alt_heights.append(max(card_height, card_padding*2 + line_height*alt_ing_lines + 35))
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
            
            # Meal Header with improved frame design
            meal_name = meal.get('meal', '')
            meal_header_height = 40
            frame_x = margin + 10
            
            # Create simple, clean meal name frame
            c.setFillColor(colors.HexColor("#f9fafb"))  # Very light gray background
            c.roundRect(frame_x, y-meal_header_height, card_width, meal_header_height, 8, fill=1, stroke=0)
            
            # Add clean border
            c.setStrokeColor(green_accent)
            c.setLineWidth(2)
            c.roundRect(frame_x, y-meal_header_height, card_width, meal_header_height, 8, fill=0, stroke=1)
            
            # Meal name with better typography
            c.setFont("Helvetica-Bold", 16)
            c.setFillColor(colors.HexColor("#1f2937"))  # Dark gray
            # Center the text vertically in the frame
            text_y = y - meal_header_height/2 - 3
            c.drawString(frame_x + 20, text_y, meal_name)
            
            # Add a small decorative dot
            c.setFillColor(green_accent)
            c.circle(frame_x + 12, text_y + 2, 3, fill=1)
            
            y -= meal_header_height + 15
            # Main Option Card with enhanced design and consistent width
            main = meal.get('main', {})
            card_x = frame_x
            
            # Main card background with cleaner design
            c.setFillColor(green_bg)
            c.roundRect(card_x, y-main_card_height, card_width, main_card_height, 8, fill=1, stroke=0)
            
            # Add clean border
            c.setStrokeColor(green_accent)
            c.setLineWidth(1)
            c.roundRect(card_x, y-main_card_height, card_width, main_card_height, 8, fill=0, stroke=1)
            
            # Meal title with inline option label (no background)
            y_main_title = y-25
            main_title = main.get('meal_title')
            if main_title:
                c.setFont("Helvetica-Bold", 11)
                c.setFillColor(colors.HexColor("#059669"))  # Darker green
                c.drawString(card_x+card_padding, y_main_title, f"{main_title} - Main Option")
                y_content = y_main_title - 20
            else:
                c.setFont("Helvetica-Bold", 11)
                c.setFillColor(colors.HexColor("#059669"))
                c.drawString(card_x+card_padding, y_main_title, "Main Option")
                y_content = y_main_title - 20
            
            # Macros on the right side, stacked vertically
            main_nut = main.get('nutrition', {})
            macro_x = card_x + card_width - 130  # Right side positioning
            macro_start_y = y-30
            
            c.setFont("Helvetica-Bold", 11)
            # Calories
            c.setFillColor(green_accent)
            c.drawString(macro_x, macro_start_y, f"{main_nut.get('calories', 0)} kcal")
            # Protein
            c.setFillColor(blue_accent)
            c.drawString(macro_x, macro_start_y - 15, f"Protein: {main_nut.get('protein', 0)}g")
            # Carbs
            c.setFillColor(orange_accent)
            c.drawString(macro_x, macro_start_y - 30, f"Carbs: {main_nut.get('carbs', 0)}g")
            # Fat
            c.setFillColor(yellow_accent)
            c.drawString(macro_x, macro_start_y - 45, f"Fat: {main_nut.get('fat', 0)}g")
            # Ingredients section with better formatting (left side, constrained width)
            if main_ings:
                ingredients_y_start = y_content
                c.setFont("Helvetica-Bold", 10)
                c.setFillColor(colors.HexColor("#374151"))  # Dark gray
                c.drawString(card_x+card_padding, ingredients_y_start, "Ingredients:")
                
                c.setFont("Helvetica", 9)
                c.setFillColor(colors.HexColor("#4b5563"))  # Medium gray
                ing_y = ingredients_y_start - 15
                max_text_width = macro_x - card_x - card_padding - 30  # Leave space for macros
                
                for ing in main_ings:
                    # Add bullet point
                    c.circle(card_x+card_padding+5, ing_y+3, 1.5, fill=1)
                    # Ingredient text with household_measure included
                    item = ing.get('item', '')
                    quantity = ing.get('quantity', '')
                    unit = ing.get('unit', '')
                    household_measure = ing.get('household_measure', '')
                    
                    # Format: "Item - Quantity Unit (Household Measure)"
                    if household_measure:
                        ingredient_text = f"{item} - {quantity} {unit} ({household_measure})"
                    else:
                        ingredient_text = f"{item} - {quantity} {unit}"
                    
                    # Use text wrapping instead of truncation for better readability
                    max_width = macro_x - card_x - card_padding - 30
                    if c.stringWidth(ingredient_text, "Helvetica", 9) > max_width:
                        # Split long text into multiple lines
                        words = ingredient_text.split()
                        lines = []
                        current_line = ""
                        
                        for word in words:
                            test_line = current_line + (" " if current_line else "") + word
                            if c.stringWidth(test_line, "Helvetica", 9) <= max_width:
                                current_line = test_line
                            else:
                                if current_line:
                                    lines.append(current_line)
                                    current_line = word
                                else:
                                    # Single word too long, keep it as is
                                    current_line = word
                        
                        if current_line:
                            lines.append(current_line)
                        
                        # Draw each line
                        for line_idx, line in enumerate(lines):
                            c.drawString(card_x+card_padding+12, ing_y - (line_idx * line_height), line)
                        
                        # Adjust y position for multiple lines
                        ing_y -= (len(lines) - 1) * line_height
                    else:
                        c.drawString(card_x+card_padding+12, ing_y, ingredient_text)
                    ing_y -= line_height
            y -= main_card_height + 18
            # Alternative Option Card with consistent design
            alt_opt = meal.get('alternative', {})
            
            # Alternative card background with cleaner design
            c.setFillColor(blue_bg)
            c.roundRect(card_x, y-alt_card_height, card_width, alt_card_height, 8, fill=1, stroke=0)
            
            # Add clean border
            c.setStrokeColor(blue_accent)
            c.setLineWidth(1)
            c.roundRect(card_x, y-alt_card_height, card_width, alt_card_height, 8, fill=0, stroke=1)
            
            # Alternative title with inline option label (no background)
            y_alt_title = y-25
            alt_title = alt_opt.get('meal_title')
            if alt_title:
                c.setFont("Helvetica-Bold", 11)
                c.setFillColor(colors.HexColor("#0369a1"))  # Darker blue
                c.drawString(card_x+card_padding, y_alt_title, f"{alt_title} - Alternative 1")
                y_alt_content = y_alt_title - 20
            else:
                c.setFont("Helvetica-Bold", 11)
                c.setFillColor(colors.HexColor("#0369a1"))
                c.drawString(card_x+card_padding, y_alt_title, "Alternative 1")
                y_alt_content = y_alt_title - 20
            
            # Macros on the right side, stacked vertically
            alt_nut = alt_opt.get('nutrition', {})
            alt_macro_x = card_x + card_width - 130
            alt_macro_start_y = y-30
            
            c.setFont("Helvetica-Bold", 11)
            # Calories
            c.setFillColor(green_accent)
            c.drawString(alt_macro_x, alt_macro_start_y, f"{alt_nut.get('calories', 0)} kcal")
            # Protein
            c.setFillColor(blue_accent)
            c.drawString(alt_macro_x, alt_macro_start_y - 15, f"Protein: {alt_nut.get('protein', 0)}g")
            # Carbs
            c.setFillColor(orange_accent)
            c.drawString(alt_macro_x, alt_macro_start_y - 30, f"Carbs: {alt_nut.get('carbs', 0)}g")
            # Fat
            c.setFillColor(yellow_accent)
            c.drawString(alt_macro_x, alt_macro_start_y - 45, f"Fat: {alt_nut.get('fat', 0)}g")
            # Alternative ingredients section with better formatting
            if alt_ings:
                alt_ingredients_y_start = y_alt_content
                c.setFont("Helvetica-Bold", 10)
                c.setFillColor(colors.HexColor("#374151"))  # Dark gray
                c.drawString(card_x+card_padding, alt_ingredients_y_start, "Ingredients:")
                
                c.setFont("Helvetica", 9)
                c.setFillColor(colors.HexColor("#4b5563"))  # Medium gray
                ing_y = alt_ingredients_y_start - 15
                
                for ing in alt_ings:
                    # Add bullet point
                    c.circle(card_x+card_padding+5, ing_y+3, 1.5, fill=1)
                    # Ingredient text with household_measure included
                    item = ing.get('item', '')
                    quantity = ing.get('quantity', '')
                    unit = ing.get('unit', '')
                    household_measure = ing.get('household_measure', '')
                    
                    # Format: "Item - Quantity Unit (Household Measure)"
                    if household_measure:
                        ingredient_text = f"{item} - {quantity} {unit} ({household_measure})"
                    else:
                        ingredient_text = f"{item} - {quantity} {unit}"
                    
                    # Use text wrapping instead of truncation for better readability
                    alt_max_width = alt_macro_x - card_x - card_padding - 30
                    if c.stringWidth(ingredient_text, "Helvetica", 9) > alt_max_width:
                        # Split long text into multiple lines
                        words = ingredient_text.split()
                        lines = []
                        current_line = ""
                        
                        for word in words:
                            test_line = current_line + (" " if current_line else "") + word
                            if c.stringWidth(test_line, "Helvetica", 9) <= alt_max_width:
                                current_line = test_line
                            else:
                                if current_line:
                                    lines.append(current_line)
                                    current_line = word
                                else:
                                    # Single word too long, keep it as is
                                    current_line = word
                        
                        if current_line:
                            lines.append(current_line)
                        
                        # Draw each line
                        for line_idx, line in enumerate(lines):
                            c.drawString(card_x+card_padding+12, ing_y - (line_idx * line_height), line)
                        
                        # Adjust y position for multiple lines
                        ing_y -= (len(lines) - 1) * line_height
                    else:
                        c.drawString(card_x+card_padding+12, ing_y, ingredient_text)
                    ing_y -= line_height
            y -= alt_card_height + 24
            # Render all other alternatives with improved styling
            if other_alts:
                # Section header with frame (consistent width)
                section_height = 35
                c.setFillColor(colors.HexColor("#fef3c7"))  # Light yellow background
                c.roundRect(frame_x, y-section_height, card_width, section_height, 10, fill=1, stroke=0)
                c.setStrokeColor(blue_accent)
                c.setLineWidth(1.5)
                c.roundRect(frame_x, y-section_height, card_width, section_height, 10, fill=0, stroke=1)
                
                c.setFont("Helvetica-Bold", 15)
                c.setFillColor(blue_accent)
                c.drawString(frame_x + 20, y-20, "Additional Alternatives")
                y -= section_height + 15
                
                for alt_idx, alt in enumerate(other_alts):
                    alt_ings = alt.get('ingredients', [])
                    alt_card_height = max(card_height, card_padding*2 + line_height*len(alt_ings))
                    
                    # Additional alternative card background with cleaner design
                    c.setFillColor(blue_bg)
                    c.roundRect(card_x, y-alt_card_height, card_width, alt_card_height, 8, fill=1, stroke=0)
                    
                    # Add clean border
                    c.setStrokeColor(blue_accent)
                    c.setLineWidth(1)
                    c.roundRect(card_x, y-alt_card_height, card_width, alt_card_height, 8, fill=0, stroke=1)
                    
                    # Alternative title with inline option label (no background)
                    y_add_alt_title = y-25
                    alt_title = alt.get('meal_title')
                    if alt_title:
                        c.setFont("Helvetica-Bold", 11)
                        c.setFillColor(colors.HexColor("#0369a1"))
                        c.drawString(card_x+card_padding, y_add_alt_title, f"{alt_title} - Alternative {alt_idx+2}")
                        y_add_alt_content = y_add_alt_title - 20
                    else:
                        c.setFont("Helvetica-Bold", 11)
                        c.setFillColor(colors.HexColor("#0369a1"))
                        c.drawString(card_x+card_padding, y_add_alt_title, f"Alternative {alt_idx+2}")
                        y_add_alt_content = y_add_alt_title - 20
                    
                    # Macros on the right side, stacked vertically
                    alt_nut = alt.get('nutrition', {})
                    add_alt_macro_x = card_x + card_width - 130
                    add_alt_macro_start_y = y-30
                    
                    c.setFont("Helvetica-Bold", 11)
                    # Calories
                    c.setFillColor(green_accent)
                    c.drawString(add_alt_macro_x, add_alt_macro_start_y, f"{alt_nut.get('calories', 0)} kcal")
                    # Protein
                    c.setFillColor(blue_accent)
                    c.drawString(add_alt_macro_x, add_alt_macro_start_y - 15, f"Protein: {alt_nut.get('protein', 0)}g")
                    # Carbs
                    c.setFillColor(orange_accent)
                    c.drawString(add_alt_macro_x, add_alt_macro_start_y - 30, f"Carbs: {alt_nut.get('carbs', 0)}g")
                    # Fat
                    c.setFillColor(yellow_accent)
                    c.drawString(add_alt_macro_x, add_alt_macro_start_y - 45, f"Fat: {alt_nut.get('fat', 0)}g")
                    # Additional alternative ingredients with better formatting
                    if alt_ings:
                        additional_ingredients_y_start = y_add_alt_content
                        c.setFont("Helvetica-Bold", 10)
                        c.setFillColor(colors.HexColor("#374151"))  # Dark gray
                        c.drawString(card_x+card_padding, additional_ingredients_y_start, "Ingredients:")
                        
                        c.setFont("Helvetica", 9)
                        c.setFillColor(colors.HexColor("#4b5563"))  # Medium gray
                        ing_y = additional_ingredients_y_start - 15
                        for ing in alt_ings:
                            # Add bullet point
                            c.circle(card_x+card_padding+5, ing_y+3, 1.5, fill=1)
                            # Ingredient text with household_measure included
                            item = ing.get('item', '')
                            quantity = ing.get('quantity', '')
                            unit = ing.get('unit', '')
                            household_measure = ing.get('household_measure', '')
                            
                            # Format: "Item - Quantity Unit (Household Measure)"
                            if household_measure:
                                ingredient_text = f"{item} - {quantity} {unit} ({household_measure})"
                            else:
                                ingredient_text = f"{item} - {quantity} {unit}"
                            
                            # Use text wrapping instead of truncation for better readability
                            add_alt_max_width = add_alt_macro_x - card_x - card_padding - 30
                            if c.stringWidth(ingredient_text, "Helvetica", 9) > add_alt_max_width:
                                # Split long text into multiple lines
                                words = ingredient_text.split()
                                lines = []
                                current_line = ""
                                
                                for word in words:
                                    test_line = current_line + (" " if current_line else "") + word
                                    if c.stringWidth(test_line, "Helvetica", 9) <= add_alt_max_width:
                                        current_line = test_line
                                    else:
                                        if current_line:
                                            lines.append(current_line)
                                            current_line = word
                                        else:
                                            # Single word too long, keep it as is
                                            current_line = word
                                
                                if current_line:
                                    lines.append(current_line)
                                
                                # Draw each line
                                for line_idx, line in enumerate(lines):
                                    c.drawString(card_x+card_padding+12, ing_y - (line_idx * line_height), line)
                                
                                # Adjust y position for multiple lines
                                ing_y -= (len(lines) - 1) * line_height
                            else:
                                c.drawString(card_x+card_padding+12, ing_y, ingredient_text)
                            ing_y -= line_height
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


def load_user_preferences(user_code=None):
    """
    Load user preferences from Supabase chat_users table.
    If user_code is not provided, falls back to first user or default values.
    """
    try:
        logger.info(f"🔍 Loading user preferences for user_code: {user_code}")
        logger.info(f"Supabase URL: {supabase_url}")
        logger.info(f"Supabase Key exists: {bool(supabase_key)}")
        
        # Define the specific fields we need to reduce data transfer
        selected_fields = 'user_code,food_allergies,dailyTotalCalories,recommendations,food_limitations,goal,number_of_meals,client_preference,macros'
        
        if user_code:
            # Fetch specific user by user_code
            logger.info(f"Fetching user with user_code: {user_code}")
            response = supabase.table('chat_users').select(selected_fields).eq('user_code', user_code).execute()
            logger.info(f"Supabase response: {response}")
            if response.data:
                user_data = response.data[0]
                logger.info(f"Found user: {user_data.get('user_code')}")
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
                    "client_preference": {}
                }

        # Debug: Log the raw user data
        logger.info(f"Raw user data from Supabase: {json.dumps(user_data, indent=2, default=str)}")

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
            "client_preference": client_preference
        }

        logger.info(f"✅ Loaded user preferences for user_code: {user_data.get('user_code')}")
        logger.info(f"Final preferences: {json.dumps(preferences, indent=2)}")
        
        # Validate that essential fields are not None
        if preferences["calories_per_day"] is None:
            logger.error("❌ calories_per_day is None after processing!")
        if preferences["macros"] is None:
            logger.error("❌ macros is None after processing!")
        
        return preferences

    except Exception as e:
        logger.error(f"Error loading user preferences: {str(e)}")
        logger.error(f"Error traceback: {traceback.format_exc()}")
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
    "   - `nutrition`: total for the meal, automatically calculated by summing the ingredients' values.\n"
    "CRITICAL: You MUST strictly follow ALL dietary restrictions and limitations in the user preferences.\n"
    "If user has 'kosher' limitation, you MUST follow kosher dietary laws:\n"
    "- NEVER mix meat (chicken, beef, lamb, etc.) with dairy (milk, cream, cheese, yogurt, etc.) in the same meal\n"
    "- Use only kosher-certified ingredients and brands\n"
    "- Avoid non-kosher ingredients (pork, shellfish, etc.)\n\n"
    "After generating all meals, VERIFY that the daily totals (calories, protein, fat, carbs) are within ±5% of the user's goal.\n"
    "If not, regenerate until it is correct.\n\n"
    "Respond ONLY with valid JSON:\n"
    "- `meal_plan`: 5 meals with full details.\n"
    "- `totals`: {calories, protein, fat, carbs} — summed across the day.\n"
    "- `note`: general advice or note to the user.\n"
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

@app.route("/api/menu", methods=["GET", "POST"])
@require_api_key
def get_generated_menu():
    try:
        # Get user_code from query params (GET) or request body (POST)
        user_code = None
        if request.method == "POST":
            data = request.get_json()
            user_code = data.get("user_code") if data else None
        else:
            user_code = request.args.get("user_code")
        
        user_preferences = load_user_preferences(user_code)
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
        data = request.get_json()
        user_code = data.get("user_code") if data else None
        preferences = load_user_preferences(user_code)
        logger.info("🔹 Received user preferences for template:\n%s", json.dumps(preferences, indent=2))

        system_prompt = """
You are a professional dietitian AI specializing in practical, balanced meal planning.
Your goal is to produce a meal template that a real person can cook and enjoy, while strictly hitting their daily calorie and macro targets using everyday ingredients.

INPUTS:
- daily_calories (kcal)
- daily_protein (g)
- daily_fat (g)
- daily_carbs (g)
- number_of_meals (integer)
- dietary_restrictions (e.g., kosher, vegetarian, gluten-free)
- food_allergies (list of foods/ingredients to avoid)
- client_preferences (likes/dislikes)

FOR EACH MEAL:
• Provide both a “main” and an “alternative.”  
• Include exactly these fields:  
  – name (string)  
  – calories (integer)  
  – protein (integer, g)  
  – fat (integer, g)  
  – carbs (integer, g)  
  – main_protein_source (string)

LOGIC & VALIDATION STEPS (iterate until all pass):
1. **Compute per-meal averages**:  
     per_cal   = daily_calories ÷ number_of_meals  
     per_pro   = daily_protein  ÷ number_of_meals  
     per_fat   = daily_fat      ÷ number_of_meals  
     per_carbs = daily_carbs    ÷ number_of_meals  

2. **Allergy & Limitation Check**:  
   - Remove or substitute any ingredient matching food_allergies.  
   - Enforce dietary_restrictions and any additional client_limitations (e.g., kosher, no pork, no shellfish, vegetarian).

3. **Meal-level check**:  
   For each meal and each macro (calories, protein, fat, carbs):  
   - IF value < per_avg × 0.70 OR > per_avg × 1.30  
       → ADJUST portion size or SWAP ingredient  
   - ENSURE no meal > 45% of any daily macro  

4. **Alternative match**:  
   - Alternatives must match mains within ±15% calories & protein, ±25% fat & carbs  
   - PRIORITIZE protein match first, then tweak fat/carbs  

5. **Daily total check**:  
   - Sum all meals → must be within ±5% of daily targets  
   - IF totals out of range  
       → ADJUST one or more meals (lean ⇒ higher or high ⇒ lean)  
       → RE-RUN all meal-level checks  

6. **Feasibility constraints**:  
   - ≤7 common ingredients per dish  
   - Only standard cooking methods (grill, bake, steam, sauté)  
   - Avoid powdered isolates unless explicitly allowed  

RESPONSE FORMAT:
Respond **only** with valid JSON:

{
  "template": [
    {
      "meal": "Breakfast",
      "main": {
        "name": "...",
        "calories": 0,
        "protein": 0,
        "fat": 0,
        "carbs": 0,
        "main_protein_source": "..."
      },
      "alternative": {
        "name": "...",
        "calories": 0,
        "protein": 0,
        "fat": 0,
        "carbs": 0,
        "main_protein_source": "..."
      }
    },
    … repeat for each meal …
  ]
}
"""






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
        user_code = data.get("user_code")
        preferences = load_user_preferences(user_code)
        if not template:
            return jsonify({"error": "Missing template"}), 400

        # ✅ Validate the template before building meals
        val_res = app.test_client().post("/api/validate-template", json={"template": template, "user_code": user_code})
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
                    "CRITICAL: You MUST strictly follow ALL dietary restrictions and limitations in the user preferences. "
                    "If user has 'kosher' limitation, you MUST follow kosher dietary laws: "
                    "- NEVER mix meat (chicken, beef, lamb, etc.) with dairy (milk, cream, cheese, yogurt, etc.) in the same meal "
                    "- Use only kosher-certified ingredients and brands "
                    "- Avoid non-kosher ingredients (pork, shellfish, etc.) "
                    "Provide: `meal_name`, `meal_title`, `ingredients` (list of objects with keys "
                    "`item`, ,`household_measure`, `calories`, `protein`, `fat`, `carbs`,`brand of pruduct`), "
                    "and `nutrition` (sum of ingredients). "
                    "IMPORTANT: For 'brand of pruduct', you MUST use real, specific brand names "
                    "NEVER use 'Generic' or 'generic' as a brand name."
                    "Macros must match the template within ±40%. Respond only with valid JSON."
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
                    "menu": [{"main": main_candidate}],
                    "user_code": user_code
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
                    "CRITICAL: You MUST strictly follow ALL dietary restrictions and limitations in the user preferences. "
                    "If user has 'kosher' limitation, you MUST follow kosher dietary laws: "
                    "- NEVER mix meat (chicken, beef, lamb, etc.) with dairy (milk, cream, cheese, yogurt, etc.) in the same meal "
                    "- Use only kosher-certified ingredients and brands "
                    "- Avoid non-kosher ingredients (pork, shellfish, etc.) "
                    "Provide: `meal_name`, `meal_title`, `ingredients` (list of objects with keys "
                    "`item`, ,`household_measure`, `calories`, `protein`, `fat`, `carbs`,`brand of pruduct`), "
                    "and `nutrition` (sum of ingredients). "
                    "IMPORTANT: For 'brand of pruduct', you MUST use real, specific brand names "
                    "NEVER use 'Generic' or 'generic' as a brand name."
                    "Macros must match the template within ±40%. Respond only with valid JSON."
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
                    "menu": [{"alternative": alt_candidate}],
                    "user_code": user_code
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
        
        # Return menu immediately without UPC codes
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
        
        logger.info(f"🔍 validate-template called with user_code: {user_code}")
        logger.info(f"🔍 Request data keys: {list(data.keys()) if data else 'None'}")
        
        preferences = load_user_preferences(user_code)

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
            if value is None:
                return 0.0
            try:
                return float(str(value).replace("g", "").strip())
            except (ValueError, TypeError):
                return 0.0

        # Safely get calories_per_day
        calories_per_day = preferences.get("calories_per_day", 2000)
        if calories_per_day is None:
            calories_per_day = 2000

        # Safely get macros with proper defaults
        macros = preferences.get("macros", {})
        if not macros:
            macros = {"protein": "150g", "fat": "80g", "carbs": "250g"}
        
        # Parse macros with fallbacks only if the macro is missing from user preferences
        target_macros = {
            "calories": float(calories_per_day),
            "protein": parse_macro(macros.get("protein", "150g")),
            "fat": parse_macro(macros.get("fat", "80g")), 
            "carbs": parse_macro(macros.get("carbs", "250g")),
        }
        
        # Add debug logging
        logger.info(f"🔍 Template validation using user_code: {user_code}")
        logger.info(f"🔍 Loaded preferences calories_per_day: {preferences.get('calories_per_day')}")
        logger.info(f"🔍 Raw macros from preferences: {macros}")
        logger.info(f"🔍 Parsed target_macros: {target_macros}")

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

def is_israeli_brand(brand):
    """
    Check if a brand is Israeli based on a list of known Israeli brands.
    """
    if not brand:
        return False
    
    israeli_brands = [
        "tnuva", "osem", "strauss", "elite", "telma", "bamba", "bissli", "krembo",
        "lechem eretz", "angel", "bagel bagel", "achla", "taboon", "dan cake",
        "kibutz galuyot", "shufersals", "machsanei hashuk", "tara", "shamir salads",
        "meshek tzuriel", "gad", "priniv", "yotvata", "shimrit", "tenuva",
        "emek", "milko", "para", "shoko", "cottage", "gamadim", "hashachar",
        "zoglovek", "wilke", "galil mountain", "carmel", "barkan", "golan heights",
        "dalton", "recanati", "tabor", "tulip", "yarden", "vita", "primor",
        "meshulam", "golden star", "kfar shaul", "hazirim", "hatzbani",
        "aviv", "masuah", "shemen", "mizra", "tivall", "achva", "halva kingdom"
    ]
    
    brand_lower = brand.lower().strip()
    return any(israeli_brand in brand_lower for israeli_brand in israeli_brands)

def prepare_upc_lookup_params(brand, name):
    """
    Prepare parameters for UPC lookup based on whether the brand is Israeli or not.
    """
    if not brand and not name:
        return None, None, None
    
    is_israeli = is_israeli_brand(brand)
    
    if is_israeli:
        # For Israeli products: combine brand and name but avoid duplication
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
        # For non-Israeli products: send brand and name separately
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
        
        if not menu:
            return jsonify({"error": "Missing menu data"}), 400
        
        logger.info("🔍 Starting UPC enrichment for menu...")
        
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
                            # Determine endpoint and parameters based on brand
                            endpoint_type, params, is_israeli = prepare_upc_lookup_params(brand, name)
                            
                            if not endpoint_type:
                                enriched_ing["UPC"] = None
                                app.logger.warning(f"No valid parameters for UPC lookup: brand={brand!r}, name={name!r}")
                                enriched_ingredients.append(enriched_ing)
                                continue
                            
                            # Choose the appropriate endpoint
                            if endpoint_type == "hebrew":
                                url = "https://dietitian-web.onrender.com/api/ingredient-upc-hebrew"
                                app.logger.info(f"Using Hebrew UPC endpoint for Israeli brand: {brand}")
                            else:
                                url = "https://dietitian-web.onrender.com/api/ingredient-upc"
                                app.logger.info(f"Using regular UPC endpoint for non-Israeli brand: {brand}")
                            
                            resp = requests.get(url, params=params, timeout=5)
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
        
        logger.info("✅ UPC enrichment completed.")
        return jsonify({"menu": enriched_menu})
        
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
        
        if not ingredients:
            return jsonify({"error": "Missing ingredients data"}), 400
        
        logger.info(f"🔍 Starting batch UPC lookup for {len(ingredients)} ingredients...")
        
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
                # Determine endpoint and parameters based on brand
                endpoint_type, params, is_israeli = prepare_upc_lookup_params(brand, name)
                
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
                    url = "https://dietitian-web.onrender.com/api/ingredient-upc-hebrew"
                    logger.info(f"Using Hebrew UPC endpoint for Israeli brand: {brand}")
                else:
                    url = "https://dietitian-web.onrender.com/api/ingredient-upc"
                    logger.info(f"Using regular UPC endpoint for non-Israeli brand: {brand}")
                
                # Use the appropriate UPC lookup service
                resp = requests.get(url, params=params, timeout=3)  # Shorter timeout for batch processing
                
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

    # Compose prompt for OpenAI
    system_prompt = (
        "You are a professional dietitian AI. Given a main meal, an existing alternative, and user preferences, generate a new, distinct alternative meal option. "
        "The new alternative should have similar calories and macros, but use different main ingredients than both the main and the current alternative. "
        "CRITICAL: You MUST strictly follow ALL dietary restrictions and limitations in the user preferences. "
        "If user has 'kosher' limitation, you MUST follow kosher dietary laws: "
        "- NEVER mix meat (chicken, beef, lamb, etc.) with dairy (milk, cream, cheese, yogurt, etc.) in the same meal "
        "- Use only kosher-certified ingredients and brands "
        "- Avoid non-kosher ingredients (pork, shellfish, etc.) "
        "IMPORTANT: For any brand names in ingredients, you MUST use real, specific brand names (e.g., 'Tnuva', 'Osem', 'Strauss', 'Elite'). "
        "NEVER use 'Generic' or 'generic' as a brand name. Always specify actual commercial brands available in Israel. "
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
            return jsonify(parsed)
        except Exception:
            logger.error(f"❌ JSON parse error for new alternative meal:\n{raw}")
            return jsonify({"error": "Invalid JSON from OpenAI", "raw": raw}), 500
    except Exception as e:
        logger.error(f"Error generating alternative meal: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
