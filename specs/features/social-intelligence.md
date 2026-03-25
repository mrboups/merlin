# Social Intelligence
## Status: Live
## Overview
Real-time social sentiment analysis powered by the Grok (xAI) API. Grok has native X/Twitter access and provides sentiment scoring for any stock or crypto asset, integrated into the AI chat context for socially-aware trading decisions.
## Architecture
User requests sentiment → Backend calls Grok API → Grok analyzes X/Twitter → Returns structured sentiment data → Displayed in social feed UI and available to chat AI.
## Implementation Details
- Grok API: grok-3-mini model via https://api.x.ai/v1/chat/completions
- System prompt instructs Grok to return JSON: {sentiment_score: float -1 to 1, summary: string, outlook: "bullish"|"bearish"|"neutral"}
- Temperature: 0.3 for consistent results
- Graceful degradation: returns None if GROK_API_KEY not configured
- JSON parse fallback: if Grok returns non-JSON, wraps raw text in neutral sentiment
- 30-second HTTP timeout
- Signals persisted in Firestore via db/signals.py
## Code Map
| File | Purpose |
|------|---------|
| backend/services/social.py | Grok API client, sentiment analysis |
| backend/routers/social.py | GET /social/signals endpoint |
| backend/db/signals.py | Signal persistence in Firestore |
| frontend/app/social/page.tsx | Social intelligence feed UI |
## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/social/signals | Get sentiment analysis for an asset |
## Firestore Schema
signals collection: {symbol, sentiment_score, summary, outlook, post_count, signal_count, created_at}
## Configuration
| Variable | Description |
|----------|-------------|
| GROK_API_KEY | xAI/Grok API key |
## Current Limitations
- No real-time streaming of social signals
- No historical sentiment tracking/trending
- Single model (grok-3-mini) — no fallback
- No batch analysis for portfolio-wide sentiment
- post_count always 0 (Grok doesn't expose this)
## Related
- [ai-chat-pipeline.md](ai-chat-pipeline.md) — sentiment feeds into chat context
- [persona-engine.md](persona-engine.md) — Elon persona uses social signals
