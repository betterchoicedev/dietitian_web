# @app.route("/api/build-menu", methods=["POST"])
# def api_build_menu():
#     max_retries = 4  # Try 4 times before giving up
    
#     for attempt in range(1, max_retries + 1):
#         try:
#             logger.info(f"🔄 Attempt {attempt}/{max_retries} to build menu")
            
#             data = request.json
#             template = data.get("template")
#             user_code = data.get("user_code")
#             preferences = load_user_preferences(user_code)
#             if not template:
#                 return jsonify({"error": "Missing template"}), 400

#             # ✅ Validate the template before building meals
#             val_res = app.test_client().post("/api/validate-template", json={"template": template, "user_code": user_code})
#             val_data = val_res.get_json()

#             if not val_data.get("is_valid"):
#                 logger.warning("❌ Template validation failed on attempt %d: %s", attempt, {
#                     "main": val_data.get("issues_main"),
#                     "alternative": val_data.get("issues_alt"),
#                 })
                
#                 # If this is not the last attempt, try to regenerate the template
#                 if attempt < max_retries:
#                     logger.info(f"🔄 Template validation failed, regenerating template for attempt {attempt + 1}")
#                     try:
#                         # Call the template generation endpoint to get a new template
#                         template_res = app.test_client().post("/api/template", json={"user_code": user_code})
#                         if template_res.status_code == 200:
#                             template_data = template_res.get_json()
#                             if template_data.get("template"):
#                                 template = template_data.get("template")
#                                 logger.info(f"✅ Generated new template for attempt {attempt + 1}")
#                                 continue  # Try again with the new template
#                             else:
#                                 logger.error("❌ New template generation returned invalid data")
#                         else:
#                             logger.error(f"❌ Template regeneration failed with status {template_res.status_code}")
#                     except Exception as template_error:
#                         logger.error(f"❌ Error regenerating template: {template_error}")
                
#                 # If we've exhausted all attempts or template regeneration failed
#                 if attempt == max_retries:
#                     return jsonify({
#                         "error": "Template validation failed after all attempts",
#                         "validation": val_data,
#                         "attempts_made": max_retries,
#                         "failure_type": "template_validation_failed",
#                         "main_issues": val_data.get("issues_main", []),
#                         "alternative_issues": val_data.get("issues_alt", []),
#                         "main_alt_issues": val_data.get("issues_main_alt", []),
#                         "suggestion": "Try regenerating the template with different parameters"
#                     }), 400
#                 else:
#                     continue  # Try the next attempt

#             logger.info("🔹 Building menu meal by meal, option by option...")
#             full_menu = []

#             for template_meal in template:
#                 meal_name = template_meal.get("meal")

#                 # Build MAIN option
#                 main_built = None
#                 main_feedback = None
#                 main_macros = template_meal.get("main", {})
#                 main_protein_source = main_macros.get("main_protein_source")
#                 for main_attempt in range(6):
#                     logger.info(f"🧠 Building MAIN for meal '{meal_name}', attempt {main_attempt + 1}")
#                     # Get region-specific instructions
#                     region = preferences.get('region', 'israel').lower()
#                     region_instructions = {
#                         'israel': "Use Israeli products and brands (e.g., Tnuva, Osem, Strauss, Elite, Telma). Include local Israeli foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 250g containers, yogurt in 150g-200g containers, hummus in 400g containers, pita bread is typically 60-80g per piece, Israeli cheese slices are 20-25g each, Bamba comes in 80g bags, Bissli in 100g bags. Use realistic Israeli portion sizes.",
#                         'us': "Use American products and brands (e.g., Kraft, General Mills, Kellogg's, Pepsi). Include typical American foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 16oz (454g) containers, yogurt in 6-8oz (170-227g) containers, cream cheese in 8oz (227g) packages, American cheese slices are 21g each, bagels are 95-105g each.",
#                         'uk': "Use British products and brands (e.g., Tesco, Sainsbury's, Heinz UK, Cadbury). Include typical British foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 300g containers, yogurt in 150-170g pots, British cheese slices are 25g each, bread slices are 35-40g each.",
#                         'canada': "Use Canadian products and brands (e.g., Loblaws, President's Choice, Tim Hortons). Include typical Canadian foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 500g containers, yogurt in 175g containers, Canadian cheese slices are 22g each.",
#                         'australia': "Use Australian products and brands (e.g., Woolworths, Coles, Arnott's, Vegemite). Include typical Australian foods when appropriate. IMPORTANT PORTION GUIDELINES: Cottage cheese comes in 250g containers, yogurt in 170g tubs, Australian cheese slices are 25g each."
#                     }
#                     region_instruction = region_instructions.get(region, region_instructions['israel'])
                    
