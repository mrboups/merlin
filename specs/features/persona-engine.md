# Persona Engine

## Status: Live (built-in personas, custom persona CRUD, activation) | Planned (pipeline integration, memory isolation, performance tracking, operating modes)

## Overview

The persona engine is Merlin's modular AI trading strategy system. Each persona is a pluggable strategy module that shapes how the AI analyzes markets and communicates with the user — not hardcoded logic, but a configuration-driven system where every behavior flows from a persona's `system_prompt_suffix`, `risk_level`, and `strategy_type`. One persona is active per user at a time; switching personas changes the AI's entire analytical stance and communication style.

## Architecture

### How Personas Shape AI Behavior

The active persona's `system_prompt_suffix` is appended to Merlin's base system prompt at chat inference time. This suffix encodes the persona's philosophy, preferred signals, risk posture, and communication style in natural language. The LLM receives a composed prompt like:

```
[Base Merlin system prompt]
...
[persona.system_prompt_suffix]
```

Built-in personas have their suffix hardcoded in `backend/routers/personas.py`. Custom personas store their suffix as `system_prompt` in Firestore, written by the user at creation time.

### Persona Data Shape

Every persona — built-in or custom — is normalized to this shape before being returned by the API:

```python
{
    "id": str,               # Unique identifier (e.g., "elon", "custom-abc123def456")
    "name": str,             # Short name (e.g., "Elon", "My Strategy")
    "display_name": str,     # Full display name (e.g., "Elon Strategy", "My Strategy")
    "description": str,      # Human-readable description of the strategy
    "strategy_type": str,    # "momentum" | "value" | "quantitative" | "speculative" | "custom"
    "type": str,             # "builtin" | "custom"
    "risk_level": str,       # "conservative" | "moderate" | "aggressive"
    "active": bool,          # Whether this is the user's currently active persona
}
```

Built-in personas additionally carry `system_prompt_suffix` internally (not returned in the list response). Custom personas store `system_prompt` in Firestore.

### Activation Model

Active persona state is stored as `active_persona_id` on the user's Firestore document (`users/{uid}`). At any time, at most one persona is active per user. Activating a new persona overwrites the field; deactivating clears it to `null`. The list endpoint reads this field once per request and annotates each persona with `active: true/false`.

## Implementation Details

### Built-in Personas

Four built-in personas are hardcoded in `backend/routers/personas.py` as `BUILTIN_PERSONAS`. They are never stored in Firestore — they are served directly from application memory on every request.

#### Elon (`id: "elon"`)
- **Display name:** Elon Strategy
- **Strategy type:** momentum
- **Risk level:** aggressive
- **Philosophy:** Momentum-based trading driven by social sentiment and market buzz. Favours high-volatility assets and trend-following entries. References social signals and market momentum in analysis.
- **Preferred assets (agent spec):** xTSLA, xNVDA, xCOIN, xGME
- **Timeframe (agent spec):** Short-term (1h–4h)
- **Sentiment weight (agent spec):** 0.7

#### Buffett (`id: "buffett"`)
- **Display name:** Buffett Strategy
- **Strategy type:** value
- **Risk level:** conservative
- **Philosophy:** Value-oriented investing focused on fundamentals, margin of safety, and long-term holds. Cautions against speculation and FOMO. Recommends conservative position sizes.
- **Preferred assets (agent spec):** xAAPL, xMSFT, xGOOG, xSPY
- **Timeframe (agent spec):** Long-term (1d–1w)
- **Sentiment weight (agent spec):** 0.1

#### AI Momentum (`id: "ai-momentum"`)
- **Display name:** AI Momentum
- **Strategy type:** quantitative
- **Risk level:** moderate
- **Philosophy:** Quantitative signal-driven analysis using technical indicators (RSI, MACD, moving averages), volume patterns, and on-chain metrics. Recommends moderate position sizes with clear stop-loss levels.
- **Preferred assets (agent spec):** Any liquid asset
- **Timeframe (agent spec):** Medium-term (4h–1d)
- **Sentiment weight (agent spec):** 0.0 (pure technical)

#### Degen (`id: "degen"`)
- **Display name:** Degen Mode
- **Strategy type:** speculative
- **Risk level:** aggressive
- **Philosophy:** High-conviction, high-risk plays on trending tokens and meme assets. Fast in, fast out. Warns the user about risk but respects their autonomy.
- **Preferred assets (agent spec):** Trending tokens, meme plays, asymmetric bets
- **Timeframe (agent spec):** Very short-term
- **Sentiment weight (agent spec):** High (trend/meme signals)

### Custom Personas

Users can create custom personas via `POST /api/v1/agents/personas/custom`. Each custom persona is stored as a document in `users/{uid}/personas/{persona_id}` in Firestore. The `persona_id` is generated as `custom-{12-char hex UUID}`.

**Creation fields (from `CreatePersonaRequest`):**
- `name` (required, max 50 chars in frontend) — becomes both `name` and `display_name`
- `description` (optional, max 200 chars in frontend)
- `system_prompt` (optional, max 2000 chars in frontend) — the persona's strategy instructions appended to Merlin's base system prompt
- `risk_level` (optional, default: `"moderate"`) — one of `"low"` | `"moderate"` | `"high"`

