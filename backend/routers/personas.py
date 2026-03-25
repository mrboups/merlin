"""
Personas router — AI trading strategy personas.

Built-in personas:
  - Elon: momentum + social sentiment, aggressive risk
  - Buffett: value investing, conservative risk
  - AI Momentum: quantitative signals, moderate risk
  - Degen: high-frequency meme/trend trading, aggressive risk

Custom personas are stored per-user in Firestore.
Activation state is per-user — each user can have one active persona at a time.
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import get_current_user
from db.firestore import get_firestore

router = APIRouter()

# ---------------------------------------------------------------------------
# Built-in personas (not stored in Firestore — hardcoded)
# ---------------------------------------------------------------------------

BUILTIN_PERSONAS: list[dict] = [
    {
        "id": "elon",
        "name": "Elon",
        "display_name": "Elon Strategy",
        "description": "Momentum-based trading driven by social sentiment and market buzz. Favours high-volatility assets and trend-following entries.",
        "strategy_type": "momentum",
        "type": "builtin",
        "risk_level": "aggressive",
        "system_prompt_suffix": (
            "You follow a momentum and social sentiment strategy. "
            "You look for trending assets with strong social buzz, "
            "favour quick entries on breakouts, and are comfortable with higher risk. "
            "You reference social signals and market momentum in your analysis."
        ),
    },
    {
        "id": "buffett",
        "name": "Buffett",
        "display_name": "Buffett Strategy",
        "description": "Value-oriented approach focusing on fundamentals, margin of safety, and long-term holds. Conservative position sizing.",
        "strategy_type": "value",
        "type": "builtin",
        "risk_level": "conservative",
        "system_prompt_suffix": (
            "You follow a value investing strategy inspired by Warren Buffett. "
            "You look for assets trading below intrinsic value, emphasise margin of safety, "
            "prefer longer holding periods, and recommend conservative position sizes. "
            "You caution against speculation and FOMO."
        ),
    },
    {
        "id": "ai-momentum",
        "name": "AI Momentum",
        "display_name": "AI Momentum",
        "description": "Quantitative signal-driven strategy using technical indicators, volume analysis, and on-chain metrics.",
        "strategy_type": "quantitative",
        "type": "builtin",
        "risk_level": "moderate",
        "system_prompt_suffix": (
            "You follow a quantitative momentum strategy. "
            "You analyse technical indicators (RSI, MACD, moving averages), "
            "volume patterns, and on-chain metrics to identify entry and exit points. "
            "You recommend moderate position sizes with clear stop-loss levels."
        ),
    },
    {
        "id": "degen",
        "name": "Degen",
        "display_name": "Degen Mode",
        "description": "High-conviction, high-risk plays on trending tokens and meme assets. Fast in, fast out.",
        "strategy_type": "speculative",
        "type": "builtin",
        "risk_level": "aggressive",
        "system_prompt_suffix": (
            "You follow a high-risk speculative strategy. "
            "You look for trending tokens, meme plays, and asymmetric bets. "
            "You are comfortable with large position sizes and fast trades. "
            "You warn the user this is high-risk but respect their autonomy."
        ),
    },
]

_BUILTIN_BY_ID: dict[str, dict] = {p["id"]: p for p in BUILTIN_PERSONAS}


# ---------------------------------------------------------------------------
# Firestore helpers
# ---------------------------------------------------------------------------

async def _get_user_personas(user_id: str) -> list[dict]:
    """Load custom personas for a user from Firestore."""
    db = get_firestore()
    docs = db.collection("users").document(user_id).collection("personas").stream()
    results = []
    async for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        results.append(data)
    return results


async def _get_active_persona_id(user_id: str) -> Optional[str]:
    """Get the user's currently active persona ID from their profile."""
    db = get_firestore()
    doc = await db.collection("users").document(user_id).get()
    if doc.exists:
        return doc.to_dict().get("active_persona_id")
    return None


async def _set_active_persona_id(user_id: str, persona_id: Optional[str]) -> None:
    """Set the user's active persona ID on their profile."""
    db = get_firestore()
    await db.collection("users").document(user_id).set(
        {"active_persona_id": persona_id}, merge=True
    )


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class CreatePersonaRequest(BaseModel):
    name: str
    description: str = ""
    system_prompt: str = ""
    risk_level: str = "moderate"