#                     main_prompt = (
#                         "You are a professional HEALTHY dietitian AI. "
#                         "Given a meal template for one meal and user preferences, build the **main option only** for this meal. "
#                         "The meal you generate MUST have the EXACT name as provided in 'meal_name'. "
#                         f"REGION-SPECIFIC REQUIREMENTS: {region_instruction} "
#                         "**CRITICAL HEALTHY DIETITIAN RULES:** "
#                         "• You are a HEALTHY dietitian - prioritize nutritious, whole foods over processed snacks "
#                         "• NEVER suggest unhealthy processed snacks (like BISLI, Bamba, chips, candy, cookies, etc.) unless the user EXPLICITLY requests them in their preferences "
#                         "• For snacks, always suggest healthy options like: fruits, vegetables, nuts, yogurt, cottage cheese, hummus, whole grain crackers, etc. "
#                         "• Only include unhealthy snacks if the user specifically mentions 'likes BISLI', 'loves chips', 'wants candy' etc. in their client_preferences "
#                         "• Even then, limit unhealthy snacks to maximum 1-2 times per week, not daily "
#                         "• Focus on balanced nutrition with whole foods, lean proteins, complex carbohydrates, and healthy fats "
#                         "**CRITICAL: ALWAYS GENERATE ALL CONTENT IN ENGLISH ONLY.** "
#                         "- All meal names, ingredient names, and descriptions must be in English "
#                         "- Do not use Hebrew, Arabic, or any other language "
#                         "- Use English names for all foods, brands, and cooking terms "
#                         "PREFERENCE LOGIC: If user 'likes' or 'loves' any food, consider it but DON'T overuse it. "
#                         "Ensure variety across all meals - avoid repeating main ingredients multiple times. "
#                         "CRITICAL: You MUST strictly follow ALL dietary restrictions and limitations in the user preferences. "
#                         "If user has 'kosher' limitation, you MUST follow kosher dietary laws: "
#                         "- NEVER mix meat (chicken, beef, lamb, etc.) with dairy (milk, cream, cheese, yogurt, etc.) in the same meal "
#                         "- Use only kosher-certified ingredients and brands "
#                         "- Avoid non-kosher ingredients (pork, shellfish, etc.) "
#                         "Provide: meal_name, meal_title, ingredients (list of objects with keys "
#                         "item, portionSI(gram), household_measure, calories, protein, fat, carbs,brand of pruduct), "
#                         "and nutrition (sum of ingredients). "
#                         "IMPORTANT: For 'brand of pruduct', you MUST use real, specific brand names "
#                         "NEVER use 'Generic' or 'generic' as a brand name. "
#                         "CRITICAL: For 'household_measure', use realistic portion sizes that match the region's packaging standards. "
#                         "For Israeli products: cottage cheese 250g containers, yogurt 150-200g containers, hummus 400g containers, etc. "
#                         "Macros must match the template EXACTLY (±0% tolerance). Respond only with valid JSON."
#                         "**CRITICAL MATHEMATICAL PRECISION:** "
#                         "• The meal's macros MUST follow the exact same percentage as its calories "
#                         "• Formula: meal_macro = (meal_calories / daily_calories) × daily_macro_target "
#                         "• Example: If meal = 629 calories (25% of 2516), then meal_protein = 25% × 189g = 47.25g "
#                         "• Use exact calculations, no rounding, no approximations "
#                         "• Every macro must add up perfectly to the target values "
#                         "Respond only with valid JSON."
#                     )
#                     main_content = {
#                         "meal_name": meal_name,
#                         "macro_targets": {
#                             "calories": main_macros.get("calories"),
#                             "protein": main_macros.get("protein"),
#                             "fat": main_macros.get("fat"),
#                             "carbs": main_macros.get("carbs"),
#                         },
#                         "main_protein_source": main_protein_source,
#                         "preferences": preferences,
#                         "INSTRUCTIONS": "Build only the main option as specified above."
#                     }
#                     if main_feedback:
#                         main_content["feedback"] = main_feedback

