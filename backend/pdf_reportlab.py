"""
ReportLab PDF Generation - Saved for future work
This file contains the ReportLab-based PDF generation code that was being developed.
"""

import io
import platform
import os
import re
import datetime
import logging

try:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
    from reportlab.lib.enums import TA_RIGHT, TA_LEFT, TA_CENTER
    from reportlab.lib.colors import HexColor
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

# Import libraries for Hebrew text support
try:
    from bidi.algorithm import get_display
    from arabic_reshaper import reshape
    BIDI_SUPPORT = True
except ImportError:
    BIDI_SUPPORT = False

logger = logging.getLogger(__name__)


def _register_hebrew_fonts():
    """Register Hebrew-capable fonts with ReportLab"""
    if not REPORTLAB_AVAILABLE:
        return None
    
    # Try to find and register Hebrew-capable fonts
    font_paths = []
    
    if platform.system() == "Windows":
        # Windows font paths
        font_paths = [
            r"C:\Windows\Fonts\arial.ttf",  # Arial (supports Hebrew)
            r"C:\Windows\Fonts\arialuni.ttf",  # Arial Unicode MS (full Unicode support)
            r"C:\Windows\Fonts\calibri.ttf",  # Calibri (supports Hebrew)
        ]
    elif platform.system() == "Darwin":  # macOS
        font_paths = [
            "/Library/Fonts/Arial.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
    else:  # Linux
        font_paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
    
    # Try to register a Hebrew-capable font
    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont('HebrewFont', font_path))
                logger.info(f"Registered Hebrew font: {font_path}")
                return 'HebrewFont'
            except Exception as e:
                logger.warning(f"Failed to register font {font_path}: {e}")
                continue
    
    logger.warning("No Hebrew-capable font found. Hebrew text may not render correctly.")
    return None


