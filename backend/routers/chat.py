"""
Chat and market endpoints.

POST /chat                — streaming SSE chat
GET  /chat/history        — get messages for a conversation
DELETE /chat/history      — clear conversation messages
GET  /chat/sessions       — list user's conversations
POST /chat/sessions       — create new conversation
GET  /chat/provider       — get user's AI model preference
PATCH /chat/provider      — set AI model preference
GET  /market/assets       — list all tradable xStock tokens
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth.dependencies import get_current_user
from db.conversations import (
    clear_messages,
    create_conversation,
    delete_conversation,
    get_messages,
    list_conversations,
)
from db.firestore import get_firestore
from services.chat import chat
from services.xstock import list_all_assets, list_tokens

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_id: str | None = None


class ProviderUpdate(BaseModel):
    model: str = Field(..., min_length=1, max_length=100)


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


@router.post("/chat")
async def send_message(
    body: ChatRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Streaming chat endpoint.

    Accepts a user message and returns a Server-Sent Events stream with:
      - {"type": "text", "content": "..."}         — AI response chunks
      - {"type": "trade_intent", "data": {...}}     — parsed trade intent
      - {"type": "error", "content": "..."}         — error message
      - {"type": "done", "conversation_id": "..."}  — stream complete
    """
    return StreamingResponse(
        chat(
            user_id=user_id,
            message=body.message,
            conversation_id=body.conversation_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Conversation history
# ---------------------------------------------------------------------------


@router.get("/chat/history")
async def get_history(
    conversation_id: str = Query(..., description="Conversation ID"),
    limit: int = Query(100, ge=1, le=500),
    user_id: str = Depends(get_current_user),
):
    """Get messages for a conversation."""
    messages = await get_messages(user_id, conversation_id, limit=limit)
    return {"conversation_id": conversation_id, "messages": messages}


@router.delete("/chat/history")
async def clear_history(
    conversation_id: str = Query(..., description="Conversation ID"),
    user_id: str = Depends(get_current_user),
):
    """Clear all messages in a conversation."""
    count = await clear_messages(user_id, conversation_id)
    return {"conversation_id": conversation_id, "deleted": count}


# ---------------------------------------------------------------------------
# Sessions (conversations)
# ---------------------------------------------------------------------------


@router.get("/chat/sessions")
async def list_sessions(
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(get_current_user),
):
    """List the user's conversations, most recent first."""
    conversations = await list_conversations(user_id, limit=limit)
    return {"conversations": conversations}


@router.post("/chat/sessions")
async def create_session(
    user_id: str = Depends(get_current_user),
):
    """Create a new empty conversation."""
    conv = await create_conversation(user_id)
    return conv


@router.delete("/chat/sessions")
async def delete_session(
    conversation_id: str = Query(..., description="Conversation ID"),
    user_id: str = Depends(get_current_user),
):
    """Delete a conversation and all its messages."""
    await delete_conversation(user_id, conversation_id)
    return {"deleted": conversation_id}


# ---------------------------------------------------------------------------
# AI provider preference
# ---------------------------------------------------------------------------


@router.get("/chat/provider")
async def get_provider(user_id: str = Depends(get_current_user)):
    """Get the user's preferred AI model."""
    db = get_firestore()
    snapshot = await db.collection("users").document(user_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="User not found.")

    user = snapshot.to_dict()
    return {
        "model": user.get("ai_model", "gpt-4o-mini"),
    }


@router.patch("/chat/provider")
async def update_provider(
    body: ProviderUpdate,
    user_id: str = Depends(get_current_user),
):
    """Set the user's preferred AI model."""
    allowed_models = {"gpt-4o-mini", "gpt-4o", "gpt-4-turbo"}
    if body.model not in allowed_models:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model. Choose from: {', '.join(sorted(allowed_models))}.",
        )

    db = get_firestore()
    await db.collection("users").document(user_id).update({"ai_model": body.model})
    return {"model": body.model}


# ---------------------------------------------------------------------------
# Market assets
# ---------------------------------------------------------------------------


@router.get("/market/assets")
async def list_assets(
    asset_type: str | None = Query(None, description="Filter by type: stock, etf, commodity_etf, crypto"),
    user_id: str = Depends(get_current_user),
):
    """List all available tradable assets (xStocks + crypto)."""
    assets = list_all_assets()

    if asset_type:
        assets = [a for a in assets if a.get("type") == asset_type]

    return {
        "count": len(assets),
        "assets": assets,
    }