#                     response = openai.ChatCompletion.create(
#                         engine=deployment,
#                         messages=[
#                             {"role": "system", "content": main_prompt},
#                             {"role": "user", "content": json.dumps(main_content, ensure_ascii=False)}
#                         ],
#                         temperature=0.3
#                     )
#                     raw_main = response["choices"][0]["message"]["content"]
#                     try:
#                         parsed = json.loads(raw_main)
#                         main_candidate = parsed.get("main") or parsed  # GPT might just return the main object
#                         logger.info(f"✅ Successfully parsed JSON for MAIN '{meal_name}'")
#                     except json.JSONDecodeError as e:
#                         # logger.error(f"❌ JSON parse error for MAIN '{meal_name}': {e}\n{raw_main}")
#                         main_feedback = [f"Invalid JSON from GPT: {str(e)}"]
#                         continue
#                     except Exception as e:
#                         logger.error(f"❌ Unexpected error parsing JSON for MAIN '{meal_name}': {e}\n{raw_main}")
#                         main_feedback = [f"Unexpected error parsing JSON: {str(e)}"]
#                         continue

#                     # Validate main
#                     validate_payload = {
#                         "template": [{"main": main_macros}],
#                         "menu": [{"main": main_candidate}],
#                         "user_code": user_code
#                     }
#                     val_res = app.test_client().post(
#                         "/api/validate-menu",
#                         json=validate_payload
#                     )
#                     val_data = val_res.get_json()
#                     is_valid = val_data.get("is_valid")
#                     issues = val_data.get("issues", [])

#                     if is_valid:
#                         logger.info(f"✅ MAIN for meal '{meal_name}' passed validation.")
#                         main_built = main_candidate
#                         break
#                     else:
#                         logger.warning(f"❌ MAIN for meal '{meal_name}' failed validation: {issues}")
#                         main_feedback = issues

#                 if not main_built:
#                     logger.error(f"❌ Could not build valid MAIN for '{meal_name}' after 6 attempts.")
#                     # Return detailed feedback about the failure
#                     return jsonify({
#                         "error": f"Failed to build main option for '{meal_name}' after 6 attempts",
#                         "meal_name": meal_name,
#                         "target_macros": main_macros,
#                         "last_feedback": main_feedback,
#                         "attempts": 6,
#                         "failure_type": "main_option_build_failed"
#                     }), 400

