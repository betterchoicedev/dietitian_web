# Standard library imports
import os
import json
import re
import uuid
import logging
import traceback
import datetime
from io import BytesIO
from functools import wraps
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor, as_completed

# Third-party imports
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from openai import AzureOpenAI
from dotenv import load_dotenv
from supabase import create_client, Client
from google.cloud import storage
from google.oauth2 import service_account
from werkzeug.utils import secure_filename
import requests

# Initialize logging before optional imports that may use logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Import libraries for Hebrew text support
try:
    from bidi.algorithm import get_display
    from arabic_reshaper import reshape

    BIDI_SUPPORT = True
except ImportError:
    BIDI_SUPPORT = False
    logger.warning(
        "Bidirectional text support not available. Install arabic-reshaper and python-bidi for Hebrew support."
    )

# Optional import for Supabase API blueprint
try:
    from supabase_api import supabase_bp

    SUPABASE_API_AVAILABLE = True
except ImportError as e:
    logger.warning(f"supabase_api module not available: {e}")
    SUPABASE_API_AVAILABLE = False

app = Flask(__name__)

default_allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost:5173",
    "https://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000",
    "https://www.betterchoicefood.com",
    "https://betterchoicefood.com",
    "https://betterchoice.one",
]

env_allowed_origins = os.getenv("API_ALLOWED_ORIGINS")
if env_allowed_origins:
    allowed_origins = [
        origin.strip() for origin in env_allowed_origins.split(",") if origin.strip()
    ]
else:
    allowed_origins = default_allowed_origins

CORS(
    app,
    resources={r"/api/*": {"origins": allowed_origins}},
    supports_credentials=True,
)

# Register blueprints
if SUPABASE_API_AVAILABLE:
    app.register_blueprint(supabase_bp)
    logger.info("Registered supabase_api blueprint at /api/db")

# Initialize Supabase client

supabase_url = os.getenv("supabaseUrl")

supabase_key = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("supabaseServiceRoleKey")
    or os.getenv("supabaseServiceKey")
    or os.getenv("supabaseKey")
)

supabase: Client = create_client(supabase_url, supabase_key)

# Initialize second Supabase client (for meal_plans database)
second_supabase_url = os.getenv("SECOND_SUPABASE_URL") or os.getenv("secondSupabaseUrl")
second_supabase_key = (
    os.getenv("SECOND_SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("secondSupabaseServiceRoleKey")
    or os.getenv("secondSupabaseServiceKey")
    or os.getenv("secondSupabaseKey")
)

second_supabase: Client = None
if second_supabase_url and second_supabase_key:
    second_supabase = create_client(second_supabase_url, second_supabase_key)

# Google Cloud Storage Configuration
GCS_BUCKET_NAME = os.getenv("GCS_CHAT_BUCKET", "users-chat-uploads")
GCS_SERVICE_ACCOUNT_FILE = os.getenv("GCS_SERVICE_ACCOUNT_FILE")
GCS_SERVICE_ACCOUNT_JSON = os.getenv("GCS_SERVICE_ACCOUNT_JSON")
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
_gcs_client = None

# Azure Translator Configuration
AZURE_TRANSLATOR_ENDPOINT = os.getenv("AZURE_TRANSLATOR_ENDPOINT")
AZURE_TRANSLATOR_KEY = os.getenv("AZURE_TRANSLATOR_KEY")
AZURE_TRANSLATOR_REGION = os.getenv("AZURE_TRANSLATOR_REGION")

# Azure OpenAI Configuration
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
AZURE_OPENAI_API_BASE = os.getenv("AZURE_OPENAI_API_BASE")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "obi2")

# Azure AD Configuration (for UPC service)
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID")
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
AZURE_UPC_SCOPE = os.getenv("AZURE_UPC_SCOPE", "api://sqlservice/.default")

# Supabase Auth Configuration
SUPABASE_AUTO_CONFIRM = (os.getenv("SUPABASE_AUTO_CONFIRM") or "false").lower() in {
    "1",
    "true",
    "yes",
    "y",
}
SUPABASE_EMAIL_REDIRECT_URL = os.getenv("SUPABASE_EMAIL_REDIRECT_URL")

# DSPy Configuration
USE_DSPY = os.getenv("USE_DSPY", "true").lower() == "true"


# --- Helper Functions ---
def _get_gcs_client():
    global _gcs_client

    if _gcs_client:
        return _gcs_client

    credentials = None
    json_env = (GCS_SERVICE_ACCOUNT_JSON or "").strip()

    if json_env:
        try:
            info = json.loads(json_env)
            credentials = service_account.Credentials.from_service_account_info(info)
        except Exception:
            logger.exception(
                "Failed to load GCS credentials from GCS_SERVICE_ACCOUNT_JSON; falling back to file/env"
            )
            credentials = None

    if (
        credentials is None
        and GCS_SERVICE_ACCOUNT_FILE
        and os.path.exists(GCS_SERVICE_ACCOUNT_FILE)
    ):
        try:
            credentials = service_account.Credentials.from_service_account_file(
                GCS_SERVICE_ACCOUNT_FILE
            )
        except Exception:
            logger.exception("Failed to load GCS credentials from file")
            raise

    if credentials is None and GOOGLE_APPLICATION_CREDENTIALS:
        _gcs_client = storage.Client()
        return _gcs_client

    if credentials is None:
        raise RuntimeError(
            "Google Cloud Storage credentials are not configured. "
            "Set GCS_SERVICE_ACCOUNT_JSON, GCS_SERVICE_ACCOUNT_FILE, or GOOGLE_APPLICATION_CREDENTIALS."
        )

    project_id = getattr(credentials, "project_id", None)
    _gcs_client = storage.Client(credentials=credentials, project=project_id)
    return _gcs_client


def _parse_iso_datetime(value):
    if not value:
        return None

    if isinstance(value, datetime.datetime):
        return value

    try:
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return None

            if cleaned.endswith("Z"):
                cleaned = cleaned[:-1] + "+00:00"

            return datetime.datetime.fromisoformat(cleaned)
    except Exception:
        return None

    return None


def _require_service_key():
    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "Supabase service credentials missing; check supabaseUrl and supabaseKey env vars."
        )


def _generate_invite_code():
    return uuid.uuid4().hex[:10].upper()


@app.route("/api/chat/uploads", methods=["POST"])
def api_chat_upload_media():
    """
    Accepts multipart/form-data uploads and stores the file in Google Cloud Storage.
    Returns JSON containing the public URL and object path.
    """
    bucket_override = (request.form.get("bucket") or "").strip()
    bucket_name = bucket_override or GCS_BUCKET_NAME

    if not bucket_name:
        return jsonify({"error": "GCS bucket is not configured"}), 500

    if "file" not in request.files:
        return jsonify({"error": "Missing file field"}), 400

    file_obj = request.files["file"]
    if not file_obj or not file_obj.filename:
        return jsonify({"error": "Uploaded file is empty"}), 400

    folder = (request.form.get("folder") or "chat").strip().strip("/")
    user_code = (request.form.get("user_code") or "").strip().strip("/")
    priority = request.form.get("priority")

    try:
        client = _get_gcs_client()
        bucket = client.bucket(bucket_name)

        if not bucket.exists(client=client):
            return jsonify({"error": f"GCS bucket '{bucket_name}' does not exist"}), 400

        safe_name = secure_filename(file_obj.filename) or "upload"
        _, ext = os.path.splitext(safe_name)
        timestamp = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
        unique_id = uuid.uuid4().hex
        folder_parts = [part for part in folder.split("/") if part]
        path_parts = ["web"]

        if user_code:
            path_parts.append(user_code)
        elif folder_parts:
            path_parts.extend(folder_parts)

        object_name = "/".join(path_parts + [f"{timestamp}-{unique_id}{ext}"])
        blob = bucket.blob(object_name)
        blob.cache_control = "public, max-age=3600"
        file_obj.stream.seek(0)

        blob.upload_from_file(
            file_obj.stream,
            content_type=file_obj.mimetype or "application/octet-stream",
            rewind=True,
        )

        # Attempt to make the object public for direct access.
        try:
            blob.make_public()
            public_url = blob.public_url
        except Exception:
            logger.warning("Failed to set public ACL for %s; using media link", object_name)
            public_url = (
                blob.media_link or f"https://storage.googleapis.com/{bucket_name}/{object_name}"
            )

        response_payload = {
            "url": public_url,
            "path": object_name,
            "bucket": bucket_name,
            "content_type": file_obj.mimetype or "application/octet-stream",
            "size": getattr(file_obj, "content_length", None),
            "priority": priority,
        }

        return jsonify(response_payload), 201

    except Exception as exc:
        logger.exception("Failed to upload chat media to GCS")
        return jsonify({"error": "Failed to upload file", "details": str(exc)}), 500


@app.route("/api/auth/delete-second-user", methods=["POST"])
def api_delete_second_auth_user():
    """
    Delete an auth user from the second Supabase instance.
    Requires: user_id (UUID) or email
    """
    logger.info("🔍 Received request to delete second Supabase auth user")

    # Check configuration
    url_configured = bool(second_supabase_url)
    key_configured = bool(second_supabase_key)

    logger.info(
        "🔍 Second Supabase config check - URL configured: %s, Key configured: %s",
        url_configured,
        key_configured,
    )

    if not url_configured or not key_configured:
        error_msg = f"Second Supabase is not configured. URL configured: {url_configured}, Key configured: {key_configured}"
        logger.error("❌ %s", error_msg)
        logger.error(
            "❌ Please set environment variables: SECOND_SUPABASE_URL (or secondSupabaseUrl) and SECOND_SUPABASE_SERVICE_ROLE_KEY (or secondSupabaseServiceRoleKey)"
        )
        return jsonify({"error": error_msg}), 500

    # Ensure URL doesn't have trailing slash
    base_url = second_supabase_url.rstrip("/") if second_supabase_url else None
    logger.info("🔍 Using second Supabase URL: %s", base_url)

    try:
        payload = request.get_json()
        if not payload:
            logger.error("❌ Request body is missing")
            return jsonify({"error": "Request body is required"}), 400

        user_id = payload.get("user_id")
        email = payload.get("email")

        logger.info("📥 Request payload - user_id: %s, email: %s", user_id, email)

        if not user_id and not email:
            logger.error("❌ Neither user_id nor email provided")
            return jsonify({"error": "Either user_id or email is required"}), 400

        admin_headers = {
            "apikey": second_supabase_key,
            "Authorization": f"Bearer {second_supabase_key}",
            "Content-Type": "application/json",
        }

        # If we don't have user_id, look it up by email first
        if not user_id and email:
            try:
                logger.info("🔍 Looking up user by email: %s", email)
                lookup_url = f"{base_url}/auth/v1/admin/users?email={email}"
                logger.info("🔍 Lookup URL: %s", lookup_url)
                lookup_response = requests.get(
                    lookup_url,
                    headers=admin_headers,
                    timeout=15,
                )
                logger.info("📥 Lookup response status: %s", lookup_response.status_code)
                if lookup_response.status_code == 200:
                    lookup_data = lookup_response.json()
                    logger.info("📥 Lookup response data: %s", lookup_data)
                    if lookup_data.get("users") and len(lookup_data["users"]) > 0:
                        user_id = lookup_data["users"][0]["id"]
                        logger.info("✅ Found auth user_id %s for email %s", user_id, email)
                    else:
                        logger.warning("⚠️ No users found for email %s", email)
                else:
                    logger.warning(
                        "⚠️ Lookup failed with status %s: %s",
                        lookup_response.status_code,
                        lookup_response.text,
                    )
            except Exception as lookup_err:
                logger.exception("❌ Failed to lookup auth user by email %s: %s", email, lookup_err)
                return jsonify({"error": f"Failed to lookup user by email: {str(lookup_err)}"}), 500

        # Delete by user_id (UUID) - this is the only supported method
        if user_id:
            delete_endpoint = f"{base_url}/auth/v1/admin/users/{user_id}"
            logger.info("🗑️ Attempting to delete auth user at: %s", delete_endpoint)

            delete_response = requests.delete(
                delete_endpoint,
                headers=admin_headers,
                timeout=15,
            )

            logger.info("📥 Delete response status: %s", delete_response.status_code)
            logger.info("📥 Delete response text: %s", delete_response.text)

            if delete_response.status_code == 200 or delete_response.status_code == 204:
                logger.info(
                    "✅ Successfully deleted auth user from second Supabase for user_id %s", user_id
                )
                return jsonify({"success": True, "message": "Auth user deleted successfully"}), 200
            else:
                error_text = delete_response.text
                try:
                    error_data = delete_response.json()
                except:
                    error_data = {"error": error_text}
                logger.error(
                    "❌ Failed to delete auth user from second Supabase. Status: %s, Error: %s",
                    delete_response.status_code,
                    error_data,
                )
                return (
                    jsonify({"error": "Failed to delete auth user", "details": error_data}),
                    delete_response.status_code,
                )
        else:
            logger.error("❌ Cannot delete auth user: no user_id found after lookup")
            return jsonify({"error": "Cannot delete auth user: no user_id found"}), 400

    except Exception as exc:
        logger.exception("❌ Failed to delete auth user from second Supabase")
        return jsonify({"error": "Failed to delete auth user", "details": str(exc)}), 500


