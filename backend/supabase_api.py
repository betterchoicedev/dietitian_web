"""
Secure Backend API Blueprint for Dietitian Web Application
All Supabase database operations as Flask Blueprint
Integrates with backend.py

CORS Configuration:
- CORS is handled by the main Flask app in backend.py
- All routes under /api/* (including /api/db/*) have CORS enabled
- Allowed origins include:
  * http://localhost:5173
  * https://www.betterchoicefood.com
  * And other configured origins
"""

from flask import Blueprint, jsonify, request
from typing import Optional
from datetime import datetime, timedelta, timezone
import os
import logging
from supabase import create_client, Client
import random
import string

# Initialize logging
logger = logging.getLogger(__name__)

# Create Flask Blueprint
supabase_bp = Blueprint('supabase_api', __name__, url_prefix='/api/db')

# Initialize Supabase client
SUPABASE_URL = os.getenv("supabaseUrl") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("supabaseServiceRoleKey")
    or os.getenv("supabaseServiceKey")
    or os.getenv("supabaseKey")
)

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("⚠️ Supabase credentials not found in environment variables")
    logger.warning("Set supabaseUrl and supabaseServiceRoleKey (or variations)")

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("✅ Supabase client initialized for API blueprint")
except Exception as e:
    logger.error(f"❌ Failed to initialize Supabase client: {e}")
    supabase = None

