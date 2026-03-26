import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import analytics, auth, chat, portfolio, personas, social, trade, waitlist

app = FastAPI(
    title="Merlin API",
    version="0.1.0",
    docs_url="/api/v1/docs",
    redoc_url=None,
)

# CORS: read allowed origins from env. In production set to the real domain(s).
# Example: CORS_ORIGINS=https://merlin-app.web.app,https://merlin.app
# Falls back to permissive localhost origins for local development only.
_cors_env = os.environ.get("CORS_ORIGINS", "")
_cors_origins = (
    [o.strip() for o in _cors_env.split(",") if o.strip()]
    if _cors_env
    else ["http://localhost:3000", "http://localhost:3001"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(portfolio.router, prefix="/api/v1", tags=["portfolio"])
app.include_router(personas.router, prefix="/api/v1", tags=["personas"])
app.include_router(social.router, prefix="/api/v1", tags=["social"])
app.include_router(trade.router, prefix="/api/v1", tags=["trade"])
app.include_router(waitlist.router, prefix="/api/v1", tags=["waitlist"])
app.include_router(analytics.router, prefix="/api/v1", tags=["analytics"])


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "service": "merlin-api", "version": "0.1.0"}