@app.route("/api/auth/register", methods=["POST"])
def api_auth_register():

    _require_service_key()

    try:

        payload = request.get_json(force=True)

    except Exception:

        return jsonify({"error": "Invalid JSON payload"}), 400

    email = (payload.get("email") or "").strip().lower()

    password = payload.get("password")

    name = (payload.get("name") or "").strip()

    invite_code = (payload.get("invite_code") or "").strip()

    company_id = payload.get("company_id")

    if company_id in ("", "none"):
        company_id = None

    if not email or not password or not name or not invite_code:
        return jsonify({"error": "Missing required fields"}), 400

    now_utc = datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)

    try:
        invite_response = (
            supabase.table("registration_invites")
            .select("*")
            .eq("code", invite_code)
            .limit(1)
            .execute()
        )
    except Exception as err:
        logger.error("Failed to query registration_invites: %s", err)
        return jsonify({"error": "Unable to validate invitation"}), 500

    invite_rows = getattr(invite_response, "data", None) or []
    if not invite_rows:
        return (
            jsonify({"error": "This invitation is not valid. Please contact your administrator."}),
            403,
        )

    invite = invite_rows[0]
    invite_email = (invite.get("email") or "").strip().lower()

    if invite_email and invite_email != email:
        return (
            jsonify({"error": "This invitation is restricted to a different email address."}),
            403,
        )

    if invite.get("revoked_at"):
        return (
            jsonify({"error": "This invitation has been revoked. Please request a new one."}),
            403,
        )

    if invite.get("used_at"):
        return (
            jsonify({"error": "This invitation was already used. Please request a new one."}),
            403,
        )

    expires_at = _parse_iso_datetime(invite.get("expires_at"))
    if expires_at and expires_at < now_utc:
        return jsonify({"error": "This invitation has expired. Please request a new one."}), 403

    target_company_id = company_id or invite.get("company_id")
    target_role = invite.get("role") or "employee"

    admin_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }

    auto_confirm = SUPABASE_AUTO_CONFIRM
    verification_redirect = SUPABASE_EMAIL_REDIRECT_URL
    user_id = None

    if auto_confirm:
        admin_payload = {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "name": name,
                "full_name": name,
                "display_name": name,
            },
        }

        try:
            admin_resp = requests.post(
                f"{supabase_url}/auth/v1/admin/users",
                headers=admin_headers,
                json=admin_payload,
                timeout=15,
            )
        except Exception as err:
            logger.error("Failed to create user via admin API: %s", err)
            return jsonify({"error": "Unable to create user account"}), 500

        if admin_resp.status_code >= 400:
            try:
                admin_error = admin_resp.json()
            except Exception:
                admin_error = {"error": admin_resp.text}

            message = admin_error.get("message") or admin_error.get(
                "error", "Failed to create user account"
            )
            logger.warning("Admin user creation rejected: %s", admin_error)
            return jsonify({"error": message}), 400

        try:
            admin_data = admin_resp.json()
        except Exception:
            admin_data = {}

        user_id = admin_data.get("id") or admin_data.get("user", {}).get("id")
        if not user_id:
            logger.error("Admin API response missing user id: %s", admin_data)
            return jsonify({"error": "User account created but missing identifier"}), 500

    else:
        signup_payload = {
            "email": email,
            "password": password,
            "data": {
                "name": name,
                "full_name": name,
                "display_name": name,
            },
        }

        try:
            signup_url = f"{supabase_url}/auth/v1/signup"
            params = {"redirect_to": verification_redirect} if verification_redirect else None

            signup_resp = requests.post(
                signup_url,
                headers=admin_headers,
                json=signup_payload,
                params=params,
                timeout=15,
            )
        except Exception as err:
            logger.error("Failed to sign up user via auth endpoint: %s", err)
            return jsonify({"error": "Unable to create user account"}), 500

        if signup_resp.status_code >= 400:
            try:
                signup_error = signup_resp.json()
            except Exception:
                signup_error = {"error": signup_resp.text}

            message = signup_error.get("message") or signup_error.get(
                "error", "Failed to create user account"
            )
            logger.warning("Signup request rejected: %s", signup_error)
            return jsonify({"error": message}), 400

        try:
            signup_data = signup_resp.json()
        except Exception:
            signup_data = {}

        user_id = signup_data.get("user", {}).get("id") or signup_data.get("id")
        if not user_id:
            logger.error("Signup response missing user id: %s", signup_data)
            return jsonify({"error": "User account created but missing identifier"}), 500

    profile_payload = {
        "id": user_id,
        "role": target_role,
        "name": name,
        "company_id": target_company_id,
    }

    try:
        profile_resp = supabase.table("profiles").insert(profile_payload).execute()
        if getattr(profile_resp, "error", None):
            raise Exception(profile_resp.error)
    except Exception as err:
        logger.error("Failed to create profile for %s: %s", user_id, err)
        return jsonify({"error": "Unable to create user profile"}), 500

    try:

        supabase.table("registration_invites").update(
            {
                "used_at": now_utc.isoformat(),
                "used_by": user_id,
            }
        ).eq("id", invite.get("id")).execute()

    except Exception as err:

        logger.warning("Failed to mark invite %s as used: %s", invite.get("id"), err)

    return jsonify({"success": True, "user_id": user_id, "role": target_role}), 201


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
                pattern = r"(?<!\w)" + re.escape(en_word) + r"(?!\w)"
                t = re.sub(pattern, repl_func, t, flags=re.IGNORECASE)

            placeholder_map.append(ph_map)
            texts_for_azure.append(t)
    else:
        texts_for_azure = texts
        placeholder_map = [{} for _ in texts]

    # 3. Call Azure Translator in bulk
    endpoint = AZURE_TRANSLATOR_ENDPOINT
    key = AZURE_TRANSLATOR_KEY
    region = AZURE_TRANSLATOR_REGION

    url = f"{endpoint}/translate?api-version=3.0&to={target}"
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-Type": "application/json",
    }

    body = [{"Text": t} for t in texts_for_azure]
    translations = []

    if body:
        resp = requests.post(url, headers=headers, json=body)
        resp.raise_for_status()
        translations = resp.json()  # a list, same length as body

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
                pattern = r"(?<!\w)" + re.escape(en_word) + r"(?!\w)"
                text_for_azure = re.sub(pattern, repl_func, text_for_azure, flags=re.IGNORECASE)

        # For English: send Hebrew text directly to Azure without custom replacements
        elif target == "en":
            text_for_azure = text
            ph_map = {}
        else:
            text_for_azure = text
            ph_map = {}

        # Call Azure Translator
        endpoint = AZURE_TRANSLATOR_ENDPOINT
        key = AZURE_TRANSLATOR_KEY
        region = AZURE_TRANSLATOR_REGION

        if not all([endpoint, key, region]):
            logger.error("Azure Translator environment variables not configured")
            return jsonify({"error": "Translation service not configured"}), 500

        url = f"{endpoint}/translate?api-version=3.0&to={target}"
        headers = {
            "Ocp-Apim-Subscription-Key": key,
            "Ocp-Apim-Subscription-Region": region,
            "Content-Type": "application/json",
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
                paths.append(
                    ("meals", mi, "alternatives", ai, "ingredients", ii, "household_measure")
                )

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
                pattern = r"(?<!\w)" + re.escape(en_word) + r"(?!\w)"
                t = re.sub(pattern, repl_func, t, flags=re.IGNORECASE)

            placeholder_map.append(ph_map)
            texts_for_azure.append(t)
    else:
        texts_for_azure = texts
        placeholder_map = [{} for _ in texts]

    # 3. Call Azure Translator in bulk
    endpoint = AZURE_TRANSLATOR_ENDPOINT
    key = AZURE_TRANSLATOR_KEY
    region = AZURE_TRANSLATOR_REGION

    url = f"{endpoint}/translate?api-version=3.0&to={target}"
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-Type": "application/json",
    }

    body = [{"Text": t} for t in texts_for_azure]
    translations = []

    if body:
        resp = requests.post(url, headers=headers, json=body)
        resp.raise_for_status()
        translations = resp.json()  # a list, same length as body

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
                                nutritional_fields = [
                                    "calories",
                                    "protein",
                                    "fat",
                                    "carbs",
                                    "portionSI(gram)",
                                ]

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
                                    nutritional_fields = [
                                        "calories",
                                        "protein",
                                        "fat",
                                        "carbs",
                                        "portionSI(gram)",
                                    ]

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
        selected_fields = "user_code,food_allergies,daily_target_total_calories,recommendations,food_limitations,medical_conditions,goal,number_of_meals,client_preference,macros,region,meal_plan_structure"

        if user_code:
            # Fetch specific user by user_code
            # logger.info(f"Fetching user with user_code: {user_code}")

            response = (
                supabase.table("chat_users")
                .select(selected_fields)
                .eq("user_code", user_code)
                .execute()
            )

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

            response = supabase.table("chat_users").select(selected_fields).limit(1).execute()

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
                    "medical_conditions": "",
                    "diet_type": "personalized",
                    "meal_count": 5,
                    "client_preference": {},
                    "region": "israel",  # Default region
                    "meal_plan_structure": {},
                    "food_allergies": "",
                    "food_limitations": "",
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
                    return field_value.split(",") if field_value else []
            else:
                return []

        allergies = parse_array_field(user_data.get("food_allergies", []))
        limitations = parse_array_field(user_data.get("food_limitations", []))
        
        # Get medical conditions as string (for DSPy constraints)
        medical_conditions = user_data.get("medical_conditions", "")
        if not isinstance(medical_conditions, str):
            medical_conditions = str(medical_conditions) if medical_conditions else ""

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
            "medical_conditions": medical_conditions,
            "diet_type": "personalized",
            "meal_count": meal_count,
            "client_preference": client_preference,
            "region": user_data.get("region", "israel"),  # Default to israel if not specified
            "meal_plan_structure": meal_plan_structure,
            "recommendations": recommendations,
            # Store raw strings for DSPy constraints (in addition to parsed arrays)
            "food_allergies": user_data.get("food_allergies", ""),
            "food_limitations": user_data.get("food_limitations", ""),
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


# Azure OpenAI config (Main AI for meal generation)

client = AzureOpenAI(
    api_version=AZURE_OPENAI_API_VERSION,
    azure_endpoint=AZURE_OPENAI_API_BASE,
    api_key=AZURE_OPENAI_API_KEY,
)

deployment = AZURE_OPENAI_DEPLOYMENT

# ⚠️ IMPORTANT: MODEL USAGE CONFIGURATION
# - OBI2 (default) is used for ALL operations EXCEPT template generation
# - Template generator (/api/template) uses the same 'deployment' variable above
#   If you want template generator to use a different model, change 'deployment'
#   or set a separate variable for template generation
# - All other operations (meal building, nutrition correction, validation retries) use OBI2
# - Anthropic Claude has been removed - all operations now use Azure OpenAI

# Nutrition Correction Prompt (Simplified to avoid content policy issues)

NUTRITION_CORRECTION_PROMPT = """
You are a Nutrition-Correction AI. Your mission is to check and fix meal data so it is realistic, accurate, and aligned with the stated macro targets.

────────────────────────────────────────────────────────
INPUT
{
  "meal":   { /* ingredient list */ },
  "targets":{ "calories": X, "protein": Y, "fat": Z, "carbs": W }
}
────────────────────────────────────────────────────────

1. **VALIDATE NUTRITION VALUES**
   * Use authoritative sources (USDA, CIQUAL, etc.).
   * Correct clearly wrong values (e.g., “avocado 60 g protein”).
   * Nutrients must scale with portion size.
   * If brand is unknown, assume generic averages.

2. **FIX PORTION SIZES & HOUSEHOLD MEASURES**
   * `portionSI` (grams) must match `household_measure`.
   * Adjust both if they conflict, using standard measures (e.g., 1 Tbsp oil ≈ 14–15 g).

3. **HIT THE TARGET TOTALS**
   * Adjust quantities so meal totals are within ±3 % of each target.
   * If needed, scale ingredients proportionally.
   * Keep item names unless a minor change is required for realism (e.g., “fried” → “cooked”).

4. **MAINTAIN JSON STRUCTURE**
   * Preserve field names, order, and nesting.
   * Do **not** add comments, explanations, or extra fields.

5. **SAFETY & REALISM RULES**
   * Zero macros only when realistic.
   * Bounds by weight: Protein ≤ 40 %, Fat ≤ 100 %, Carbs ≤ 100 %.
   * Calories must obey: kcal ≈ P×4 + C×4 + F×9 (±5 %).
   * No food should exceed known biological limits (e.g., no veggie ≥ chicken in protein).

6. **INGREDIENT & BRAND LIMITS**
   * **Max 7 ingredients**—merge or drop the smallest if over.
   * Replace placeholder brands (“Generic”, "", etc.) with real ones (e.g., Tnuva, Osem).
   * For fresh produce, use brand “Fresh” or a local-market equivalent.

────────────────────────────────────────────────────────
OUTPUT
Return **ONLY** the corrected JSON for `"meal"`—no markdown, no comments, no extra text.

"""