# Initialize second Supabase client (for client_meal_plans database)
SECOND_SUPABASE_URL = os.getenv("SECOND_SUPABASE_URL") or os.getenv("secondSupabaseUrl")
SECOND_SUPABASE_KEY = (
    os.getenv("SECOND_SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("secondSupabaseServiceRoleKey")
    or os.getenv("secondSupabaseServiceKey")
    or os.getenv("secondSupabaseKey")
)

second_supabase: Client = None
if SECOND_SUPABASE_URL and SECOND_SUPABASE_KEY:
    try:
        second_supabase = create_client(SECOND_SUPABASE_URL, SECOND_SUPABASE_KEY)
        logger.info("✅ Second Supabase client initialized for API blueprint")
    except Exception as e:
        logger.error(f"❌ Failed to initialize second Supabase client: {e}")
        second_supabase = None
else:
    logger.warning("⚠️ Second Supabase credentials not found - client_meal_plans endpoints will not work")

# Helper function to handle Supabase errors
def handle_supabase_error(error, operation):
    logger.error(f"❌ Error in {operation}: {error}")
    return jsonify({"error": str(error)}), 500

# Helper to generate a short, human-friendly invite code
def generate_invite_code():
    """Generate 8-character uppercase alphanumeric invite code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

# ==================== REGISTRATION INVITES ENDPOINTS ====================

@supabase_bp.route("/registration-invites", methods=["GET"])
def list_registration_invites():
    """List registration invites with optional filters"""
    try:
        email = request.args.get('email')
        status = request.args.get('status')
        
        query = supabase.table("registration_invites").select("*").order("created_at", desc=True)
        
        if email:
            query = query.ilike("email", f"%{email}%")
        
        if status == "active":
            query = query.is_("used_at", "null").is_("revoked_at", "null")
        elif status == "used":
            query = query.not_.is_("used_at", "null")
        elif status == "revoked":
            query = query.not_.is_("revoked_at", "null")
        
        response = query.execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_registration_invites')

@supabase_bp.route("/registration-invites", methods=["POST"])
def create_registration_invite():
    """Create a new registration invite"""
    try:
        payload = request.get_json()
        
        # Compute expires_at from expires_in_hours
        expires_at = None
        if payload.get('expires_in_hours'):
            hours = float(payload['expires_in_hours'])
            if hours > 0:
                expires_at = (datetime.utcnow() + timedelta(hours=hours)).isoformat()
        
        invite_record = {
            "code": payload.get('code') or generate_invite_code(),
            "email": payload.get('email', '').strip().lower(),
            "role": payload.get('role', 'employee'),
            "company_id": None if payload.get('company_id') in ['', 'none'] else payload.get('company_id'),
            "expires_at": expires_at,
            "max_uses": payload.get('max_uses', 1),
            "notes": payload.get('notes'),
        }
        
        response = supabase.table("registration_invites").insert(invite_record).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_registration_invite')

@supabase_bp.route("/registration-invites/<code>/revoke", methods=["POST"])
def revoke_registration_invite(code):
    """Revoke a registration invite"""
    try:
        response = supabase.table("registration_invites").update({
            "revoked_at": datetime.utcnow().isoformat()
        }).eq("code", code).execute()
        
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'revoke_registration_invite')

# ==================== REGISTRATION LINKS ENDPOINTS ====================

@supabase_bp.route("/registration-links", methods=["POST"])
def create_registration_link():
    """Create or update existing registration rule with optional max_slots and expires_at
    Uses base64 encoded links, but stores record in DB for tracking current_count
    Note: manager_id is UNIQUE, so we update existing or create new"""
    try:
        payload = request.get_json()
        
        if not payload.get('manager_id'):
            return jsonify({"error": "manager_id is required"}), 400
        
        manager_id = payload.get('manager_id')
        max_slots = payload.get('max_clients', 30)  # Frontend sends max_clients, we map to max_slots
        expires_at = payload.get('expiry_date')  # Frontend sends expiry_date, we map to expires_at
        
        # Validate expires_at if provided
        if expires_at:
            try:
                expiry_dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                # Use timezone-aware datetime for comparison
                now_utc = datetime.now(timezone.utc)
                if expiry_dt < now_utc:
                    return jsonify({"error": "expires_at must be in the future"}), 400
            except ValueError:
                return jsonify({"error": "Invalid expires_at format. Use ISO 8601 format."}), 400
        
        # Check if a record with this manager_id already exists (manager_id is UNIQUE)
        existing = supabase.table("registration_rules")\
            .select("*")\
            .eq("manager_id", manager_id)\
            .limit(1)\
            .execute()
        
        if existing.data and len(existing.data) > 0:
            # Update existing record
            update_data = {
                "max_slots": max_slots,
                "expires_at": expires_at if expires_at else None,
                "is_active": True,
            }
            
            response = supabase.table("registration_rules")\
                .update(update_data)\
                .eq("manager_id", manager_id)\
                .execute()
            
            link_data = response.data[0] if response.data else existing.data[0]
        else:
            # Create new record
            link_record = {
                "manager_id": manager_id,
                "max_slots": max_slots,
                "current_count": 0,
                "expires_at": expires_at if expires_at else None,
                "is_active": True,
            }
            
            response = supabase.table("registration_rules").insert(link_record).execute()
            link_data = response.data[0] if response.data else None
        
        # Return the record (link URL is generated client-side with base64)
        return jsonify(link_data), 200 if existing.data and len(existing.data) > 0 else 201
    except Exception as e:
        return handle_supabase_error(e, 'create_registration_link')

@supabase_bp.route("/registration-links/<link_id>", methods=["GET"])
def get_registration_link(link_id):
    """Get a registration rule by ID"""
    try:
        response = supabase.table("registration_rules").select("*").eq("id", link_id).execute()
        if not response.data:
            return jsonify({"error": "Registration rule not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_registration_link')

@supabase_bp.route("/registration-links/manager/<manager_id>", methods=["GET"])
def list_registration_links_by_manager(manager_id):
    """Get registration rule for a manager (manager_id is UNIQUE, so returns single record)"""
    try:
        response = supabase.table("registration_rules")\
            .select("*")\
            .eq("manager_id", manager_id)\
            .limit(1)\
            .execute()
        if not response.data or len(response.data) == 0:
            return jsonify({"error": "Registration rule not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_registration_links_by_manager')

@supabase_bp.route("/registration-links/find", methods=["POST"])
def find_registration_link():
    """Find a registration rule by manager_id
    Used during registration to find the matching record and increment current_count
    Note: manager_id is UNIQUE, so we only need manager_id to find the record"""
    try:
        payload = request.get_json()
        manager_id = payload.get('manager_id')
        
        if not manager_id:
            return jsonify({"error": "manager_id is required"}), 400
        
        response = supabase.table("registration_rules")\
            .select("*")\
            .eq("manager_id", manager_id)\
            .limit(1)\
            .execute()
        
        if not response.data or len(response.data) == 0:
            return jsonify({"error": "Registration rule not found"}), 404
        
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'find_registration_link')

@supabase_bp.route("/registration-links/<link_id>/increment", methods=["POST"])
def increment_registration_link_count(link_id):
    """Increment the current_count for a registration rule
    Used when a client successfully registers"""
    try:
        # First get the current record to check limits
        current = supabase.table("registration_rules")\
            .select("*")\
            .eq("id", link_id)\
            .limit(1)\
            .execute()
        
        if not current.data or len(current.data) == 0:
            return jsonify({"error": "Registration rule not found"}), 404
        
        link_record = current.data[0]
        
        # Check if limit reached
        if link_record['current_count'] >= link_record['max_slots']:
            return jsonify({
                "error": f"Maximum registrations ({link_record['max_slots']}) reached",
                "current_count": link_record['current_count'],
                "max_slots": link_record['max_slots']
            }), 403
        
        # Increment count
        response = supabase.table("registration_rules")\
            .update({"current_count": link_record['current_count'] + 1})\
            .eq("id", link_id)\
            .execute()
        
        return jsonify(response.data[0] if response.data else None), 200
    except Exception as e:
        return handle_supabase_error(e, 'increment_registration_link_count')

# ==================== MENU / MEAL PLANS ENDPOINTS ====================

@supabase_bp.route("/menus", methods=["POST"])
def create_menu():
    """Create a new menu/meal plan"""
    try:
        data = request.get_json()
        
        # Check if active menu exists
        if data.get('user_code') and data.get('status') == 'active':
            existing = supabase.table("meal_plans_and_schemas")\
                .select("id")\
                .eq("user_code", data['user_code'])\
                .eq("record_type", "meal_plan")\
                .eq("status", "active")\
                .execute()
            
            if existing.data and len(existing.data) > 0:
                return jsonify({
                    "error": "Cannot create menu: this user already has an active menu. Please deactivate the existing active menu first."
                }), 400
        
        # Add change log entry
        change_log = data.get("change_log", [])
        change_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "actor_id": data.get('dietitian_id', 'system'),
            "action": "CREATED",
            "details": {
                "record_type": data.get('record_type'),
                "meal_plan_name": data.get('meal_plan_name')
            }
        })
        data["change_log"] = change_log
        
        response = supabase.table("meal_plans_and_schemas").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_menu')

@supabase_bp.route("/menus/<menu_id>", methods=["GET"])
def get_menu(menu_id):
    """Get a specific menu by ID"""
    try:
        response = supabase.table("meal_plans_and_schemas").select("*").eq("id", menu_id).execute()
        if not response.data:
            return jsonify({"error": "Menu not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_menu')

@supabase_bp.route("/menus", methods=["GET"])
def list_menus():
    """List all menus"""
    try:
        response = supabase.table("meal_plans_and_schemas").select("*").order("created_at", desc=True).execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_menus')

@supabase_bp.route("/menus/filter", methods=["POST"])
def filter_menus():
    """Filter menus with query parameters
    
    Supports:
    - Simple equality: { key: value }
    - IN clause: { key: [value1, value2] }
    - Not equal: { not_key: value } -> neq('key', value)
    - Less than: { key_lt: value } -> lt('key', value)
    - Not null: { key_not_null: true } -> not('key', 'is', null)
    """
    try:
        data = request.get_json()
        filters = data.get('filters', {})
        order_by = data.get('order_by', 'created_at')
        
        query = supabase.table("meal_plans_and_schemas").select("*")
        
        for key, value in filters.items():
            if value is not None:
                # Handle special operators
                if key.endswith('_lt'):
                    # Less than operator
                    column = key[:-3]  # Remove '_lt' suffix
                    query = query.lt(column, value)
                elif key.endswith('_not_null') and value is True:
                    # Not null operator
                    column = key[:-9]  # Remove '_not_null' suffix
                    query = query.not_.is_(column, "null")
                elif key.startswith('not_'):
                    # Not equal operator
                    column = key[4:]  # Remove 'not_' prefix
                    query = query.neq(column, value)
                elif isinstance(value, list):
                    # IN clause
                    if len(value) > 0:
                        query = query.in_(key, value)
                    else:
                        return jsonify([]), 200
                else:
                    # Simple equality
                    query = query.eq(key, value)
        
        # Apply ordering
        order_column = order_by.replace("-", "")
        desc = order_by.startswith("-")
        if order_column == "created_date":
            order_column = "created_at"
        
        query = query.order(order_column, desc=desc)
        response = query.execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'filter_menus')

@supabase_bp.route("/menus/<menu_id>", methods=["PATCH"])
def update_menu(menu_id):
    """Update a menu"""
    try:
        updates = request.get_json()
        if not updates:
            return jsonify({"error": "No update data provided"}), 400
        
        # Get existing change log
        existing = supabase.table("meal_plans_and_schemas").select("change_log").eq("id", menu_id).execute()
        if not existing.data:
            return jsonify({"error": "Menu not found"}), 404
        
        # Handle change log - ensure it's a list
        change_log = existing.data[0].get("change_log")
        if change_log is None:
            change_log = []
        elif not isinstance(change_log, list):
            change_log = []
        
        # Add change log entry (only if not already in updates to avoid recursion)
        if "change_log" not in updates:
            change_log.append({
                "timestamp": datetime.utcnow().isoformat(),
                "actor_id": updates.get('dietitian_id', 'system'),
                "action": "UPDATED",
                "details": {k: v for k, v in updates.items() if k != 'change_log'}
            })
            updates["change_log"] = change_log
        
        # Set updated_at if not already set
        if "updated_at" not in updates:
            updates["updated_at"] = datetime.utcnow().isoformat()
        
        response = supabase.table("meal_plans_and_schemas").update(updates).eq("id", menu_id).execute()
        return jsonify(response.data[0] if response.data else None), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_menu')

@supabase_bp.route("/menus/<menu_id>", methods=["DELETE"])
def delete_menu(menu_id):
    """Delete a menu"""
    try:
        supabase.table("meal_plans_and_schemas").delete().eq("id", menu_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_menu')

@supabase_bp.route("/menus/user/<user_code>", methods=["DELETE"])
def delete_menus_by_user_code(user_code):
    """Delete all menus for a user_code"""
    try:
        supabase.table("meal_plans_and_schemas").delete().eq("user_code", user_code).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_menus_by_user_code')

# ==================== CHAT USERS ENDPOINTS ====================

@supabase_bp.route("/chat-users", methods=["POST"])
def create_chat_user():
    """Create a new chat user"""
    try:
        data = request.get_json()
        response = supabase.table("chat_users").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_chat_user')

@supabase_bp.route("/chat-users", methods=["GET"])
def list_chat_users():
    """List all chat users"""
    try:
        fields = request.args.get('fields', '*')
        response = supabase.table("chat_users").select(fields).order("full_name").execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_chat_users')

@supabase_bp.route("/chat-users/<user_code>", methods=["GET"])
def get_chat_user(user_code):
    """Get a specific chat user by user_code"""
    try:
        fields = request.args.get('fields', '*')
        response = supabase.table("chat_users").select(fields).eq("user_code", user_code).execute()
        if not response.data:
            return jsonify({"error": "User not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_chat_user')

@supabase_bp.route("/chat-users/<user_code>/meal-plan", methods=["GET"])
def get_user_meal_plan(user_code):
    """Get active meal plan for a user"""
    try:
        response = supabase.table("meal_plans_and_schemas")\
            .select("meal_plan, daily_total_calories, macros_target, recommendations, dietary_restrictions")\
            .eq("user_code", user_code)\
            .eq("record_type", "meal_plan")\
            .eq("status", "active")\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()
        
        return jsonify(response.data[0] if response.data else None), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_user_meal_plan')

@supabase_bp.route("/chat-users/<user_code>", methods=["PATCH"])
def update_chat_user(user_code):
    """Update a chat user"""
    try:
        updates = request.get_json()
        response = supabase.table("chat_users").update(updates).eq("user_code", user_code).execute()
        
        if not response.data:
            return jsonify({"error": "User not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_chat_user')

@supabase_bp.route("/chat-users/<user_code>", methods=["DELETE"])
def delete_chat_user(user_code):
    """Delete a chat user"""
    try:
        supabase.table("chat_users").delete().eq("user_code", user_code).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_chat_user')

# ==================== CHAT CONVERSATIONS ENDPOINTS ====================

@supabase_bp.route("/chat-conversations", methods=["GET"])
def list_chat_conversations():
    """List all chat conversations"""
    try:
        fields = request.args.get('fields', '*')
        # Order by id (descending) to get the most recent conversations first
        response = supabase.table("chat_conversations").select(fields).order("id", desc=True).execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_chat_conversations')

@supabase_bp.route("/chat-conversations/user/<user_code>", methods=["GET"])
def get_conversation_by_user_code(user_code):
    """Get conversation for a specific user by user_code"""
    try:
        # First, get the user_id from chat_users table using user_code
        user_response = supabase.table("chat_users")\
            .select("id")\
            .eq("user_code", user_code)\
            .single()\
            .execute()
        
        if not user_response.data:
            return jsonify({"error": "User not found"}), 404
        
        user_id = user_response.data["id"]
        
        # Now get the conversation using user_id
        # Order by id (descending) to get the most recent conversation
        response = supabase.table("chat_conversations")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("id", desc=True)\
            .limit(1)\
            .execute()
        
        if not response.data:
            return jsonify({"error": "Conversation not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_conversation_by_user_code')

@supabase_bp.route("/chat-conversations/user/<user_code>/all", methods=["GET"])
def list_conversations_by_user_code(user_code):
    """List all conversations for a specific user"""
    try:
        # First, get the user_id from chat_users table using user_code
        user_response = supabase.table("chat_users")\
            .select("id")\
            .eq("user_code", user_code)\
            .single()\
            .execute()
        
        if not user_response.data:
            return jsonify({"error": "User not found"}), 404
        
        user_id = user_response.data["id"]
        
        # Now get all conversations using user_id
        # Order by id (descending) to get the most recent conversations first
        response = supabase.table("chat_conversations")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("id", desc=True)\
            .execute()
        
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_conversations_by_user_code')

@supabase_bp.route("/chat-conversations/<conversation_id>", methods=["DELETE"])
def delete_conversation(conversation_id):
    """Delete a specific conversation"""
    try:
        supabase.table("chat_conversations").delete().eq("id", conversation_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_conversation')

@supabase_bp.route("/chat-conversations/user/<user_code>", methods=["DELETE"])
def delete_conversations_by_user_code(user_code):
    """Delete all conversations for a specific user"""
    try:
        # First, get the user_id from chat_users table using user_code
        user_response = supabase.table("chat_users")\
            .select("id")\
            .eq("user_code", user_code)\
            .single()\
            .execute()
        
        if not user_response.data:
            return jsonify({"error": "User not found"}), 404
        
        user_id = user_response.data["id"]
        
        # Now delete all conversations using user_id
        supabase.table("chat_conversations").delete().eq("user_id", user_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_conversations_by_user_code')

# ==================== CHAT MESSAGES ENDPOINTS ====================

@supabase_bp.route("/chat-messages", methods=["POST"])
def create_chat_message():
    """Create a new chat message"""
    try:
        data = request.get_json()
        response = supabase.table("chat_messages").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_chat_message')

@supabase_bp.route("/chat-messages/conversation/<conversation_id>", methods=["GET"])
def list_messages_by_conversation(conversation_id):
    """List messages for a specific conversation"""
    try:
        limit = request.args.get('limit', type=int)
        before_message_id = request.args.get('beforeMessageId')
        
        query = supabase.table("chat_messages")\
            .select("*")\
            .eq("conversation_id", conversation_id)
        
        if before_message_id:
            # Get messages before a specific message ID (for pagination)
            # First get the created_at of the reference message
            ref_msg = supabase.table("chat_messages").select("created_at").eq("id", before_message_id).single().execute()
            if ref_msg.data:
                query = query.lt("created_at", ref_msg.data["created_at"])
        
        query = query.order("created_at", desc=True)
        
        if limit:
            query = query.limit(limit)
        
        response = query.execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_messages_by_conversation')

# ==================== FOOD LOGS ENDPOINTS ====================

@supabase_bp.route("/food-logs/<user_code>", methods=["GET"])
def get_food_logs_by_user_code(user_code):
    """Get food logs for a user by user_code"""
    try:
        # First, get the user_id from chat_users table
        user_response = supabase.table("chat_users").select("id").eq("user_code", user_code).execute()
        
        if not user_response.data or len(user_response.data) == 0:
            return jsonify({"error": "User not found"}), 404
        
        user_id = user_response.data[0]["id"]
        
        # Get food logs by user_id
        logs_response = supabase.table("food_logs")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("log_date", desc=True)\
            .execute()
        
        return jsonify(logs_response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_food_logs_by_user_code')

@supabase_bp.route("/food-logs/<user_code>/analyze", methods=["GET"])
def analyze_food_preferences(user_code):
    """Analyze food preferences for a user by user_code"""
    try:
        # First, get the user_id from chat_users table
        user_response = supabase.table("chat_users").select("id").eq("user_code", user_code).execute()
        
        if not user_response.data or len(user_response.data) == 0:
            return jsonify({"error": "User not found"}), 404
        
        user_id = user_response.data[0]["id"]
        
        # Get food logs by user_id
        logs_response = supabase.table("food_logs")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("log_date", desc=True)\
            .execute()
        
        food_logs = logs_response.data or []
        
        if not food_logs:
            return jsonify({"error": "No food logs found for this user"}), 404
        
        # Analyze eating habits
        meal_categories = {
            "breakfast": [],
            "lunch": [],
            "dinner": [],
            "snack": [],
            "morning snack": [],
            "afternoon snack": [],
            "evening snack": [],
            "other": [],
        }
        
        # Process each food log
        for log in food_logs:
            meal_type = (log.get("meal_type") or "other").lower()
            if meal_type in meal_categories:
                meal_categories[meal_type].append(log)
            else:
                meal_categories["other"].append(log)
        
        # Return analysis
        return jsonify({
            "total_logs": len(food_logs),
            "meal_categories": {k: len(v) for k, v in meal_categories.items()},
            "food_logs": food_logs
        }), 200
    except Exception as e:
        return handle_supabase_error(e, 'analyze_food_preferences')

# ==================== WEIGHT LOGS ENDPOINTS ====================

@supabase_bp.route("/weight-logs", methods=["GET"])
def list_weight_logs():
    """List weight logs with optional filters"""
    try:
        user_code = request.args.get('user_code')
        user_codes = request.args.get('user_codes')  # Comma-separated
        limit = request.args.get('limit', type=int)
        
        query = supabase.table("weight_logs").select("*")
        
        if user_code:
            query = query.eq("user_code", user_code)
        elif user_codes:
            codes_list = user_codes.split(",")
            query = query.in_("user_code", codes_list)
        
        if limit:
            query = query.limit(limit)
        
        query = query.order("measurement_date", desc=True)
        response = query.execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_weight_logs')

@supabase_bp.route("/weight-logs/user-codes", methods=["GET"])
def get_unique_user_codes():
    """Get unique user codes with weight logs"""
    try:
        response = supabase.table("weight_logs").select("user_code").execute()
        unique_codes = list(set([item["user_code"] for item in response.data if item.get("user_code")]))
        return jsonify(unique_codes), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_unique_user_codes')

@supabase_bp.route("/weight-logs", methods=["POST"])
def create_weight_log():
    """Create a new weight log entry"""
    try:
        data = request.get_json()
        response = supabase.table("weight_logs").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_weight_log')

@supabase_bp.route("/weight-logs/<log_id>", methods=["PATCH"])
def update_weight_log(log_id):
    """Update a weight log entry"""
    try:
        updates = request.get_json()
        response = supabase.table("weight_logs").update(updates).eq("id", log_id).execute()
        
        if not response.data:
            return jsonify({"error": "Weight log not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_weight_log')

@supabase_bp.route("/weight-logs/<log_id>", methods=["DELETE"])
def delete_weight_log(log_id):
    """Delete a weight log entry"""
    try:
        supabase.table("weight_logs").delete().eq("id", log_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_weight_log')

# ==================== PROFILES ENDPOINTS ====================

@supabase_bp.route("/profiles", methods=["GET"])
def list_profiles():
    """List all profiles with company info"""
    try:
        response = supabase.table("profiles")\
            .select("id, role, company_id, name, created_at, company:companies(id, name)")\
            .order("created_at", desc=True)\
            .execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_profiles')

@supabase_bp.route("/profiles/basic", methods=["GET"])
def get_basic_profiles():
    """Get basic profile information"""
    try:
        response = supabase.table("profiles").select("id, role, company_id").execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_basic_profiles')

@supabase_bp.route("/profiles/<profile_id>", methods=["GET"])
def get_profile(profile_id):
    """Get a profile by ID"""
    try:
        response = supabase.table("profiles")\
            .select("id, role, company_id")\
            .eq("id", profile_id)\
            .single()\
            .execute()
        
        if not response.data:
            return jsonify({"error": "Profile not found"}), 404
        return jsonify(response.data), 200
    except Exception as e:
        # Handle case where profile doesn't exist (PGRST116)
        if hasattr(e, 'code') and e.code == 'PGRST116':
            return jsonify({"error": "Profile not found"}), 404
        return handle_supabase_error(e, 'get_profile')

@supabase_bp.route("/profiles/company/<company_id>", methods=["GET"])
def get_profiles_by_company(company_id):
    """Get all profile IDs for a company"""
    try:
        response = supabase.table("profiles")\
            .select("id")\
            .eq("company_id", company_id)\
            .execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_profiles_by_company')

@supabase_bp.route("/profiles/<profile_id>", methods=["PATCH"])
def update_profile(profile_id):
    """Update a profile"""
    try:
        updates = request.get_json()
        response = supabase.table("profiles").update(updates).eq("id", profile_id).execute()
        
        if not response.data:
            return jsonify({"error": "Profile not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_profile')

# ==================== COMPANIES ENDPOINTS ====================

@supabase_bp.route("/companies", methods=["GET"])
def list_companies():
    """List all companies"""
    try:
        response = supabase.table("companies").select("id, name").order("name").execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_companies')

@supabase_bp.route("/companies", methods=["POST"])
def create_company():
    """Create a new company"""
    try:
        data = request.get_json()
        name = data.get('name')
        
        if not name:
            return jsonify({"error": "Company name is required"}), 400
        
        response = supabase.table("companies").insert({"name": name}).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_company')

# ==================== SYSTEM MESSAGES ENDPOINTS ====================

@supabase_bp.route("/system-messages", methods=["GET"])
def list_system_messages():
    """List system messages with optional filters"""
    try:
        is_active = request.args.get('is_active')
        priority = request.args.get('priority')
        
        query = supabase.table("system_messages").select("*")
        
        if is_active is not None:
            # Convert string to boolean
            is_active_bool = is_active.lower() == 'true' if isinstance(is_active, str) else bool(is_active)
            query = query.eq("is_active", is_active_bool)
        
        if priority:
            query = query.eq("priority", priority)
        
        query = query.order("created_at", desc=True)
        response = query.execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_system_messages')

@supabase_bp.route("/system-messages/<message_id>", methods=["GET"])
def get_system_message(message_id):
    """Get a specific system message"""
    try:
        response = supabase.table("system_messages").select("*").eq("id", message_id).execute()
        if not response.data:
            return jsonify({"error": "Message not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_system_message')

@supabase_bp.route("/system-messages", methods=["POST"])
def create_system_message():
    """Create a new system message"""
    try:
        data = request.get_json()
        response = supabase.table("system_messages").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_system_message')

@supabase_bp.route("/system-messages/<message_id>", methods=["PATCH"])
def update_system_message(message_id):
    """Update a system message"""
    try:
        updates = request.get_json()
        response = supabase.table("system_messages").update(updates).eq("id", message_id).execute()
        
        if not response.data:
            return jsonify({"error": "Message not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_system_message')

@supabase_bp.route("/system-messages/<message_id>", methods=["DELETE"])
def delete_system_message(message_id):
    """Delete a system message"""
    try:
        supabase.table("system_messages").delete().eq("id", message_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_system_message')

# ==================== SCHEDULED REMINDERS ENDPOINTS ====================

@supabase_bp.route("/scheduled-reminders", methods=["GET"])
def list_scheduled_reminders():
    """List scheduled reminders with optional filters"""
    try:
        user_code = request.args.get('user_code')
        status = request.args.get('status')  # Comma-separated statuses
        
        query = supabase.table("scheduled_reminders").select("*")
        
        if user_code:
            query = query.eq("user_code", user_code)
        
        if status:
            statuses = status.split(",")
            query = query.in_("status", statuses)
        
        query = query.order("scheduled_date").order("scheduled_time")
        response = query.execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_scheduled_reminders')

@supabase_bp.route("/scheduled-reminders", methods=["POST"])
def create_scheduled_reminder():
    """Create a new scheduled reminder"""
    try:
        data = request.get_json()
        response = supabase.table("scheduled_reminders").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_scheduled_reminder')

@supabase_bp.route("/scheduled-reminders/<reminder_id>", methods=["GET"])
def get_scheduled_reminder(reminder_id):
    """Get a specific scheduled reminder"""
    try:
        response = supabase.table("scheduled_reminders").select("*").eq("id", reminder_id).execute()
        if not response.data:
            return jsonify({"error": "Reminder not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_scheduled_reminder')

@supabase_bp.route("/scheduled-reminders/<reminder_id>", methods=["PATCH"])
def update_scheduled_reminder(reminder_id):
    """Update a scheduled reminder"""
    try:
        updates = request.get_json()
        response = supabase.table("scheduled_reminders").update(updates).eq("id", reminder_id).execute()
        
        if not response.data:
            return jsonify({"error": "Reminder not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_scheduled_reminder')

@supabase_bp.route("/scheduled-reminders/<reminder_id>", methods=["DELETE"])
def delete_scheduled_reminder(reminder_id):
    """Delete a scheduled reminder"""
    try:
        supabase.table("scheduled_reminders").delete().eq("id", reminder_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_scheduled_reminder')

@supabase_bp.route("/scheduled-reminders/plan/<plan_id>", methods=["DELETE"])
def delete_reminders_by_plan(plan_id):
    """Delete all scheduled reminders for a specific plan
    
    Query params:
    - plan_type: Type of plan (e.g., 'meal_plan', 'training_plan')
    """
    try:
        plan_type = request.args.get('plan_type')
        
        query = supabase.table("scheduled_reminders").delete().eq("plan_id", plan_id)
        
        if plan_type:
            query = query.eq("plan_type", plan_type)
        
        response = query.execute()
        return jsonify({"success": True, "deleted_count": len(response.data) if response.data else 0}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_reminders_by_plan')

# ==================== USER MESSAGE PREFERENCES ENDPOINTS ====================

@supabase_bp.route("/user-message-preferences", methods=["GET"])
def list_user_message_preferences():
    """List user message preferences with optional filters"""
    try:
        user_codes = request.args.get('user_codes')  # Comma-separated user codes
        limit = request.args.get('limit', type=int)
        offset = request.args.get('offset', type=int, default=0)
        count = request.args.get('count', 'false').lower() == 'true'
        
        query = supabase.table("user_message_preferences").select("*" if not count else "*", count='exact' if count else None)
        
        if user_codes:
            codes_list = user_codes.split(",")
            query = query.in_("user_code", codes_list)
        
        if limit:
            query = query.limit(limit)
        
        if offset:
            query = query.range(offset, offset + (limit or 100) - 1)
        
        response = query.execute()
        
        if count:
            return jsonify({
                "data": response.data,
                "count": response.count
            }), 200
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_user_message_preferences')

@supabase_bp.route("/user-message-preferences/<preference_id>", methods=["GET"])
def get_user_message_preference(preference_id):
    """Get a specific user message preference"""
    try:
        response = supabase.table("user_message_preferences").select("*").eq("id", preference_id).execute()
        if not response.data:
            return jsonify({"error": "Preference not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_user_message_preference')

@supabase_bp.route("/user-message-preferences", methods=["POST"])
def create_user_message_preference():
    """Create a new user message preference"""
    try:
        data = request.get_json()
        response = supabase.table("user_message_preferences").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_user_message_preference')

@supabase_bp.route("/user-message-preferences/<preference_id>", methods=["PATCH"])
def update_user_message_preference(preference_id):
    """Update a user message preference"""
    try:
        updates = request.get_json()
        response = supabase.table("user_message_preferences").update(updates).eq("id", preference_id).execute()
        
        if not response.data:
            return jsonify({"error": "Preference not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_user_message_preference')

@supabase_bp.route("/user-message-preferences/<preference_id>", methods=["DELETE"])
def delete_user_message_preference(preference_id):
    """Delete a user message preference"""
    try:
        supabase.table("user_message_preferences").delete().eq("id", preference_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_user_message_preference')

# ==================== INGREDIENTS ====================

@supabase_bp.route("/ingredients/search", methods=["GET"])
def search_ingredients():
    """Search ingredients with flexible query patterns
    
    Query params:
    - query: Search query string
    - page: Page number (default: 1)
    - limit: Results per page (default: 50)
    """
    try:
        query = request.args.get('query', '').strip()
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        
        if not query:
            return jsonify({"error": "Query parameter is required"}), 400
        
        # Normalize query for better matching
        query = query.strip().lower()
        
        # Calculate offset for pagination
        offset = (page - 1) * limit
        
        # Split query into words for multi-word search
        words = query.split()
        
        results = []
        
        # Query 1: Items that START with the query
        starts_with_pattern = f"{query}%"
        response1 = supabase.table("ingridientsroee")\
            .select("id, name, english_name, calories_energy, protein_g, fat_g, carbohydrates_g")\
            .or_(f"name.ilike.{starts_with_pattern},english_name.ilike.{starts_with_pattern}")\
            .limit(limit)\
            .execute()
        
        if response1.data:
            results.extend(response1.data)
        
        # Query 2: Items that CONTAIN the full query (if not enough results)
        if len(results) < limit:
            contains_pattern = f"%{query}%"
            response2 = supabase.table("ingridientsroee")\
                .select("id, name, english_name, calories_energy, protein_g, fat_g, carbohydrates_g")\
                .or_(f"name.ilike.{contains_pattern},english_name.ilike.{contains_pattern}")\
                .limit(limit * 2)\
                .execute()
            
            if response2.data:
                # Filter out duplicates
                existing_ids = {item['id'] for item in results}
                for item in response2.data:
                    if item['id'] not in existing_ids:
                        results.append(item)
                        existing_ids.add(item['id'])
        
        # Query 3: Items that contain ANY of the words (if multiple words)
        if len(words) > 1 and len(results) < limit:
            words_conditions = []
            for word in words:
                word_pattern = f"%{word}%"
                words_conditions.append(f"name.ilike.{word_pattern}")
                words_conditions.append(f"english_name.ilike.{word_pattern}")
            
            response3 = supabase.table("ingridientsroee")\
                .select("id, name, english_name, calories_energy, protein_g, fat_g, carbohydrates_g")\
                .or_(",".join(words_conditions))\
                .limit(200)\
                .execute()
            
            if response3.data:
                # Filter out duplicates
                existing_ids = {item['id'] for item in results}
                for item in response3.data:
                    if item['id'] not in existing_ids:
                        results.append(item)
                        existing_ids.add(item['id'])
        
        # Apply pagination to final results
        paginated_results = results[offset:offset + limit]
        
        return jsonify({
            "data": paginated_results,
            "page": page,
            "limit": limit,
            "total": len(results),
            "has_more": len(results) > offset + limit
        }), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'search_ingredients')

# ==================== MEAL TEMPLATES ====================

@supabase_bp.route("/meal-templates", methods=["GET"])
def list_meal_templates():
    """List meal templates with their variants
    
    Query params:
    - language: 'he' or 'en' (default: 'en')
    - dietitian_id: Filter by dietitian ID
    """
    try:
        language = request.args.get('language', 'en')
        dietitian_id = request.args.get('dietitian_id')
        
        order_column = 'hebrew_name' if language == 'he' else 'name'
        
        query = supabase.table("meal_templates")\
            .select("*, variants:meal_template_variants(meals_per_day)")\
            .order(order_column)
        
        if dietitian_id:
            query = query.eq("dietitian_id", dietitian_id)
        
        response = query.execute()
        return jsonify(response.data), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'list_meal_templates')

@supabase_bp.route("/meal-templates/<template_id>", methods=["GET"])
def get_meal_template(template_id):
    """Get a specific meal template"""
    try:
        response = supabase.table("meal_templates")\
            .select("*")\
            .eq("id", template_id)\
            .single()\
            .execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_meal_template')

@supabase_bp.route("/meal-templates", methods=["POST"])
def create_meal_template():
    """Create a new meal template
    
    Body: {
        name: string,
        hebrew_name?: string,
        tags?: array,
        dietitian_id?: string,
        company_id?: string
    }
    """
    try:
        data = request.get_json()
        
        template_data = {
            "name": data.get("name"),
            "tags": data.get("tags", [])
        }
        
        if data.get("hebrew_name"):
            template_data["hebrew_name"] = data["hebrew_name"]
        if data.get("dietitian_id"):
            template_data["dietitian_id"] = data["dietitian_id"]
        if data.get("company_id"):
            template_data["company_id"] = data["company_id"]
        
        response = supabase.table("meal_templates")\
            .insert(template_data)\
            .execute()
        
        return jsonify(response.data[0]), 201
        
    except Exception as e:
        return handle_supabase_error(e, 'create_meal_template')

@supabase_bp.route("/meal-templates/<template_id>", methods=["PATCH"])
def update_meal_template(template_id):
    """Update a meal template
    
    Body: {
        name?: string,
        hebrew_name?: string,
        tags?: array
    }
    """
    try:
        data = request.get_json()
        
        update_data = {}
        if "name" in data:
            update_data["name"] = data["name"]
        if "hebrew_name" in data:
            update_data["hebrew_name"] = data["hebrew_name"]
        if "tags" in data:
            update_data["tags"] = data["tags"]
        
        response = supabase.table("meal_templates")\
            .update(update_data)\
            .eq("id", template_id)\
            .execute()
        
        return jsonify(response.data[0]), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'update_meal_template')

@supabase_bp.route("/meal-templates/<template_id>", methods=["DELETE"])
def delete_meal_template(template_id):
    """Delete a meal template and all its variants and meals"""
    try:
        # First, get all variants for this template
        variants_response = supabase.table("meal_template_variants")\
            .select("id")\
            .eq("template_id", template_id)\
            .execute()
        
        if variants_response.data:
            # Delete all meals for each variant
            for variant in variants_response.data:
                supabase.table("meal_template_meals")\
                    .delete()\
                    .eq("variant_id", variant['id'])\
                    .execute()
            
            # Delete all variants
            supabase.table("meal_template_variants")\
                .delete()\
                .eq("template_id", template_id)\
                .execute()
        
        # Finally, delete the template
        supabase.table("meal_templates")\
            .delete()\
            .eq("id", template_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'delete_meal_template')

# ==================== MEAL TEMPLATE VARIANTS ====================

@supabase_bp.route("/meal-template-variants", methods=["GET"])
def list_meal_template_variants():
    """List meal template variants
    
    Query params:
    - template_id: Filter by template ID
    - meals_per_day: Filter by meals per day
    """
    try:
        template_id = request.args.get('template_id')
        meals_per_day = request.args.get('meals_per_day')
        
        query = supabase.table("meal_template_variants").select("*")
        
        if template_id:
            query = query.eq("template_id", template_id)
        if meals_per_day:
            query = query.eq("meals_per_day", int(meals_per_day))
        
        response = query.execute()
        return jsonify(response.data), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'list_meal_template_variants')

@supabase_bp.route("/meal-template-variants/<variant_id>", methods=["GET"])
def get_meal_template_variant(variant_id):
    """Get a specific meal template variant"""
    try:
        response = supabase.table("meal_template_variants")\
            .select("*")\
            .eq("id", variant_id)\
            .single()\
            .execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_meal_template_variant')

@supabase_bp.route("/meal-template-variants", methods=["POST"])
def create_meal_template_variant():
    """Create a new meal template variant
    
    Body: {
        template_id: string,
        meals_per_day: number
    }
    """
    try:
        data = request.get_json()
        
        variant_data = {
            "template_id": data.get("template_id"),
            "meals_per_day": data.get("meals_per_day")
        }
        
        response = supabase.table("meal_template_variants")\
            .insert(variant_data)\
            .execute()
        
        return jsonify(response.data[0]), 201
        
    except Exception as e:
        return handle_supabase_error(e, 'create_meal_template_variant')

@supabase_bp.route("/meal-template-variants/<variant_id>", methods=["DELETE"])
def delete_meal_template_variant(variant_id):
    """Delete a meal template variant and all its meals"""
    try:
        # Delete all meals for this variant
        supabase.table("meal_template_meals")\
            .delete()\
            .eq("variant_id", variant_id)\
            .execute()
        
        # Delete the variant
        supabase.table("meal_template_variants")\
            .delete()\
            .eq("id", variant_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'delete_meal_template_variant')

# ==================== MEAL TEMPLATE MEALS ====================

@supabase_bp.route("/meal-template-meals", methods=["GET"])
def list_meal_template_meals():
    """List meal template meals
    
    Query params:
    - variant_id: Filter by variant ID (required)
    """
    try:
        variant_id = request.args.get('variant_id')
        
        if not variant_id:
            return jsonify({"error": "variant_id parameter is required"}), 400
        
        response = supabase.table("meal_template_meals")\
            .select("*")\
            .eq("variant_id", variant_id)\
            .order("position")\
            .execute()
        
        return jsonify(response.data), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'list_meal_template_meals')

@supabase_bp.route("/meal-template-meals/<meal_id>", methods=["GET"])
def get_meal_template_meal(meal_id):
    """Get a specific meal template meal"""
    try:
        response = supabase.table("meal_template_meals")\
            .select("*")\
            .eq("id", meal_id)\
            .single()\
            .execute()
        return jsonify(response.data), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_meal_template_meal')

@supabase_bp.route("/meal-template-meals", methods=["POST"])
def create_meal_template_meals():
    """Create meal template meals (single or bulk)
    
    Body: {
        meals: array of {
            variant_id: string,
            position: number,
            meal_key: string,
            name: string,
            hebrew_name?: string,
            calories_percentage: number,
            emoji?: string
        }
    }
    """
    try:
        data = request.get_json()
        meals = data.get("meals", [])
        
        if not meals:
            return jsonify({"error": "meals array is required"}), 400
        
        response = supabase.table("meal_template_meals")\
            .insert(meals)\
            .execute()
        
        return jsonify(response.data), 201
        
    except Exception as e:
        return handle_supabase_error(e, 'create_meal_template_meals')

@supabase_bp.route("/meal-template-meals/<meal_id>", methods=["PATCH"])
def update_meal_template_meal(meal_id):
    """Update a meal template meal"""
    try:
        data = request.get_json()
        
        response = supabase.table("meal_template_meals")\
            .update(data)\
            .eq("id", meal_id)\
            .execute()
        
        return jsonify(response.data[0]), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'update_meal_template_meal')

@supabase_bp.route("/meal-template-meals/<meal_id>", methods=["DELETE"])
def delete_meal_template_meal(meal_id):
    """Delete a meal template meal"""
    try:
        supabase.table("meal_template_meals")\
            .delete()\
            .eq("id", meal_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'delete_meal_template_meal')

@supabase_bp.route("/meal-template-meals/variant/<variant_id>", methods=["DELETE"])
def delete_meals_by_variant(variant_id):
    """Delete all meals for a specific variant"""
    try:
        supabase.table("meal_template_meals")\
            .delete()\
            .eq("variant_id", variant_id)\
            .execute()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        return handle_supabase_error(e, 'delete_meals_by_variant')

# ==================== CLIENT MEAL PLANS ENDPOINTS (Second Supabase) ====================

@supabase_bp.route("/client-meal-plans", methods=["GET"])
def get_client_meal_plan():
    """Get a client meal plan by original_meal_plan_id"""
    try:
        if not second_supabase:
            return jsonify({"error": "Second Supabase client not configured"}), 500
        
        original_meal_plan_id = request.args.get('original_meal_plan_id')
        if not original_meal_plan_id:
            return jsonify({"error": "original_meal_plan_id is required"}), 400
        
        response = second_supabase.table("client_meal_plans")\
            .select("*")\
            .eq("original_meal_plan_id", original_meal_plan_id)\
            .maybeSingle()\
            .execute()
        
        return jsonify(response.data if response.data else None), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_client_meal_plan')

@supabase_bp.route("/client-meal-plans", methods=["POST"])
def create_client_meal_plan():
    """Create a new client meal plan"""
    try:
        if not second_supabase:
            return jsonify({"error": "Second Supabase client not configured"}), 500
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        response = second_supabase.table("client_meal_plans").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_client_meal_plan')

@supabase_bp.route("/client-meal-plans", methods=["PATCH"])
def update_client_meal_plan():
    """Update a client meal plan by original_meal_plan_id"""
    try:
        if not second_supabase:
            return jsonify({"error": "Second Supabase client not configured"}), 500
        
        original_meal_plan_id = request.args.get('original_meal_plan_id')
        if not original_meal_plan_id:
            return jsonify({"error": "original_meal_plan_id is required"}), 400
        
        updates = request.get_json()
        if not updates:
            return jsonify({"error": "Request body is required"}), 400
        
        response = second_supabase.table("client_meal_plans")\
            .update(updates)\
            .eq("original_meal_plan_id", original_meal_plan_id)\
            .execute()
        
        return jsonify(response.data[0] if response.data else None), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_client_meal_plan')

@supabase_bp.route("/client-meal-plans", methods=["DELETE"])
def delete_client_meal_plan():
    """Delete a client meal plan by original_meal_plan_id"""
    try:
        if not second_supabase:
            return jsonify({"error": "Second Supabase client not configured"}), 500
        
        original_meal_plan_id = request.args.get('original_meal_plan_id')
        if not original_meal_plan_id:
            return jsonify({"error": "original_meal_plan_id is required"}), 400
        
        second_supabase.table("client_meal_plans")\
            .delete()\
            .eq("original_meal_plan_id", original_meal_plan_id)\
            .execute()
        
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_client_meal_plan')

# ==================== CLIENTS ENDPOINTS (Second Supabase) ====================

@supabase_bp.route("/clients", methods=["GET"])
def get_client():
    """Get a client by user_code from second Supabase"""
    try:
        if not second_supabase:
            return jsonify({"error": "Second Supabase client not configured"}), 500
        
        user_code = request.args.get('user_code')
        if not user_code:
            return jsonify({"error": "user_code is required"}), 400
        
        # Get specific fields if requested
        select_fields = request.args.get('select', '*')
        
        response = second_supabase.table("clients")\
            .select(select_fields)\
            .eq("user_code", user_code)\
            .maybeSingle()\
            .execute()
        
        return jsonify(response.data if response.data else None), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_client')

@supabase_bp.route("/clients", methods=["DELETE"])
def delete_client():
    """Delete a client by user_code from second Supabase"""
    try:
        if not second_supabase:
            return jsonify({"error": "Second Supabase client not configured"}), 500
        
        user_code = request.args.get('user_code')
        if not user_code:
            return jsonify({"error": "user_code is required"}), 400
        
        second_supabase.table("clients")\
            .delete()\
            .eq("user_code", user_code)\
            .execute()
        
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_client')

# ==================== TRAINING PLANS ENDPOINTS ====================

@supabase_bp.route("/training-plans", methods=["GET"])
def list_training_plans():
    """List all training plans"""
    try:
        response = supabase.table("training_plans").select("*").order("created_at", desc=True).execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_training_plans')

@supabase_bp.route("/training-plans", methods=["POST"])
def create_training_plan():
    """Create a new training plan"""
    try:
        data = request.get_json()
        response = supabase.table("training_plans").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_training_plan')

@supabase_bp.route("/training-plans/<plan_id>", methods=["PATCH"])
def update_training_plan(plan_id):
    """Update a training plan"""
    try:
        updates = request.get_json()
        updates["updated_at"] = datetime.utcnow().isoformat()
        response = supabase.table("training_plans").update(updates).eq("id", plan_id).execute()
        
        if not response.data:
            return jsonify({"error": "Training plan not found"}), 404
        
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_training_plan')

@supabase_bp.route("/training-plans/<plan_id>", methods=["DELETE"])
def delete_training_plan(plan_id):
    """Delete a training plan"""
    try:
        supabase.table("training_plans").delete().eq("id", plan_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_training_plan')

@supabase_bp.route("/training-plans/user/<user_code>", methods=["GET"])
def get_training_plans_by_user_code(user_code):
    """Get training plans for a specific user"""
    try:
        response = supabase.table("training_plans")\
            .select("*")\
            .eq("user_code", user_code)\
            .order("created_at", desc=True)\
            .execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_training_plans_by_user_code')

@supabase_bp.route("/training-plans/user/<user_code>/active", methods=["GET"])
def get_active_training_plans_by_user_code(user_code):
    """Get active training plans for a specific user"""
    try:
        response = supabase.table("training_plans")\
            .select("*")\
            .eq("user_code", user_code)\
            .eq("status", "active")\
            .order("created_at", desc=True)\
            .execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_active_training_plans_by_user_code')

# ==================== TRAINING LOGS ENDPOINTS ====================

@supabase_bp.route("/training-logs", methods=["GET"])
def list_training_logs():
    """List all training logs with optional limit"""
    try:
        limit = request.args.get('limit', type=int, default=100)
        query = supabase.table("training_logs").select("*").order("session_date", desc=True)
        
        if limit:
            query = query.limit(limit)
        
        response = query.execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_training_logs')

@supabase_bp.route("/training-logs/user/<user_code>", methods=["GET"])
def get_training_logs_by_user_code(user_code):
    """Get training logs for a specific user"""
    try:
        limit = request.args.get('limit', type=int, default=50)
        query = supabase.table("training_logs")\
            .select("*")\
            .eq("user_code", user_code)\
            .order("session_date", desc=True)
        
        if limit:
            query = query.limit(limit)
        
        response = query.execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_training_logs_by_user_code')

@supabase_bp.route("/training-logs/user/<user_code>/date-range", methods=["GET"])
def get_training_logs_by_date_range(user_code):
    """Get training logs for a user within a date range"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not start_date or not end_date:
            return jsonify({"error": "start_date and end_date are required"}), 400
        
        query = supabase.table("training_logs")\
            .select("*")\
            .eq("user_code", user_code)\
            .gte("session_date", start_date)\
            .lte("session_date", end_date)\
            .order("session_date", desc=True)
        
        response = query.execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_training_logs_by_date_range')

# ==================== TRAINING REMINDERS ENDPOINTS ====================

@supabase_bp.route("/training-reminders/pending", methods=["GET"])
def get_pending_training_reminders():
    """Get all pending training reminders"""
    try:
        now = datetime.utcnow().isoformat()
        # Combine scheduled_date and scheduled_time for comparison
        today = datetime.utcnow().date().isoformat()
        response = supabase.table("scheduled_reminders")\
            .select("*")\
            .eq("plan_type", "training_plan")\
            .eq("status", "pending")\
            .lte("scheduled_date", today)\
            .order("scheduled_date", desc=False)\
            .order("scheduled_time", desc=False)\
            .execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_pending_training_reminders')

@supabase_bp.route("/training-reminders/user/<user_code>", methods=["GET"])
def get_training_reminders_by_user_code(user_code):
    """Get training reminders for a specific user"""
    try:
        response = supabase.table("scheduled_reminders")\
            .select("*")\
            .eq("plan_type", "training_plan")\
            .eq("user_code", user_code)\
            .order("scheduled_date", desc=True)\
            .order("scheduled_time", desc=True)\
            .execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_training_reminders_by_user_code')

@supabase_bp.route("/training-reminders", methods=["POST"])
def create_training_reminder():
    """Create a new training reminder"""
    try:
        data = request.get_json()
        # Ensure plan_type is set to "training_plan" for training reminders
        if "plan_type" not in data:
            data["plan_type"] = "training_plan"
        response = supabase.table("scheduled_reminders").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_training_reminder')

@supabase_bp.route("/training-reminders/<reminder_id>", methods=["PATCH"])
def update_training_reminder(reminder_id):
    """Update a training reminder"""
    try:
        updates = request.get_json()
        response = supabase.table("scheduled_reminders").update(updates).eq("id", reminder_id).execute()
        
        if not response.data:
            return jsonify({"error": "Training reminder not found"}), 404
        
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_training_reminder')

@supabase_bp.route("/training-reminders/<reminder_id>", methods=["DELETE"])
def delete_training_reminder(reminder_id):
    """Delete a training reminder"""
    try:
        supabase.table("scheduled_reminders").delete().eq("id", reminder_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_training_reminder')

# ==================== EXERCISE LIBRARY ENDPOINTS ====================

@supabase_bp.route("/exercise-library", methods=["GET"])
def list_exercise_library():
    """List all exercises in the library"""
    try:
        response = supabase.table("exercise_library").select("*").order("exercise_name").execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_exercise_library')

@supabase_bp.route("/exercise-library", methods=["POST"])
def create_exercise():
    """Create a new exercise"""
    try:
        data = request.get_json()
        response = supabase.table("exercise_library").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_exercise')

@supabase_bp.route("/exercise-library/<exercise_id>", methods=["PATCH"])
def update_exercise(exercise_id):
    """Update an exercise"""
    try:
        updates = request.get_json()
        response = supabase.table("exercise_library").update(updates).eq("id", exercise_id).execute()
        
        if not response.data:
            return jsonify({"error": "Exercise not found"}), 404
        
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_exercise')

@supabase_bp.route("/exercise-library/<exercise_id>", methods=["DELETE"])
def delete_exercise(exercise_id):
    """Delete an exercise"""
    try:
        supabase.table("exercise_library").delete().eq("id", exercise_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_exercise')

@supabase_bp.route("/exercise-library/category/<category>", methods=["GET"])
def get_exercises_by_category(category):
    """Get exercises by category"""
    try:
        response = supabase.table("exercise_library")\
            .select("*")\
            .eq("category", category)\
            .order("exercise_name")\
            .execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_exercises_by_category')

@supabase_bp.route("/exercise-library/search", methods=["GET"])
def search_exercises():
    """Search exercises by query"""
    try:
        query = request.args.get('query', '')
        if not query:
            return jsonify([]), 200
        
        # Search in exercise_name, exercise_name_he, description
        # Use ilike for case-insensitive search
        search_pattern = f"%{query}%"
        response = supabase.table("exercise_library")\
            .select("*")\
            .or_(f"exercise_name.ilike.{search_pattern},exercise_name_he.ilike.{search_pattern},description.ilike.{search_pattern}")\
            .order("exercise_name")\
            .execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'search_exercises')

# ==================== TRAINING PLAN TEMPLATES ENDPOINTS ====================

@supabase_bp.route("/training-plan-templates", methods=["GET"])
def list_training_plan_templates():
    """List all training plan templates (both public and user's own)"""
    try:
        # Get user_id from request if available (for filtering user's templates)
        user_id = request.args.get('user_id')
        
        query = supabase.table("training_plan_templates").select("*")
        
        if user_id:
            # Get user's templates
            query = query.eq("created_by", user_id)
        else:
            # Get all templates (public and user's own)
            query = query.or_(f"is_public.eq.true,created_by.eq.{user_id}" if user_id else "is_public.eq.true")
        
        response = query.order("created_at", desc=True).execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'list_training_plan_templates')

@supabase_bp.route("/training-plan-templates/public", methods=["GET"])
def get_public_training_plan_templates():
    """Get all public training plan templates"""
    try:
        response = supabase.table("training_plan_templates")\
            .select("*")\
            .eq("is_public", True)\
            .order("created_at", desc=True)\
            .execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'get_public_training_plan_templates')

