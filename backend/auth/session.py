"""
JWT session token creation and verification.

Tokens are stateless HS256 JWTs signed with JWT_SECRET.  The default
expiry is 24 hours; set TOKEN_EXPIRY_HOURS via environment to override.

python-jose is already listed in requirements.txt as
  python-jose[cryptography]==3.3.0
"""

import os
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

_jwt_secret = os.environ.get("JWT_SECRET", "")
if not _jwt_secret:
    import secrets
    _jwt_secret = secrets.token_hex(32)
    import logging
    logging.getLogger(__name__).warning(
        "JWT_SECRET not set — using a random ephemeral secret. "
        "All sessions will be invalidated on restart. "
        "Set JWT_SECRET in production."
    )
SECRET_KEY: str = _jwt_secret
ALGORITHM: str = "HS256"
TOKEN_EXPIRY_HOURS: int = int(os.environ.get("JWT_EXPIRY_HOURS", "24"))


def create_session_token(user_id: str) -> str:
    """
    Issue a signed JWT for user_id.

    The token carries three standard claims:
      sub — user_id (Firestore document ID)
      iat — issued-at (UTC)
      exp — expiry (UTC, TOKEN_EXPIRY_HOURS from now)
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_session_token(token: str) -> str | None:
    """
    Decode and validate a JWT.

    Returns the user_id (sub claim) on success, or None if the token is
    missing, expired, or has an invalid signature.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        return user_id if user_id else None
    except JWTError:
        return None