#                 # Build ALTERNATIVE option
#                 alt_built = None
#                 alt_feedback = None
#                 alt_macros = template_meal.get("alternative", {})
#                 alt_protein_source = alt_macros.get("main_protein_source")
#                 for alt_attempt in range(6):
#                     logger.info(f"🧠 Building ALTERNATIVE for meal '{meal_name}', attempt {alt_attempt + 1}")
#                     alt_prompt = (
#                         "You are a professional HEALTHY dietitian AI. "
#                         "Given a meal template for one meal and user preferences, build the **alternative option only** for this meal. "
#                         "The meal you generate MUST have the EXACT name as provided in 'meal_name'. "
#                         f"REGION-SPECIFIC REQUIREMENTS: {region_instruction} "
#                         "**CRITICAL HEALTHY DIETITIAN RULES:** "
#                         "• You are a HEALTHY dietitian - prioritize nutritious, whole foods over processed snacks "
#                         "• NEVER suggest unhealthy processed snacks (like BISLI, Bamba, chips, candy, cookies, etc.) unless the user EXPLICITLY requests them in their preferences "
#                         "• For snacks, always suggest healthy options like: fruits, vegetables, nuts, yogurt, cottage cheese, hummus, whole grain crackers, etc. "
#                         "• Only include unhealthy snacks if the user specifically mentions 'likes BISLI', 'loves chips', 'wants candy' etc. in their client_preferences "
#                         "• Even then, limit unhealthy snacks to maximum 1-2 times per week, not daily "
#                         "• Focus on balanced nutrition with whole foods, lean proteins, complex carbohydrates, and healthy fats "
#                         "**CRITICAL: ALWAYS GENERATE ALL CONTENT IN ENGLISH ONLY.** "
#                         "- All meal names, ingredient names, and descriptions must be in English "
#                         "- Do not use Hebrew, Arabic, or any other language "
#                         "- Use English names for all foods, brands, and cooking terms "
#                         "PREFERENCE LOGIC: If user 'likes' or 'loves' any food, consider it but DON'T overuse it. "
#                         "Ensure variety across all meals - avoid repeating main ingredients multiple times. "
#                         "CRITICAL: You MUST strictly follow ALL dietary restrictions and limitations in the user preferences. "
#                         "If user has 'kosher' limitation, you MUST follow kosher dietary laws: "
#                         "- NEVER mix meat (chicken, beef, lamb, etc.) with dairy (milk, cream, cheese, yogurt, etc.) in the same meal "
#                         "- Use only kosher-certified ingredients and brands "
#                         "- Avoid non-kosher ingredients (pork, shellfish, etc.) "
#                         "Provide: meal_name, meal_title, ingredients (list of objects with keys "
#                         "item, portionSI(gram), household_measure, calories, protein, fat, carbs,brand of pruduct), "
#                         "and nutrition (sum of ingredients). "
#                         "IMPORTANT: For 'brand of pruduct', you MUST use real, specific brand names "
#                         "NEVER use 'Generic' or 'generic' as a brand name. "
#                         "CRITICAL: For 'household_measure', use realistic portion sizes that match the region's packaging standards. "
#                         "For Israeli products: cottage cheese 250g containers, yogurt 150-200g containers, hummus 400g containers, etc. "
#                         "Macros must match the template EXACTLY (±0% tolerance). Respond only with valid JSON."
#                         "**CRITICAL MATHEMATICAL PRECISION:** "
#                         "• The meal's macros MUST follow the exact same percentage as its calories "
#                         "• Formula: meal_macro = (meal_calories / daily_calories) × daily_macro_target "
#                         "• Example: If meal = 629 calories (25% of 2516), then meal_protein = 25% × 189g = 47.25g "
#                         "• Use exact calculations, no rounding, no approximations "
#                         "• Every macro must add up perfectly to the target values "
#                         "Respond only with valid JSON."
#                     )
#                     alt_content = {
#                         "meal_name": meal_name,
#                         "macro_targets": {
#                             "calories": alt_macros.get("calories"),
#                             "protein": alt_macros.get("protein"),
#                             "fat": alt_macros.get("fat"),
#                             "carbs": alt_macros.get("carbs"),
#                         },
#                         "main_protein_source": alt_protein_source,
#                         "preferences": preferences,
#                         "INSTRUCTIONS": "Build only the alternative option as specified above."
#                     }
#                     if alt_feedback:
#                         alt_content["feedback"] = alt_feedback

#                     response = openai.ChatCompletion.create(
#                         engine=deployment,
#                         messages=[
#                             {"role": "system", "content": alt_prompt},
#                             {"role": "user", "content": json.dumps(alt_content, ensure_ascii=False)}
#                         ],
#                         temperature=0.3
#                     )
#                     raw_alt = response["choices"][0]["message"]["content"]
#                     try:
#                         parsed = json.loads(raw_alt)
#                         alt_candidate = parsed.get("alternative") or parsed  # GPT might just return the alt object
#                         logger.info(f"✅ Successfully parsed JSON for ALTERNATIVE '{meal_name}'")
#                     except json.JSONDecodeError as e:
#                         logger.error(f"❌ JSON parse error for ALTERNATIVE '{meal_name}': {e}\n{raw_alt}")
#                         alt_feedback = [f"Invalid JSON from GPT: {str(e)}"]
#                         continue
#                     except Exception as e:
#                         logger.error(f"❌ Unexpected error parsing JSON for ALTERNATIVE '{meal_name}': {e}\n{raw_alt}")
#                         alt_feedback = [f"Unexpected error parsing JSON: {str(e)}"]
#                         continue

