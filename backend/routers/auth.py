"""
WebAuthn authentication routes.

Endpoints
---------
POST /register/begin     — generate registration options for a new passkey
POST /register/complete  — verify attestation, create user, return JWT
POST /login/begin        — generate authentication options (discoverable creds)
POST /login/complete     — verify assertion, refresh sign count, return JWT
POST /logout             — client-side only; JWT is stateless, this is a no-op

Challenge storage
-----------------
Challenges are stored in a module-level dict keyed by a random session_id.
Each entry has a 5-minute TTL enforced at read time.  For production with
multiple replicas this should be replaced by Redis or Firestore with a TTL.
"""

import json
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from auth.dependencies import get_current_user
from auth.models import (
    LoginBeginRequest,
    LoginBeginResponse,
    LoginCompleteRequest,
    LoginCompleteResponse,
    LogoutResponse,
    RegisterBeginRequest,
    RegisterBeginResponse,
    RegisterCompleteRequest,
    RegisterCompleteResponse,
    UpdateAddressRequest,
    UpdateAddressResponse,
)
from auth.session import create_session_token
from auth.webauthn import (
    create_authentication_options,
    create_registration_options,
    serialise_options,
    verify_authentication,
    verify_registration,
)
from db.users import (
    create_user,
    get_credential,
    get_user_by_credential_id,
    get_user_by_id,
    update_address,
    update_sign_count,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory challenge store
# ---------------------------------------------------------------------------

# Maps session_id -> (challenge_bytes, expiry_unix_timestamp)
_challenges: dict[str, tuple[bytes, float]] = {}
CHALLENGE_TTL: int = 300  # 5 minutes


def _store_challenge(session_id: str, challenge: bytes) -> None:
    _challenges[session_id] = (challenge, time.monotonic() + CHALLENGE_TTL)


def _pop_challenge(session_id: str) -> Optional[bytes]:
    """
    Retrieve and delete the challenge for session_id.

    Returns None if the session_id is unknown or the challenge has expired.
    Pops on retrieval so each challenge can only be used once.
    """
    entry = _challenges.pop(session_id, None)
    if entry is None:
        return None
    challenge, expiry = entry
    if time.monotonic() > expiry:
        return None
    return challenge


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


@router.post(
    "/register/begin",
    response_model=RegisterBeginResponse,
    summary="Begin WebAuthn registration",
    description=(
        "Generate passkey creation options for a new account. "
        "The returned session_id must be included in /register/complete."
    ),
)
async def register_begin(body: RegisterBeginRequest) -> RegisterBeginResponse:
    # Generate a temporary user_id for the ceremony.  If registration
    # completes successfully this becomes the permanent Firestore document ID.
    temp_user_id = secrets.token_hex(16)

    options, challenge = create_registration_options(
        user_id=temp_user_id,
        user_name=body.username,
    )

    session_id = secrets.token_urlsafe(32)
    _store_challenge(session_id, challenge)

    # options_to_json returns a JSON string; parse it back to dict so
    # FastAPI can serialise it cleanly inside the response envelope.
    options_dict = json.loads(serialise_options(options))

    return RegisterBeginResponse(options=options_dict, session_id=session_id)


@router.post(
    "/register/complete",
    response_model=RegisterCompleteResponse,
    summary="Complete WebAuthn registration",
    description=(
        "Verify the attestation response from the browser, create a Firestore "
        "user document, and return a JWT session token."
    ),
)
async def register_complete(body: RegisterCompleteRequest) -> RegisterCompleteResponse:
    challenge = _pop_challenge(body.session_id)
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired session_id.",
        )

    try:
        verification = verify_registration(
            credential_json=body.credential,
            expected_challenge=challenge,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"WebAuthn registration verification failed: {exc}",
        )

    if not verification.user_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User verification was not performed by the authenticator.",
        )

    device_type = verification.credential_device_type.value  # 'singleDevice' | 'multiDevice'

    user = await create_user(
        username=body.username,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        device_type=device_type,
        backed_up=verification.credential_backed_up,
    )

    token = create_session_token(user["id"])

    return RegisterCompleteResponse(
        user_id=user["id"],
        token=token,
        address=user["address"],  # Empty until client-side key derivation
    )


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@router.post(
    "/login/begin",
    response_model=LoginBeginResponse,
    summary="Begin WebAuthn authentication",
    description=(
        "Generate passkey assertion options. Uses discoverable credentials "
        "(empty allow_credentials) so the authenticator resolves the user."
    ),
)
async def login_begin(body: LoginBeginRequest) -> LoginBeginResponse:
    # Discoverable credential flow: no allow_credentials list.
    # The authenticator will present the user with all passkeys registered
    # for this RP ID and let them choose.
    options, challenge = create_authentication_options(credentials=None)

    session_id = secrets.token_urlsafe(32)
    _store_challenge(session_id, challenge)

    options_dict = json.loads(serialise_options(options))

    return LoginBeginResponse(options=options_dict, session_id=session_id)