def _correct_meal_nutrition(meal_data: dict, macro_targets: dict, max_attempts: int = 1):
    """
    Use OBI2 (Azure OpenAI) to fix unrealistic nutrition values and ensure meal matches macro targets.
    Returns (corrected_meal_data, success_flag) tuple.
    """
    try:
        # Prepare the payload (remove any calculated totals from meal_data to avoid confusion)
        clean_meal_data = {k: v for k, v in meal_data.items() if k != "totals"}

        payload = {"meal": clean_meal_data, "targets": macro_targets}

        logger.info(f"📊 Current meal totals: {meal_data.get('totals', 'not calculated')}")
        logger.info(f"🎯 Target macros: {macro_targets}")

        for attempt in range(1, max_attempts + 1):
            try:
                logger.info(
                    f"🔧 Correcting nutrition values with OBI2 (attempt {attempt}/{max_attempts})..."
                )
                logger.info(
                    f"🔧 Sending to OBI2 - Meal: {meal_data.get('meal_title', 'N/A')}, Targets: {macro_targets}"
                )

                # Build the full content to send
                full_content = f"{NUTRITION_CORRECTION_PROMPT}\n\nInput:\n{json.dumps(payload, ensure_ascii=False)}"

                # Call OBI2 (Azure OpenAI)
                response = client.chat.completions.create(
                    model=deployment,
                    messages=[
                        {"role": "system", "content": NUTRITION_CORRECTION_PROMPT},
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                    max_tokens=2048,
                    temperature=0.3,
                )

                # Extract text from response
                raw_text = response.choices[0].message.content

                logger.info(f"🔍 OBI2 raw response: {raw_text[:8000]}...")  # Log first 8000 chars

                if not raw_text:
                    logger.warning(f"❌ Empty response from OBI2 (attempt {attempt})")
                    if attempt < max_attempts:
                        continue
                    logger.info(f"ℹ️ Correction failed, using original meal from first AI")
                    return (meal_data, False)

                # Strip markdown fences and parse JSON
                raw = _strip_markdown_fences(raw_text)
                logger.info(f"🔍 After stripping markdown: {raw[:8000]}...")

                try:
                    corrected_meal = json.loads(raw)
                except Exception as e:
                    logger.warning(f"❌ JSON parse error in correction (attempt {attempt}): {e}")
                    if attempt < max_attempts:
                        continue
                    logger.info(f"ℹ️ Correction failed, using original meal from first AI")
                    return (meal_data, False)

                # Check if response has "meal" wrapper (sometimes added)
                if (
                    isinstance(corrected_meal, dict)
                    and "meal" in corrected_meal
                    and "ingredients" not in corrected_meal
                ):
                    logger.info("🔧 Unwrapping 'meal' object from OBI2 response")
                    corrected_meal = corrected_meal["meal"]

                # Validate the corrected meal has required fields
                if not isinstance(corrected_meal, dict) or "ingredients" not in corrected_meal:
                    logger.warning(f"❌ Invalid corrected meal structure (attempt {attempt})")
                    logger.warning(
                        f"Keys found: {corrected_meal.keys() if isinstance(corrected_meal, dict) else 'not a dict'}"
                    )
                    if attempt < max_attempts:
                        continue
                    logger.info(f"ℹ️ Correction failed, using original meal from first AI")
                    return (meal_data, False)

                logger.info(f"✅ Nutrition correction with OBI2 successful!")
                return (corrected_meal, True)

            except Exception as e:
                logger.error(f"❌ Exception during OBI2 correction (attempt {attempt}): {e}")
                if attempt < max_attempts:
                    continue
                # If all attempts fail, return original meal as fallback
                logger.info(f"ℹ️ Correction failed, using original meal from first AI")
                return (meal_data, False)

        # If all attempts fail, return original meal as fallback
        logger.info(f"ℹ️ Correction failed, using original meal from first AI")
        return (meal_data, False)

    except Exception as e:
        logger.error(f"❌ Failed to correct meal nutrition with OBI2: {e}")
        # Return original meal as fallback
        logger.info(f"ℹ️ Correction failed, using original meal from first AI")
        return (meal_data, False)


def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not AZURE_OPENAI_API_KEY:
            logger.error("API key not configured")
            return jsonify({"error": "Service not configured properly"}), 503
        return f(*args, **kwargs)

    return decorated_function


def _calculate_macros_from_calories(calories, calories_pct, daily_calories, daily_protein, daily_fat):
    """
    Calculate macros for a meal based on calories percentage (Python-based calculation).
    
    Args:
        calories: Meal calories (can be calculated from calories_pct)
        calories_pct: Percentage of daily calories for this meal (0-100)
        daily_calories: Total daily calories target
        daily_protein: Total daily protein target (grams)
        daily_fat: Total daily fat target (grams)
    
    Returns:
        Dict with calories, protein, fat, and carbs
    """
    # Calculate meal calories from percentage if not provided
    if calories is None or calories == 0:
        calories = (daily_calories * calories_pct) / 100.0
    
    # Calculate protein and fat based on calories percentage
    protein = (daily_protein * calories_pct) / 100.0
    fat = (daily_fat * calories_pct) / 100.0
    
    # Calculate carbs from remaining calories
    # Formula: calories = (protein * 4) + (fat * 9) + (carbs * 4)
    # So: carbs = (calories - (protein * 4) - (fat * 9)) / 4
    carbs = (calories - (protein * 4) - (fat * 9)) / 4.0
    
    # Ensure carbs is not negative
    if carbs < 0:
        carbs = 0
    
    return {
        "calories": round(calories, 1),
        "protein": round(protein, 1),
        "fat": round(fat, 1),
        "carbs": round(carbs, 1)
    }


@app.route("/api/template", methods=["POST"])
def api_template():
    """
    New template generation approach:
    1. Get meal plan structure
    2. Generate meal names (main and alternative) using AI
    3. Calculate macros using Python (like DSPy)
    4. Return template JSON
    """
    try:
        data = request.get_json()
        user_code = data.get("user_code") if data else None

        # Get meal plan structure
        meal_structure = data.get("meal_structure") or data.get("meal_plan_structure")

        # If not provided in request, load from preferences
        if not meal_structure:
            preferences = load_user_preferences(user_code)
            meal_structure = preferences.get("meal_plan_structure", [])
        
        if not meal_structure or len(meal_structure) == 0:
            return jsonify({"error": "No meal plan structure provided"}), 400
        
        # Load user preferences for macro targets
        preferences = load_user_preferences(user_code)
        
        # Get daily macro targets
        def parse_macro(value):
            if value is None:
                return 0.0
            try:
                return float(str(value).replace("g", "").strip())
            except (ValueError, TypeError):
                return 0.0
        
        daily_calories = preferences.get("calories_per_day", 2000)
        if daily_calories is None:
            daily_calories = 2000
        
        macros = preferences.get("macros", {})
        if not macros:
            macros = {"protein": "150g", "fat": "80g"}
        
        daily_protein = parse_macro(macros.get("protein", "150g"))
        daily_fat = parse_macro(macros.get("fat", "80g"))
        
        # Get region and constraints for AI
        region = preferences.get("region", "israel").lower()
        allergies = preferences.get("allergies", []) or []
        limitations = preferences.get("limitations", []) or []
        
        allergies_list = ", ".join(allergies) if allergies else "None"
        limitations_list = ", ".join(limitations) if limitations else "None"
        
        # Region-specific instructions
        region_instructions = {
            "israel": "Focus on Israeli cuisine and products. Use Israeli brands (Tnuva, Osem, Strauss, Elite, Telma) and local foods (hummus, falafel, tahini, pita, sabich, shakshuka).",
            "us": "Focus on American cuisine and products. Use American brands (Kraft, General Mills, Kellogg's, Pepsi) and typical American foods (bagels, cereals, sandwiches, burgers, mac and cheese).",
            "uk": "Focus on British cuisine and products. Use British brands (Tesco, Sainsbury's, Heinz UK, Cadbury) and typical British foods (beans on toast, fish and chips, bangers and mash).",
            "canada": "Focus on Canadian cuisine and products. Use Canadian brands (Loblaws, President's Choice, Tim Hortons) and typical Canadian foods (maple syrup dishes, poutine elements).",
            "australia": "Focus on Australian cuisine and products. Use Australian brands (Woolworths, Coles, Arnott's, Vegemite) and typical Australian foods.",
        }
        region_instruction = region_instructions.get(region, region_instructions["israel"])
        
        # Build system prompt for translating main meal description to English
        translate_prompt = f"""You are a translator and nutritionist. Translate meal descriptions to proper English meal names.

**CRITICAL: ALL OUTPUT MUST BE IN ENGLISH ONLY**
• Translate Hebrew/Arabic descriptions to English
• Preserve the client's food preferences and intent
• Make it a proper, appetizing meal name in English
• Example: "סלט עם ביצים קשות" → "Hard Boiled Eggs with Mixed Salad"
• Example: "yogurt with granola" → "Yogurt with Granola and Fresh Berries"
• Example: "meatballs with rice" → "Beef Meatballs with Rice and Tomato Sauce"

**OUTPUT FORMAT:**
Return ONLY valid JSON - no markdown, no commentary.

Schema:
{{
  "main_name": "<English meal name>",
  "main_protein_source": "<protein source in English>"
}}"""
        
        # Build system prompt for alternative meal generation only
        alt_system_prompt = f"""You are an expert nutritionist generating alternative meal names for a meal plan.

**CRITICAL: ALL OUTPUT MUST BE IN ENGLISH ONLY**
• All meal names MUST be in English (e.g., "Scrambled Eggs with Toast", "Grilled Chicken Salad")
• All protein sources MUST be in English (e.g., "eggs", "chicken", "yogurt", "salmon")
• NEVER use Hebrew, Arabic, or any other language

{region_instruction}

**DIETARY CONSTRAINTS:**
• ALLERGIES (LIFE THREATENING - ZERO TOLERANCE): {allergies_list}
• DIETARY LIMITATIONS: {limitations_list}

**ALTERNATIVE MEAL RULES:**
• Alternative meal must differ from main meal in:
  1. Protein source (different protein)
  2. Carb base (different carb source)
  3. Cooking method (different preparation)
  4. Flavour profile (different cuisine style)
• Never repeat the same core ingredient in both options
• Must be UNIQUE - not the same as any previously generated alternative

**OUTPUT FORMAT:**
Return ONLY valid JSON - no markdown, no commentary.

Schema:
{{
  "alternative_name": "<English dish name for alternative option>",
  "alternative_protein_source": "<English protein name for alternative>"
}}"""
        
        template = []
        generated_alternatives = []  # Track all generated alternatives to avoid duplicates
        
        # Process each meal in the structure
        for meal_data in meal_structure:
            meal_name = meal_data.get("meal", "Unnamed Meal")
            calories_pct = meal_data.get("calories_pct", 0)
            description = meal_data.get("description", "")
            
            if calories_pct == 0:
                logger.warning(f"⚠️ Meal '{meal_name}' has 0% calories, skipping")
                continue
            
            # Calculate macros using Python
            macros_calculated = _calculate_macros_from_calories(
                calories=None,  # Will be calculated from calories_pct
                calories_pct=calories_pct,
                daily_calories=daily_calories,
                daily_protein=daily_protein,
                daily_fat=daily_fat
            )
            
            # STEP 1: Translate main meal description to English
            main_meal_name = None
            main_protein_source = None
            
            if description:
                try:
                    translate_user_prompt = f"""Translate this meal description to a proper English meal name:

**DESCRIPTION:** {description}

**MEAL TYPE:** {meal_name}

Return a proper, appetizing English meal name that preserves the client's food preferences."""
                    
                    translate_response = client.chat.completions.create(
                        model=deployment,
                        messages=[
                            {"role": "system", "content": translate_prompt},
                            {"role": "user", "content": translate_user_prompt}
                        ],
                        max_tokens=150,
                        temperature=0.3
                    )
                    
                    translate_result = translate_response.choices[0].message.content
                    cleaned_translate = _strip_markdown_fences(translate_result)
                    translate_data = json.loads(cleaned_translate)
                    main_meal_name = translate_data.get("main_name", description)
                    main_protein_source = translate_data.get("main_protein_source", "protein")
                    
                    logger.info(f"✅ Translated main meal: '{description}' → '{main_meal_name}'")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to translate description, using as-is: {e}")
                    main_meal_name = description
                    # Extract protein source from name
                    name_lower = description.lower()
                    proteins = [
                        "chicken", "beef", "steak", "turkey", "fish", "salmon", "tuna",
                        "eggs", "egg", "tofu", "cottage cheese", "cheese", "yogurt",
                        "lentils", "beans", "quinoa", "meat", "poultry", "hummus", "falafel"
                    ]
                    main_protein_source = "protein"
                    for protein in proteins:
                        if protein in name_lower:
                            main_protein_source = protein
                            break
            else:
                main_meal_name = f"{meal_name} Main"
                main_protein_source = "protein"
            
            # STEP 2: Generate alternative meal using AI based on main meal
            alt_result_text = None
            alt_meal_name = None
            alt_protein_source = None
            
            try:
                alt_prompt = f"""Generate a DIFFERENT alternative meal for this specific main dish:

**MAIN DISH:** {main_meal_name}
**MAIN PROTEIN SOURCE:** {main_protein_source}

**MEAL DETAILS:**
- Meal Type: {meal_name}
- Calories: {macros_calculated['calories']} kcal
- Protein: {macros_calculated['protein']}g
- Fat: {macros_calculated['fat']}g
- Carbs: {macros_calculated['carbs']}g

**PREVIOUSLY GENERATED ALTERNATIVES (MUST AVOID DUPLICATES):**
{chr(10).join([f"- {alt}" for alt in generated_alternatives]) if generated_alternatives else "None yet"}

**REQUIREMENTS:**
- Generate a COMPLETELY DIFFERENT meal from the main dish "{main_meal_name}"
- Must differ in: protein source, carb base, cooking method, and flavour profile
- Must be UNIQUE - not the same as any previously generated alternative listed above
- Return ONLY a JSON object with: {{"alternative_name": "<English meal name>", "alternative_protein_source": "<protein source>"}}"""
                
                alt_response = client.chat.completions.create(
                    model=deployment,
                    messages=[
                        {"role": "system", "content": alt_system_prompt},
                        {"role": "user", "content": alt_prompt}
                    ],
                    max_tokens=200,
                    temperature=0.8  # Higher temperature for more variety
                )
                
                alt_result_text = alt_response.choices[0].message.content
                logger.info(f"✅ AI response for alternative '{meal_name}': {alt_result_text}")
                
                # Parse JSON response
                cleaned_alt = _strip_markdown_fences(alt_result_text)
                alt_data = json.loads(cleaned_alt)
                alt_meal_name = alt_data.get("alternative_name", f"{meal_name} Alternative")
                alt_protein_source = alt_data.get("alternative_protein_source", "protein")
                
                # Track this alternative to avoid duplicates
                generated_alternatives.append(alt_meal_name)
                
                logger.info(f"✅ Generated alternative meal name: {alt_meal_name}")
                
            except json.JSONDecodeError as e:
                logger.error(f"❌ Failed to parse AI response for '{meal_name}': {e}")
                if alt_result_text:
                    logger.error(f"Raw response: {alt_result_text}")
                # Fallback: generate unique alternative name
                alt_meal_name = f"{meal_name} Alternative {len(generated_alternatives) + 1}"
                alt_protein_source = "protein"
                generated_alternatives.append(alt_meal_name)
                
            except Exception as e:
                logger.error(f"❌ Error generating alternative meal name for '{meal_name}': {e}")
                # Fallback: generate unique alternative name
                alt_meal_name = f"{meal_name} Alternative {len(generated_alternatives) + 1}"
                alt_protein_source = "protein"
                generated_alternatives.append(alt_meal_name)
            
            # Build main option (format: fat, name, protein, calories, main_protein_source)
            main_option = {
                "fat": round(macros_calculated["fat"]),
                "name": main_meal_name,
                "protein": round(macros_calculated["protein"]),
                "calories": round(macros_calculated["calories"]),
                "main_protein_source": main_protein_source
            }
            
            # Build alternative option (format: fat, name, protein, calories, main_protein_source)
            alt_option = {
                "fat": round(macros_calculated["fat"]),
                "name": alt_meal_name or f"{meal_name} Alternative",
                "protein": round(macros_calculated["protein"]),
                "calories": round(macros_calculated["calories"]),
                "main_protein_source": alt_protein_source or "protein"
            }
            
            template.append({
                "main": main_option,
                "meal": meal_name,
                "alternative": alt_option
            })
            
            logger.info(f"✅ Generated template for '{meal_name}': Main={main_option['name']}, Alt={alt_option['name']}")
        
        logger.info(f"✅ Generated template with {len(template)} meals using new approach")
        return jsonify({"template": template})
        
    except Exception as e:
        logger.error(f"❌ Exception in /api/template: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


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

• **HEALTHY FOOD PRIORITY**: You are a HEALTHY dietitian - prioritize whole, nutritious foods.

• **NEVER USE** these unhealthy items: margarine, processed cheese spreads, artificial sweeteners, ultra-processed snacks.

• **ALWAYS PREFER** healthy alternatives: butter or olive oil (not margarine), real cheese (not processed), whole grains, fresh produce, natural yogurt.

• If snacks are requested, prefer fruit, veg, nuts, yogurt, cottage cheese, hummus, whole-grain crackers.

• Only include unhealthy processed items if client explicitly requests them in preferences.

• **CRITICAL: STRICTLY AVOID ALL FOODS IN ALLERGIES LIST** - This is life-threatening: {allergies_list}

• **CRITICAL: STRICTLY FOLLOW ALL DIETARY LIMITATIONS** - Never include these foods/ingredients: {limitations_list}

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

        # Remove language tag (e.g., "json", "python") if present on first line
        first_newline = s.find("\n")
        if first_newline > 0 and first_newline < 20:  # Language tag is usually short
            first_line = s[:first_newline].strip()
            # Check if first line is just a language identifier (no special chars)
            if first_line and first_line.isalpha():
                s = s[first_newline + 1 :]

        if "```" in s:
            s = s.rsplit("```", 1)[0]

    return s.strip()


def _region_instruction_from_prefs(preferences: dict) -> str:
    region = (preferences.get("region") or "israel").lower()

    mapping = {
        "israel": (
            "Use Israeli brands (Tnuva, Osem, Strauss, Elite, Telma). "
            "Typical packs: cottage cheese 250g; yogurt 150–200g; hummus 400g; "
            "pita 60–80g; cheese slices 20–25g; Bamba 80g; Bissli 100g."
        ),
        "us": (
            "Use US brands (Kraft, General Mills, Kellogg's). Packs: cottage cheese 16oz/454g; "
            "yogurt 6–8oz/170–227g; cream cheese 8oz/227g; cheese slices 21g; bagel 95–105g."
        ),
        "uk": (
            "Use UK brands (Tesco, Sainsbury's, Heinz UK). Packs: cottage cheese 300g; yogurt 150–170g; "
            "cheese slices 25g; bread slices 35–40g."
        ),
        "canada": (
            "Use Canadian brands (Loblaws, President's Choice). Packs: cottage cheese 500g; "
            "yogurt 175g; cheese slices 22g."
        ),
        "australia": (
            "Use Australian brands (Woolworths, Coles, Arnott's). Packs: cottage cheese 250g; "
            "yogurt 170g; cheese slices 25g."
        ),
    }

    return mapping.get(region, mapping["israel"])


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
    max_attempts: int = 6,
):
    """
    Build a meal option using DSPy pipeline (multi-stage with specialized predictors).
    Falls back to legacy prompt-based approach if DSPy is unavailable.
    """
    # Capture module-level USE_DSPY to avoid scoping issues
    use_dspy = USE_DSPY

    # Try DSPy approach first
    if use_dspy:
        try:
            from meal_builder_dspy_v2 import build_single_meal_with_constraints

            logger.info(f"🚀 Using DSPy v2 pipeline with constraints for {option_type} '{meal_name}'")

            # Prepare user constraints from preferences
            user_constraints = {
                "food_allergies": preferences.get("food_allergies", ""),
                "food_limitations": preferences.get("food_limitations", ""),
                "medical_conditions": preferences.get("medical_conditions", "")
            }
            
            # Get region from preferences
            user_region = preferences.get("region", "")

            # Call DSPy v2 pipeline with constraints
            result = build_single_meal_with_constraints(
                meal_type=meal_name,
                macro_targets=macro_targets,
                required_protein_source=required_protein_source,
                user_constraints=user_constraints,
                user_region=user_region,
                option_type=option_type,
            )

            if result:
                # Validate the DSPy result
                tpl_key = "main" if option_type.upper() == "MAIN" else "alternative"
                wrapped_template = [{tpl_key: macro_targets}]
                wrapped_menu = [{tpl_key: result}]

                val_res = app.test_client().post(
                    "/api/validate-menu",
                    json={
                        "template": wrapped_template,
                        "menu": wrapped_menu,
                        "user_code": user_code,
                    },
                )
                val = val_res.get_json() or {}

                if val.get("is_valid"):
                    logger.info(f"✅ DSPy result passed validation for '{meal_name}'")

                    # Add nutrition totals and protein source
                    result = _calculate_nutrition_from_ingredients(result)
                    if required_protein_source:
                        result["main_protein_source"] = required_protein_source
                    else:
                        result.setdefault("main_protein_source", "Unknown")

                    return result
                else:
                    issues = val.get("issues", [])
                    failed_meal = val.get("meal_data", {})
                    logger.warning(
                        f"⚠️ DSPy result failed validation for '{meal_name}' [{option_type.upper()}], falling back to legacy approach"
                    )
                    logger.warning(f"   Validation issues: {issues}")
                    if failed_meal:
                        logger.warning(
                            f"   Failed meal data: {json.dumps(failed_meal, ensure_ascii=False, indent=2)[:500]}..."
                        )
            else:
                logger.warning(f"⚠️ DSPy pipeline returned None, falling back to legacy approach")

        except ImportError as e:
            logger.warning(f"⚠️ DSPy not available ({e}), falling back to legacy approach")
        except Exception as e:
            logger.error(f"❌ DSPy pipeline error: {e}, falling back to legacy approach")

    # Legacy prompt-based approach (fallback)
    logger.info(f"🔄 Using legacy prompt-based approach for {option_type} '{meal_name}'")

    avoid_proteins = avoid_proteins or []
    avoid_ingredients = avoid_ingredients or []
    previous_issues = []  # Track issues across attempts
    validation_feedback = ""  # Current validation feedback

    # Extract allergies and limitations from preferences
    allergies = preferences.get("allergies", []) or []
    limitations = preferences.get("limitations", []) or []

    # Format for prompt
    allergies_list = ", ".join(allergies) if allergies else "None"
    limitations_list = ", ".join(limitations) if limitations else "None"

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
                validation_feedback_section=validation_feedback_section,
                allergies_list=allergies_list,
                limitations_list=limitations_list,
            )

            user_payload = {"meal_name": meal_name, "preferences": preferences}

        else:
            # RETRY ATTEMPTS: Focused correction prompt
            validation_issues = "\n".join([f"• {issue}" for issue in previous_issues]) if previous_issues else "No specific issues captured"
            prompt = f"""
*** CRITICAL MEAL REPAIR PROTOCOL ***

Your previous attempt to generate a meal failed validation. You must now act as a **Senior Clinical Nutritionist** to fix the errors while maintaining culinary excellence.

---------------------------------------------------------
1. DIAGNOSTIC REPORT (READ CAREFULLY)
---------------------------------------------------------
FAILED MEAL: {meal_name}
THE EXACT ERRORS: {validation_issues}

---------------------------------------------------------
2. CORRECTION STRATEGY
---------------------------------------------------------
You must fix the errors above using the following logic:

A. IF MACRO TARGETS MISSED (Physics Check):
   - **Protein too low?** DO NOT just increase the portion of a low-protein item (like beans). ADD a high-density side: Egg Whites, Tuna, Seitan, or Protein Powder.
   - **Carbs too high?** Swap the carb source for a lower-density option (e.g., Swap Rice for Quinoa, or Bread for Lite Bread).
   - **Calories too high?** Reduce FATS first (Oil/Nuts), then Carbs. Keep Protein high.
   - **CRITICAL:** Use REAL USDA standard nutrition densities. Do not invent "magic food" (e.g., Bread that is 50% protein does not exist).

B. IF DIETARY VIOLATION (Safety Check):
   - **Kosher Violation?** (Meat+Dairy): Immediately remove the Dairy item. Replace fats with Olive Oil/Tahini/Avocado.
   - **Allergy Violation?** REMOVE the ingredient entirely. Do not just rename it. Swap for a safe alternative.
   - **Vegan/Veg Violation?** Check hidden ingredients (e.g., Caesar dressing has anchovies). Use explicit Vegan alternatives.

C. IF REGIONAL/BRAND ERROR:
   - Client Region: **{region_instruction}**
   - **Israel:** Use Tnuva, Tara, Strauss, Osem, Angel, Elite, Yad Mordechai.
   - **USA:** Use Kraft, Dannon, Quaker, Chobani, Tyson.
   - NEVER mix regions.

---------------------------------------------------------
3. CONSTRAINTS & TARGETS
---------------------------------------------------------
* Target Macros (HIT EXACTLY): {macro_targets}
* Required Protein Source: {required_protein_source}
* Avoid Proteins: {avoid_proteins}
* Avoid Ingredients: {avoid_ingredients}
* Allergies (LIFE THREATENING - ZERO TOLERANCE): {allergies_list}
* Limitations: {limitations_list}

---------------------------------------------------------
4. OUTPUT FORMAT
---------------------------------------------------------
Return ONLY valid JSON. No markdown, no "Here is the fixed meal".
Format:
{{{{
  "meal_name": "{meal_name}",
  "meal_title": "<Appetizing Name in English>",
  "ingredients": [
    {{{{
      "item": "<Specific Name in English (e.g. Tnuva Cottage Cheese)>",
      "portionSI(gram)": <float>,
      "household_measure": "<e.g. 1 cup, 2 slices>",
      "calories": <int>,
      "protein": <int>,
      "fat": <int>,
      "carbs": <int>,
      "brand of pruduct": "<Brand Name or 'Fresh'>"
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

        # Use OBI2 for all attempts (first attempt and retries)
        logger.info(f"🔧 Using OBI2 for meal building (attempt {i+1})")
        response = client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_message_content},
            ],
        )

        raw = _strip_markdown_fences(response.choices[0].message.content)

        try:
            candidate = json.loads(raw)
        except Exception as e:
            error_msg = f"JSON parse error: {e}"
            logger.warning(f"❌ {error_msg} for {option_type} '{meal_name}'")
            previous_issues.append(error_msg)
            continue

        # Apply nutrition correction IMMEDIATELY after generation, BEFORE validation
        candidate, correction_success = _correct_meal_nutrition(candidate, macro_targets)

        if correction_success:
            logger.info(f"✅ Nutrition values corrected by correction AI")
        # If correction failed or was skipped, candidate already contains original meal

        # Wrap for validator
        tpl_key = "main" if option_type.upper() == "MAIN" else "alternative"
        wrapped_template = [{tpl_key: macro_targets}]
        wrapped_menu = [{tpl_key: candidate}]

        val_res = app.test_client().post(
            "/api/validate-menu",
            json={"template": wrapped_template, "menu": wrapped_menu, "user_code": user_code},
        )

        val = val_res.get_json() or {}

        if val.get("is_valid"):
            logger.info(f"✅ {option_type} for '{meal_name}' passed validation.")

            # Automatically calculate and add nutrition totals from ingredients
            candidate = _calculate_nutrition_from_ingredients(candidate)

            # Persist the protein source so downstream consumers (UI, alt generators) have it
            if required_protein_source:
                candidate["main_protein_source"] = required_protein_source
            else:
                candidate.setdefault("main_protein_source", "Unknown")

            return candidate
        else:
            # Collect validation issues for next attempt
            issues = val.get("issues", [])
            failed_meal = val.get("meal_data", {})

            logger.warning(
                f"❌ {option_type} for '{meal_name}' failed validation. Meal: {json.dumps(failed_meal, ensure_ascii=False)}, Issues: {issues}"
            )

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


def _build_single_meal_option(
    template_meal: dict,
    option_type: str,
    preferences: dict,
    user_code: str,
    region_instruction: str,
    avoid_proteins=None,
    avoid_ingredients=None,
):
    """
    Build a single meal option (MAIN or ALTERNATIVE) and return the result.
    Returns (meal_name, option_type, result) tuple.
    """
    meal_name = template_meal.get("meal")

    try:
        if option_type == "MAIN":
            macros = template_meal.get("main", {})
        else:
            macros = template_meal.get("alternative", {})

        required_protein = macros.get("main_protein_source")
        template_meal_title = macros.get("name")

        # Extract macro targets from template
        calories = macros.get("calories")
        protein = macros.get("protein")
        fat = macros.get("fat")

        # Calculate carbs if not provided
        carbs = macros.get("carbs")
        if carbs is None and calories is not None and protein is not None and fat is not None:
            carbs = (calories - (protein * 4) - (fat * 9)) / 4
            carbs = round(carbs)

        targets = {
            "name": template_meal_title,  # CRITICAL: Pass dish name for Chef (e.g. "Chickpea Omelette with Avocado")
            "calories": calories,
            "protein": protein,
            "fat": fat,
            "carbs": carbs,
        }

        # Validate targets (only macros required; name is optional)
        macro_keys = ("calories", "protein", "fat", "carbs")
        if any(targets.get(k) is None for k in macro_keys):
            logger.error(f"❌ Template missing macro targets for {option_type} '{meal_name}'")
            return (meal_name, option_type, None, f"Missing macro targets: {targets}")

        # Build per-option preferences so the meal builder can follow the template's intended title
        # (especially important for ALTERNATIVE, which otherwise intentionally ignores user text preferences for variety)
        prefs_for_option = dict(preferences or {})
        if template_meal_title:
            prefs_for_option["template_meal_title"] = template_meal_title
        prefs_for_option["template_meal_slot"] = meal_name
        prefs_for_option["template_option_type"] = option_type

        # Build the option (without correction, that happens inside _build_option_with_retries now)
        result = _build_option_with_retries(
            option_type=option_type,
            meal_name=meal_name,
            macro_targets=targets,
            required_protein_source=required_protein,
            preferences=prefs_for_option,
            user_code=user_code,
            region_instruction=region_instruction,
            avoid_proteins=avoid_proteins,
            avoid_ingredients=avoid_ingredients,
        )

        if result:
            logger.info(f"✅ Successfully built {option_type} for '{meal_name}'")
            return (meal_name, option_type, result, None)
        else:
            logger.error(f"❌ Failed to build {option_type} for '{meal_name}'")
            return (meal_name, option_type, None, f"Failed to build {option_type}")

    except Exception as e:
        logger.error(f"❌ Exception building {option_type} for '{meal_name}': {e}")
        return (meal_name, option_type, None, str(e))


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

            # Debug log region from preferences
            loaded_region = preferences.get("region", "NOT_SET")
            logger.info(
                f"🌍 Loaded region from preferences: '{loaded_region}' for user_code: {user_code}"
            )
            if not loaded_region or loaded_region == "NOT_SET":
                logger.error(
                    f"❌ Region is not set in preferences! Check database for user_code: {user_code}"
                )
            elif loaded_region.lower() == "israel":
                logger.info(f"   Using Israeli brands and ingredients")
            elif loaded_region.lower() == "usa":
                logger.info(f"   Using USA brands and ingredients")
            else:
                logger.warning(
                    f"   Unknown region '{loaded_region}' - may have limited brand support"
                )

            region_instruction = _region_instruction_from_prefs(preferences)

            # ✅ Validate the template before building meals
            val_res = app.test_client().post(
                "/api/validate-template", json={"template": template, "user_code": user_code}
            )
            val_data = val_res.get_json() or {}

            if not val_data.get("is_valid"):
                logger.warning(
                    "❌ Template validation failed on attempt %d: %s",
                    attempt,
                    {
                        "main": val_data.get("issues_main"),
                        "alternative": val_data.get("issues_alt"),
                    },
                )

                # Try to regenerate a template if we have retries left
                if attempt < max_retries:
                    logger.info(f"🔄 Regenerating template for attempt {attempt + 1}")

                    try:
                        template_res = app.test_client().post(
                            "/api/template", json={"user_code": user_code}
                        )

                        if template_res.status_code == 200:
                            template_data = template_res.get_json() or {}

                            if template_data.get("template"):
                                template = template_data["template"]
                                logger.info(f"✅ Generated new template for attempt {attempt + 1}")
                                continue  # retry with the new template
                            else:
                                logger.error("❌ New template generation returned invalid data")
                        else:
                            logger.error(
                                f"❌ Template regeneration failed with status {template_res.status_code}"
                            )

                    except Exception as template_error:
                        logger.error(f"❌ Error regenerating template: {template_error}")

                if attempt == max_retries:
                    return (
                        jsonify(
                            {
                                "error": "Template validation failed after all attempts",
                                "validation": val_data,
                                "attempts_made": max_retries,
                                "failure_type": "template_validation_failed",
                                "main_issues": val_data.get("issues_main", []),
                                "alternative_issues": val_data.get("issues_alt", []),
                                "main_alt_issues": val_data.get("issues_main_alt", []),
                                "suggestion": "Try regenerating the template with different parameters",
                            }
                        ),
                        400,
                    )
                else:
                    continue  # next attempt

            logger.info("🔹 Building menu in PARALLEL - ALL meal options at once...")

            # Build ALL meal options (MAIN + ALTERNATIVE for each meal) in parallel
            # If we have 5 meals, we run 10 threads simultaneously (5 MAIN + 5 ALT)
            total_options = len(template) * 2  # MAIN + ALTERNATIVE for each meal
            logger.info(
                f"🚀 Building {total_options} meal options in parallel ({len(template)} meals × 2 options)..."
            )

            # Submit all tasks at once
            all_results = {}  # Key: (index, meal_name) tuple to handle duplicate meal names
            with ThreadPoolExecutor(max_workers=total_options) as executor:
                all_futures = {}

                # Submit all MAIN and ALTERNATIVE tasks simultaneously
                for meal_index, template_meal in enumerate(template):
                    meal_name = template_meal.get("meal")
                    meal_key = (meal_index, meal_name)  # Use index to make unique

                    # Submit MAIN task
                    main_future = executor.submit(
                        _build_single_meal_option,
                        template_meal,
                        "MAIN",
                        preferences,
                        user_code,
                        region_instruction,
                    )
                    all_futures[main_future] = (meal_key, "MAIN")

                    # Submit ALTERNATIVE task (running in parallel with MAIN)
                    # Note: Since they run in parallel, ALTERNATIVE won't have MAIN's ingredients to avoid
                    # The AI will differentiate based on the prompt instructions
                    alt_future = executor.submit(
                        _build_single_meal_option,
                        template_meal,
                        "ALTERNATIVE",
                        preferences,
                        user_code,
                        region_instruction,
                        None,  # avoid_proteins - will be handled by prompt
                        None,  # avoid_ingredients - will be handled by prompt
                    )
                    all_futures[alt_future] = (meal_key, "ALTERNATIVE")

                # Collect all results as they complete
                for future in as_completed(all_futures):
                    meal_name_returned, option_type_returned, result, error = future.result()
                    expected_meal_key, expected_option = all_futures[future]

                    if error or not result:
                        logger.error(
                            f"❌ Failed to build {expected_option} for meal at index {expected_meal_key[0]}: {error}"
                        )
                        return (
                            jsonify(
                                {
                                    "error": f"Failed to build {expected_option.lower()} option for meal at index {expected_meal_key[0]}",
                                    "meal_index": expected_meal_key[0],
                                    "meal_name": expected_meal_key[1],
                                    "option_type": expected_option,
                                    "details": error,
                                    "failure_type": f"{expected_option.lower()}_option_build_failed",
                                }
                            ),
                            400,
                        )

                    # Store result with key (index, meal_name) to handle duplicate meal names
                    if expected_meal_key not in all_results:
                        all_results[expected_meal_key] = {}
                    all_results[expected_meal_key][option_type_returned] = result

                    logger.info(f"✅ Completed {option_type_returned} for meal at index {expected_meal_key[0]} ({expected_meal_key[1]})")

            logger.info(f"✅ Successfully built all {total_options} meal options in parallel!")

            # Assemble the full menu in the correct order
            full_menu = []
            for meal_index, template_meal in enumerate(template):
                meal_name = template_meal.get("meal")
                meal_key = (meal_index, meal_name)
                full_menu.append(
                    {
                        "meal": meal_name,
                        "main": all_results[meal_key]["MAIN"],
                        "alternative": all_results[meal_key]["ALTERNATIVE"],
                    }
                )

            logger.info("✅ Finished building full menu.")

            totals = calculate_totals(full_menu)

            # Clean ingredient names before returning
            cleaned_menu = clean_ingredient_names(full_menu)

            logger.info(
                "Full menu built: %s",
                json.dumps({"menu": cleaned_menu, "totals": totals}, ensure_ascii=False, indent=2),
            )

            return jsonify({"menu": cleaned_menu, "totals": totals})

        except Exception as e:
            logger.error(
                "❌ Exception in /api/build-menu (attempt %d):\n%s", attempt, traceback.format_exc()
            )

            if attempt == max_retries:
                return (
                    jsonify(
                        {
                            "error": f"Menu build failed after {max_retries} attempts",
                            "exception": str(e),
                            "attempt": attempt,
                            "max_retries": max_retries,
                            "failure_type": "exception_during_build",
                            "traceback": traceback.format_exc(),
                        }
                    ),
                    500,
                )
            else:
                logger.info("🔄 Retrying menu build due to exception...")
                continue

    # If we get here, all attempts failed
    logger.error("❌ All %d attempts to build menu failed", max_retries)

    return (
        jsonify(
            {
                "error": f"Menu build failed after {max_retries} attempts",
                "attempts_made": max_retries,
                "failure_type": "all_attempts_exhausted",
                "suggestion": "Try regenerating the template or adjusting user preferences",
            }
        ),
        500,
    )


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
            if "main" in t and "main" in m:
                return "main"
            if "alternative" in t and "alternative" in m:
                return "alternative"
            # Graceful fallback
            return "main" if "main" in m else "alternative" if "alternative" in m else None

        option = _detect_option(entry_t, entry_m)

        if option is None:

            return (
                jsonify(
                    {
                        "is_valid": False,
                        "issues": ["Could not detect option type (main/alternative)"],
                    }
                ),
                400,
            )

        tpl = entry_t.get(option) or {}

        mn = entry_m.get(option) or {}

        # -------- helpers ----------

        def _is_english(s: str) -> bool:
            if not isinstance(s, str):
                return False

            # Allow ASCII + common English Unicode punctuation (en-dash, em-dash, smart quotes, degree, etc.)
            # Flag Hebrew (U+0590-U+05FF), Arabic (U+0600-U+06FF), and other non-Latin scripts

            try:
                # First try pure ASCII (fastest path)
                s.encode("ascii")
                return True
            except UnicodeEncodeError:
                # If not ASCII, check if it contains Hebrew, Arabic, or other non-Latin scripts
                # Allow common English Unicode: en-dash (–), em-dash (—), smart quotes, degree, fractions, etc.
                for char in s:
                    code_point = ord(char)
                    # Reject Hebrew, Arabic, Cyrillic, Chinese, Japanese, Korean, etc.
                    if (
                        0x0590 <= code_point <= 0x05FF  # Hebrew
                        or 0x0600 <= code_point <= 0x06FF  # Arabic
                        or 0x0400 <= code_point <= 0x04FF  # Cyrillic
                        or 0x4E00 <= code_point <= 0x9FFF  # CJK Unified Ideographs
                        or 0x3040 <= code_point <= 0x309F  # Hiragana
                        or 0x30A0 <= code_point <= 0x30FF  # Katakana
                        or 0xAC00 <= code_point <= 0xD7AF
                    ):  # Hangul
                        return False
                # If no non-Latin scripts found, it's acceptable English with Unicode punctuation
                return True
            except Exception:
                return False

        def _num(x, default=None):
            try:
                return float(x)
            except Exception:
                return default

        def _close(a, b, tol=1.0):
            a = _num(a)
            b = _num(b)
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
            dairy_items = [
                "milk",
                "cream",
                "cheese",
                "yogurt",
                "butter",
                "dairy",
                "parmesan",
                "mozzarella",
                "ricotta",
                "cottage cheese",
            ]
            non_kosher_items = [
                "pork",
                "bacon",
                "ham",
                "shellfish",
                "shrimp",
                "lobster",
                "crab",
                "clam",
                "oyster",
                "scallop",
            ]

            has_meat, has_dairy = False, False
            meat_ings, dairy_ings = [], []

            for ing in ingredients or []:
                item_name = str(ing.get("item", "")).lower()

                # Non-kosher check
                for nk in non_kosher_items:
                    if nk in item_name:
                        kosher_issues.append(
                            f"Non-kosher ingredient detected: {ing.get('item', '')}"
                        )

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

        def _validate_dietary_restrictions(ingredients, limitations_list, allergies_list):
            """Validate general dietary limitations and allergies (not just kosher)"""
            issues = []

            # Normalize lists to lowercase for comparison
            limitations_normalized = [str(lim).lower().strip() for lim in limitations_list if lim]

            allergies_normalized = [
                str(allergy).lower().strip() for allergy in allergies_list if allergy
            ]

            # Skip kosher as it's handled separately
            limitations_normalized = [lim for lim in limitations_normalized if lim != "kosher"]

            for ing in ingredients or []:
                item_name = str(ing.get("item", "")).lower()

                # Check allergies (exact or substring match)
                for allergy in allergies_normalized:
                    if allergy in item_name or item_name in allergy:
                        issues.append(
                            f"ALLERGY VIOLATION: Contains '{ing.get('item', '')}' which matches allergy '{allergy}'"
                        )

                # Check limitations (exact or substring match)
                for limitation in limitations_normalized:
                    # "X-free" means diet must avoid X; flag only if item contains X and is not explicitly X-free
                    if limitation.endswith("-free") and len(limitation) > 5:
                        substance = limitation[:-5].strip()  # e.g. "gluten-free" -> "gluten"
                        safe_phrases = (limitation.replace("-", " "), limitation)  # "gluten free", "gluten-free"
                        if substance in item_name:
                            if not any(phrase in item_name for phrase in safe_phrases):
                                issues.append(
                                    f"DIETARY LIMITATION VIOLATION: Contains '{ing.get('item', '')}' which violates limitation '{limitation}'"
                                )
                        continue
                    # Handle common patterns like "no chicken", "no beef", etc.
                    if limitation.startswith("no ") or limitation.startswith("avoid "):
                        # Extract the food item from "no chicken" -> "chicken"
                        food_item = limitation.replace("no ", "").replace("avoid ", "").strip()

                        if food_item in item_name or item_name in food_item:
                            issues.append(
                                f"DIETARY LIMITATION VIOLATION: Contains '{ing.get('item', '')}' which violates limitation '{limitation}'"
                            )
                    else:
                        # Direct match (e.g., "chicken", "beef") — things to avoid
                        if limitation in item_name or item_name in limitation:
                            issues.append(
                                f"DIETARY LIMITATION VIOLATION: Contains '{ing.get('item', '')}' which violates limitation '{limitation}'"
                            )

            return issues

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
                issues.append(
                    f"{option.capitalize()} ingredient #{idx+1} 'item' must be English-only."
                )

            if measure is not None and not _is_english(measure):
                issues.append(
                    f"{option.capitalize()} ingredient #{idx+1} 'household_measure' must be English-only."
                )

            if brand is None or not _is_english(brand):
                issues.append(
                    f"{option.capitalize()} ingredient #{idx+1} 'brand of pruduct' must be English-only."
                )

            if isinstance(brand, str) and brand.strip().lower() in ("generic", "no brand", "brand"):
                issues.append(
                    f"{option.capitalize()} ingredient #{idx+1} brand must be a real brand (not 'generic')."
                )

            # numeric fields non-negative
            for mk in ["portionSI(gram)", "calories", "protein", "fat", "carbs"]:
                if mk in ing:
                    v = _num(ing.get(mk), default=None)
                    if v is None:
                        issues.append(
                            f"{option.capitalize()} ingredient #{idx+1} '{mk}' must be numeric."
                        )
                    elif v < 0:
                        issues.append(
                            f"{option.capitalize()} ingredient #{idx+1} '{mk}' cannot be negative."
                        )

        # Template targets presence
        for macro in macros:
            if macro not in tpl:
                issues.append(f"Template for {option} missing target '{macro}'.")

        # -------- ingredient sum validation against template targets (with margins) ----------
        # TEMPORARILY DISABLED FOR DEBUGGING
        # sums = {m: 0.0 for m in macros}
        #
        # for ing in ingredients or []:
        #     for m in macros:
        #         sums[m] += _num(ing.get(m), 0.0)
        #
        # for m in macros:
        #     target = _num(tpl.get(m), default=None)
        #     if target is None or target == 0:
        #         continue
        #
        #     # Check if ingredient sum matches template target within margin
        #     margin = get_allowed_margin(target)
        #     if abs(sums[m] - target) / target > margin:
        #         direction = "Reduce" if sums[m] > target else "Increase"
        #         issues.append(
        #             f"{option.capitalize()} {m}: Sum of ingredients ({round(sums[m],1)}) doesn't match template target ({target}) "
        #             f"(allowed ±{int(margin*100)}%). {direction} ingredient {m} values."
        #         )

        # -------- kosher checks ----------

        kosher_issues = _validate_kosher_ingredients(ingredients, limitations)

        for ki in kosher_issues:

            issues.append(f"{option.capitalize()} option: {ki}")

        # -------- general dietary restrictions and allergies checks ----------

        allergies = preferences.get("allergies", []) or []

        dietary_restriction_issues = _validate_dietary_restrictions(
            ingredients, limitations, allergies
        )

        for dri in dietary_restriction_issues:

            issues.append(f"{option.capitalize()} option: {dri}")

        is_valid = len(issues) == 0

        return jsonify(
            {
                "is_valid": is_valid,
                "issues": issues,
                "meal_data": mn,  # Include the actual meal JSON that was validated
                "option_type": option,  # Include which option type was validated
            }
        )

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
            "fat": parse_macro(macros.get("fat", "80g")),
        }

        # Add debug logging
        logger.info(f"🔍 Template validation using user_code: {user_code}")
        logger.info(
            f"🔍 Loaded preferences calories_per_day: {preferences.get('calories_per_day')}"
        )
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

        # Check for equality between main and alternative macros (with ±3g tolerance)
        main_alt_issues = []
        TOLERANCE_GRAMS = 3.0

        for macro in total_main:
            main_val = round(total_main[macro], 1)
            alt_val = round(total_alt[macro], 1)
            diff = abs(main_val - alt_val)

            if diff > TOLERANCE_GRAMS:
                main_alt_issues.append(
                    f"Main vs Alternative {macro} mismatch: Main={main_val}, Alt={alt_val} (diff={diff:.1f}g, allowed: ±{TOLERANCE_GRAMS}g)"
                )

        is_valid_main = len(issues_main) == 0
        is_valid_alt = len(issues_alt) == 0
        is_valid = is_valid_main and is_valid_alt and len(main_alt_issues) == 0

        # Logging for debugging

        logger.info(
            f"Validation summary (main): totals={total_main}, targets={target_macros}, issues={issues_main}"
        )

        logger.info(
            f"Validation summary (alternative): totals={total_alt}, targets={target_macros}, issues={issues_alt}"
        )

        logger.info(f"Validation summary (main vs alt): main_alt_issues={main_alt_issues}")

        if not is_valid:

            logger.warning(
                "❌ Template validation failed. Main valid: %s, Alt valid: %s",
                is_valid_main,
                is_valid_alt,
            )

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

        return jsonify(
            {
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
                "targets": target_macros,
            }
        )

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


@app.route("/api/enrich-menu-with-upc", methods=["POST"])
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
            region = preferences.get("region", "israel")
        except Exception as e:
            logger.warning(f"Failed to load user preferences, using default region: {e}")
            region = "israel"

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
                            endpoint_type, params, is_israeli = prepare_upc_lookup_params(
                                brand, name, region
                            )

                            if not endpoint_type:
                                enriched_ing["UPC"] = None
                                app.logger.warning(
                                    f"No valid parameters for UPC lookup: brand={brand!r}, name={name!r}"
                                )
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


@app.route("/api/batch-upc-lookup", methods=["POST"])
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
            region = preferences.get("region", "israel")
        except Exception as e:
            logger.warning(f"Failed to load user preferences, using default region: {e}")
            region = "israel"

        logger.info(
            f"🔍 Starting batch UPC lookup for {len(ingredients)} ingredients with region: {region}"
        )

        results = []

        # Process all ingredients in parallel-like manner (simulate concurrent processing)
        for ingredient in ingredients:
            brand = ingredient.get("brand", "").strip()
            name = ingredient.get("name", "").strip()

            if not brand and not name:
                results.append(
                    {"brand": brand, "name": name, "upc": None, "error": "Missing brand and name"}
                )
                continue

            try:
                # Determine endpoint and parameters based on region
                endpoint_type, params, is_israeli = prepare_upc_lookup_params(brand, name, region)

                if not endpoint_type:
                    results.append(
                        {"brand": brand, "name": name, "upc": None, "error": "No valid parameters"}
                    )
                    continue

                # Choose the appropriate endpoint
                if endpoint_type == "hebrew":
                    url = "https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-upc-hebrew"
                    logger.info(f"Using Hebrew UPC endpoint for region: {region}")
                else:
                    url = "https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-upc"
                    logger.info(f"Using regular UPC endpoint for region: {region}")

                # Use the appropriate UPC lookup service
                resp = requests.get(
                    url, params=params, timeout=30
                )  # Increased timeout for complex Hebrew searches

                if resp.status_code == 200:
                    upc_data = resp.json()
                    upc_code = upc_data.get("upc")

                    results.append({"brand": brand, "name": name, "upc": upc_code})

                    logger.info(f"✅ Found UPC for {brand} {name}: {upc_code}")
                else:
                    results.append(
                        {
                            "brand": brand,
                            "name": name,
                            "upc": None,
                            "error": f"HTTP {resp.status_code}",
                        }
                    )
                    logger.warning(
                        f"❌ UPC lookup failed for {brand} {name}: HTTP {resp.status_code}"
                    )

            except requests.exceptions.Timeout:
                results.append({"brand": brand, "name": name, "upc": None, "error": "Timeout"})
                logger.warning(f"⏰ UPC lookup timed out for {brand} {name}")

            except Exception as e:
                results.append({"brand": brand, "name": name, "upc": None, "error": str(e)})
                logger.warning(f"❌ UPC lookup failed for {brand} {name}: {e}")

        successful_lookups = len([r for r in results if r.get("upc")])

        logger.info(
            f"✅ Batch UPC lookup completed: {successful_lookups}/{len(ingredients)} successful"
        )

        return jsonify(
            {
                "results": results,
                "summary": {
                    "total": len(ingredients),
                    "successful": successful_lookups,
                    "failed": len(ingredients) - successful_lookups,
                },
            }
        )

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

 **ENGLISH ONLY** for all names/measures/brands.

 **HEALTHY FOOD PRIORITY**: You are a HEALTHY dietitian - use whole, nutritious foods only.

 **NEVER USE**: margarine, processed cheese spreads, artificial sweeteners, ultra-processed snacks.

 **ALWAYS PREFER**: butter or olive oil (not margarine), real cheese (not processed), whole grains, fresh produce.

 Only include unhealthy items if client explicitly requests them in preferences.

 **CRITICAL: STRICTLY AVOID ALL FOODS IN ALLERGIES LIST** - This is life-threatening: {allergies_list}

 **CRITICAL: STRICTLY FOLLOW ALL DIETARY LIMITATIONS** - Never include these foods/ingredients: {limitations_list}

 If kosher: never mix meat + dairy; avoid pork/shellfish; prefer kosher-suitable brands.

 ≤ 7 ingredients; simple methods (grill, bake, steam, sauté).

 Use realistic regional pack sizes & brands:

  {region_instruction}

MACRO TARGETS

The sum of all ingredients must match these targets within margin: {macro_targets}.

CRITICAL: Cross-check every ingredient's macro values against reliable nutrition databases to ensure accuracy.

DIFFERENTIATION (from both the given MAIN and CURRENT ALTERNATIVE)

 **Different main protein source** (avoid: {avoid_proteins}).

 **Different carb base** and **different cooking method**.

 **Different flavour profile** (e.g., if Mediterranean, switch to Asian/Mexican/Italian).

 Avoid these core ingredients (substring match): {avoid_ingredients}.

VALIDATION

 Return only the JSON object in the schema above.

 Do not add keys not listed in the schema.

 The validator will sum all ingredient macros and check against targets with appropriate margins.

 If you see a previous meal attempt above, analyze what went wrong and fix those specific issues.

 Pay special attention to macro calculations, ingredient accuracy, and dietary restrictions.

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
        "protein": meal_obj.get("protein"),
        "fat": meal_obj.get("fat"),
        "carbs": meal_obj.get("carbs"),
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
        for ing in m.get("ingredients") or []:
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

        for ing in m.get("ingredients") or []:
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


@app.route("/api/generate-alternative-meal", methods=["POST"])
def generate_alternative_meal():
    max_attempts = 4
    previous_issues = []  # Track issues across attempts
    validation_feedback = ""  # Current validation feedback
    previous_candidate = None  # Store the failed meal for retry attempts

    data = request.get_json() or {}
    main = data.get("main")
    current_alt = data.get("alternative")  # existing alternative
    all_alternatives = data.get("allAlternatives", [])  # all existing alternatives
    user_code = data.get("user_code")

    if not main or not current_alt:
        return jsonify({"error": "Missing main or alternative meal"}), 400

    if not user_code:
        return jsonify({"error": "Missing user_code"}), 500

    # Load preferences & region
    try:
        preferences = load_user_preferences(user_code) or {}
    except Exception as e:
        return jsonify({"error": f"Failed to load user preferences: {str(e)}"}), 500

    region_instruction = _region_instruction_from_prefs(preferences)

    # Extract allergies and limitations from preferences
    allergies = preferences.get("allergies", []) or []
    limitations = preferences.get("limitations", []) or []

    # Format for prompt
    allergies_list = ", ".join(allergies) if allergies else "None"
    limitations_list = ", ".join(limitations) if limitations else "None"

    # Macro targets: mirror the MAIN meal's totals (strict)
    macro_targets = _extract_macros(main)

    if any(macro_targets.get(k) is None for k in ("calories", "protein", "fat", "carbs")):
        return (
            jsonify(
                {"error": "Main meal lacks complete macro totals (calories, protein, fat, carbs)."}
            ),
            400,
        )

    # Build differentiation constraints using ALL alternatives for better duplication avoidance
    avoid_proteins, avoid_ingredients = _collect_avoid_lists_from_all_alternatives(
        main, all_alternatives
    )

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
                    avoid_ingredients=avoid_ingredients,
                    allergies_list=allergies_list,
                    limitations_list=limitations_list,
                )

                enhanced_system_prompt = system_prompt

            # RETRY ATTEMPTS: Use short focused prompt with JSON and issues

            else:

                enhanced_system_prompt = f"""You previously generated an alternative meal that failed validation.

