from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_user

router = APIRouter()


@router.post("/chat")
async def send_message(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Chat not implemented")


@router.get("/chat/history")
async def get_history(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Chat history not implemented")


@router.delete("/chat/history")
async def clear_history(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Clear history not implemented")


@router.get("/chat/sessions")
async def list_sessions(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Sessions not implemented")


@router.post("/chat/sessions")
async def create_session(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Create session not implemented")


@router.get("/chat/provider")
async def get_provider(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Provider config not implemented")


@router.patch("/chat/provider")
async def update_provider(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Provider config not implemented")


@router.get("/market/assets")
async def list_assets(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Market assets not implemented")
