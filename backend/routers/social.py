from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_user

router = APIRouter()


@router.get("/social/signals")
async def get_signals(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Social signals not implemented")
