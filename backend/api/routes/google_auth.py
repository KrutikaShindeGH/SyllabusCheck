"""
SyllabusCheck — Google OAuth 2.0 Login
Phase 7: Adds /api/auth/google and /api/auth/google/callback
"""
import secrets
import uuid
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import create_access_token, create_refresh_token, hash_password
from core.config import settings
from core.database import get_db

router = APIRouter()

GOOGLE_AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# In-memory state store (fine for single-worker dev; use Redis in production)
_oauth_states: dict[str, str] = {}


@router.get("/google")
async def google_login():
    """Step 1 — Redirect user to Google's consent screen."""
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = "pending"

    params = {
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "redirect_uri":  settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "state":         state,
        "access_type":   "offline",
        "prompt":        "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(
    code:  str = Query(...),
    state: str = Query(...),
    db:    AsyncSession = Depends(get_db),
):
    """Step 2 — Exchange code, upsert user, issue JWT, redirect frontend."""

    # ── Validate state (CSRF protection) ──────────────────────────────
    if state not in _oauth_states:
        raise HTTPException(status_code=400, detail="Invalid OAuth state — possible CSRF")
    del _oauth_states[state]

    # ── Exchange code for Google tokens ───────────────────────────────
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code":          code,
                "client_id":     settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri":  settings.GOOGLE_REDIRECT_URI,
                "grant_type":    "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Google token exchange failed")
        tokens = token_resp.json()

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch Google user info")
        guser = userinfo_resp.json()

    email     = guser.get("email", "").lower().strip()
    full_name = guser.get("name", email.split("@")[0])

    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email address")

    # ── Look up or create user ─────────────────────────────────────────
    result = await db.execute(
        text("SELECT id, full_name FROM users WHERE email = :email"),
        {"email": email}
    )
    row = result.fetchone()

    if row:
        full_name = row[1] or full_name  # prefer stored name
    else:
        new_id         = uuid.uuid4()
        dummy_password = hash_password(secrets.token_urlsafe(32))
        await db.execute(
            text(
                "INSERT INTO users (id, email, hashed_password, full_name, role, is_active, created_at) "
                "VALUES (:id, :email, :pw, :name, 'professor', true, NOW())"
            ),
            {"id": new_id, "email": email, "pw": dummy_password, "name": full_name},
        )
        await db.commit()

    # ── Issue JWTs using EMAIL as subject — matches get_current_user ───
    # auth.py does: WHERE User.email == payload["sub"]
    # so sub MUST be the email, not the user ID
    access_token  = create_access_token(subject=email, extra={"role": "professor"})
    refresh_token = create_refresh_token(subject=email)

    # ── Redirect to frontend with tokens as query params ───────────────
    frontend_callback = (
        f"{settings.FRONTEND_URL}/?"
        f"access_token={access_token}"
        f"&refresh_token={refresh_token}"
        f"&email={email}"
        f"&name={full_name}"
    )
    return RedirectResponse(frontend_callback)

