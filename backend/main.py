from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, chat, portfolio, personas, social

app = FastAPI(
    title="Merlin API",
    version="0.1.0",
    docs_url="/api/v1/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(portfolio.router, prefix="/api/v1", tags=["portfolio"])
app.include_router(personas.router, prefix="/api/v1", tags=["personas"])
app.include_router(social.router, prefix="/api/v1", tags=["social"])


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "service": "merlin-api", "version": "0.1.0"}
