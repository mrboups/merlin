"""
Trade Safety Guardrails.

Runs mandatory safety checks on every trade intent before it can proceed
to quoting or execution.  All checks must pass for a trade to be approved.

Implements checks from the Guardrails agent spec:
  1. Amount validation        — min $1, max $10,000
  2. Asset validation         — must be a known xStock or supported crypto
  3. Side validation          — must be "buy" or "sell"
  4. US person block          — xStocks blocked for US persons
  5. Sanctioned country block — blocked countries
  6. Daily limit              — max $50,000 daily notional
  7. Duplicate detection      — no identical trade within 60 seconds
  8. Rate limit               — max 10 trades per minute
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from db.firestore import get_firestore
from services.xstock import is_supported_asset

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MIN_TRADE_USD = 1.0
MAX_TRADE_USD = 10_000.0
DAILY_NOTIONAL_LIMIT = 50_000.0
DUPLICATE_WINDOW_SECONDS = 60
MAX_TRADES_PER_MINUTE = 10

SANCTIONED_COUNTRIES = frozenset({
    "KP",  # North Korea
    "IR",  # Iran
    "CU",  # Cuba
    "SY",  # Syria
    "RU",  # Russia
    "BY",  # Belarus
    "MM",  # Myanmar
    "VE",  # Venezuela
    "ZW",  # Zimbabwe
    "SD",  # Sudan
})


# ---------------------------------------------------------------------------
# Main validator
# ---------------------------------------------------------------------------


async def validate_trade(user_id: str, intent: dict) -> dict:
    """
    Run all safety checks on a trade intent.

    Parameters
    ----------
    user_id : str
        The authenticated user ID.
    intent : dict
        Parsed trade intent with keys: side, asset, amount, amount_type.

    Returns
    -------
    dict
        {
            "approved": bool,
            "checks": [{"name": str, "passed": bool, "detail": str}, ...],
            "reason": str | None   -- first failure reason, or None if all pass
        }
    """
    checks: list[dict] = []

    # 1. Side validation
    checks.append(_check_side(intent))

    # 2. Asset validation
    checks.append(_check_asset(intent))

    # 3. Amount validation
    checks.append(_check_amount(intent))

    # 4. US person block
    user_profile = await _get_user_profile(user_id)
    checks.append(_check_us_person(user_profile, intent))

    # 5. Sanctioned country block
    checks.append(_check_sanctioned_country(user_profile))

    # 6. Daily limit
    daily_check = await _check_daily_limit(user_id, intent)
    checks.append(daily_check)

    # 7. Duplicate detection
    dup_check = await _check_duplicate(user_id, intent)
    checks.append(dup_check)

    # 8. Rate limit
    rate_check = await _check_rate_limit(user_id)
    checks.append(rate_check)

    # Determine overall result
    failed = [c for c in checks if not c["passed"]]
    return {
        "approved": len(failed) == 0,
        "checks": checks,
        "reason": failed[0]["detail"] if failed else None,
    }


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------


def _check_side(intent: dict) -> dict:
    side = intent.get("side", "").lower()
    if side in ("buy", "sell"):
        return {"name": "side_validation", "passed": True, "detail": f"Side '{side}' is valid."}
    return {"name": "side_validation", "passed": False, "detail": f"Invalid trade side '{side}'. Must be 'buy' or 'sell'."}


def _check_asset(intent: dict) -> dict:
    asset = intent.get("asset", "")
    if not asset:
        return {"name": "asset_validation", "passed": False, "detail": "No asset specified."}
    if is_supported_asset(asset):
        return {"name": "asset_validation", "passed": True, "detail": f"Asset '{asset}' is supported."}
    return {"name": "asset_validation", "passed": False, "detail": f"Asset '{asset}' is not a recognized xStock or supported crypto."}


def _check_amount(intent: dict) -> dict:
    amount = intent.get("amount")
    amount_type = intent.get("amount_type", "usd")

    if amount is None:
        return {"name": "amount_validation", "passed": False, "detail": "No amount specified."}

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return {"name": "amount_validation", "passed": False, "detail": f"Invalid amount: {intent.get('amount')}."}

    if amount <= 0:
        return {"name": "amount_validation", "passed": False, "detail": "Amount must be greater than zero."}

    # For USD amounts, enforce min/max
    if amount_type == "usd":
        if amount < MIN_TRADE_USD:
            return {"name": "amount_validation", "passed": False, "detail": f"Minimum trade is ${MIN_TRADE_USD:.2f}."}
        if amount > MAX_TRADE_USD:
            return {"name": "amount_validation", "passed": False, "detail": f"Maximum trade is ${MAX_TRADE_USD:,.2f} per trade."}

    return {"name": "amount_validation", "passed": True, "detail": f"Amount {amount} ({amount_type}) is within limits."}


def _check_us_person(user_profile: dict, intent: dict) -> dict:
    """Block US persons from trading xStocks."""
    asset = intent.get("asset", "").upper()

    # Only block for xStock assets (prefixed with "x" or matched to xStock)
    is_xstock = asset.startswith("X") and asset not in ("XOM",)  # XOM is Exxon ticker, not xStock prefix
    # More reliable: check if the resolved symbol starts with "x"
    resolved_symbol = intent.get("resolved_symbol", "")
    if resolved_symbol.startswith("x") and resolved_symbol not in ("xOM",):
        is_xstock = True

    if not is_xstock:
        return {"name": "us_person_block", "passed": True, "detail": "Non-xStock asset — US person check not required."}

    is_us = user_profile.get("country") == "US" or user_profile.get("is_us_person", False)
    if is_us:
        return {
            "name": "us_person_block",
            "passed": False,
            "detail": "xStock tracker certificates are not available to US persons.",
        }

    return {"name": "us_person_block", "passed": True, "detail": "User is not a US person."}


def _check_sanctioned_country(user_profile: dict) -> dict:
    country = user_profile.get("country", "").upper()
    if country in SANCTIONED_COUNTRIES:
        return {
            "name": "sanctioned_country_block",
            "passed": False,
            "detail": f"Trading is not available in your region ({country}).",
        }
    return {"name": "sanctioned_country_block", "passed": True, "detail": "Region check passed."}


async def _check_daily_limit(user_id: str, intent: dict) -> dict:
    """Check cumulative daily notional does not exceed limit."""
    amount = intent.get("amount", 0)
    amount_type = intent.get("amount_type", "usd")

    # For quantity-based trades we would need a price lookup.
    # For now, only enforce on USD-denominated amounts.
    if amount_type != "usd":
        return {"name": "daily_limit", "passed": True, "detail": "Quantity-based trade — USD daily limit deferred to execution."}

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        amount = 0.0

    db = get_firestore()
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    trades_ref = (
        db.collection("users")
        .document(user_id)
        .collection("trades")
        .where("created_at", ">=", day_start.isoformat())
        .order_by("created_at")
    )

    daily_total = 0.0
    async for doc in trades_ref.stream():
        trade = doc.to_dict()
        daily_total += float(trade.get("total_usd", 0))

    if daily_total + amount > DAILY_NOTIONAL_LIMIT:
        remaining = max(0, DAILY_NOTIONAL_LIMIT - daily_total)
        return {
            "name": "daily_limit",
            "passed": False,
            "detail": f"Daily limit would be exceeded. Used: ${daily_total:,.2f} / ${DAILY_NOTIONAL_LIMIT:,.2f}. Remaining: ${remaining:,.2f}.",
        }

    return {
        "name": "daily_limit",
        "passed": True,
        "detail": f"Daily usage: ${daily_total:,.2f} + ${amount:,.2f} = ${daily_total + amount:,.2f} / ${DAILY_NOTIONAL_LIMIT:,.2f}.",
    }


async def _check_duplicate(user_id: str, intent: dict) -> dict:
    """Reject identical trade within the cooldown window."""
    db = get_firestore()
    cutoff = datetime.fromtimestamp(
        time.time() - DUPLICATE_WINDOW_SECONDS, tz=timezone.utc
    ).isoformat()

    recent_ref = (
        db.collection("users")
        .document(user_id)
        .collection("trades")
        .where("created_at", ">=", cutoff)
        .order_by("created_at")
    )

    async for doc in recent_ref.stream():
        trade = doc.to_dict()
        if (
            trade.get("side") == intent.get("side")
            and trade.get("symbol", "").upper() == intent.get("asset", "").upper()
            and str(trade.get("amount")) == str(intent.get("amount"))
        ):
            return {
                "name": "duplicate_detection",
                "passed": False,
                "detail": f"Identical trade detected within the last {DUPLICATE_WINDOW_SECONDS}s. Please wait before retrying.",
            }

    return {"name": "duplicate_detection", "passed": True, "detail": "No duplicate detected."}


async def _check_rate_limit(user_id: str) -> dict:
    """Max trades per minute."""
    db = get_firestore()
    cutoff = datetime.fromtimestamp(
        time.time() - 60, tz=timezone.utc
    ).isoformat()

    trades_ref = (
        db.collection("users")
        .document(user_id)
        .collection("trades")
        .where("created_at", ">=", cutoff)
        .order_by("created_at")
    )

    count = 0
    async for _ in trades_ref.stream():
        count += 1

    if count >= MAX_TRADES_PER_MINUTE:
        return {
            "name": "rate_limit",
            "passed": False,
            "detail": f"Rate limit exceeded: {count}/{MAX_TRADES_PER_MINUTE} trades in the last 60 seconds.",
        }

    return {
        "name": "rate_limit",
        "passed": True,
        "detail": f"Rate: {count}/{MAX_TRADES_PER_MINUTE} trades in the last 60 seconds.",
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_user_profile(user_id: str) -> dict:
    """Fetch user profile from Firestore, returning empty dict on miss."""
    db = get_firestore()
    snapshot = await db.collection("users").document(user_id).get()
    if snapshot.exists:
        return snapshot.to_dict()
    return {}