def _build_pdf_content(menu, version="portrait", remove_brands=False):
    """Build PDF content using ReportLab with proper Hebrew/RTL support - compact single page layout"""
    
    if not REPORTLAB_AVAILABLE:
        raise ImportError("ReportLab not available")
    
    story = []
    styles = getSampleStyleSheet()
    
    # Get Hebrew font name if available
    hebrew_font_name = None
    try:
        if 'HebrewFont' in pdfmetrics.getRegisteredFontNames():
            hebrew_font_name = 'HebrewFont'
    except:
        pass
    
    # Calculate number of meals and ingredients per meal for dynamic sizing
    num_meals = len(menu.get("meals", []))
    # Count total ingredients and structure per meal
    meals_data = []
    total_ingredients = 0
    for meal in menu.get("meals", []):
        main_ings = len(meal.get("main", {}).get("ingredients", []))
        # Count ingredients from singular alternative
        alternative = meal.get("alternative", {})
        alt_ings = len(alternative.get("ingredients", [])) if alternative and alternative.get("meal_title") else 0
        # Also count ingredients from alternatives array (plural) - store per alternative
        alternatives_array = meal.get("alternatives", [])
        additional_alt_ings = 0
        alt_ing_counts = []  # Store ingredient count per alternative
        if alternatives_array and isinstance(alternatives_array, list):
            for alt_option in alternatives_array:
                ing_count = len(alt_option.get("ingredients", []))
                additional_alt_ings += ing_count
                alt_ing_counts.append(ing_count)
        total_ingredients += main_ings + alt_ings + additional_alt_ings
        meals_data.append({
            'main_ings': main_ings,
            'alt_ings': alt_ings,
            'additional_alt_ings': additional_alt_ings,
            'alt_ing_counts': alt_ing_counts,  # Per-alternative ingredient counts
            'num_additional_alts': len(alternatives_array) if alternatives_array else 0,
            'total_ings': main_ings + alt_ings + additional_alt_ings,
            'meal': meal  # Store reference to meal for accurate calculation
        })
    
    # A4 portrait: 297mm height, with 8mm margins = 281mm available
    available_height_mm = 281  # A4 height - margins
    
    # Start with larger font sizes - use spacing to fill page, not smaller fonts
    header_font = 14
    user_font = 14
    totals_font = 13
    meal_title_font = 15
    dish_title_font = 13
    ingredient_font = 11.5
    ing_spacing = 2
    dish_spacing = 2
    
    # Calculate fixed section heights (header, user, totals)
    # Header table: ~12mm (font + padding)
    # User name: ~5mm (font + spacing)
    # Totals: ~10mm (font + padding + spacing)
    fixed_section_height = 27  # Header + user + totals
    
    # Calculate total content height for all meals with current font sizes
    def calculate_content_height(fonts, spacing):
        h_font, u_font, t_font, m_font, d_font, i_font = fonts
        i_sp, d_sp = spacing
        total = 0
        for meal_data in meals_data:
            meal_title_h = m_font + 4  # padding
            main_dish_h = d_font + 2  # padding
            main_ings_h = meal_data['main_ings'] * (i_font + i_sp)
            meal_h = meal_title_h + main_dish_h + main_ings_h
            # Singular alternative (only if it exists)
            if meal_data['alt_ings'] > 0:
                alt_dish_h = d_font + 2  # padding
                alt_ings_h = meal_data['alt_ings'] * (i_font + i_sp)
                meal_h += d_sp + alt_dish_h + alt_ings_h
            # Additional alternatives from array (each has dish title + ingredients)
            num_additional_alts = meal_data.get('num_additional_alts', 0)
            if num_additional_alts > 0:
                # Each additional alternative: dish title + ingredients + spacing
                alt_ing_counts = meal_data.get('alt_ing_counts', [])
                for alt_idx in range(num_additional_alts):
                    meal_h += d_sp  # spacing before this alternative
                    meal_h += d_font + 2  # dish title
                    # Use actual ingredient count for this specific alternative
                    if alt_idx < len(alt_ing_counts):
                        ing_count = alt_ing_counts[alt_idx]
                    else:
                        # Fallback: average if count not available
                        ing_count = meal_data.get('additional_alt_ings', 0) / num_additional_alts if num_additional_alts > 0 else 0
                    meal_h += ing_count * (i_font + i_sp)  # ingredients
            total += meal_h
        return total
    
    # Try with base sizes first
    total_content_height = calculate_content_height(
        (header_font, user_font, totals_font, meal_title_font, dish_title_font, ingredient_font),
        (ing_spacing, dish_spacing)
    )
    
    meals_available_height = available_height_mm - fixed_section_height
    
    # Add safety buffer (5%) to account for rendering differences and ensure it fits
    safety_buffer = meals_available_height * 0.05
    effective_available_height = meals_available_height - safety_buffer
    remaining_space = effective_available_height - total_content_height
    
    # Calculate total number of alternatives to determine if we need more aggressive reduction
    total_alternatives = sum(1 for m in meals_data if m['alt_ings'] > 0)  # Count meals with singular alternative
    total_alternatives += sum(m.get('num_additional_alts', 0) for m in meals_data)  # Count additional alternatives
    
    # More aggressive reduction if there are many alternatives
    # If there are many alternatives, ALWAYS reduce fonts to ensure it fits
    if total_alternatives > 6:
        # Many alternatives - ALWAYS reduce fonts to ensure fit
        reduction_needed = True
    else:
        # Normal case - only reduce if way over
        reduction_needed = remaining_space < -20
    
    # Reduce fonts if needed - iterate until it fits
    max_iterations = 3
    iteration = 0
    
    while (reduction_needed or remaining_space < 0) and iteration < max_iterations:
        iteration += 1
        
        # Content way too dense - need to reduce slightly
        scale_factor = effective_available_height / total_content_height
        
        # More aggressive reduction if many alternatives
        if total_alternatives > 6:
            # Many alternatives - need more aggressive reduction
            if scale_factor < 0.7:
                meal_title_font = 12
                dish_title_font = 10
                ingredient_font = 8.5
                ing_spacing = 1
                dish_spacing = 1.1
            elif scale_factor < 0.8:
                meal_title_font = 12.5
                dish_title_font = 10.5
                ingredient_font = 9
                ing_spacing = 1.2
                dish_spacing = 1.3
            else:
                meal_title_font = 13
                dish_title_font = 11
                ingredient_font = 9.5
                ing_spacing = 1.4
                dish_spacing = 1.5
        else:
            # Normal reduction
            if scale_factor < 0.65:
                # Extremely dense - reduce but keep readable
                meal_title_font = 13.5
                dish_title_font = 11.5
                ingredient_font = 10.5
                ing_spacing = 1.5
                dish_spacing = 1.6
            elif scale_factor < 0.75:
                # Very dense - small reduction
                meal_title_font = 14
                dish_title_font = 12
                ingredient_font = 11
                ing_spacing = 1.8
                dish_spacing = 1.9
            else:
                # Dense - minimal reduction
                meal_title_font = 14.5
                dish_title_font = 12.5
                ingredient_font = 11.5
                ing_spacing = 2
                dish_spacing = 2
        
        # Recalculate with new sizes
        total_content_height = calculate_content_height(
            (header_font, user_font, totals_font, meal_title_font, dish_title_font, ingredient_font),
            (ing_spacing, dish_spacing)
        )
        remaining_space = effective_available_height - total_content_height
        
        # Check if we need another iteration
        if remaining_space < 0 and iteration < max_iterations:
            # Still doesn't fit, reduce more aggressively
            scale_factor = effective_available_height / total_content_height
            
            if scale_factor < 0.9:
                # Reduce fonts further
                meal_title_font = max(10, meal_title_font - 0.5)
                dish_title_font = max(8, dish_title_font - 0.5)
                ingredient_font = max(7, ingredient_font - 0.5)
                ing_spacing = max(0.8, ing_spacing - 0.2)
                dish_spacing = max(0.8, dish_spacing - 0.2)
                
                # Recalculate again
                total_content_height = calculate_content_height(
                    (header_font, user_font, totals_font, meal_title_font, dish_title_font, ingredient_font),
                    (ing_spacing, dish_spacing)
                )
                remaining_space = effective_available_height - total_content_height
            else:
                break
        else:
            break
    
    # Distribute remaining space evenly between meals
    # We need: space after totals + space between each meal (num_meals - 1)
    if num_meals > 0:
        num_gaps = num_meals  # One after totals + (num_meals - 1) between meals
        if remaining_space > 0:
            # Distribute extra space evenly - use generous spacing to fill page
            meal_spacing = max(3, remaining_space / num_gaps)  # Minimum 3mm spacing, distribute evenly
            spacing_after_totals = meal_spacing
        else:
            # No extra space, use minimal spacing but keep readable
            meal_spacing = 2
            spacing_after_totals = 2
    else:
        meal_spacing = 2
        spacing_after_totals = 2
    
    # Detect Hebrew content
    def contains_hebrew(text):
        if not text:
            return False
        return bool(re.search(r'[\u0590-\u05FF]', str(text)))
    
    has_hebrew = any(
        contains_hebrew(meal.get("meal")) or
        contains_hebrew(meal.get("main", {}).get("meal_title")) or
        contains_hebrew(meal.get("alternative", {}).get("meal_title")) or
        any(contains_hebrew(ing.get("item")) for ing in meal.get("main", {}).get("ingredients", [])) or
        any(contains_hebrew(ing.get("item")) for ing in meal.get("alternative", {}).get("ingredients", [])) or
        any(
            any(contains_hebrew(ing.get("item")) for ing in alt_option.get("ingredients", []))
            for alt_option in meal.get("alternatives", [])
        )
        for meal in menu.get("meals", [])
    )
    
    # Use bidi algorithm for Hebrew text if available
    def format_text(text, is_hebrew=False):
        if not text:
            return ""
        text_str = str(text)
        if is_hebrew and BIDI_SUPPORT:
            try:
                reshaped_text = reshape(text_str)
                return get_display(reshaped_text)
            except:
                return text_str
        return text_str
    
    # Define compact styles with Hebrew font if available
    font_name = hebrew_font_name if (has_hebrew and hebrew_font_name) else 'Helvetica'
    
    # Color scheme
    dark_green = HexColor('#2d5016')
    medium_green = HexColor('#4CAF50')
    light_green_bg = HexColor('#e8f5e8')
    lighter_green_bg = HexColor('#f0f8f0')
    dark_text = HexColor('#333333')
    gray_text = HexColor('#666666')
    
    # Compact header style - dynamic sizing
    header_compact_style = ParagraphStyle(
        'HeaderCompact',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=header_font,
        textColor=dark_green,
        alignment=TA_RIGHT if has_hebrew else TA_LEFT,
        spaceAfter=1,
    )
    
    # User name style - dynamic sizing
    user_name_style = ParagraphStyle(
        'UserName',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=user_font,
        textColor=medium_green,
        alignment=TA_RIGHT if has_hebrew else TA_LEFT,
        spaceAfter=1,
    )
    
    # Daily totals style (with background) - dynamic sizing
    totals_style = ParagraphStyle(
        'Totals',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=totals_font,
        textColor=dark_text,
        alignment=TA_CENTER,
        spaceAfter=meal_spacing * 2,
        backColor=lighter_green_bg,
        borderPadding=3,
    )
    
    # Meal title style (compact with green color) - dynamic sizing
    meal_title_style = ParagraphStyle(
        'MealTitle',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=meal_title_font,
        textColor=dark_green,
        alignment=TA_RIGHT if has_hebrew else TA_LEFT,
        spaceAfter=0,
        spaceBefore=meal_spacing,
        backColor=lighter_green_bg,
        borderPadding=2,
    )
    
    # Dish title style (compact) - dynamic sizing
    dish_title_style = ParagraphStyle(
        'DishTitle',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=dish_title_font,
        textColor=dark_text,
        alignment=TA_RIGHT if has_hebrew else TA_LEFT,
        spaceAfter=0,
        leftIndent=5 if not has_hebrew else 0,
        rightIndent=5 if has_hebrew else 0,
    )
    
    # Ingredient style (very compact) - dynamic sizing
    ingredient_style = ParagraphStyle(
        'Ingredient',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=ingredient_font,
        textColor=gray_text,
        alignment=TA_RIGHT if has_hebrew else TA_LEFT,
        spaceAfter=ing_spacing,
        leftIndent=8 if not has_hebrew else 0,
        rightIndent=8 if has_hebrew else 0,
        leading=ingredient_font + 1,  # Tight line spacing
    )
    
    # Header row - Date and Title
    today = datetime.datetime.now()
    date_str = today.strftime("%d %B %Y") if has_hebrew else today.strftime("%B %d, %Y")
    user_name = menu.get("user_name", "Client")
    title_text = format_text("תפריט אישי" if has_hebrew else "Personal Meal Plan", has_hebrew)
    
    # Create header table with background color
    header_data = [[
        Paragraph(format_text(date_str, has_hebrew), header_compact_style),
        Paragraph(title_text, header_compact_style)
    ]]
    header_table = Table(header_data, colWidths=[90*mm, 90*mm])
    header_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT' if has_hebrew else 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('BACKGROUND', (0, 0), (-1, -1), light_green_bg),
    ]))
    story.append(header_table)
    story.append(Paragraph(format_text(user_name, has_hebrew), user_name_style))
    story.append(Spacer(1, max(1, meal_spacing * 0.5)))
    
    # Daily Totals (compact with background)
    totals = menu.get("totals", {})
    totals_text = f"{totals.get('calories', 0)} kcal | P: {totals.get('protein', 0)}g | F: {totals.get('fat', 0)}g | C: {totals.get('carbs', 0)}g"
    # Create totals table with background - compact
    totals_data = [[Paragraph(format_text(totals_text, has_hebrew), totals_style)]]
    totals_table = Table(totals_data, colWidths=[180*mm])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (-1, -1), lighter_green_bg),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [lighter_green_bg]),
    ]))
    story.append(totals_table)
    # Add calculated spacing after totals
    story.append(Spacer(1, spacing_after_totals))
    
    # Meals - compact layout with styling
    meals_list = menu.get("meals", [])
    for meal_idx, meal in enumerate(meals_list):
        meal_name = format_text(meal.get("meal", ""), has_hebrew)
        # Meal title with background
        meal_title_data = [[Paragraph(meal_name, meal_title_style)]]
        meal_title_table = Table(meal_title_data, colWidths=[180*mm])
        meal_title_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT' if has_hebrew else 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BACKGROUND', (0, 0), (-1, -1), lighter_green_bg),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMBORDER', (0, 0), (-1, -1), 1, medium_green),
        ]))
        story.append(meal_title_table)
        story.append(Spacer(1, dish_spacing))
        
        # Main option
        main = meal.get("main", {})
        main_title = format_text(main.get("meal_title", ""), has_hebrew)
        main_nutrition = main.get("nutrition", {})
        main_nutrition_text = f"({main_nutrition.get('calories', 0)} kcal)"
        
        # Main dish with light background
        main_dish_data = [[Paragraph(f"<b>{main_title}</b> {main_nutrition_text}", dish_title_style)]]
        main_dish_table = Table(main_dish_data, colWidths=[180*mm])
        main_dish_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT' if has_hebrew else 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BACKGROUND', (0, 0), (-1, -1), HexColor('#e6f9f0')),  # Light green for main
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        story.append(main_dish_table)
        
        # Main ingredients (compact) - show ALL ingredients
        for ing in main.get("ingredients", []):
            item = format_text(ing.get("item", ""), has_hebrew)
            measure = format_text(ing.get("household_measure", ""), has_hebrew)
            brand = ing.get("brand of pruduct", "")
            if remove_brands or not brand:
                ing_text = f"• {item} - {measure}"
            else:
                ing_text = f"• {item} ({format_text(brand, has_hebrew)}) - {measure}"
            story.append(Paragraph(ing_text, ingredient_style))
        
        story.append(Spacer(1, dish_spacing))
        
        # Alternative option - check if it exists and has content
        alternative = meal.get("alternative", {})
        if alternative and alternative.get("meal_title"):
            alt_title = format_text(alternative.get("meal_title", ""), has_hebrew)
            alt_nutrition = alternative.get("nutrition", {})
            alt_nutrition_text = f"({alt_nutrition.get('calories', 0)} kcal)"
            
            # Alternative dish with different light background
            alt_dish_data = [[Paragraph(f"<b>{alt_title}</b> {alt_nutrition_text}", dish_title_style)]]
            alt_dish_table = Table(alt_dish_data, colWidths=[180*mm])
            alt_dish_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'RIGHT' if has_hebrew else 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BACKGROUND', (0, 0), (-1, -1), HexColor('#e0f2fe')),  # Light blue for alternative
                ('LEFTPADDING', (0, 0), (-1, -1), 3),
                ('RIGHTPADDING', (0, 0), (-1, -1), 3),
                ('TOPPADDING', (0, 0), (-1, -1), 1),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            ]))
            story.append(alt_dish_table)
            
            # Alternative ingredients (compact) - show ALL ingredients
            for ing in alternative.get("ingredients", []):
                item = format_text(ing.get("item", ""), has_hebrew)
                measure = format_text(ing.get("household_measure", ""), has_hebrew)
                brand = ing.get("brand of pruduct", "")
                if remove_brands or not brand:
                    ing_text = f"• {item} - {measure}"
                else:
                    ing_text = f"• {item} ({format_text(brand, has_hebrew)}) - {measure}"
                story.append(Paragraph(ing_text, ingredient_style))
        
        # Also handle additional alternatives array if it exists
        alternatives_array = meal.get("alternatives", [])
        if alternatives_array and isinstance(alternatives_array, list):
            for alt_idx, alt_option in enumerate(alternatives_array):
                if alt_option and alt_option.get("meal_title"):
                    story.append(Spacer(1, dish_spacing))
                    alt_title = format_text(alt_option.get("meal_title", ""), has_hebrew)
                    alt_nutrition = alt_option.get("nutrition", {})
                    alt_nutrition_text = f"({alt_nutrition.get('calories', 0)} kcal)"
                    
                    # Alternative dish with different light background
                    alt_dish_data = [[Paragraph(f"<b>{alt_title}</b> {alt_nutrition_text}", dish_title_style)]]
                    alt_dish_table = Table(alt_dish_data, colWidths=[180*mm])
                    alt_dish_table.setStyle(TableStyle([
                        ('ALIGN', (0, 0), (-1, -1), 'RIGHT' if has_hebrew else 'LEFT'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('BACKGROUND', (0, 0), (-1, -1), HexColor('#e0f2fe')),  # Light blue for alternative
                        ('LEFTPADDING', (0, 0), (-1, -1), 3),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
                        ('TOPPADDING', (0, 0), (-1, -1), 1),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                    ]))
                    story.append(alt_dish_table)
                    
                    # Alternative ingredients (compact) - show ALL ingredients
                    for ing in alt_option.get("ingredients", []):
                        item = format_text(ing.get("item", ""), has_hebrew)
                        measure = format_text(ing.get("household_measure", ""), has_hebrew)
                        brand = ing.get("brand of pruduct", "")
                        if remove_brands or not brand:
                            ing_text = f"• {item} - {measure}"
                        else:
                            ing_text = f"• {item} ({format_text(brand, has_hebrew)}) - {measure}"
                        story.append(Paragraph(ing_text, ingredient_style))
        
        # Add spacing after meal (except last one) - use calculated meal_spacing
        if meal_idx < len(meals_list) - 1:
            story.append(Spacer(1, meal_spacing))
    
    return story


def generate_pdf_reportlab(menu, version="portrait", remove_brands=False):
    """
    Generate PDF from menu JSON using ReportLab (server-side).
    This method handles Hebrew/RTL text with proper font support.
    
    Returns: PDF bytes (BytesIO object)
    
    NOTE: This is saved for future development. Currently not in use.
    """
    if not REPORTLAB_AVAILABLE:
        raise ImportError("ReportLab not available. Please install: pip install reportlab")
    
    # Register Hebrew-capable fonts if available
    _register_hebrew_fonts()
    
    # Create PDF in memory - always portrait, fit to one page
    pdf_bytes = io.BytesIO()
    # Always use portrait for single page
    page_size = A4
    
    # Minimal margins to maximize content area
    doc = SimpleDocTemplate(
        pdf_bytes, 
        pagesize=page_size, 
        rightMargin=8*mm, 
        leftMargin=8*mm, 
        topMargin=8*mm, 
        bottomMargin=8*mm,
        allowSplitting=0  # Try to keep content together
    )
    
    # Build PDF content
    story = _build_pdf_content(menu, version, remove_brands)
    
    # Generate PDF
    doc.build(story)
    pdf_bytes.seek(0)
    
    return pdf_bytes