#                     # Validate alternative
#                     validate_payload = {
#                         "template": [{"alternative": alt_macros}],
#                         "menu": [{"alternative": alt_candidate}],
#                         "user_code": user_code
#                     }
#                     val_res = app.test_client().post(
#                         "/api/validate-menu",
#                         json=validate_payload
#                     )
#                     val_data = val_res.get_json()
#                     is_valid = val_data.get("is_valid")
#                     issues = val_data.get("issues", [])

#                     if is_valid:
#                         logger.info(f"✅ ALTERNATIVE for meal '{meal_name}' passed validation.")
#                         alt_built = alt_candidate
#                         break
#                     else:
#                         logger.warning(f"❌ ALTERNATIVE for meal '{meal_name}' failed validation: {issues}")
#                         alt_feedback = issues

#                 if not alt_built:
#                     logger.error(f"❌ Could not build valid ALTERNATIVE for '{meal_name}' after 6 attempts.")
#                     # Return detailed feedback about the failure
#                     return jsonify({
#                         "error": f"Failed to build alternative option for '{meal_name}' after 6 attempts",
#                         "meal_name": meal_name,
#                         "target_macros": alt_macros,
#                         "last_feedback": alt_feedback,
#                         "attempts": 6,
#                         "failure_type": "alternative_option_build_failed"
#                     }), 400

#                 # Combine into meal entry
#                 meal_obj = {
#                     "meal": meal_name,
#                     "main": main_built,
#                     "alternative": alt_built
#                 }
#                 full_menu.append(meal_obj)

#             logger.info("✅ Finished building full menu.")
#             totals = calculate_totals(full_menu)
            
#             # Clean ingredient names before returning
#             cleaned_menu = clean_ingredient_names(full_menu)
            
#             # Return menu immediately without UPC codes
#             logger.info("Full menu built: %s", json.dumps({"menu": cleaned_menu, "totals": totals}, ensure_ascii=False, indent=2))
#             return jsonify({"menu": cleaned_menu, "totals": totals})
            
#         except Exception as e:
#             logger.error("❌ Exception in /api/build-menu (attempt %d):\n%s", attempt, traceback.format_exc())
#             if attempt == max_retries:
#                 return jsonify({
#                     "error": f"Menu build failed after {max_retries} attempts",
#                     "exception": str(e),
#                     "attempt": attempt,
#                     "max_retries": max_retries,
#                     "failure_type": "exception_during_build",
#                     "traceback": traceback.format_exc()
#                 }), 500
#             else:
#                 logger.info(f"🔄 Retrying menu build due to exception...")
#                 continue
    
#     # If we get here, all attempts failed
#     logger.error("❌ All %d attempts to build menu failed", max_retries)
#     return jsonify({
#         "error": f"Menu build failed after {max_retries} attempts",
#         "attempts_made": max_retries,
#         "failure_type": "all_attempts_exhausted",
#         "suggestion": "Try regenerating the template or adjusting user preferences"
#     }), 500


# @app.route("/api/validate-menu", methods=["POST"])
# def api_validate_menu():
#     try:
#         data = request.json
#         template = data.get("template")
#         menu = data.get("menu")
#         user_code = data.get("user_code")

#         if not template or not menu or not isinstance(template, list) or not isinstance(menu, list):
#             return jsonify({"is_valid": False, "issues": ["Missing or invalid template/menu"]}), 400

#         # Load user preferences for dietary restrictions
#         preferences = None
#         try:
#             preferences = load_user_preferences(user_code)
#         except Exception as e:
#             logger.warning(f"Could not load user preferences for validation: {e}")
#             preferences = {"limitations": []}

#         macros = ["calories", "protein", "fat"]

#         def get_allowed_margin(val):
#             val = float(val)
#             if val <= 10:
#                 return 0.6
#             elif val <= 20:
#                 return 0.5
#             elif val <= 30:
#                 return 0.4
#             else:
#                 return 0.3  # 30% margin for anything above 30

#         def validate_kosher_ingredients(ingredients, limitations):
#             """Validate kosher compliance for ingredients"""
#             if "kosher" not in [limit.lower() for limit in limitations]:
#                 return []
            
#             kosher_issues = []
            