class UpdatePersonaConfigRequest(BaseModel):
    auto_trade_enabled: Optional[bool] = None
    risk_level: Optional[str] = None
    active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/agents/personas")
async def list_personas(user_id: str = Depends(get_current_user)):
    """
    List all personas (built-in + user's custom ones).

    Each persona includes an `active` flag indicating whether it is the
    user's currently selected persona.
    """
    active_id = await _get_active_persona_id(user_id)

    # Built-in personas
    personas = []
    for bp in BUILTIN_PERSONAS:
        personas.append({
            "id": bp["id"],
            "name": bp["name"],
            "display_name": bp["display_name"],
            "description": bp["description"],
            "strategy_type": bp["strategy_type"],
            "type": bp["type"],
            "risk_level": bp["risk_level"],
            "active": bp["id"] == active_id,
        })

    # Custom personas from Firestore
    custom = await _get_user_personas(user_id)
    for cp in custom:
        personas.append({
            "id": cp["id"],
            "name": cp.get("name", "Custom"),
            "display_name": cp.get("display_name", cp.get("name", "Custom")),
            "description": cp.get("description", ""),
            "strategy_type": cp.get("strategy_type", "custom"),
            "type": "custom",
            "risk_level": cp.get("risk_level", "moderate"),
            "active": cp["id"] == active_id,
        })

    return {"personas": personas}


@router.post("/agents/personas/custom")
async def create_persona(
    body: CreatePersonaRequest,
    user_id: str = Depends(get_current_user),
):
    """Create a new custom persona for the current user."""
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Persona name is required")

    persona_id = f"custom-{uuid.uuid4().hex[:12]}"
    persona_data = {
        "name": body.name.strip(),
        "display_name": body.name.strip(),
        "description": body.description.strip(),
        "system_prompt": body.system_prompt.strip(),
        "risk_level": body.risk_level,
        "strategy_type": "custom",
        "type": "custom",
    }

    db = get_firestore()
    await db.collection("users").document(user_id).collection("personas").document(persona_id).set(persona_data)

    return {
        "persona": {
            "id": persona_id,
            **persona_data,
            "active": False,
        }
    }


@router.post("/agents/personas/{persona_id}/activate")
async def activate_persona(
    persona_id: str,
    user_id: str = Depends(get_current_user),
):
    """Set a persona as the user's active persona."""
    # Verify persona exists (built-in or custom)
    if persona_id not in _BUILTIN_BY_ID:
        db = get_firestore()
        doc = await db.collection("users").document(user_id).collection("personas").document(persona_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Persona not found")

    await _set_active_persona_id(user_id, persona_id)
    return {"status": "ok", "active_persona_id": persona_id}


@router.patch("/agents/personas/{persona_id}/config")
async def update_persona_config(
    persona_id: str,
    body: UpdatePersonaConfigRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Update persona configuration.

    For built-in personas, only activation state can be changed.
    For custom personas, risk_level can also be updated.

    Setting active=False or auto_trade_enabled=False deactivates the persona
    (clears active_persona_id if it matches).
    """
    # Handle deactivation
    if body.active is False or body.auto_trade_enabled is False:
        current_active = await _get_active_persona_id(user_id)
        if current_active == persona_id:
            await _set_active_persona_id(user_id, None)
        return {"status": "ok", "active_persona_id": None}

    # Handle custom persona config update
    if persona_id not in _BUILTIN_BY_ID:
        db = get_firestore()
        doc_ref = db.collection("users").document(user_id).collection("personas").document(persona_id)
        doc = await doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Persona not found")

        updates = {}
        if body.risk_level is not None:
            updates["risk_level"] = body.risk_level
        if updates:
            await doc_ref.update(updates)

    return {"status": "ok"}


@router.delete("/agents/personas/{persona_id}")
async def delete_persona(
    persona_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a custom persona. Built-in personas cannot be deleted."""
    if persona_id in _BUILTIN_BY_ID:
        raise HTTPException(status_code=400, detail="Cannot delete a built-in persona")

    db = get_firestore()
    doc_ref = db.collection("users").document(user_id).collection("personas").document(persona_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Persona not found")

    await doc_ref.delete()

    # Clear active if this was the active persona
    current_active = await _get_active_persona_id(user_id)
    if current_active == persona_id:
        await _set_active_persona_id(user_id, None)

    return {"status": "ok"}
