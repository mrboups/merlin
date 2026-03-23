"""
Firestore persistence for social signals.

Collection: ``social_signals`` (global, not per-user).
"""

from datetime import datetime, timezone

from .firestore import get_firestore


async def save_signal(signal: dict) -> str:
    """
    Save a social signal document to Firestore.

    Returns the auto-generated document ID.
    """
    db = get_firestore()
    doc = {
        **signal,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _, doc_ref = await db.collection("social_signals").add(doc)
    return doc_ref.id


async def get_signals(symbol: str | None = None, limit: int = 50) -> list[dict]:
    """
    Retrieve recent social signals, optionally filtered by symbol.

    Results are ordered by ``created_at`` descending.
    """
    db = get_firestore()
    query = db.collection("social_signals").order_by(
        "created_at", direction="DESCENDING"
    )

    if symbol:
        query = query.where("symbol", "==", symbol.upper())

    query = query.limit(limit)

    docs = query.stream()
    results: list[dict] = []
    async for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        results.append(data)

    return results