Here is the meal you generated:

{json.dumps(previous_candidate, ensure_ascii=False, indent=2)}

These are the validation issues that need to be fixed:

{validation_feedback}

**CRITICAL: STRICTLY AVOID ALL FOODS IN ALLERGIES LIST** - This is life-threatening: {allergies_list}

**CRITICAL: STRICTLY FOLLOW ALL DIETARY LIMITATIONS** - Never include these foods/ingredients: {limitations_list}

return a corrected version of this meal as JSON that fixes ALL the issues above.

Keep the same meal structure but adjust the values to pass validation.

Return ONLY valid JSON, no markdown fences or explanations."""

            user_payload = {
                "main": main,
                "current_alternative": current_alt,
                "all_alternatives": all_alternatives,
                "user_preferences": preferences,
            }

            response = client.chat.completions.create(
                model=deployment,
                messages=[
                    {"role": "system", "content": enhanced_system_prompt},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                ],
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
                "/api/validate-menu", json={"template": tpl, "menu": menu, "user_code": user_code}
            )

            val = val_res.get_json() or {}

            if not val.get("is_valid"):
                # Collect validation issues for next attempt
                issues = val.get("issues", [])
                failed_meal = val.get("meal_data", {})

                app.logger.warning(
                    f"❌ NEW ALTERNATIVE failed validation. Meal: {json.dumps(failed_meal, ensure_ascii=False)}, Issues: {issues}"
                )

                # Store the failed candidate for retry
                previous_candidate = candidate

                # Format validation feedback for next attempt
                validation_feedback = "\n".join([f"• {issue}" for issue in issues])
                previous_issues.extend(issues)

                if attempt == max_attempts:
                    return (
                        jsonify(
                            {
                                "error": "Generated alternative failed validation after all attempts",
                                "issues": issues,
                                "attempts": max_attempts,
                                "previous_issues": previous_issues,
                            }
                        ),
                        400,
                    )

                continue

            # Automatically calculate and add nutrition totals from ingredients
            candidate = _calculate_nutrition_from_ingredients(candidate)

            # Clean & enrich
            cleaned = clean_ingredient_names({"alternative": candidate}).get(
                "alternative", candidate
            )
            region = (preferences.get("region") or "israel").lower()
            enriched = enrich_alternative_with_upc(cleaned, user_code, region)

            app.logger.info("✅ NEW ALTERNATIVE generated, validated, and enriched.")
            return jsonify(enriched)

        except Exception as e:
            error_msg = f"Exception occurred: {str(e)}"

            app.logger.error(f"❌ Exception in generate_alternative_meal attempt {attempt}: {e}")

            previous_issues.append(error_msg)

            if attempt == max_attempts:
                return (
                    jsonify(
                        {
                            "error": "Exception while generating alternative meal",
                            "exception": str(e),
                            "attempts": max_attempts,
                            "previous_issues": previous_issues,
                        }
                    ),
                    500,
                )

            # otherwise loop and retry

    # Fallback (should not reach due to returns above)
    return (
        jsonify(
            {
                "error": "All attempts to generate the alternative meal failed",
                "attempts": max_attempts,
                "previous_issues": previous_issues,
            }
        ),
        500,
    )


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

                    print("Tenant ID:", AZURE_TENANT_ID)
                    print("Client ID:", AZURE_CLIENT_ID)
                    print("Client Secret:", AZURE_CLIENT_SECRET)
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

        brand = ingredient.get(
            "brand of pruduct", ""
        )  # Note: keeping the typo as it matches the existing code

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
                f"{brand_lower} ",  # "Brand Item"
                f" {brand_lower}",  # "Item Brand"
                f"{brand_lower}-",  # "Brand-Item"
                f"-{brand_lower}",  # "Item-Brand"
                f"{brand_lower} - ",  # "Brand - Item"
                f" - {brand_lower}",  # "Item - Brand"
                brand_lower,  # Just the brand name itself
            ]

            cleaned_item = item

            for pattern in patterns_to_try:
                if pattern in item_lower:
                    # Find the actual case-preserved version to remove
                    start_idx = item_lower.find(pattern)

                    if start_idx != -1:
                        # Remove the pattern and clean up extra spaces/dashes
                        cleaned_item = item[:start_idx] + item[start_idx + len(pattern) :]
                        cleaned_item = cleaned_item.strip().strip("-").strip()
                        break

            # If we removed something, update the item name
            if cleaned_item and cleaned_item != item:
                cleaned_ingredient["item"] = cleaned_item

                logger.info(
                    f"🧹 Cleaned ingredient: '{item}' -> '{cleaned_item}' (removed brand: {brand})"
                )

                # 2) Remove any parenthesized content, e.g. "(tnuva) hummus" → "hummus"

            #    \([^)]*\)  matches a '(' plus any non-')' chars up to ')'
            #    Surrounding \s* eats any extra whitespace left behind
            cleaned_item = re.sub(r"\s*\([^)]*\)\s*", " ", cleaned_item).strip()

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


def get_azure_access_token():
    import requests

    tenant_id = AZURE_TENANT_ID
    client_id = AZURE_CLIENT_ID
    client_secret = AZURE_CLIENT_SECRET
    scope = AZURE_UPC_SCOPE

    if not all([tenant_id, client_id, client_secret, scope]):
        logger.error("Azure AD credentials are not set in environment variables.")
        return None

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

    token_data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": scope,
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
            user_response = (
                supabase.table("chat_users")
                .select("id")
                .eq("user_code", user_code)
                .single()
                .execute()
            )

            if user_response.data:
                user_id = user_response.data["id"]

                # Get food logs by user_id
                logs_response = (
                    supabase.table("food_logs")
                    .select("*")
                    .eq("user_id", user_id)
                    .order("log_date", desc=True)
                    .execute()
                )
                food_logs = logs_response.data or []

        except Exception as e:
            logger.error(f"Error fetching food logs: {e}")
            return jsonify({"error": "Failed to fetch food logs"}), 500

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
            meal_label = log.get("meal_label", "").lower()
            food_items = log.get("food_items", [])

            # Determine meal category
            category = "other"

            if "breakfast" in meal_label:

                category = "breakfast"

            elif "lunch" in meal_label:

                category = "lunch"

            elif "dinner" in meal_label:

                category = "dinner"

            elif "snack" in meal_label:

                if "morning" in meal_label:

                    category = "morning snack"

                elif "afternoon" in meal_label:

                    category = "afternoon snack"

                elif "evening" in meal_label:

                    category = "evening snack"

                else:

                    category = "snack"

            # Extract food items

            if isinstance(food_items, list):

                for item in food_items:

                    if isinstance(item, dict) and item.get("name"):

                        meal_categories[category].append(item["name"].lower().strip())

            elif isinstance(food_items, dict) and food_items.get("name"):

                meal_categories[category].append(food_items["name"].lower().strip())

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

        habits_text = (
            "; ".join(food_habits_summary) if food_habits_summary else "No specific patterns found"
        )

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
                    {"role": "user", "content": "Summarize the habits and suggest improvements."},
                ],
                max_tokens=250,
            )

            analysis_text = response.choices[0].message.content
            logger.info("✅ Generated eating habits analysis successfully")

            return jsonify(
                {
                    "analysis": analysis_text,
                    "analysis_data": {
                        "total_logs": len(food_logs),
                        "top_foods_by_meal": top_foods_by_meal,
                        "unique_foods_count": len(
                            set([food for foods in meal_categories.values() for food in foods])
                        ),
                    },
                }
            )

        except Exception as e:
            logger.error(f"Error calling OpenAI for eating habits analysis: {e}")
            return jsonify({"error": "Failed to generate analysis"}), 500

    except Exception as e:
        logger.error(f"Error analyzing eating habits: {e}")
        return jsonify({"error": "Failed to analyze eating habits"}), 500


@app.route("/api/update-meal-plan-descriptions", methods=["POST"])
def api_update_meal_plan_descriptions():
    """
    Analyze food habits and update meal plan descriptions based on what the client actually eats.
    Gets the meal plan structure from Supabase and updates only the description fields.
    """
    try:
        data = request.get_json()
        user_code = data.get("user_code")

        if not user_code:
            return jsonify({"error": "user_code is required"}), 400

        logger.info(f"🔍 Updating meal plan descriptions for user_code: {user_code}")

        # Load user preferences to get meal plan structure
        try:
            preferences = load_user_preferences(user_code)
            meal_plan_structure = preferences.get("meal_plan_structure", [])

            if not meal_plan_structure:

                return jsonify({"error": "No meal plan structure found for this user"}), 404

        except Exception as e:

            logger.error(f"Error loading user preferences: {str(e)}")

            return jsonify({"error": f"Failed to load user preferences: {str(e)}"}), 500

        # Get food logs for the user (reuse logic from analyze_eating_habits)

        food_logs = []

        try:

            user_response = (
                supabase.table("chat_users")
                .select("id")
                .eq("user_code", user_code)
                .single()
                .execute()
            )

            if user_response.data:

                user_id = user_response.data["id"]

                logs_response = (
                    supabase.table("food_logs")
                    .select("*")
                    .eq("user_id", user_id)
                    .order("log_date", desc=True)
                    .execute()
                )

                food_logs = logs_response.data or []

        except Exception as e:

            logger.error(f"Error fetching food logs: {e}")

            return jsonify({"error": "Failed to fetch food logs"}), 500

        if not food_logs:

            return (
                jsonify(
                    {
                        "error": "No food logs found for this user. Cannot personalize meal descriptions."
                    }
                ),
                404,
            )

        # Analyze eating habits by meal category
        meal_categories = {
            "breakfast": [],
            "lunch": [],
            "dinner": [],
            "snack": [],
            "snacks": [],
            "morning snack": [],
            "afternoon snack": [],
            "evening snack": [],
            "other": [],
        }

        # Process each food log
        for log in food_logs:
            meal_label = log.get("meal_label", "").lower()
            food_items = log.get("food_items", [])

            # Determine meal category
            category = "other"
            if "breakfast" in meal_label:
                category = "breakfast"
            elif "lunch" in meal_label:

                category = "lunch"

            elif "dinner" in meal_label:

                category = "dinner"

            elif "snack" in meal_label:

                if "morning" in meal_label:

                    category = "morning snack"

                elif "afternoon" in meal_label:

                    category = "afternoon snack"

                elif "evening" in meal_label:

                    category = "evening snack"

                else:

                    category = "snack"

            # Extract food items
            if isinstance(food_items, list):
                for item in food_items:
                    if isinstance(item, dict) and item.get("name"):
                        meal_categories[category].append(item["name"].lower().strip())
            elif isinstance(food_items, dict) and food_items.get("name"):
                meal_categories[category].append(food_items["name"].lower().strip())

        # Get top 5 most frequent foods for each meal category
        top_foods_by_meal = {}

        for category, foods in meal_categories.items():
            if foods:
                food_counts = {}
                for food in foods:
                    food_counts[food] = food_counts.get(food, 0) + 1

                sorted_foods = sorted(food_counts.items(), key=lambda x: x[1], reverse=True)
                top_foods_by_meal[category] = sorted_foods[:5]

        # Normalize meal names for matching (e.g., "Snacks" -> "snack")
        def normalize_meal_name(meal_name):
            meal_lower = meal_name.lower().strip()

            if "breakfast" in meal_lower:
                return "breakfast"
            elif "lunch" in meal_lower:
                return "lunch"
            elif "dinner" in meal_lower:
                return "dinner"
            elif "snack" in meal_lower:
                if "morning" in meal_lower:
                    return "morning snack"
                elif "afternoon" in meal_lower:
                    return "afternoon snack"
                elif "evening" in meal_lower:
                    return "evening snack"
                else:
                    return "snack"

            return meal_lower

        # Extract dietary restrictions and recommendations from preferences
        allergies = preferences.get("allergies", [])
        limitations = preferences.get("limitations", [])
        recommendations = preferences.get("recommendations", [])

        # Format allergies and limitations for display
        allergies_text = ", ".join(allergies) if allergies else "None"
        limitations_text = ", ".join(limitations) if limitations else "None"
        recommendations_text = ", ".join(recommendations) if recommendations else "None"

        # Build system prompt for updating descriptions
        system_prompt = """You are a professional dietitian AI that personalizes meal plan descriptions based on a client's actual eating habits.

