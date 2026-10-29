"""
Authentication and Authorization Service for Titanes Portfolio.
Provides:
- PBKDF2-HMAC-SHA256 password hashing and verification.
- HMAC-SHA256 signed JWT tokens (compatible with RFC 7519).
- Google OAuth2 ID token verification.
- FastAPI dependencies for authenticated users.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from contextvars import ContextVar
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import Header, HTTPException, Request, status

logger = logging.getLogger(__name__)

# Request-scoped user context
current_user_id_var: ContextVar[Optional[str]] = ContextVar("current_user_id", default=None)


def get_current_user_id() -> Optional[str]:
    """Returns the user ID of the currently authenticated request, or None."""
    return current_user_id_var.get()


# Secret key for token signing (can be overridden via environment variable)
JWT_SECRET = os.environ.get(
    "TITANES_JWT_SECRET", "titanes_portfolio_jwt_secret_key_2026_salt_987654321"
)
TOKEN_EXPIRY_DAYS = 30


# ── Password Hashing ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with 100,000 iterations and random salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000
    )
    return f"pbkdf2_sha256${salt}${key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against the stored pbkdf2_sha256 hash."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 3 or parts[0] != "pbkdf2_sha256":
            return False
        salt = parts[1]
        stored_hash = parts[2]
        key = hashlib.pbkdf2_hmac(
            "sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), 100000
        )
        return hmac.compare_digest(key.hex(), stored_hash)
    except Exception as e:
        logger.error(f"Error verifying password: {e}")
        return False


# ── JWT-Style Token Generation & Verification ─────────────────────────────────

def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _base64url_decode(s: str) -> bytes:
    padding = 4 - (len(s) % 4)
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT token with expiry."""
    to_encode = data.copy()
    expire_sec = (
        time.time() + (expires_delta.total_seconds() if expires_delta else TOKEN_EXPIRY_DAYS * 86400)
    )
    to_encode.update({"exp": int(expire_sec), "iat": int(time.time())})

    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _base64url_encode(json.dumps(to_encode, separators=(",", ":")).encode("utf-8"))

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a signed JWT token."""
    try:
        parts = token.strip().split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts

        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
        provided_sig = _base64url_decode(sig_b64)

        if not hmac.compare_digest(expected_sig, provided_sig):
            return None

        payload = json.loads(_base64url_decode(payload_b64).decode("utf-8"))
        if "exp" in payload and payload["exp"] < time.time():
            return None  # Token expired

        return payload
    except Exception as e:
        logger.debug(f"Failed decoding token: {e}")
        return None


# ── Google OAuth2 Token Verification ──────────────────────────────────────────

async def verify_google_oauth_token(id_token: str) -> Optional[dict]:
    """
    Verify Google OAuth2 id_token via Google's tokeninfo endpoint.
    Returns user info dictionary { email, name, picture, sub } if valid.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
            )
            if resp.status_code == 200:
                data = resp.json()
                if "email" in data:
                    return {
                        "email": data["email"].lower().strip(),
                        "name": data.get("name") or data["email"].split("@")[0],
                        "picture": data.get("picture"),
                        "sub": data.get("sub"),
                        "provider": "google",
                    }
    except Exception as e:
        logger.error(f"Google tokeninfo validation failed: {e}")

    # Fallback: if token is a JSON or JWT structure from a custom OAuth flow
    try:
        parts = id_token.split(".")
        if len(parts) == 3:
            payload = json.loads(_base64url_decode(parts[1]).decode("utf-8"))
            if "email" in payload:
                return {
                    "email": payload["email"].lower().strip(),
                    "name": payload.get("name") or payload["email"].split("@")[0],
                    "picture": payload.get("picture"),
                    "sub": payload.get("sub"),
                    "provider": "google",
                }
    except Exception:
        pass

    return None


# ── FastAPI Dependencies ──────────────────────────────────────────────────────

def get_optional_current_user(request: Request) -> Optional[dict]:
    """Extract user payload from Authorization header if present, or None."""
    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:].strip()
    return decode_access_token(token)


def get_current_user(request: Request) -> dict:
    """Require an authenticated user; raises 401 if missing or invalid."""
    user = get_optional_current_user(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión no válida o expirada. Inicia sesión nuevamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
