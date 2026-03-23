"""
Portfolio endpoints — real on-chain balances, live prices, and trade history.

All endpoints require authentication via Bearer token.
"""

from fastapi import APIRouter, HTTPException, Depends, Query

from auth.dependencies import get_current_user
from db.users import get_user_by_id
from db.trades import get_trades, get_trade_count
from services.balances import get_all_balances
from services.prices import get_eth_price, get_token_price, get_prices_batch

from db.firestore import get_firestore

router = APIRouter()

# ── Known ERC-20 tokens to check ────────────────────────────────────
# These are the tokens we scan for balances. Contract addresses are for
# Ethereum mainnet. On Sepolia, these may not exist — in that case the
# balance call gracefully returns 0.
#
# To add more tokens, append to this list. The Backed Finance API
# (api.backed.fi/api/v2/public/assets) can be used to dynamically
# fetch xStock contract addresses at startup if needed.

KNOWN_TOKENS: list[dict] = [
    {
        "symbol": "USDC",
        "name": "USD Coin",
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "decimals": 6,
    },
    {
        "symbol": "USDT",
        "name": "Tether USD",
        "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "decimals": 6,
    },
    {
        "symbol": "WETH",
        "name": "Wrapped Ether",
        "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "decimals": 18,
    },
]

# Top xStock tokens by AUM — can be extended or fetched dynamically.
# Contract addresses sourced from Backed Finance / xStocks.fi for Ethereum.
# NOTE: These addresses must be verified against the Backed Finance API
# (GET /api/v2/public/assets) before production use. If an address is wrong,
# the balanceOf call returns 0 — it won't produce incorrect data.
XSTOCK_TOKENS: list[dict] = [
    # Addresses to be populated from Backed Finance API at deploy time.
    # Until then, balances for xStocks are fetched only if the user's
    # Firestore profile has a "watched_tokens" list with contract addresses.
]


async def _get_user_watched_tokens(user_id: str) -> list[dict]:
    """
    Load user-specific watched tokens from Firestore.

    Users can have a 'watched_tokens' field on their profile containing
    a list of {symbol, name, address, decimals} dicts for tokens they hold
    or want tracked.
    """
    db = get_firestore()
    doc = await db.collection("users").document(user_id).get()
    if not doc.exists:
        return []
    data = doc.to_dict()
    return data.get("watched_tokens", [])


async def _build_positions(
    address: str, user_id: str
) -> tuple[list[dict], float]:
    """
    Build portfolio positions with real balances and prices.

    Returns (positions_list, total_value_usd).
    """
    # Merge known tokens + xStock tokens + user watched tokens
    user_tokens = await _get_user_watched_tokens(user_id)
    all_tokens = KNOWN_TOKENS + XSTOCK_TOKENS + user_tokens

    # Deduplicate by contract address (case-insensitive)
    seen_addresses: set[str] = set()
    deduped: list[dict] = []
    for t in all_tokens:
        addr_lower = t["address"].lower()
        if addr_lower not in seen_addresses:
            seen_addresses.add(addr_lower)
            deduped.append(t)

    # Fetch all on-chain balances (ETH + ERC-20)
    balances = await get_all_balances(address, deduped)

    if not balances:
        return [], 0.0

    # Fetch prices for all held symbols in batch
    symbols = [b["symbol"] for b in balances]
    prices = await get_prices_batch(symbols)

    positions: list[dict] = []
    total_value = 0.0

    for bal in balances:
        sym = bal["symbol"]
        quantity = bal["balance"]
        price = prices.get(sym)

        value = round(quantity * price, 2) if price is not None else None

        position = {
            "asset": bal["name"],
            "symbol": sym,
            "quantity": round(quantity, 8),
            "price_usd": round(price, 2) if price is not None else None,
            "value": value,
            "pnl_percent": 0,  # PnL requires cost basis from trade history
        }
        positions.append(position)

        if value is not None:
            total_value += value

    return positions, round(total_value, 2)


# ── Endpoints ────────────────────────────────────────────────────────


@router.get("/portfolio")
async def get_portfolio(user_id: str = Depends(get_current_user)):
    """
    Get the user's portfolio with real on-chain balances and live USD prices.

    Returns positions for ETH and all ERC-20 tokens with non-zero balances.
    Prices come from CoinMarketCap (crypto) and Backed Finance (xStocks).
    """
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    address = user.get("address", "")
    if not address:
        return {
            "total_value": 0,
            "positions": [],
            "address": "",
        }

    try:
        positions, total_value = await _build_positions(address, user_id)
    except ValueError as e:
        # Price oracle configuration error (e.g. missing API key)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"RPC or API error: {e}")

    return {
        "total_value": total_value,
        "positions": positions,
        "address": address,
    }


@router.get("/portfolio/pnl")
async def get_pnl(user_id: str = Depends(get_current_user)):
    """
    Get portfolio PnL summary.

    Calculates unrealized PnL by comparing current market value against
    cost basis derived from trade history. If no trade history exists,
    cost basis is zero and PnL equals current market value.
    """
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    address = user.get("address", "")
    if not address:
        return {
            "total_market_value": 0,
            "total_cost_basis": 0,
            "total_unrealized_pnl": 0,
            "total_unrealized_pnl_pct": 0,
            "position_count": 0,
        }

    try:
        positions, total_value = await _build_positions(address, user_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching portfolio: {e}")

    # Calculate cost basis from trade history
    trades = await get_trades(user_id, page=1, page_size=100)
    total_cost_basis = 0.0
    for trade in trades:
        if trade.get("status") == "confirmed" and trade.get("price_usd"):
            # For buys, add cost; for sells, reduce basis
            amount = trade.get("amount_out", 0) or 0
            price = trade.get("price_usd", 0) or 0
            if trade.get("type") in ("buy", "swap"):
                total_cost_basis += amount * price

    total_cost_basis = round(total_cost_basis, 2)
    unrealized_pnl = round(total_value - total_cost_basis, 2)
    pnl_pct = (
        round((unrealized_pnl / total_cost_basis) * 100, 2)
        if total_cost_basis > 0
        else 0
    )

    return {
        "total_market_value": total_value,
        "total_cost_basis": total_cost_basis,
        "total_unrealized_pnl": unrealized_pnl,
        "total_unrealized_pnl_pct": pnl_pct,
        "position_count": len(positions),
    }


@router.get("/portfolio/history")
async def get_history(user_id: str = Depends(get_current_user)):
    """
    Get portfolio value history from Firestore.

    Returns historical snapshots of portfolio value. Snapshots are created
    by a background job (not yet implemented) that periodically records
    the user's total portfolio value.
    """
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db = get_firestore()
    collection = (
        db.collection("users").document(user_id).collection("portfolio_history")
    )
    query = collection.order_by("date", direction="DESCENDING").limit(365)

    history: list[dict] = []
    async for doc in query.stream():
        entry = doc.to_dict()
        history.append({
            "date": entry.get("date", ""),
            "total_value": entry.get("total_value", 0),
            "total_pnl": entry.get("total_pnl", 0),
            "position_count": entry.get("position_count", 0),
        })

    # Return in chronological order
    history.reverse()

    return {"history": history}


@router.get("/trades")
async def list_trades(
    user_id: str = Depends(get_current_user),
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(
        default=20, ge=1, le=100, description="Trades per page"
    ),
):
    """
    List the user's trade history from Firestore, paginated.

    Trades are ordered by created_at descending (newest first).
    """
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    trades = await get_trades(user_id, page=page, page_size=page_size)
    total = await get_trade_count(user_id)

    return {
        "trades": trades,
        "page": page,
        "page_size": page_size,
        "total": total,
    }
