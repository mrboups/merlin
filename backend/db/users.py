"""
User CRUD operations backed by Firestore.

Schema
------
Collection: users
  Document ID: user_id (UUID)
  Fields:
    id            str  — same as document ID
    username      str
    address       str  — EOA address, set after client-side key derivation
    created_at    str  — ISO-8601 UTC
    credentials   list[dict] — see credential dict shape below

Each credential dict:
    credential_id  str  — hex-encoded raw bytes
    public_key     str  — hex-encoded COSE public key bytes
    sign_count     int
    device_type    str  — 'singleDevice' | 'multiDevice'
    backed_up      bool
    created_at     str  — ISO-8601 UTC

Credential lookup index
-----------------------
Collection: credential_index
  Document ID: credential_id_hex
  Fields:
    user_id  str  — points back to the user document

This avoids a full collection scan when looking up a user by credential ID.
Firestore does not support array_contains_any on nested objects, so a
separate index collection is the correct Firestore pattern.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from .firestore import get_firestore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# User creation
# ---------------------------------------------------------------------------


async def create_user(
    username: str,
    credential_id: bytes,
    public_key: bytes,
    sign_count: int,
    device_type: str = "singleDevice",
    backed_up: bool = False,
) -> dict:
    """
    Create a new user document with their first WebAuthn credential.

    Returns the full user dict as stored in Firestore.
    """
    db = get_firestore()
    user_id = str(uuid.uuid4())
    credential_id_hex = credential_id.hex()

    credential_entry = {
        "credential_id": credential_id_hex,
        "public_key": public_key.hex(),
        "sign_count": sign_count,
        "device_type": device_type,
        "backed_up": backed_up,
        "created_at": _now_iso(),
    }

    user_doc = {
        "id": user_id,
        "username": username,
        "address": "",
        "created_at": _now_iso(),
        "credentials": [credential_entry],
    }

    # Write user document and index entry atomically via a batch.
    batch = db.batch()
    batch.set(db.collection("users").document(user_id), user_doc)
    batch.set(
        db.collection("credential_index").document(credential_id_hex),
        {"user_id": user_id},
    )
    await batch.commit()

    return user_doc


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def get_user_by_id(user_id: str) -> Optional[dict]:
    """Return the user dict for user_id, or None if not found."""
    db = get_firestore()
    snapshot = await db.collection("users").document(user_id).get()
    return snapshot.to_dict() if snapshot.exists else None


async def get_user_by_credential_id(credential_id_hex: str) -> Optional[dict]:
    """
    Look up a user by their WebAuthn credential ID.

    Uses the credential_index collection for an O(1) lookup — no
    full-collection scan.
    """
    db = get_firestore()
    index_snapshot = await db.collection("credential_index").document(credential_id_hex).get()
    if not index_snapshot.exists:
        return None

    index_data = index_snapshot.to_dict()
    user_id: str = index_data["user_id"]
    return await get_user_by_id(user_id)


def get_credential(user: dict, credential_id_hex: str) -> Optional[dict]:
    """
    Extract a single credential entry from a user dict by credential ID.

    Returns None if the credential is not found on this user.
    This is a pure dict look-up (no Firestore call).
    """
    for cred in user.get("credentials", []):
        if cred.get("credential_id") == credential_id_hex:
            return cred
    return None


# ---------------------------------------------------------------------------
# Updates
# ---------------------------------------------------------------------------


async def update_sign_count(user_id: str, credential_id_hex: str, new_sign_count: int) -> None:
    """
    Update the sign_count for one credential after a successful authentication.

    The sign count is used for replay protection — the server rejects any
    assertion where the new count is not strictly greater than the stored one.
    """
    db = get_firestore()
    user = await get_user_by_id(user_id)
    if not user:
        return

    credentials = user.get("credentials", [])
    for cred in credentials:
        if cred.get("credential_id") == credential_id_hex:
            cred["sign_count"] = new_sign_count
            break

    await db.collection("users").document(user_id).update({"credentials": credentials})


async def update_address(user_id: str, address: str) -> None:
    """
    Persist the user's EOA address after client-side key derivation completes.
    """
    db = get_firestore()
    await db.collection("users").document(user_id).update({"address": address})


async def add_credential(
    user_id: str,
    credential_id: bytes,
    public_key: bytes,
    sign_count: int,
    device_type: str = "singleDevice",
    backed_up: bool = False,
) -> None:
    """
    Register an additional passkey for an existing user (multi-device backup).

    Writes the credential entry into the user's credentials array and adds
    an entry to credential_index.
    """
    db = get_firestore()
    credential_id_hex = credential_id.hex()

    credential_entry = {
        "credential_id": credential_id_hex,
        "public_key": public_key.hex(),
        "sign_count": sign_count,
        "device_type": device_type,
        "backed_up": backed_up,
        "created_at": _now_iso(),
    }

    user = await get_user_by_id(user_id)
    if not user:
        return

    credentials = user.get("credentials", [])
    credentials.append(credential_entry)

    batch = db.batch()
    batch.update(db.collection("users").document(user_id), {"credentials": credentials})
    batch.set(
        db.collection("credential_index").document(credential_id_hex),
        {"user_id": user_id},
    )
    await batch.commit()
