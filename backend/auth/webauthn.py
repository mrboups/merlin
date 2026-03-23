"""
WebAuthn registration and authentication helpers using py-webauthn 2.1.0.

RP settings are driven by environment variables so the same code runs
correctly in local dev (localhost) and production (merlin.app).
"""

import os

from webauthn.registration.generate_registration_options import generate_registration_options
from webauthn.registration.verify_registration_response import verify_registration_response
from webauthn.authentication.generate_authentication_options import generate_authentication_options
from webauthn.authentication.verify_authentication_response import verify_authentication_response
from webauthn.helpers.options_to_json import options_to_json
from webauthn.helpers.parse_registration_credential_json import parse_registration_credential_json
from webauthn.helpers.parse_authentication_credential_json import parse_authentication_credential_json
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    PublicKeyCredentialCreationOptions,
    PublicKeyCredentialRequestOptions,
    RegistrationCredential,
    AuthenticationCredential,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)
from webauthn.registration.verify_registration_response import VerifiedRegistration
from webauthn.authentication.verify_authentication_response import VerifiedAuthentication

# ---------------------------------------------------------------------------
# RP configuration — override via environment for production deployment
# ---------------------------------------------------------------------------

RP_ID: str = os.environ.get("WEBAUTHN_RP_ID", "localhost")
RP_NAME: str = os.environ.get("WEBAUTHN_RP_NAME", "Merlin")
ORIGIN: str = os.environ.get("WEBAUTHN_ORIGIN", "http://localhost:3000")


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def create_registration_options(
    user_id: str,
    user_name: str,
    existing_credentials: list[bytes] | None = None,
) -> tuple[PublicKeyCredentialCreationOptions, bytes]:
    """
    Generate WebAuthn registration options for a new passkey.

    Returns the options object (use options_to_json to serialise for the
    browser) and the raw challenge bytes that must be stored server-side
    until the ceremony completes.

    existing_credentials: raw credential IDs already registered for this
    user so the authenticator excludes them (prevents duplicate passkeys
    on the same device).
    """
    if existing_credentials is None:
        existing_credentials = []

    exclude = [PublicKeyCredentialDescriptor(id=cid) for cid in existing_credentials]

    options = generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_name=user_name,
        user_id=user_id.encode(),
        user_display_name=user_name,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,       # ES256 — preferred
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,  # RS256 — fallback
        ],
        exclude_credentials=exclude or None,
        timeout=60000,
    )

    # options.challenge is generated internally by the library when we don't
    # pass one explicitly; read it back so we can store it.
    challenge: bytes = options.challenge
    return options, challenge


def serialise_options(
    options: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions,
) -> str:
    """Convert a py-webauthn options object to a JSON string for the browser."""
    return options_to_json(options)


def verify_registration(
    credential_json: dict,
    expected_challenge: bytes,
    require_user_verification: bool = True,
) -> VerifiedRegistration:
    """
    Verify a WebAuthn registration response from the browser.

    credential_json: the raw dict received from the browser
        (RegistrationResponseJSON from @simplewebauthn/browser).
    expected_challenge: the challenge bytes we generated for this ceremony.

    Raises webauthn.exceptions.InvalidCBORData / webauthn.exceptions.InvalidAuthenticatorDataStructure
    or other exceptions on failure — callers must catch and return 400.
    """
    credential: RegistrationCredential = parse_registration_credential_json(credential_json)
    return verify_registration_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_rp_id=RP_ID,
        expected_origin=ORIGIN,
        require_user_verification=require_user_verification,
    )


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


def create_authentication_options(
    credentials: list[bytes] | None = None,
) -> tuple[PublicKeyCredentialRequestOptions, bytes]:
    """
    Generate WebAuthn authentication options.

    credentials: list of raw credential ID bytes for the authenticating user.
    Pass an empty list or None for a discoverable-credential (passkey) flow
    where the authenticator identifies the user itself.

    Returns (options, challenge_bytes).
    """
    allow: list[PublicKeyCredentialDescriptor] | None = None
    if credentials:
        allow = [PublicKeyCredentialDescriptor(id=cid) for cid in credentials]

    options = generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.REQUIRED,
        timeout=60000,
    )

    challenge: bytes = options.challenge
    return options, challenge


def verify_authentication(
    credential_json: dict,
    expected_challenge: bytes,
    public_key: bytes,
    sign_count: int,
    require_user_verification: bool = True,
) -> VerifiedAuthentication:
    """
    Verify a WebAuthn authentication assertion from the browser.

    credential_json: raw dict from the browser
        (AuthenticationResponseJSON from @simplewebauthn/browser).
    expected_challenge: challenge bytes stored during login/begin.
    public_key: the COSE-encoded public key bytes stored at registration.
    sign_count: the last known authenticator sign count (anti-replay).

    Raises on failure — callers must catch and return 401.
    """
    credential: AuthenticationCredential = parse_authentication_credential_json(credential_json)
    return verify_authentication_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_rp_id=RP_ID,
        expected_origin=ORIGIN,
        credential_public_key=public_key,
        credential_current_sign_count=sign_count,
        require_user_verification=require_user_verification,
    )
