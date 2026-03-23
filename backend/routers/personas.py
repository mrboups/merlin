from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_user

router = APIRouter()


@router.get("/agents/personas")
async def list_personas(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Personas not implemented")


@router.post("/agents/personas/custom")
async def create_persona(user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Create persona not implemented")


@router.post("/agents/personas/{persona_id}/activate")
async def activate_persona(persona_id: str, user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Activate persona not implemented")


@router.patch("/agents/personas/{persona_id}/config")
async def update_persona_config(persona_id: str, user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Update persona config not implemented")


@router.delete("/agents/personas/{persona_id}")
async def delete_persona(persona_id: str, user_id: str = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Delete persona not implemented")