**TASK:**

Update ONLY the "description" field for each meal. Do NOT modify meal names, calories, or calories_pct.

**CRITICAL RULES:**

* **NEVER include foods from allergies list** - This is life-threatening

* **NEVER include foods from limitations list** - Strictly avoid (e.g., if kosher: no meat+dairy mixing)

* **Each meal appears ONCE** - Do not repeat the same meal in the output

* **English only** - All descriptions must be in English

* **Keep it short** - 1-3 food items, max 5-6 words

* Use the client's frequently consumed foods for each meal type

* Consider recommendations when creating descriptions

**OUTPUT:**

Return ONLY a valid JSON array with the same structure:

[{"meal": "Breakfast", "calories": 875, "description": "Updated description", "calories_pct": 30}, ...]

Return ALL meals from the input - do not omit any."""

        # Prepare eating habits summary for the prompt
        habits_summary = {}

        for meal in meal_plan_structure:
            meal_name = meal.get("meal", "")
            normalized = normalize_meal_name(meal_name)

            # Try exact match first, then variations
            if normalized in top_foods_by_meal:
                habits_summary[meal_name] = top_foods_by_meal[normalized]
            elif "snack" in normalized and "snack" in top_foods_by_meal:
                habits_summary[meal_name] = top_foods_by_meal["snack"]
            elif "snack" in normalized and "snacks" in top_foods_by_meal:
                habits_summary[meal_name] = top_foods_by_meal["snacks"]
            else:
                habits_summary[meal_name] = []

        # Build user prompt with meal plan and habits
        habits_text = "\n".join(
            [
                (
                    f"- {meal}: {', '.join([f'{food} ({count}x)' for food, count in foods[:3]])}"
                    if foods
                    else f"- {meal}: No data available"
                )
                for meal, foods in habits_summary.items()
            ]
        )

        user_prompt = f"""Update meal plan descriptions based on client's eating habits.

