"""Analytics endpoint — track button clicks and page events."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from db.firestore import get_firestore

router = APIRouter()


class TrackEventRequest(BaseModel):
    event: str  # e.g. "cta_click", "waitlist_open", "telegram_click"
    source: Optional[str] = None  # e.g. "hero", "nav", "cta_section", "footer"
    metadata: Optional[dict] = None


@router.post("/track")
async def track_event(body: TrackEventRequest):
    """Save an analytics event to Firestore. No auth required."""
    db = get_firestore()
    await db.collection("analytics_events").add({
        "event": body.event,
        "source": body.source or "unknown",
        "metadata": body.metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": "ok"}