@supabase_bp.route("/training-plan-templates/search", methods=["GET"])
def search_training_plan_templates():
    """Search training plan templates by query"""
    try:
        query = request.args.get('query', '')
        if not query:
            return jsonify([]), 200
        
        # Search in template_name, template_name_he, description, description_he
        search_pattern = f"%{query}%"
        response = supabase.table("training_plan_templates")\
            .select("*")\
            .or_(f"template_name.ilike.{search_pattern},template_name_he.ilike.{search_pattern},description.ilike.{search_pattern},description_he.ilike.{search_pattern}")\
            .order("created_at", desc=True)\
            .execute()
        return jsonify(response.data or []), 200
    except Exception as e:
        return handle_supabase_error(e, 'search_training_plan_templates')

@supabase_bp.route("/training-plan-templates", methods=["POST"])
def create_training_plan_template():
    """Create a new training plan template"""
    try:
        data = request.get_json()
        response = supabase.table("training_plan_templates").insert(data).execute()
        return jsonify(response.data[0] if response.data else None), 201
    except Exception as e:
        return handle_supabase_error(e, 'create_training_plan_template')

@supabase_bp.route("/training-plan-templates/<template_id>", methods=["PATCH"])
def update_training_plan_template(template_id):
    """Update a training plan template"""
    try:
        updates = request.get_json()
        response = supabase.table("training_plan_templates").update(updates).eq("id", template_id).execute()
        
        if not response.data:
            return jsonify({"error": "Template not found"}), 404
        
        return jsonify(response.data[0]), 200
    except Exception as e:
        return handle_supabase_error(e, 'update_training_plan_template')

