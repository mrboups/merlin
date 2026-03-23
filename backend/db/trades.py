"""
Trade history CRUD backed by Firestore.

Schema
------
Collection: users/{user_id}/trades
  Document ID: auto-generated
  Fields:
    id              str  — same as document ID
    type            str  — "buy" | "sell" | "swap"
    asset_in        str  — symbol sold (e.g. "ETH", "USDC")
    asset_out       str  — symbol bought (e.g. "TSLAx", "ETH")
    amount_in       float
    amount_out      float
    price_usd       float | None — execution price in USD
    tx_hash         str  — on-chain transaction hash
    status          str  — "pending" | "confirmed" | "failed"
    privacy_mode    str  — "public" | "shielded" | "compliant"
    created_at      str  — ISO-8601 UTC
"""

from datetime import datetime, timezone
from typing import Optional

from google.cloud.firestore_v1 import AsyncQuery

from .firestore import get_firestore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def save_trade(user_id: str, trade: dict) -> str:
    """
    Save a trade record to Firestore under the user's trades subcollection.

    The trade dict should contain at minimum:
        type, asset_in, asset_out, amount_in, amount_out, tx_hash, status

    Returns the auto-generated trade document ID.
    """
    db = get_firestore()
    collection = db.collection("users").document(user_id).collection("trades")

    trade_doc = {
        "type": trade.get("type", "swap"),
        "asset_in": trade.get("asset_in", ""),
        "asset_out": trade.get("asset_out", ""),
        "amount_in": trade.get("amount_in", 0),
        "amount_out": trade.get("amount_out", 0),
        "price_usd": trade.get("price_usd"),
        "tx_hash": trade.get("tx_hash", ""),
        "status": trade.get("status", "pending"),
        "privacy_mode": trade.get("privacy_mode", "public"),
        "created_at": trade.get("created_at", _now_iso()),
    }

    doc_ref = collection.document()
    trade_doc["id"] = doc_ref.id
    await doc_ref.set(trade_doc)

    return doc_ref.id


async def get_trades(
    user_id: str, page: int = 1, page_size: int = 20
) -> list[dict]:
    """
    Get paginated trade history for a user, ordered by created_at descending.

    Args:
        user_id: The user's ID.
        page: 1-based page number.
        page_size: Number of trades per page (max 100).

    Returns:
        List of trade dicts.
    """
    db = get_firestore()
    page_size = min(page_size, 100)
    offset = (max(page, 1) - 1) * page_size

    collection = db.collection("users").document(user_id).collection("trades")
    query: AsyncQuery = (
        collection
        .order_by("created_at", direction="DESCENDING")
        .offset(offset)
        .limit(page_size)
    )

    docs = query.stream()
    results: list[dict] = []
    async for doc in docs:
        results.append(doc.to_dict())

    return results


async def get_trade_count(user_id: str) -> int:
    """Get the total number of trades for a user."""
    db = get_firestore()
    collection = db.collection("users").document(user_id).collection("trades")
    # Firestore doesn't have a native count without reading docs,
    # so we use the count aggregation query.
    count_query = collection.count()
    result = await count_query.get()
    # result is a list of AggregationResult
    if result and len(result) > 0:
        return result[0][0].value
    return 0


async def update_trade_status(
    user_id: str, trade_id: str, status: str, tx_hash: Optional[str] = None
) -> None:
    """Update a trade's status (and optionally tx_hash) after confirmation."""
    db = get_firestore()
    doc_ref = (
        db.collection("users").document(user_id)
        .collection("trades").document(trade_id)
    )
    update: dict = {"status": status}
    if tx_hash is not None:
        update["tx_hash"] = tx_hash
    await doc_ref.update(update)


async def save_quoted_trade(
    user_id: str,
    asset: str,
    symbol: str,
    side: str,
    amount: float,
    amount_type: str = "usd",
    total_usd: float = 0.0,
    conversation_id: str = "",
    guardrail_result: dict | None = None,
) -> str:
    """
    Persist a quoted (pre-execution) trade record.

    This is called after guardrails pass and a quote is generated,
    but before on-chain execution.  Returns the trade document ID.
    """
    trade = {
        "type": side,
        "asset_in": "USDC" if side == "buy" else symbol,
        "asset_out": symbol if side == "buy" else "USDC",
        "amount_in": amount if amount_type == "usd" else 0,
        "amount_out": 0,
        "price_usd": None,
        "tx_hash": "",
        "status": "quoted",
        "privacy_mode": "public",
        "created_at": _now_iso(),
        # Extended fields for guardrail / chat traceability
        "side": side,
        "symbol": symbol,
        "asset": asset,
        "amount": amount,
        "amount_type": amount_type,
        "total_usd": total_usd if total_usd else (amount if amount_type == "usd" else 0),
        "conversation_id": conversation_id,
    }
    if guardrail_result:
        trade["guardrail_result"] = guardrail_result

    return await save_trade(user_id, trade)
