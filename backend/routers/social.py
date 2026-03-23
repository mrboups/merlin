"""
Social signals endpoints.

GET /social/signals  — fetch social sentiment signals, optionally for a
                       specific symbol.  If a symbol is provided and the
                       Grok API key is configured, a fresh sentiment analysis
                       is performed and persisted before returning results.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth.dependencies import get_current_user
from db.signals import get_signals, save_signal
from services.social import analyze_sentiment

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/social/signals")
async def list_signals(
    symbol: Optional[str] = Query(None, description="Filter by asset symbol (e.g. TSLA)"),
    limit: int = Query(50, ge=1, le=200, description="Max signals to return"),
    user_id: str = Depends(get_current_user),
):
    """
    Return social sentiment signals.

    When *symbol* is provided the endpoint first asks the Grok API for a
    fresh sentiment analysis and saves it to Firestore before returning
    all matching signals.  If the Grok API key is not configured the
    endpoint still returns any previously cached signals.
    """
    upper_symbol = symbol.upper() if symbol else None

    # If a specific symbol is requested, try to get fresh sentiment
    if upper_symbol:
        try:
            fresh = await analyze_sentiment(upper_symbol)
            if fresh is not None:
                await save_signal(fresh)
        except Exception:
            logger.exception("Failed to fetch fresh sentiment for %s", upper_symbol)

    signals = await get_signals(symbol=upper_symbol, limit=limit)
    return {"signals": signals}
