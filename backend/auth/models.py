"""
Pydantic request/response models for the WebAuthn auth routes.

All models use Pydantic v2 (already in requirements.txt as pydantic==2.10.4).
"""

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


class RegisterBeginRequest(BaseModel):
    username: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Display name / email used as the WebAuthn user.name.",
    )


class RegisterBeginResponse(BaseModel):
    options: dict  # JSON-serialised PublicKeyCredentialCreationOptions
    session_id: str  # Opaque handle linking begin → complete


class RegisterCompleteRequest(BaseModel):
    session_id: str
    credential: dict  # RegistrationResponseJSON from @simplewebauthn/browser
    username: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Must match the username used in begin.",
    )


class RegisterCompleteResponse(BaseModel):
    user_id: str
    token: str  # JWT session token
    address: str  # EOA address — empty until key derivation happens client-side


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


class LoginBeginRequest(BaseModel):
    """
    Login begin is intentionally empty — we use discoverable credentials
    (passkeys) so the authenticator resolves the user itself.  The model
    exists so FastAPI generates a proper request body schema.
    """

    pass


class LoginBeginResponse(BaseModel):
    options: dict  # JSON-serialised PublicKeyCredentialRequestOptions
    session_id: str


class LoginCompleteRequest(BaseModel):
    session_id: str
    credential: dict  # AuthenticationResponseJSON from @simplewebauthn/browser


class LoginCompleteResponse(BaseModel):
    user_id: str
    token: str
    address: str


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


class LogoutResponse(BaseModel):
    ok: bool = True


# ---------------------------------------------------------------------------
# Address update
# ---------------------------------------------------------------------------


class UpdateAddressRequest(BaseModel):
    address: str = Field(
        ...,
        min_length=42,
        max_length=42,
        description="EIP-55 checksummed Ethereum address (0x-prefixed, 42 chars).",
    )


class UpdateAddressResponse(BaseModel):
    status: str  # "ok"
    address: str