**Update fields (from `UpdatePersonaConfigRequest`):**
- `risk_level` — updates Firestore document (custom personas only)
- `active: false` or `auto_trade_enabled: false` — deactivates the persona (clears `active_persona_id` if it matches)

Built-in personas cannot be deleted. Custom personas can be deleted via `DELETE /api/v1/agents/personas/{id}`; if deleted, `active_persona_id` is cleared if it matched.

### Frontend

`frontend/app/personas/page.tsx` is a full client-side persona management page using TanStack Query. It provides:
- Tabbed display of built-in vs. custom personas as cards
- Toggle button per persona to activate/deactivate (calls activate or PATCH config)
- "Create Persona" dialog with name, description, strategy prompt, and risk level fields
- Delete button on custom persona cards
- Active state badge and strategy type badge per card
- Back link to chat (`/`)

## Code Map

| File | Purpose |
|------|---------|
| `backend/routers/personas.py` | All 5 persona endpoints + built-in persona definitions + Firestore helpers |
| `frontend/app/personas/page.tsx` | Persona management UI — list, activate, create, delete |

## API Endpoints

All endpoints require authentication (`get_current_user` dependency). URL prefix: `/api/v1`.

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/agents/personas` | List all personas (built-in + user's custom), each annotated with `active` flag | Live |
| POST | `/agents/personas/custom` | Create a new custom persona for the current user | Live |
| POST | `/agents/personas/{id}/activate` | Set a persona as the user's active persona | Live |
| PATCH | `/agents/personas/{id}/config` | Update persona config (risk_level, deactivation) | Live |
| DELETE | `/agents/personas/{id}` | Delete a custom persona (built-ins cannot be deleted) | Live |

### Response Shapes

**GET /agents/personas**
```json
{
  "personas": [
    {
      "id": "elon",
      "name": "Elon",
      "display_name": "Elon Strategy",
      "description": "...",
      "strategy_type": "momentum",
      "type": "builtin",
      "risk_level": "aggressive",
      "active": false
    }
  ]
}
```

**POST /agents/personas/custom**
```json
{
  "persona": {
    "id": "custom-abc123def456",
    "name": "My Strategy",
    "display_name": "My Strategy",
    "description": "...",
    "system_prompt": "...",
    "risk_level": "moderate",
    "strategy_type": "custom",
    "type": "custom",
    "active": false
  }
}
```

**POST /agents/personas/{id}/activate**
```json
{ "status": "ok", "active_persona_id": "elon" }
```

**PATCH /agents/personas/{id}/config**
```json
{ "status": "ok" }
```

**DELETE /agents/personas/{id}**
```json
{ "status": "ok" }
```

## Firestore Schema

### Active persona pointer (on user document)
```
users/{uid}
  active_persona_id: string | null   // ID of the active persona, or null
```

### Custom personas sub-collection
```
users/{uid}/personas/{persona_id}
  name: string
  display_name: string
  description: string
  system_prompt: string              // Strategy instructions appended to base system prompt
  risk_level: string                 // "low" | "moderate" | "high"
  strategy_type: string              // "custom"
  type: string                       // "custom"
```

Built-in personas are never written to Firestore. They are served from `BUILTIN_PERSONAS` in application memory.

## Configuration

No environment variables specific to the persona engine. Persona definitions are hardcoded in `backend/routers/personas.py`. Custom personas are user-controlled via the API.

## Current Limitations

- **Pipeline integration not wired.** The active persona's `system_prompt_suffix` (built-in) or `system_prompt` (custom) is not yet injected into the chat pipeline's LLM inference call. The persona is stored and activated, but has no effect on AI responses until the chat router reads `active_persona_id` and composes the prompt.
- **No operating modes.** Manual, Assisted, and Autonomous modes (as defined in `agents/persona-engine.md`) are not implemented. All interactions are effectively manual.
- **No memory isolation.** The `IMemoryProvider` interface (conversation history, trade history, learned patterns per persona) is not implemented. All conversation context is shared regardless of active persona.
- **No performance tracking.** PnL, win rate, Sharpe ratio, max drawdown, and trade frequency are not tracked per persona.
- **No social intelligence integration.** The Grok/X API dual pipeline for `SentimentSignal` is not implemented. The Elon and Degen personas cannot act on social signals yet.
- **No `strategy_type` validation.** Custom personas accept any string for `strategy_type` and `risk_level` — no enum enforcement at the API layer.
- **`system_prompt_suffix` not returned in list response.** Clients cannot read the built-in persona's prompt instructions; only `description` is surfaced.
- **No per-user limits on custom personas.** A user could create an unbounded number of custom personas.

## Related

- `agents/persona-engine.md` — Full agent spec: IPersona interface, StrategyConfig, IModelProvider, IMemoryProvider, 9-node pipeline integration, SentimentSignal, operating modes
- `agents/guardrails.md` — Safety checks enforced per trade; guardrail limits (maxPositionSize, maxDailyVolume, maxTradesPerDay) must wrap autonomous mode when implemented
- `agents/chat-intent-parser.md` — Intent parsing pipeline that will read the active persona to contextualize trade intent
- `specs/project-spec.md` — Full project specification
