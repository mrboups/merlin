"""
Conversation and message persistence backed by Firestore.

Schema
------
Collection: users/{userId}/conversations/{convId}
  Fields:
    id          str  — same as document ID
    title       str  — auto-generated from first user message
    created_at  str  — ISO-8601 UTC
    updated_at  str  — ISO-8601 UTC

Sub-collection: users/{userId}/conversations/{convId}/messages/{msgId}
  Fields:
    id          str  — same as document ID
    role        str  — "user" | "assistant" | "system"
    content     str  — message text
    created_at  str  — ISO-8601 UTC
    metadata    dict — optional (trade_intent, function_call, etc.)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from .firestore import get_firestore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_title(message: str) -> str:
    """Generate a short conversation title from the first user message."""
    cleaned = message.strip()
    if len(cleaned) <= 50:
        return cleaned
    return cleaned[:47] + "..."


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------


async def create_conversation(user_id: str, first_message: str | None = None) -> dict:
    """Create a new conversation document. Returns the conversation dict."""
    db = get_firestore()
    conv_id = str(uuid.uuid4())
    now = _now_iso()

    title = _generate_title(first_message) if first_message else "New conversation"

    conv_doc = {
        "id": conv_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
    }

    await (
        db.collection("users")
        .document(user_id)
        .collection("conversations")
        .document(conv_id)
        .set(conv_doc)
    )

    return conv_doc


async def get_conversation(user_id: str, conversation_id: str) -> Optional[dict]:
    """Return a conversation dict or None."""
    db = get_firestore()
    snapshot = await (
        db.collection("users")
        .document(user_id)
        .collection("conversations")
        .document(conversation_id)
        .get()
    )
    return snapshot.to_dict() if snapshot.exists else None


async def list_conversations(user_id: str, limit: int = 50) -> list[dict]:
    """List conversations for a user, most recent first."""
    db = get_firestore()
    query = (
        db.collection("users")
        .document(user_id)
        .collection("conversations")
        .order_by("updated_at", direction="DESCENDING")
        .limit(limit)
    )

    results = []
    async for doc in query.stream():
        results.append(doc.to_dict())
    return results


async def delete_conversation(user_id: str, conversation_id: str) -> None:
    """Delete a conversation and all its messages."""
    db = get_firestore()
    conv_ref = (
        db.collection("users")
        .document(user_id)
        .collection("conversations")
        .document(conversation_id)
    )

    # Delete all messages in the sub-collection first
    messages_ref = conv_ref.collection("messages")
    async for doc in messages_ref.stream():
        await doc.reference.delete()

    # Delete the conversation document
    await conv_ref.delete()


async def update_conversation_timestamp(user_id: str, conversation_id: str) -> None:
    """Touch the updated_at field."""
    db = get_firestore()
    await (
        db.collection("users")
        .document(user_id)
        .collection("conversations")
        .document(conversation_id)
        .update({"updated_at": _now_iso()})
    )


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


async def add_message(
    user_id: str,
    conversation_id: str,
    role: str,
    content: str,
    metadata: dict | None = None,
) -> dict:
    """
    Append a message to a conversation.

    Parameters
    ----------
    role : str
        One of "user", "assistant", "system".
    content : str
        The message text.
    metadata : dict, optional
        Extra data (trade intent, function call info, etc.).

    Returns the stored message dict.
    """
    db = get_firestore()
    msg_id = str(uuid.uuid4())
    now = _now_iso()

    msg_doc: dict = {
        "id": msg_id,
        "role": role,
        "content": content,
        "created_at": now,
    }
    if metadata:
        msg_doc["metadata"] = metadata

    await (
        db.collection("users")
        .document(user_id)
        .collection("conversations")
        .document(conversation_id)
        .collection("messages")
        .document(msg_id)
        .set(msg_doc)
    )

    # Update conversation timestamp
    await update_conversation_timestamp(user_id, conversation_id)

    return msg_doc


async def get_messages(
    user_id: str,
    conversation_id: str,
    limit: int = 100,
) -> list[dict]:
    """Return messages for a conversation, ordered oldest-first."""
    db = get_firestore()
    query = (
        db.collection("users")
        .document(user_id)
        .collection("conversations")
        .document(conversation_id)
        .collection("messages")
        .order_by("created_at")
        .limit(limit)
    )

    results = []
    async for doc in query.stream():
        results.append(doc.to_dict())
    return results


async def clear_messages(user_id: str, conversation_id: str) -> int:
    """Delete all messages in a conversation. Returns count deleted."""
    db = get_firestore()
    messages_ref = (
        db.collection("users")
        .document(user_id)
        .collection("conversations")
        .document(conversation_id)
        .collection("messages")
    )

    count = 0
    async for doc in messages_ref.stream():
        await doc.reference.delete()
        count += 1

    return count
