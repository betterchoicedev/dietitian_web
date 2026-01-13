"""
Supabase API Routes
This module provides REST API endpoints for all Supabase database operations.
Replaces direct Supabase calls from the frontend with backend API calls.
"""

from flask import Blueprint, jsonify, request
from supabase import create_client, Client
import os
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Create Blueprint
supabase_bp = Blueprint('supabase_api', __name__, url_prefix='/api/db')

# Initialize Supabase client
supabase_url = os.getenv('supabaseUrl')
supabase_key = os.getenv('supabaseKey')

if not supabase_url or not supabase_key:
    logger.error("Supabase credentials not found in environment variables")
    supabase: Client = None
else:
    supabase: Client = create_client(supabase_url, supabase_key)


def handle_error(error, operation="Operation"):
    """Centralized error handler"""
    logger.error(f"{operation} failed: {str(error)}")
    return jsonify({"error": str(error)}), 500


def sanitize_for_serialization(obj, seen=None):
    """
    Recursively sanitize an object to remove circular references.
    Returns a clean copy that can be safely serialized to JSON.
    """
    if seen is None:
        seen = set()
    
    # Handle None
    if obj is None:
        return None
    
    # Handle primitives
    if not isinstance(obj, (dict, list)):
        # Handle datetime objects
        if isinstance(obj, datetime):
            return obj.isoformat()
        return obj
    
    # Check for circular reference
    obj_id = id(obj)
    if obj_id in seen:
        return "[Circular Reference]"
    
    seen.add(obj_id)
    
    try:
        # Handle dictionaries
        if isinstance(obj, dict):
            sanitized = {}
            for key, value in obj.items():
                # Skip change_log to prevent circular references
                if key == 'change_log':
                    continue
                try:
                    sanitized[key] = sanitize_for_serialization(value, seen)
                except Exception:
                    sanitized[key] = "[Error serializing]"
            seen.remove(obj_id)
            return sanitized
        
        # Handle lists
        if isinstance(obj, list):
            sanitized = [sanitize_for_serialization(item, seen) for item in obj]
            seen.remove(obj_id)
            return sanitized
    except Exception:
        seen.discard(obj_id)
        return "[Error serializing]"
    
    seen.discard(obj_id)
    return obj


# ============================================================================
# MEAL PLANS AND SCHEMAS (Menu entity)
# ============================================================================

@supabase_bp.route('/meal-plans', methods=['POST'])
def create_meal_plan():
    """Create a new meal plan"""
    try:
        data = request.json
        
        # Normalize status to draft by default
        data['status'] = data.get('status', 'draft')
        
        # Only block creation if trying to create an ACTIVE menu while one already exists
        if data.get('user_code') and data['status'] == 'active':
            existing = supabase.table('meal_plans_and_schemas')\
                .select('id')\
                .eq('user_code', data['user_code'])\
                .eq('record_type', 'meal_plan')\
                .eq('status', 'active')\
                .execute()
            
            if existing.data and len(existing.data) > 0:
                return jsonify({
                    "error": "Cannot create menu: this user already has an active menu. Please deactivate the existing active menu first."
                }), 400
        
        # Add change log entry
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "actor_id": data.get('dietitian_id', 'system'),
            "action": "CREATED",
            "details": {
                "record_type": data.get('record_type'),
                "meal_plan_name": data.get('meal_plan_name')
            }
        }
        
        change_log = data.get('change_log', [])
        change_log.append(log_entry)
        data['change_log'] = change_log
        
        # Insert into Supabase
        result = supabase.table('meal_plans_and_schemas')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create meal plan")


