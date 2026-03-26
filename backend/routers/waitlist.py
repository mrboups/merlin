"""Waitlist endpoint — collect emails for beta launch notification."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db.firestore import get_firestore

router = APIRouter()


class WaitlistRequest(BaseModel):
    email: str


@router.post("/waitlist")
async def join_waitlist(body: WaitlistRequest) -> dict[str, str]:
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address.")

    db = get_firestore()

    # Check if already registered
    query = db.collection("waitlist").where("email", "==", email).limit(1)
    docs = [d async for d in query.stream()]
    if docs:
        return {"status": "already_registered", "message": "You're already on the list!"}

    await db.collection("waitlist").add(
        {
            "email": email,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": "website",
        }
    )
    return {"status": "ok", "message": "You're on the list!"}
