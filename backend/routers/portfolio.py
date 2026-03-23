from fastapi import APIRouter, HTTPException, Depends

from auth.dependencies import get_current_user
from db.users import get_user_by_id
from services.provider import get_balance

router = APIRouter()


@router.get("/portfolio")
async def get_portfolio(user_id: str = Depends(get_current_user)):
    """Get the user's portfolio with real ETH balance."""
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
        eth_balance = await get_balance(address)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"RPC error: {str(e)}")

    positions = []
    if eth_balance > 0:
        positions.append({
            "asset": "Ethereum",
            "symbol": "ETH",
            "quantity": round(eth_balance, 6),
            "value": round(eth_balance, 6),  # Value in ETH — price oracle not yet integrated
            "pnl_percent": 0,
        })

    return {
        "total_value": round(eth_balance, 6),
        "positions": positions,
        "address": address,
    }


@router.get("/portfolio/pnl")
async def get_pnl(user_id: str = Depends(get_current_user)):
    """Get portfolio PnL summary."""
    raise HTTPException(status_code=501, detail="Portfolio PnL not implemented")


@router.get("/portfolio/history")
async def get_history(user_id: str = Depends(get_current_user)):
    """Get portfolio history."""
    raise HTTPException(status_code=501, detail="Portfolio history not implemented")


@router.get("/trades")
async def list_trades(user_id: str = Depends(get_current_user)):
    """List user's trades."""
    raise HTTPException(status_code=501, detail="Trades not implemented")