@supabase_bp.route("/training-plan-templates/<template_id>", methods=["DELETE"])
def delete_training_plan_template(template_id):
    """Delete a training plan template"""
    try:
        supabase.table("training_plan_templates").delete().eq("id", template_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return handle_supabase_error(e, 'delete_training_plan_template')

# ==================== HEALTH CHECK ====================

@supabase_bp.route("/health", methods=["GET"])
def api_health_check():
    """API health check with CORS verification"""
    origin = request.headers.get('Origin', 'Not provided')
    
    # Test second Supabase connection
    second_status = "not_configured"
    if second_supabase:
        try:
            second_supabase.table("client_meal_plans").select("id").limit(1).execute()
            second_status = "connected"
        except:
            second_status = "error"
    
    return jsonify({
        "status": "healthy",
        "service": "Supabase API Blueprint",
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY),
        "second_supabase_status": second_status,
        "timestamp": datetime.utcnow().isoformat(),
        "cors": {
            "enabled": True,
            "configured_in": "backend.py main app",
            "request_origin": origin,
            "allowed_origins": [
                "http://localhost:5173",
                "https://www.betterchoicefood.com",
                "https://betterchoicefood.com",
                "And others configured in backend.py"
            ]
        }
    }), 200

logger.info("✅ Supabase API Blueprint initialized with all endpoints")