@supabase_bp.route('/meal-plans/<meal_plan_id>', methods=['GET'])
def get_meal_plan(meal_plan_id):
    """Get a specific meal plan by ID"""
    try:
        result = supabase.table('meal_plans_and_schemas')\
            .select('*')\
            .eq('id', meal_plan_id)\
            .single()\
            .execute()
        
        return jsonify(result.data if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Get meal plan")


@supabase_bp.route('/meal-plans', methods=['GET'])
def list_meal_plans():
    """List all meal plans"""
    try:
        result = supabase.table('meal_plans_and_schemas')\
            .select('*')\
            .order('created_at', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List meal plans")


@supabase_bp.route('/meal-plans/filter', methods=['POST'])
def filter_meal_plans():
    """Filter meal plans based on query parameters"""
    try:
        query_params = request.json
        order_by = query_params.pop('orderBy', 'created_at')
        
        # Check for empty array filters
        has_empty_array = any(
            isinstance(v, list) and len(v) == 0 
            for v in query_params.values()
        )
        
        if has_empty_array:
            return jsonify([]), 200
        
        # Build query
        query = supabase.table('meal_plans_and_schemas').select('*')
        
        # Apply filters
        for key, value in query_params.items():
            if value is not None:
                if isinstance(value, list):
                    query = query.in_(key, value)
                else:
                    query = query.eq(key, value)
        
        # Apply ordering
        order_column = order_by.lstrip('-')
        if order_column == 'created_date':
            order_column = 'created_at'
        
        desc_order = order_by.startswith('-')
        query = query.order(order_column, desc=desc_order)
        
        result = query.execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Filter meal plans")


@supabase_bp.route('/meal-plans/<meal_plan_id>', methods=['PUT'])
def update_meal_plan(meal_plan_id):
    """Update a meal plan"""
    try:
        data = request.json
        
        # Check if user already has an active menu before setting status to active
        if data.get('status') == 'active':
            # Ensure we have user_code
            user_code = data.get('user_code')
            if not user_code:
                current_menu = supabase.table('meal_plans_and_schemas')\
                    .select('user_code')\
                    .eq('id', meal_plan_id)\
                    .single()\
                    .execute()
                user_code = current_menu.data.get('user_code') if current_menu.data else None
            
            if not user_code:
                return jsonify({"error": "User code is required to activate a menu."}), 400
            
            # Find other active menus for this user
            existing_active = supabase.table('meal_plans_and_schemas')\
                .select('id, active_days')\
                .eq('user_code', user_code)\
                .eq('record_type', 'meal_plan')\
                .eq('status', 'active')\
                .execute()
            
            other_active = [m for m in (existing_active.data or []) if m['id'] != meal_plan_id]
            
            if other_active:
                # Get new meal plan's active_days
                new_active_days = data.get('active_days')
                if new_active_days is None:
                    current_menu = supabase.table('meal_plans_and_schemas')\
                        .select('active_days')\
                        .eq('id', meal_plan_id)\
                        .single()\
                        .execute()
                    new_active_days = current_menu.data.get('active_days') if current_menu.data else None
                
                # Normalize days
                new_days_set = set(range(7)) if not new_active_days or len(new_active_days) == 0 else set(new_active_days)
                
                # Check for conflicts
                for existing_menu in other_active:
                    existing_days = existing_menu.get('active_days')
                    existing_days_set = set(range(7)) if not existing_days or len(existing_days) == 0 else set(existing_days)
                    
                    # Check overlap
                    if new_days_set & existing_days_set:
                        return jsonify({
                            "error": f"Cannot activate meal plan: There is already an active meal plan for overlapping days."
                        }), 400
        
        # Add change log entry
        existing_menu = supabase.table('meal_plans_and_schemas')\
            .select('change_log')\
            .eq('id', meal_plan_id)\
            .single()\
            .execute()
        
        change_log = existing_menu.data.get('change_log', []) if existing_menu.data else []
        
        # Create a sanitized copy of data for the change log to avoid circular references
        log_details = sanitize_for_serialization(data)
        
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "actor_id": data.get('dietitian_id', 'system'),
            "action": "UPDATED",
            "details": log_details
        }
        change_log.append(log_entry)
        data['change_log'] = change_log
        data['updated_at'] = datetime.utcnow().isoformat()
        
        # Update in Supabase
        result = supabase.table('meal_plans_and_schemas')\
            .update(data)\
            .eq('id', meal_plan_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update meal plan")


@supabase_bp.route('/meal-plans/<meal_plan_id>', methods=['DELETE'])
def delete_meal_plan(meal_plan_id):
    """Delete a meal plan"""
    try:
        supabase.table('meal_plans_and_schemas')\
            .delete()\
            .eq('id', meal_plan_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete meal plan")


# ============================================================================
# CHAT USERS
# ============================================================================

@supabase_bp.route('/chat-users', methods=['POST'])
def create_chat_user():
    """Create a new chat user"""
    try:
        data = request.json
        
        result = supabase.table('chat_users')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create chat user")


@supabase_bp.route('/chat-users', methods=['GET'])
def list_chat_users():
    """List all chat users with optional field selection"""
    try:
        # Support field selection via query parameter
        fields = request.args.get('fields', '*')
        if fields != '*':
            # Convert comma-separated string to list
            fields = [f.strip() for f in fields.split(',')]
        
        query = supabase.table('chat_users')
        
        if fields == '*':
            query = query.select('*')
        else:
            query = query.select(','.join(fields))
        
        result = query.order('full_name').execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List chat users")


@supabase_bp.route('/chat-users/<user_code>', methods=['GET'])
def get_chat_user(user_code):
    """Get a chat user by user_code with optional field selection"""
    try:
        # Support field selection via query parameter
        fields = request.args.get('fields', '*')
        if fields != '*':
            # Convert comma-separated string to list
            fields = [f.strip() for f in fields.split(',')]
        
        # Select must be called first to get a query builder that supports filtering
        if fields == '*':
            query = supabase.table('chat_users').select('*')
        else:
            query = supabase.table('chat_users').select(','.join(fields))
        
        # Then apply the filter
        query = query.eq('user_code', user_code)
        
        result = query.single().execute()
        
        return jsonify(result.data if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Get chat user")


@supabase_bp.route('/chat-users/<user_code>', methods=['PUT'])
def update_chat_user(user_code):
    """Update a chat user"""
    try:
        data = request.json
        
        result = supabase.table('chat_users')\
            .update(data)\
            .eq('user_code', user_code)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update chat user")


@supabase_bp.route('/chat-users/<user_code>', methods=['DELETE'])
def delete_chat_user(user_code):
    """Delete a chat user"""
    try:
        supabase.table('chat_users')\
            .delete()\
            .eq('user_code', user_code)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete chat user")


@supabase_bp.route('/chat-users/<user_code>/meal-plan', methods=['GET'])
def get_user_active_meal_plan(user_code):
    """Get active meal plan for a user"""
    try:
        result = supabase.table('meal_plans_and_schemas')\
            .select('meal_plan, daily_total_calories, macros_target, recommendations, dietary_restrictions')\
            .eq('user_code', user_code)\
            .eq('record_type', 'meal_plan')\
            .eq('status', 'active')\
            .order('created_at', desc=True)\
            .limit(1)\
            .execute()
        
        meal_plan = result.data[0] if result.data and len(result.data) > 0 else None
        return jsonify(meal_plan), 200
        
    except Exception as e:
        return handle_error(e, "Get user meal plan")


# ============================================================================
# CHATS
# ============================================================================

@supabase_bp.route('/chats', methods=['POST'])
def create_chat():
    """Create a new chat"""
    try:
        data = request.json
        
        result = supabase.table('chats')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create chat")


@supabase_bp.route('/chats/<chat_id>', methods=['GET'])
def get_chat(chat_id):
    """Get a specific chat"""
    try:
        result = supabase.table('chats')\
            .select('*')\
            .eq('id', chat_id)\
            .single()\
            .execute()
        
        return jsonify(result.data if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Get chat")


@supabase_bp.route('/chats', methods=['GET'])
def list_chats():
    """List all chats"""
    try:
        result = supabase.table('chats')\
            .select('*')\
            .order('created_at', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List chats")


@supabase_bp.route('/chats/filter', methods=['POST'])
def filter_chats():
    """Filter chats based on query parameters"""
    try:
        query_params = request.json
        
        query = supabase.table('chats').select('*')
        
        for key, value in query_params.items():
            if value is not None:
                query = query.eq(key, value)
        
        result = query.execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Filter chats")


@supabase_bp.route('/chats/<chat_id>', methods=['PUT'])
def update_chat(chat_id):
    """Update a chat"""
    try:
        data = request.json
        data['updated_at'] = datetime.utcnow().isoformat()
        
        result = supabase.table('chats')\
            .update(data)\
            .eq('id', chat_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update chat")


@supabase_bp.route('/chats/<chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    """Delete a chat"""
    try:
        supabase.table('chats')\
            .delete()\
            .eq('id', chat_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete chat")


# ============================================================================
# FOOD LOGS
# ============================================================================

@supabase_bp.route('/food-logs/user/<user_code>', methods=['GET'])
def get_food_logs_by_user_code(user_code):
    """Get food logs for a user by user_code"""
    try:
        # First get the user_id from chat_users table
        user_result = supabase.table('chat_users')\
            .select('id')\
            .eq('user_code', user_code)\
            .single()\
            .execute()
        
        if not user_result.data:
            return jsonify([]), 200
        
        user_id = user_result.data['id']
        
        # Get food logs by user_id
        result = supabase.table('food_logs')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('log_date', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get food logs by user code")


@supabase_bp.route('/food-logs/analyze/<user_code>', methods=['GET'])
def analyze_food_preferences(user_code):
    """Analyze food preferences from food logs"""
    try:
        # Get food logs
        user_result = supabase.table('chat_users')\
            .select('id')\
            .eq('user_code', user_code)\
            .single()\
            .execute()
        
        if not user_result.data:
            return jsonify(None), 200
        
        user_id = user_result.data['id']
        
        logs_result = supabase.table('food_logs')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('log_date', desc=True)\
            .execute()
        
        food_logs = logs_result.data if logs_result.data else []
        
        if not food_logs:
            return jsonify(None), 200
        
        # Analyze preferences
        all_food_items = []
        for log in food_logs:
            if log.get('food_items'):
                items = log['food_items'] if isinstance(log['food_items'], list) else [log['food_items']]
                for item in items:
                    if item and item.get('name'):
                        all_food_items.append({
                            'name': item['name'],
                            'meal_label': log.get('meal_label'),
                            'date': log.get('log_date')
                        })
        
        # Count frequencies
        food_frequency = {}
        for item in all_food_items:
            name = item['name'].lower().strip()
            food_frequency[name] = food_frequency.get(name, 0) + 1
        
        # Get top 10 foods
        sorted_foods = sorted(food_frequency.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Analyze meal patterns
        meal_counts = {}
        foods_by_meal = {}
        
        for log in food_logs:
            meal_label = log.get('meal_label')
            if meal_label:
                meal_counts[meal_label] = meal_counts.get(meal_label, 0) + 1
                
                if meal_label not in foods_by_meal:
                    foods_by_meal[meal_label] = {}
                
                if log.get('food_items'):
                    items = log['food_items'] if isinstance(log['food_items'], list) else [log['food_items']]
                    for item in items:
                        if item and item.get('name'):
                            food_name = item['name'].lower().strip()
                            foods_by_meal[meal_label][food_name] = foods_by_meal[meal_label].get(food_name, 0) + 1
        
        # Sort foods by meal
        foods_by_meal_sorted = {}
        for meal, foods in foods_by_meal.items():
            sorted_meal_foods = sorted(foods.items(), key=lambda x: x[1], reverse=True)
            foods_by_meal_sorted[meal] = [{'name': name, 'count': count} for name, count in sorted_meal_foods]
        
        preferences = {
            'frequently_consumed_foods': [name for name, _ in sorted_foods],
            'meal_patterns': meal_counts,
            'foods_by_meal': foods_by_meal_sorted,
            'total_logs': len(food_logs),
            'analysis_date': datetime.utcnow().isoformat()
        }
        
        return jsonify(preferences), 200
        
    except Exception as e:
        return handle_error(e, "Analyze food preferences")


@supabase_bp.route('/food-logs/user/<user_code>', methods=['DELETE'])
def delete_food_logs_by_user_code(user_code):
    """Delete all food logs for a user"""
    try:
        # Get user_id
        user_result = supabase.table('chat_users')\
            .select('id')\
            .eq('user_code', user_code)\
            .single()\
            .execute()
        
        if not user_result.data:
            return jsonify({"success": True, "deleted": 0}), 200
        
        user_id = user_result.data['id']
        
        # Delete food logs
        supabase.table('food_logs')\
            .delete()\
            .eq('user_id', user_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete food logs by user code")


# ============================================================================
# WEIGHT LOGS
# ============================================================================

@supabase_bp.route('/weight-logs/user/<user_code>', methods=['GET'])
def get_weight_logs_by_user_code(user_code):
    """Get weight logs for a user"""
    try:
        result = supabase.table('weight_logs')\
            .select('*')\
            .eq('user_code', user_code)\
            .order('measurement_date')\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get weight logs")


@supabase_bp.route('/weight-logs', methods=['GET'])
def list_weight_logs():
    """List weight logs with optional filtering by user_code array"""
    try:
        user_code = request.args.get('user_code')
        user_codes = request.args.getlist('user_code')  # Support multiple user codes
        
        query = supabase.table('weight_logs').select('*')
        
        if user_code:
            query = query.eq('user_code', user_code)
        elif user_codes and len(user_codes) > 0:
            query = query.in_('user_code', user_codes)
        
        # Support limit
        limit = request.args.get('limit')
        if limit:
            try:
                limit = int(limit)
                query = query.limit(limit)
            except ValueError:
                pass
        
        result = query.order('measurement_date', desc=True).execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List weight logs")


@supabase_bp.route('/weight-logs', methods=['POST'])
def create_weight_log():
    """Create a new weight log entry"""
    try:
        data = request.json
        
        result = supabase.table('weight_logs')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create weight log")


@supabase_bp.route('/weight-logs/<log_id>', methods=['PUT'])
def update_weight_log(log_id):
    """Update a weight log entry"""
    try:
        data = request.json
        
        result = supabase.table('weight_logs')\
            .update(data)\
            .eq('id', log_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update weight log")


@supabase_bp.route('/weight-logs/<log_id>', methods=['DELETE'])
def delete_weight_log(log_id):
    """Delete a weight log entry"""
    try:
        supabase.table('weight_logs')\
            .delete()\
            .eq('id', log_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete weight log")


# ============================================================================
# PROFILES
# ============================================================================

@supabase_bp.route('/profiles', methods=['GET'])
def list_profiles():
    """List all profiles with company info"""
    try:
        result = supabase.table('profiles')\
            .select('id, role, company_id, name, created_at, company:companies(id, name)')\
            .order('created_at', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List profiles")


@supabase_bp.route('/profiles/<profile_id>', methods=['PUT'])
def update_profile(profile_id):
    """Update a profile"""
    try:
        data = request.json
        
        result = supabase.table('profiles')\
            .update(data)\
            .eq('id', profile_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update profile")


# ============================================================================
# COMPANIES
# ============================================================================

@supabase_bp.route('/companies', methods=['GET'])
def list_companies():
    """List all companies"""
    try:
        result = supabase.table('companies')\
            .select('id, name')\
            .order('name')\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List companies")


@supabase_bp.route('/companies', methods=['POST'])
def create_company():
    """Create a new company"""
    try:
        data = request.json
        name = data.get('name')
        
        if not name:
            return jsonify({"error": "Company name is required"}), 400
        
        result = supabase.table('companies')\
            .insert({'name': name})\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create company")


# ============================================================================
# CHAT MESSAGES
# ============================================================================

@supabase_bp.route('/chat-messages', methods=['POST'])
def create_chat_message():
    """Create a new chat message"""
    try:
        data = request.json
        
        result = supabase.table('chat_messages')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create chat message")


@supabase_bp.route('/chat-messages/conversation/<conversation_id>', methods=['GET'])
def list_messages_by_conversation(conversation_id):
    """Get messages for a conversation"""
    try:
        limit = request.args.get('limit', 20, type=int)
        before_id = request.args.get('beforeMessageId', type=int)
        
        query = supabase.table('chat_messages')\
            .select('*')\
            .eq('conversation_id', conversation_id)\
            .order('created_at', desc=True)\
            .limit(limit)
        
        if before_id:
            query = query.lt('id', before_id)
        
        result = query.execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List messages by conversation")


@supabase_bp.route('/chat-messages/conversation/<conversation_id>', methods=['DELETE'])
def delete_messages_by_conversation(conversation_id):
    """Delete all messages for a conversation"""
    try:
        supabase.table('chat_messages')\
            .delete()\
            .eq('conversation_id', conversation_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete messages by conversation")


@supabase_bp.route('/chat-messages/user/<user_code>', methods=['DELETE'])
def delete_messages_by_user_code(user_code):
    """Delete all messages for a user"""
    try:
        # Get user
        user_result = supabase.table('chat_users')\
            .select('id')\
            .eq('user_code', user_code)\
            .single()\
            .execute()
        
        if not user_result.data:
            return jsonify({"success": True, "deleted": 0}), 200
        
        user_id = user_result.data['id']
        
        # Get conversations
        conv_result = supabase.table('chat_conversations')\
            .select('id')\
            .eq('user_id', user_id)\
            .execute()
        
        if not conv_result.data:
            return jsonify({"success": True, "deleted": 0}), 200
        
        conversation_ids = [c['id'] for c in conv_result.data]
        
        # Delete messages
        supabase.table('chat_messages')\
            .delete()\
            .in_('conversation_id', conversation_ids)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete messages by user code")


# ============================================================================
# MESSAGE QUEUE
# ============================================================================

@supabase_bp.route('/message-queue', methods=['POST'])
def add_to_message_queue():
    """Add a message to the queue"""
    try:
        data = request.json
        
        # Validate required fields
        if not all(key in data for key in ['conversation_id', 'client_id', 'dietitian_id']):
            return jsonify({"error": "Missing required fields"}), 400
        
        result = supabase.table('message_queue')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Add to message queue")


@supabase_bp.route('/message-queue/client/<client_id>', methods=['GET'])
def get_pending_messages_for_client(client_id):
    """Get pending messages for a client"""
    try:
        result = supabase.table('message_queue')\
            .select('*')\
            .eq('client_id', client_id)\
            .eq('status', 'pending')\
            .order('priority', desc=True)\
            .order('created_at')\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get pending messages for client")


@supabase_bp.route('/message-queue/dietitian/<dietitian_id>', methods=['GET'])
def get_messages_by_dietitian(dietitian_id):
    """Get messages sent by a dietitian"""
    try:
        status = request.args.get('status')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        query = supabase.table('message_queue')\
            .select('*')\
            .eq('dietitian_id', dietitian_id)\
            .order('created_at', desc=True)\
            .range(offset, offset + limit - 1)
        
        if status:
            query = query.eq('status', status)
        
        result = query.execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get messages by dietitian")


@supabase_bp.route('/message-queue/<message_id>', methods=['PUT'])
def update_message_status(message_id):
    """Update message status"""
    try:
        data = request.json
        status = data.get('status')
        
        if not status:
            return jsonify({"error": "Status is required"}), 400
        
        update_data = {
            'status': status,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        if status == 'sent':
            update_data['processed_at'] = datetime.utcnow().isoformat()
        
        if 'error_message' in data:
            update_data['error_message'] = data['error_message']
        
        result = supabase.table('message_queue')\
            .update(update_data)\
            .eq('id', message_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update message status")


@supabase_bp.route('/message-queue', methods=['GET'])
def list_all_messages():
    """Get all messages in queue (admin)"""
    try:
        status = request.args.get('status')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        query = supabase.table('message_queue')\
            .select('*, chat_conversations!inner(id, started_at), chat_users!inner(id, full_name, user_code)')\
            .order('priority', desc=True)\
            .order('created_at', desc=True)\
            .range(offset, offset + limit - 1)
        
        if status:
            query = query.eq('status', status)
        
        result = query.execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List all messages")


@supabase_bp.route('/message-queue/user/<user_code>', methods=['GET'])
def list_messages_by_user_code(user_code):
    """List queued messages for a user"""
    try:
        result = supabase.table('message_queue')\
            .select('*')\
            .eq('user_code', user_code)\
            .order('created_at', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List messages by user code")


@supabase_bp.route('/message-queue/conversation/<conversation_id>', methods=['DELETE'])
def delete_queue_by_conversation(conversation_id):
    """Delete queued messages for a conversation"""
    try:
        supabase.table('message_queue')\
            .delete()\
            .eq('conversation_id', conversation_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete queue by conversation")


@supabase_bp.route('/message-queue/user/<user_code>', methods=['DELETE'])
def delete_queue_by_user_code(user_code):
    """Delete queued messages for a user"""
    try:
        supabase.table('message_queue')\
            .delete()\
            .eq('user_code', user_code)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete queue by user code")


# ============================================================================
# CHAT CONVERSATIONS
# ============================================================================

@supabase_bp.route('/chat-conversations', methods=['GET'])
def list_chat_conversations():
    """List all chat conversations with optional field selection"""
    try:
        # Support field selection via query parameter
        fields = request.args.get('fields', '*')
        if fields != '*':
            # Convert comma-separated string to list
            fields = [f.strip() for f in fields.split(',')]
        
        query = supabase.table('chat_conversations')
        
        if fields == '*':
            query = query.select('*')
        else:
            query = query.select(','.join(fields))
        
        result = query.order('started_at', desc=True).execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List chat conversations")


@supabase_bp.route('/chat-conversations/user/<user_code>', methods=['GET'])
def get_conversation_by_user_code(user_code):
    """Get conversation for a user"""
    try:
        # Get user
        user_result = supabase.table('chat_users')\
            .select('id')\
            .eq('user_code', user_code)\
            .single()\
            .execute()
        
        if not user_result.data:
            return jsonify(None), 404
        
        user_id = user_result.data['id']
        
        # Get conversation
        result = supabase.table('chat_conversations')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('started_at', desc=True)\
            .limit(1)\
            .execute()
        
        conversation = result.data[0] if result.data else None
        return jsonify(conversation), 200
        
    except Exception as e:
        return handle_error(e, "Get conversation by user code")


@supabase_bp.route('/chat-conversations/user/<user_code>/list', methods=['GET'])
def list_conversations_by_user_code(user_code):
    """List all conversations for a user"""
    try:
        # Get user
        user_result = supabase.table('chat_users')\
            .select('id')\
            .eq('user_code', user_code)\
            .single()\
            .execute()
        
        if not user_result.data:
            return jsonify([]), 200
        
        user_id = user_result.data['id']
        
        # Get conversations
        result = supabase.table('chat_conversations')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('started_at', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List conversations by user code")


@supabase_bp.route('/chat-conversations/<conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    """Delete a conversation"""
    try:
        supabase.table('chat_conversations')\
            .delete()\
            .eq('id', conversation_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete conversation")


@supabase_bp.route('/chat-conversations/user/<user_code>', methods=['DELETE'])
def delete_conversations_by_user_code(user_code):
    """Delete all conversations for a user"""
    try:
        # Get user
        user_result = supabase.table('chat_users')\
            .select('id')\
            .eq('user_code', user_code)\
            .single()\
            .execute()
        
        if not user_result.data:
            return jsonify({"success": True, "deleted": 0}), 200
        
        user_id = user_result.data['id']
        
        # Delete conversations
        supabase.table('chat_conversations')\
            .delete()\
            .eq('user_id', user_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete conversations by user code")


# ============================================================================
# TRAINING PLANS
# ============================================================================

@supabase_bp.route('/training-plans/user/<user_code>', methods=['GET'])
def get_training_plans_by_user(user_code):
    """Get all training plans for a user"""
    try:
        result = supabase.table('training_plans')\
            .select('*')\
            .eq('user_code', user_code)\
            .order('created_at', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get training plans by user")


@supabase_bp.route('/training-plans', methods=['GET'])
def get_all_training_plans():
    """Get all training plans"""
    try:
        result = supabase.table('training_plans')\
            .select('*')\
            .order('created_at', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get all training plans")


@supabase_bp.route('/training-plans/user/<user_code>/active', methods=['GET'])
def get_active_training_plan(user_code):
    """Get active training plan for a user"""
    try:
        result = supabase.table('training_plans')\
            .select('*')\
            .eq('user_code', user_code)\
            .eq('status', 'active')\
            .order('created_at', desc=True)\
            .limit(1)\
            .execute()
        
        plan = result.data[0] if result.data else None
        return jsonify(plan), 200
        
    except Exception as e:
        return handle_error(e, "Get active training plan")


@supabase_bp.route('/training-plans', methods=['POST'])
def create_training_plan():
    """Create a new training plan"""
    try:
        data = request.json
        
        # If setting as active, deactivate other plans
        if data.get('status') == 'active' and data.get('user_code'):
            supabase.table('training_plans')\
                .update({'status': 'archived'})\
                .eq('user_code', data['user_code'])\
                .eq('status', 'active')\
                .execute()
        
        result = supabase.table('training_plans')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create training plan")


@supabase_bp.route('/training-plans/<plan_id>', methods=['PUT'])
def update_training_plan(plan_id):
    """Update a training plan"""
    try:
        data = request.json
        data['updated_at'] = datetime.utcnow().isoformat()
        
        result = supabase.table('training_plans')\
            .update(data)\
            .eq('id', plan_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update training plan")


@supabase_bp.route('/training-plans/<plan_id>', methods=['DELETE'])
def delete_training_plan(plan_id):
    """Delete a training plan"""
    try:
        supabase.table('training_plans')\
            .delete()\
            .eq('id', plan_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete training plan")


# ============================================================================
# TRAINING LOGS
# ============================================================================

@supabase_bp.route('/training-logs/user/<user_code>', methods=['GET'])
def get_training_logs_by_user(user_code):
    """Get training logs for a user"""
    try:
        limit = request.args.get('limit', 50, type=int)
        
        result = supabase.table('training_logs')\
            .select('*')\
            .eq('user_code', user_code)\
            .order('session_date', desc=True)\
            .limit(limit)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get training logs by user")


@supabase_bp.route('/training-logs/user/<user_code>/range', methods=['GET'])
def get_training_logs_by_date_range(user_code):
    """Get training logs by date range"""
    try:
        start_date = request.args.get('startDate')
        end_date = request.args.get('endDate')
        
        if not start_date or not end_date:
            return jsonify({"error": "startDate and endDate are required"}), 400
        
        result = supabase.table('training_logs')\
            .select('*')\
            .eq('user_code', user_code)\
            .gte('session_date', start_date)\
            .lte('session_date', end_date)\
            .order('session_date', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get training logs by date range")


@supabase_bp.route('/training-logs', methods=['GET'])
def get_all_training_logs():
    """Get all training logs (for analytics)"""
    try:
        limit = request.args.get('limit', 100, type=int)
        
        result = supabase.table('training_logs')\
            .select('*')\
            .order('session_date', desc=True)\
            .limit(limit)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get all training logs")


# ============================================================================
# TRAINING ANALYTICS
# ============================================================================

@supabase_bp.route('/training-analytics/user/<user_code>', methods=['GET'])
def get_training_analytics_by_user(user_code):
    """Get progress analytics for a user"""
    try:
        result = supabase.table('training_progress_analytics')\
            .select('*')\
            .eq('user_code', user_code)\
            .order('date_end', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get training analytics by user")


@supabase_bp.route('/training-analytics/user/<user_code>/exercise/<exercise_name>', methods=['GET'])
def get_exercise_analytics(user_code, exercise_name):
    """Get analytics for specific exercise"""
    try:
        result = supabase.table('training_progress_analytics')\
            .select('*')\
            .eq('user_code', user_code)\
            .eq('exercise_name', exercise_name)\
            .order('date_end', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get exercise analytics")


# ============================================================================
# TRAINING REMINDERS
# ============================================================================

@supabase_bp.route('/training-reminders/pending', methods=['GET'])
def get_pending_reminders():
    """Get pending reminders"""
    try:
        result = supabase.table('training_reminder_queue')\
            .select('*')\
            .eq('status', 'pending')\
            .order('scheduled_for')\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get pending reminders")


@supabase_bp.route('/training-reminders/user/<user_code>', methods=['GET'])
def get_reminders_by_user(user_code):
    """Get reminders for a user"""
    try:
        result = supabase.table('training_reminder_queue')\
            .select('*')\
            .eq('user_code', user_code)\
            .order('scheduled_for', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get reminders by user")


@supabase_bp.route('/training-reminders', methods=['POST'])
def create_reminder():
    """Create a reminder"""
    try:
        data = request.json
        
        result = supabase.table('training_reminder_queue')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create reminder")


@supabase_bp.route('/training-reminders/<reminder_id>', methods=['PUT'])
def update_reminder_status(reminder_id):
    """Update reminder status"""
    try:
        data = request.json
        status = data.get('status')
        
        if not status:
            return jsonify({"error": "Status is required"}), 400
        
        update_data = {'status': status}
        
        if status == 'sent':
            update_data['sent_at'] = datetime.utcnow().isoformat()
        
        if 'error_message' in data:
            update_data['error_message'] = data['error_message']
        
        result = supabase.table('training_reminder_queue')\
            .update(update_data)\
            .eq('id', reminder_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update reminder status")


@supabase_bp.route('/training-reminders/<reminder_id>', methods=['DELETE'])
def delete_reminder(reminder_id):
    """Delete a reminder"""
    try:
        supabase.table('training_reminder_queue')\
            .delete()\
            .eq('id', reminder_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete reminder")


# ============================================================================
# EXERCISE LIBRARY
# ============================================================================

@supabase_bp.route('/exercise-library', methods=['GET'])
def get_all_exercises():
    """Get all active exercises"""
    try:
        result = supabase.table('exercise_library')\
            .select('*')\
            .eq('is_active', True)\
            .order('exercise_name')\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get all exercises")


@supabase_bp.route('/exercise-library/category/<category>', methods=['GET'])
def get_exercises_by_category(category):
    """Get exercises by category"""
    try:
        result = supabase.table('exercise_library')\
            .select('*')\
            .eq('category', category)\
            .eq('is_active', True)\
            .order('exercise_name')\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get exercises by category")


@supabase_bp.route('/exercise-library/search', methods=['GET'])
def search_exercises():
    """Search exercises"""
    try:
        search_term = request.args.get('q', '')
        
        if not search_term:
            return jsonify([]), 200
        
        result = supabase.table('exercise_library')\
            .select('*')\
            .ilike('exercise_name', f'%{search_term}%')\
            .eq('is_active', True)\
            .order('exercise_name')\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Search exercises")


@supabase_bp.route('/exercise-library', methods=['POST'])
def create_exercise():
    """Create a new exercise"""
    try:
        data = request.json
        
        result = supabase.table('exercise_library')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create exercise")


@supabase_bp.route('/exercise-library/<exercise_id>', methods=['PUT'])
def update_exercise(exercise_id):
    """Update an exercise"""
    try:
        data = request.json
        data['updated_at'] = datetime.utcnow().isoformat()
        
        result = supabase.table('exercise_library')\
            .update(data)\
            .eq('id', exercise_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update exercise")


# ============================================================================
# TRAINING PLAN TEMPLATES
# ============================================================================

@supabase_bp.route('/training-templates', methods=['GET'])
def get_all_templates():
    """Get all active templates"""
    try:
        result = supabase.table('training_plan_templates')\
            .select('*')\
            .eq('is_active', True)\
            .order('created_at', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get all templates")


@supabase_bp.route('/training-templates/public', methods=['GET'])
def get_public_templates():
    """Get public templates"""
    try:
        result = supabase.table('training_plan_templates')\
            .select('*')\
            .eq('is_public', True)\
            .eq('is_active', True)\
            .order('usage_count', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get public templates")


@supabase_bp.route('/training-templates/search', methods=['GET'])
def search_templates():
    """Search templates"""
    try:
        search_term = request.args.get('q', '')
        
        if not search_term:
            return jsonify([]), 200
        
        # Note: Supabase Python client doesn't support .or() in the same way
        # We'll need to do multiple queries and combine results
        result = supabase.table('training_plan_templates')\
            .select('*')\
            .ilike('template_name', f'%{search_term}%')\
            .eq('is_active', True)\
            .order('created_at', desc=True)\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Search templates")


@supabase_bp.route('/training-templates', methods=['POST'])
def create_template():
    """Create a new template"""
    try:
        data = request.json
        
        result = supabase.table('training_plan_templates')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 201
        
    except Exception as e:
        return handle_error(e, "Create template")


@supabase_bp.route('/training-templates/<template_id>', methods=['PUT'])
def update_template(template_id):
    """Update a template"""
    try:
        data = request.json
        data['updated_at'] = datetime.utcnow().isoformat()
        
        result = supabase.table('training_plan_templates')\
            .update(data)\
            .eq('id', template_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update template")


@supabase_bp.route('/training-templates/<template_id>', methods=['DELETE'])
def delete_template(template_id):
    """Delete a template (soft delete)"""
    try:
        supabase.table('training_plan_templates')\
            .update({'is_active': False})\
            .eq('id', template_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete template")


@supabase_bp.route('/training-templates/<template_id>/hard-delete', methods=['DELETE'])
def hard_delete_template(template_id):
    """Hard delete a template (permanent)"""
    try:
        supabase.table('training_plan_templates')\
            .delete()\
            .eq('id', template_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Hard delete template")


@supabase_bp.route('/training-templates/<template_id>/increment-usage', methods=['POST'])
def increment_template_usage(template_id):
    """Increment template usage count"""
    try:
        # Get current count
        current = supabase.table('training_plan_templates')\
            .select('usage_count')\
            .eq('id', template_id)\
            .single()\
            .execute()
        
        new_count = (current.data.get('usage_count', 0) if current.data else 0) + 1
        
        supabase.table('training_plan_templates')\
            .update({'usage_count': new_count})\
            .eq('id', template_id)\
            .execute()
        
        return jsonify({"success": True, "usage_count": new_count}), 200
        
    except Exception as e:
        # Non-critical operation, don't fail
        logger.warning(f"Failed to increment template usage: {str(e)}")
        return jsonify({"success": False}), 200


# ============================================================================
# CLIENTS FILTER
# ============================================================================

@supabase_bp.route('/clients/filter', methods=['POST'])
def filter_clients():
    """Filter clients (chat_users) based on query parameters"""
    try:
        query_params = request.json
        
        query = supabase.table('chat_users').select('*')
        
        # Apply filters
        if query_params.get('dietitian_id'):
            query = query.eq('provider_id', query_params['dietitian_id'])
        
        if query_params.get('code'):
            query = query.eq('user_code', query_params['code'])
        
        result = query.order('full_name').execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Filter clients")


# ============================================================================
# SYSTEM MESSAGES
# ============================================================================

@supabase_bp.route('/system-messages', methods=['GET'])
def get_system_messages():
    """Get system messages with optional filtering"""
    try:
        is_active = request.args.get('is_active', 'true').lower() == 'true'
        priority = request.args.get('priority')
        directed_to = request.args.get('directed_to')
        
        query = supabase.table('system_messages').select('*')
        
        if is_active is not None:
            query = query.eq('is_active', is_active)
        
        if priority:
            query = query.eq('priority', priority)
        
        if directed_to:
            query = query.eq('directed_to', directed_to)
        
        result = query.order('created_at', desc=True).execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get system messages")


@supabase_bp.route('/system-messages/<message_id>', methods=['PUT'])
def update_system_message(message_id):
    """Update a system message"""
    try:
        data = request.json
        
        result = supabase.table('system_messages')\
            .update(data)\
            .eq('id', message_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update system message")


@supabase_bp.route('/system-messages/active-for-user', methods=['GET'])
def get_active_messages_for_user():
    """Get active system messages visible to a user (broadcast or directed to user)"""
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify([]), 200
        
        # Get active messages that are either broadcast (directed_to IS NULL) or directed to the user
        # Select only the fields needed for counting: id, start_date, end_date, priority, directed_to
        result = supabase.table('system_messages')\
            .select('id, start_date, end_date, priority, directed_to')\
            .eq('is_active', True)\
            .execute()
        
        all_messages = result.data if result.data else []
        
        # Filter messages: broadcast (directed_to is None) or directed to user
        filtered_messages = []
        for message in all_messages:
            directed_to = message.get('directed_to')
            if not directed_to or directed_to == user_id:
                filtered_messages.append(message)
        
        return jsonify(filtered_messages), 200
        
    except Exception as e:
        return handle_error(e, "Get active messages for user")


@supabase_bp.route('/system-messages/urgent', methods=['GET'])
def get_urgent_system_messages():
    """Get urgent system messages with visibility filtering"""
    try:
        # Get current user from request (should be passed from frontend)
        user_id = request.args.get('user_id')
        user_role = request.args.get('user_role')
        user_company_id = request.args.get('user_company_id')
        
        # Get all urgent active messages
        result = supabase.table('system_messages')\
            .select('*')\
            .eq('is_active', True)\
            .eq('priority', 'urgent')\
            .order('created_at', desc=True)\
            .execute()
        
        all_urgent_messages = result.data if result.data else []
        
        # If sys_admin, return all messages
        if user_role == 'sys_admin':
            return jsonify(all_urgent_messages), 200
        
        # For non-sys_admin users, apply visibility filtering
        if not user_id:
            return jsonify([]), 200
        
        # Get all profiles for company-based filtering
        try:
            profiles_result = supabase.table('profiles')\
                .select('id, role, company_id')\
                .execute()
            
            all_profiles = profiles_result.data if profiles_result.data else []
            
            # Create maps for quick lookup
            profile_map = {}
            company_managers_map = {}
            
            for profile in all_profiles:
                profile_map[profile['id']] = profile
                
                if profile.get('role') == 'company_manager' and profile.get('company_id'):
                    company_id = profile['company_id']
                    if company_id not in company_managers_map:
                        company_managers_map[company_id] = []
                    company_managers_map[company_id].append(profile['id'])
            
            # Filter messages based on visibility rules
            filtered_messages = []
            for message in all_urgent_messages:
                # Check if this is a personalized meal plan request by title
                is_meal_plan_request = (
                    message.get('title') == 'בקשה לתוכנית תזונה מותאמת' or 
                    message.get('title') == 'Request for Personalized Meal Plan'
                )
                
                # For non-meal-plan-request messages, use simple filtering
                if not is_meal_plan_request:
                    # Broadcast messages: visible to everyone
                    if not message.get('directed_to'):
                        filtered_messages.append(message)
                        continue
                    # Message directed to current user: always visible
                    if message.get('directed_to') == user_id:
                        filtered_messages.append(message)
                    continue
                
                # For meal plan request messages, apply company-based visibility rules
                # Message directed to current user: always visible
                if message.get('directed_to') == user_id:
                    filtered_messages.append(message)
                    continue
                
                # If no directed_to, don't show (meal plan requests should always be directed)
                if not message.get('directed_to'):
                    continue
                
                # Get the target profile
                target_profile = profile_map.get(message.get('directed_to'))
                if not target_profile:
                    continue
                
                # Show to company managers in the same company as the target
                if (user_role == 'company_manager' and 
                    target_profile.get('company_id') and 
                    user_company_id == target_profile.get('company_id')):
                    filtered_messages.append(message)
            
            return jsonify(filtered_messages), 200
            
        except Exception as profiles_error:
            # Fallback to basic filtering if profiles table is not available
            logger.warning(f'Could not fetch profiles, falling back to basic filtering: {str(profiles_error)}')
            
            # Basic filtering: show broadcast messages or messages directed to user
            filtered_messages = []
            for message in all_urgent_messages:
                if not message.get('directed_to') or message.get('directed_to') == user_id:
                    filtered_messages.append(message)
            
            return jsonify(filtered_messages), 200
        
    except Exception as e:
        return handle_error(e, "Get urgent system messages")


@supabase_bp.route('/system-messages/for-dietitian', methods=['GET'])
def get_system_messages_for_dietitian():
    """Get all system messages with visibility filtering for dietitian profile"""
    try:
        # Get current user from request (should be passed from frontend)
        user_id = request.args.get('user_id')
        user_role = request.args.get('user_role')
        user_company_id = request.args.get('user_company_id')
        
        # Get all messages
        result = supabase.table('system_messages')\
            .select('*')\
            .order('created_at', desc=True)\
            .execute()
        
        all_messages = result.data if result.data else []
        
        # If sys_admin, return all messages
        if user_role == 'sys_admin':
            return jsonify(all_messages), 200
        
        # For non-sys_admin users, apply visibility filtering
        if not user_id:
            return jsonify([]), 200
        
        # Get all profiles for company-based filtering
        try:
            profiles_result = supabase.table('profiles')\
                .select('id, role, company_id')\
                .execute()
            
            all_profiles = profiles_result.data if profiles_result.data else []
            
            # Create maps for quick lookup
            profile_map = {}
            company_managers_map = {}
            
            for profile in all_profiles:
                profile_map[profile['id']] = profile
                
                if profile.get('role') == 'company_manager' and profile.get('company_id'):
                    company_id = profile['company_id']
                    if company_id not in company_managers_map:
                        company_managers_map[company_id] = []
                    company_managers_map[company_id].append(profile['id'])
            
            # Filter messages based on visibility rules
            filtered_messages = []
            for message in all_messages:
                # Check if this is a personalized meal plan request by title
                is_meal_plan_request = (
                    message.get('title') == 'בקשה לתוכנית תזונה מותאמת' or 
                    message.get('title') == 'Request for Personalized Meal Plan'
                )
                
                # For non-meal-plan-request messages, use simple filtering
                if not is_meal_plan_request:
                    # Broadcast messages: visible to everyone
                    if not message.get('directed_to'):
                        filtered_messages.append(message)
                        continue
                    # Message directed to current user: always visible
                    if message.get('directed_to') == user_id:
                        filtered_messages.append(message)
                    continue
                
                # For meal plan request messages, apply company-based visibility rules
                # Message directed to current user: always visible
                if message.get('directed_to') == user_id:
                    filtered_messages.append(message)
                    continue
                
                # If no directed_to, don't show (meal plan requests should always be directed)
                if not message.get('directed_to'):
                    continue
                
                # Get the target profile
                target_profile = profile_map.get(message.get('directed_to'))
                if not target_profile:
                    continue
                
                # Show to company managers in the same company as the target
                if (user_role == 'company_manager' and 
                    target_profile.get('company_id') and 
                    user_company_id == target_profile.get('company_id')):
                    filtered_messages.append(message)
            
            return jsonify(filtered_messages), 200
            
        except Exception as profiles_error:
            # Fallback to basic filtering if profiles table is not available
            logger.warning(f'Could not fetch profiles, falling back to basic filtering: {str(profiles_error)}')
            
            # Basic filtering: show broadcast messages or messages directed to user
            filtered_messages = []
            for message in all_messages:
                if not message.get('directed_to') or message.get('directed_to') == user_id:
                    filtered_messages.append(message)
            
            return jsonify(filtered_messages), 200
        
    except Exception as e:
        return handle_error(e, "Get system messages for dietitian")


@supabase_bp.route('/profiles/basic', methods=['GET'])
def get_profiles_basic():
    """Get basic profile information (id, role, company_id)"""
    try:
        result = supabase.table('profiles')\
            .select('id, role, company_id')\
            .execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "Get profiles basic")


# ============================================================================
# USER MESSAGE PREFERENCES
# ============================================================================

@supabase_bp.route('/user-message-preferences', methods=['GET'])
def get_user_message_preferences():
    """Get user message preferences with optional filtering"""
    try:
        user_code = request.args.get('user_code')
        user_codes = request.args.getlist('user_code')  # Support multiple user codes
        
        query = supabase.table('user_message_preferences').select('*', count='exact')
        
        if user_code:
            query = query.eq('user_code', user_code)
        elif user_codes and len(user_codes) > 0:
            query = query.in_('user_code', user_codes)
        
        # Get count
        count_result = query.execute()
        total_count = count_result.count if hasattr(count_result, 'count') else len(count_result.data or [])
        
        # Get data with pagination (support both from/to and offset/limit)
        from_param = request.args.get('from', type=int)
        to_param = request.args.get('to', type=int)
        limit = request.args.get('limit', type=int)
        offset = request.args.get('offset', type=int)
        
        if from_param is not None and to_param is not None:
            # Use from/to range
            query = query.range(from_param, to_param)
        elif limit:
            query = query.limit(limit)
            if offset:
                query = query.range(offset, offset + limit - 1)
        
        query = query.order('user_code', desc=False)
        result = query.execute()
        
        # Return data with count
        response_data = result.data if result.data else []
        return jsonify({
            'data': response_data,
            'count': total_count
        }), 200
        
    except Exception as e:
        return handle_error(e, "Get user message preferences")


@supabase_bp.route('/user-message-preferences/<preference_id>', methods=['PUT'])
def update_user_message_preference(preference_id):
    """Update a user message preference"""
    try:
        data = request.json
        
        result = supabase.table('user_message_preferences')\
            .update(data)\
            .eq('id', preference_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update user message preference")


# ============================================================================
# SCHEDULED REMINDERS
# ============================================================================

@supabase_bp.route('/scheduled-reminders', methods=['POST'])
def create_scheduled_reminders():
    """Create scheduled reminders (supports bulk insert)"""
    try:
        data = request.json
        
        # Support both single object and array
        if isinstance(data, dict):
            data = [data]
        
        result = supabase.table('scheduled_reminders')\
            .insert(data)\
            .execute()
        
        return jsonify(result.data if result.data else []), 201
        
    except Exception as e:
        return handle_error(e, "Create scheduled reminders")


@supabase_bp.route('/scheduled-reminders', methods=['GET'])
def list_scheduled_reminders():
    """List scheduled reminders with optional filtering"""
    try:
        user_code = request.args.get('user_code')
        status = request.args.get('status')
        plan_type = request.args.get('plan_type')
        plan_id = request.args.get('plan_id')
        
        query = supabase.table('scheduled_reminders').select('*')
        
        if user_code:
            query = query.eq('user_code', user_code)
        if status:
            query = query.eq('status', status)
        if plan_type:
            query = query.eq('plan_type', plan_type)
        if plan_id:
            query = query.eq('plan_id', plan_id)
        
        result = query.order('scheduled_date', desc=False).execute()
        
        return jsonify(result.data if result.data else []), 200
        
    except Exception as e:
        return handle_error(e, "List scheduled reminders")


@supabase_bp.route('/scheduled-reminders/<reminder_id>', methods=['PUT'])
def update_scheduled_reminder(reminder_id):
    """Update a scheduled reminder"""
    try:
        data = request.json
        
        result = supabase.table('scheduled_reminders')\
            .update(data)\
            .eq('id', reminder_id)\
            .execute()
        
        return jsonify(result.data[0] if result.data else {}), 200
        
    except Exception as e:
        return handle_error(e, "Update scheduled reminder")


@supabase_bp.route('/scheduled-reminders/<reminder_id>', methods=['DELETE'])
def delete_scheduled_reminder(reminder_id):
    """Delete a scheduled reminder"""
    try:
        supabase.table('scheduled_reminders')\
            .delete()\
            .eq('id', reminder_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_error(e, "Delete scheduled reminder")


# ============================================================================
# HEALTH CHECK
# ============================================================================

@supabase_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "supabase_connected": supabase is not None
    }), 200