**CURRENT MEAL PLAN:**

{json.dumps(meal_plan_structure, indent=2, ensure_ascii=False)}

**EATING HABITS:**

{habits_text}

**RESTRICTIONS:**

* Allergies: {allergies_text}

* Limitations: {limitations_text}

* Recommendations: {recommendations_text}

**REQUIREMENTS:**

* Update ONLY the "description" field

* NEVER use foods from allergies or limitations lists

* Use frequently consumed foods for each meal

* Each meal appears once - do not duplicate"""

        # Call Azure OpenAI
        try:
            logger.info("🧠 Sending meal plan update request to OpenAI")

            response = client.chat.completions.create(
                model=deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=800,
            )

            result_text = response.choices[0].message.content

            logger.info(f"✅ Received response from OpenAI: {result_text}")

            # Parse JSON response

            try:

                # Strip markdown code fences if present

                cleaned_result = _strip_markdown_fences(result_text)

                updated_meal_plan = json.loads(cleaned_result)

                # Validate structure

                if not isinstance(updated_meal_plan, list):

                    return jsonify({"error": "Invalid response format: expected array"}), 500

                # Ensure all required fields are present and validate

                for i, meal in enumerate(updated_meal_plan):

                    if not all(
                        key in meal for key in ["meal", "calories", "description", "calories_pct"]
                    ):

                        return jsonify({"error": f"Meal at index {i} missing required fields"}), 500

                    # Validate that structure matches (except description)

                    original_meal = meal_plan_structure[i] if i < len(meal_plan_structure) else None

                    if original_meal:

                        if meal["meal"] != original_meal["meal"]:

                            logger.warning(
                                f"Meal name mismatch: expected {original_meal['meal']}, got {meal['meal']}"
                            )

                        if meal["calories"] != original_meal["calories"]:

                            logger.warning(
                                f"Calories changed for {meal['meal']}: expected {original_meal['calories']}, got {meal['calories']}"
                            )

                            # Restore original calories

                            meal["calories"] = original_meal["calories"]

                        if meal["calories_pct"] != original_meal["calories_pct"]:

                            logger.warning(
                                f"Calories_pct changed for {meal['meal']}: expected {original_meal['calories_pct']}, got {meal['calories_pct']}"
                            )

                            # Restore original calories_pct

                            meal["calories_pct"] = original_meal["calories_pct"]

                logger.info("✅ Successfully updated meal plan descriptions")

                return jsonify(
                    {
                        "meal_plan_structure": updated_meal_plan,
                        "updated_descriptions": True,
                        "original_count": len(meal_plan_structure),
                        "updated_count": len(updated_meal_plan),
                    }
                )

            except json.JSONDecodeError as e:

                logger.error(f"❌ Failed to parse JSON response: {result_text}")

                logger.error(f"JSON error: {str(e)}")

                return (
                    jsonify({"error": "Failed to parse AI response as JSON", "raw": result_text}),
                    500,
                )

        except Exception as e:

            logger.error(f"Error calling OpenAI: {e}")

            logger.error(f"Traceback: {traceback.format_exc()}")

            return jsonify({"error": f"Failed to generate updated descriptions: {str(e)}"}), 500

    except Exception as e:

        logger.error(f"❌ Exception in /api/update-meal-plan-descriptions: {str(e)}")

        logger.error(f"Traceback: {traceback.format_exc()}")

        return jsonify({"error": f"Failed to update meal plan descriptions: {str(e)}"}), 500


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
        region = data.get("region", "israel").lower()  # Validate required parameters
        if not ingredient:
            return jsonify({"error": "Ingredient name is required"}), 400

        if not from_measurement:
            return jsonify({"error": "From measurement is required"}), 400

        if to_type not in ["grams", "household"]:
            return jsonify({"error": "toType must be 'grams' or 'household'"}), 400

        logger.info(
            f"🤖 Converting measurement: {ingredient} ({brand}) from '{from_measurement}' to {to_type} for region {region}"
        )

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
            "israel": {
                "units": "Use Israeli/common metric measurements. Consider local market standards.",
                "examples": "Israeli cottage cheese tubs (250g), hummus containers (400g), pita sizes (60-80g), typical vegetable portions",
            },
            "us": {
                "units": "Use American customary units (cups, tablespoons, ounces). Consider US market standards.",
                "examples": "US cottage cheese containers (16oz), yogurt cups (6-8oz), bread slices, typical American portions",
            },
            "uk": {
                "units": "Use British/metric measurements. Consider UK market standards.",
                "examples": "UK cottage cheese tubs (300g), yogurt pots (150-170g), bread slices, typical British portions",
            },
            "canada": {
                "units": "Use Canadian/metric measurements. Consider Canadian market standards.",
                "examples": "Canadian cottage cheese containers (500g), yogurt containers (175g), typical Canadian portions",
            },
            "australia": {
                "units": "Use Australian/metric measurements. Consider Australian market standards.",
                "examples": "Australian cottage cheese tubs (250g), yogurt tubs (170g), typical Australian portions",
            },
        }

        region_info = region_context.get(region, region_context["israel"])

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
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=200,
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
            result.update(
                {
                    "ingredient": ingredient,
                    "brand": brand,
                    "from_measurement": from_measurement,
                    "to_type": to_type,
                    "region": region,
                    "timestamp": datetime.datetime.now().isoformat(),
                }
            )

            logger.info(
                f"✅ Successfully converted measurement: {from_measurement} → {result['converted_measurement']}"
            )
            return jsonify(result)

        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse AI response as JSON: {raw_response}")
            logger.error(f"❌ JSON error: {str(e)}")

            # Attempt to extract measurement from non-JSON response
            fallback_measurement = extract_measurement_from_text(raw_response, to_type)

            if fallback_measurement:
                logger.info(f"🔄 Using fallback extraction: {fallback_measurement}")
                return jsonify(
                    {
                        "converted_measurement": fallback_measurement,
                        "confidence": "low",
                        "method": "Fallback text extraction",
                        "notes": "Could not parse AI JSON response, used text extraction",
                        "ingredient": ingredient,
                        "from_measurement": from_measurement,
                        "to_type": to_type,
                    }
                )
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
                r"(\d+(?:\.\d+)?)\s*g(?:rams?)?",
                r"(\d+(?:\.\d+)?)\s*gram",
                r"about\s*(\d+(?:\.\d+)?)\s*g",
                r"(\d+(?:\.\d+)?)\s*gr",
            ]

            for pattern in gram_patterns:
                match = re.search(pattern, text)
                if match:
                    return match.group(1)

        elif to_type == "household":
            # Look for household measurements
            household_patterns = [
                r"(\d+(?:\.\d+)?)\s*(?:cups?|cups|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|ml|liters?|pieces?|slices?|cloves?|heads?)",
                r"(\d+(?:\.\d+)?)\s*(?:medium|large|small)\s*(\w+)",
                r"about\s*(\d+(?:\.\d+)?)\s*(?:cups?|cups|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|ml|liters?|pieces?|slices?|cloves?|heads?)",
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