#             # Define meat and dairy ingredients
#             meat_items = ["chicken", "beef", "lamb", "turkey", "duck", "meat", "poultry"]
#             dairy_items = ["milk", "cream", "cheese", "yogurt", "butter", "dairy", "parmesan", "mozzarella", "ricotta", "cottage cheese"]
#             non_kosher_items = ["pork", "bacon", "ham", "shellfish", "shrimp", "lobster", "crab", "clam", "oyster", "scallop"]
            
#             has_meat = False
#             has_dairy = False
#             meat_ingredients = []
#             dairy_ingredients = []
            
#             for ingredient in ingredients:
#                 item_name = ingredient.get("item", "").lower()
                
#                 # Check for non-kosher ingredients
#                 for non_kosher in non_kosher_items:
#                     if non_kosher in item_name:
#                         kosher_issues.append(f"Non-kosher ingredient detected: {ingredient.get('item', '')}")
                
#                 # Check for meat
#                 for meat in meat_items:
#                     if meat in item_name:
#                         has_meat = True
#                         meat_ingredients.append(ingredient.get("item", ""))
#                         break
                
#                 # Check for dairy
#                 for dairy in dairy_items:
#                     if dairy in item_name:
#                         has_dairy = True
#                         dairy_ingredients.append(ingredient.get("item", ""))
#                         break
            
#             # Check for meat + dairy violation
#             if has_meat and has_dairy:
#                 kosher_issues.append(f"KOSHER VIOLATION: Cannot mix meat and dairy in the same meal. Found meat: {', '.join(meat_ingredients)} and dairy: {', '.join(dairy_ingredients)}")
            
#             return kosher_issues

#         issues = []

#         # --- Main option feedback ---
#         template_main = template[0].get("main")
#         menu_main = menu[0].get("main")
#         if template_main and menu_main:
#             # Validate nutritional macros
#             for macro in macros:
#                 tmpl_val = float(template_main.get(macro, 0))
#                 menu_val = float(menu_main.get("nutrition", {}).get(macro, 0))
#                 if tmpl_val == 0:
#                     continue
#                 margin = get_allowed_margin(tmpl_val)
#                 if abs(menu_val - tmpl_val) / tmpl_val > margin:
#                     direction = "Reduce" if menu_val > tmpl_val else "Increase"
#                     issues.append(
#                         f"{macro.capitalize()} is out of range for main: got {menu_val}g, target is {tmpl_val}g (allowed ±{int(margin*100)}%). {direction} {macro.lower()} ingredients."
#                     )
            
#             # Validate kosher compliance for main
#             main_ingredients = menu_main.get("ingredients", [])
#             kosher_issues_main = validate_kosher_ingredients(main_ingredients, preferences.get("limitations", []))
#             if kosher_issues_main:
#                 issues.extend([f"Main option: {issue}" for issue in kosher_issues_main])

#         # --- Alternative option feedback ---
#         template_alt = template[0].get("alternative")
#         menu_alt = menu[0].get("alternative")
#         if template_alt and menu_alt:
#             # Validate nutritional macros
#             for macro in macros:
#                 tmpl_val = float(template_alt.get(macro, 0))
#                 menu_val = float(menu_alt.get("nutrition", {}).get(macro, 0))
#                 if tmpl_val == 0:
#                     continue
#                 margin = get_allowed_margin(tmpl_val)
#                 if abs(menu_val - tmpl_val) / tmpl_val > margin:
#                     direction = "Reduce" if menu_val > tmpl_val else "Increase"
#                     issues.append(
#                         f"{macro.capitalize()} is out of range for alternative: got {menu_val}g, target is {tmpl_val}g (allowed ±{int(margin*100)}%). {direction} {macro.lower()} ingredients."
#                     )
            
#             # Validate kosher compliance for alternative
#             alt_ingredients = menu_alt.get("ingredients", [])
#             kosher_issues_alt = validate_kosher_ingredients(alt_ingredients, preferences.get("limitations", []))
#             if kosher_issues_alt:
#                 issues.extend([f"Alternative option: {issue}" for issue in kosher_issues_alt])

#         is_valid = len(issues) == 0

#         return jsonify({
#             "is_valid": is_valid,
#             "issues": issues,
#         })

#     except Exception as e:
#         logger.error("❌ Exception in /api/validate-menu:\n%s", traceback.format_exc())
#         return jsonify({"is_valid": False, "issues": [str(e)]}), 500
