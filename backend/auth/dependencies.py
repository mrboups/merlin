"""
FastAPI dependency for extracting and verifying the authenticated user
from a Bearer JWT in the Authorization header.

Usage in a route:
    from auth.dependencies import get_current_user

    @router.get("/protected")
    async def protected(user_id: str = Depends(get_current_user)):
        ...
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .session import verify_session_token

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    """
    Verify the Bearer token and return the user_id.

    Raises HTTP 401 if the token is absent, malformed, expired, or has
    an invalid signature.
    """
    user_id = verify_session_token(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id