@router.post(
    "/login/complete",
    response_model=LoginCompleteResponse,
    summary="Complete WebAuthn authentication",
    description=(
        "Verify the assertion response, update the sign count for replay "
        "protection, and return a fresh JWT session token."
    ),
)
async def login_complete(body: LoginCompleteRequest) -> LoginCompleteResponse:
    challenge = _pop_challenge(body.session_id)
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired session_id.",
        )

    # The credential ID from the browser response tells us which user this is.
    # py-webauthn encodes it as base64url; we need hex for our Firestore index.
    raw_credential = body.credential
    credential_id_b64 = raw_credential.get("id") or raw_credential.get("rawId")
    if not credential_id_b64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credential response is missing 'id' field.",
        )

    # Decode base64url to hex for the Firestore lookup.
    from webauthn import base64url_to_bytes

    try:
        credential_id_bytes = base64url_to_bytes(credential_id_b64)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credential 'id' is not valid base64url.",
        )

    credential_id_hex = credential_id_bytes.hex()

    # Find the user who owns this credential.
    user = await get_user_by_credential_id(credential_id_hex)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unknown credential.",
        )

    stored_cred = get_credential(user, credential_id_hex)
    if stored_cred is None:
        # Should not happen given the index lookup succeeded, but guard anyway.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credential not found on user record.",
        )

    public_key_bytes = bytes.fromhex(stored_cred["public_key"])
    stored_sign_count: int = stored_cred["sign_count"]

    try:
        verification = verify_authentication(
            credential_json=raw_credential,
            expected_challenge=challenge,
            public_key=public_key_bytes,
            sign_count=stored_sign_count,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"WebAuthn authentication failed: {exc}",
        )

    if not verification.credential_backed_up and not stored_cred.get("backed_up", False):
        # Single-device credential — not backed up, user should be reminded to
        # register a backup passkey, but we still allow the login.
        pass

    # Persist the updated sign count.  new_sign_count == 0 means the
    # authenticator doesn't maintain a counter (some platform authenticators);
    # we accept that but still write 0 so the field stays consistent.
    await update_sign_count(
        user_id=user["id"],
        credential_id_hex=credential_id_hex,
        new_sign_count=verification.new_sign_count,
    )

    token = create_session_token(user["id"])

    return LoginCompleteResponse(
        user_id=user["id"],
        token=token,
        address=user.get("address", ""),
    )


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Logout",
    description=(
        "Stateless logout — JWTs cannot be server-side invalidated. "
        "The client must delete the token from storage. "
        "This endpoint exists so the frontend has a consistent logout URL."
    ),
)
async def logout() -> LogoutResponse:
    return LogoutResponse(ok=True)


# ---------------------------------------------------------------------------
# Address update
# ---------------------------------------------------------------------------


@router.patch(
    "/address",
    response_model=UpdateAddressResponse,
    summary="Set derived EOA address",
    description=(
        "Persist the user's derived Ethereum address after client-side BIP-44 "
        "key derivation completes.  Called immediately after registration "
        "completes and the seed has been encrypted and stored locally."
    ),
)
async def update_eth_address(
    body: UpdateAddressRequest,
    user_id: str = Depends(get_current_user),
) -> UpdateAddressResponse:
    """Store the EOA address derived from the user's passkey-encrypted seed."""
    await update_address(user_id, body.address)
    return UpdateAddressResponse(status="ok", address=body.address)
