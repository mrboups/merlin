"""
Firestore-backed WebAuthn challenge store.

Challenges are stored with a 5-minute TTL and deleted on first read
(one-time use).  This replaces the in-memory dict so the auth flow
works correctly across multiple Cloud Run replicas.
"""

from datetime import datetime, timedelta, timezone

from .firestore import get_firestore

CHALLENGE_TTL_SECONDS = 300  # 5 minutes


async def store_challenge(
    session_id: str,
    challenge: bytes,
    user_data: dict | None = None,
) -> None:
    """Store a WebAuthn challenge in Firestore with TTL metadata."""
    db = get_firestore()
    now = datetime.now(timezone.utc)
    await db.collection("challenges").document(session_id).set(
        {
            "challenge": challenge.hex(),
            "user_data": user_data,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(seconds=CHALLENGE_TTL_SECONDS)).isoformat(),
        }
    )


async def get_challenge(session_id: str) -> tuple[bytes, dict | None] | None:
    """
    Retrieve and delete a challenge (one-time use).

    Returns ``(challenge_bytes, user_data)`` or ``None`` if the session_id
    is unknown or the challenge has expired.
    """
    db = get_firestore()
    doc_ref = db.collection("challenges").document(session_id)
    doc = await doc_ref.get()

    if not doc.exists:
        return None

    data = doc.to_dict()

    # Delete after reading — one-time use
    await doc_ref.delete()

    # Check expiry
    expires_at = datetime.fromisoformat(data["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        return None

    challenge = bytes.fromhex(data["challenge"])
    return challenge, data.get("user_data")
