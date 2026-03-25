# AI Chat Pipeline

## Status: Live

## Overview

The AI Chat Pipeline is the primary interface through which users interact with Merlin. It accepts free-form natural language messages, classifies intent via OpenAI GPT-4o-mini function calling, and produces either a streamed conversational response or a structured trade confirmation card that the user signs on-chain. All responses are delivered as Server-Sent Events (SSE), giving the frontend real-time streaming text with no polling.

## Architecture

```
User message
  │
  ▼
POST /chat  (FastAPI StreamingResponse, media_type="text/event-stream")
  │
  ▼
chat()  [backend/services/chat.py]
  │
  ├─ Persist user message → Firestore (users/{uid}/conversations/{cid}/messages)
  │
  ├─ Build OpenAI messages array (system prompt + last 50 messages from Firestore)
  │
  ▼
OpenAI GPT-4o-mini  — stream=True, tool_choice="auto"
  │
  ├── finish_reason == "stop"
  │     └─ Stream text chunks as {"type": "text", "content": "..."}
  │        Persist final text → Firestore
  │
  └── finish_reason == "tool_calls"
        │
        ├── parse_trade_intent(side, asset, amount, amount_type)
        │     │
        │     ├─ xStock resolver  [services/xstock.py]
        │     │     resolve_token(asset_query) → matched_token + confidence
        │     │     Low confidence (<0.8) → emit ambiguous_asset tool result → GPT asks clarification
        │     │
        │     ├─ Guardrails  [services/guardrails.py]
        │     │     validate_trade(user_id, intent) → approved | blocked + reason
        │     │
        │     ├─ Uniswap V3 quote  [services/uniswap.py]
        │     │     uniswap_get_quote(token_in, token_out, amount_in) → estimated_output
        │     │
        │     ├─ save_quoted_trade()  [db/trades.py]  → trade_id in Firestore
        │     │
        │     ├─ Emit {"type": "trade_intent", "data": {...}}  → frontend renders confirmation card
        │     │
        │     └─ Second GPT call with tool result → stream confirmation text
        │
        ├── get_price(asset)
        │     resolve_token() → symbol → get_token_price() → stream price text
        │
        └── get_portfolio()
              get_user_by_id() → wallet address
              get_all_balances() + get_prices_batch() → stream portfolio text

  ▼
Emit {"type": "done", "conversation_id": "..."}

  ▼  (on trade_intent event — frontend side)
User confirms trade confirmation card
  └─ executeSwap() via useAuth hook → wallet signs → on-chain submission
```

## Implementation Details

### OpenAI Function Calling — 3 Tools

| Tool | Trigger | Parameters |
|------|---------|------------|
| `parse_trade_intent` | User wants to buy or sell | `side` (buy/sell), `asset` (string), `amount` (number), `amount_type` (usd/quantity) |
| `get_price` | User asks about a price | `asset` (string) |
| `get_portfolio` | User asks about portfolio/balance/holdings | none |

All three tools go through a second GPT streaming call after the tool result is produced, so the user always receives a natural language follow-up in addition to any structured event.

### SSE Event Protocol

Every SSE frame is a JSON object on a `data:` line:

| Event type | Payload | Purpose |
|------------|---------|---------|
| `text` | `{"type": "text", "content": "..."}` | Streaming AI text chunk |
| `trade_intent` | `{"type": "trade_intent", "data": {...}}` | Structured trade — frontend renders confirmation card |
| `error` | `{"type": "error", "content": "..."}` | Recoverable error message |
| `done` | `{"type": "done", "conversation_id": "..."}` | Stream complete |

The `trade_intent` data payload includes: `trade_id`, `side`, `asset`, `symbol`, `amount`, `amount_type`, `guardrails`, and optionally `estimated_output` + `estimated_output_symbol` from the live Uniswap V3 quote.

### System Prompt

The system prompt (`SYSTEM_PROMPT` in `backend/services/chat.py`) defines Merlin's behavior:

- Establishes identity as a privacy-preserving Ethereum trading assistant
- Instructs when to call each of the three tools
- Prohibits financial advice
- Requires trade confirmation before execution
- Clarifies that xStocks are tracker certificates, not share ownership
- Lists the primary xStock symbols (xTSLA, xAAPL, xGOOG, xAMZN, xMSFT, xNVDA, xMETA, xNFLX, xCOIN, xPLTR, xGME, xSPY, xQQQ, xGLD, and 50+ more)
- Lists crypto assets: ETH, USDC, USDT, WETH
- Enforces the US-persons / sanctioned-countries compliance block for xStocks
- Requires clarification when the request is ambiguous or the amount is missing

### Intent Parsing — Natural Language to Structured Intent

GPT-4o-mini extracts the following fields via `parse_trade_intent`:

| Field | Type | Values |
|-------|------|--------|
| `side` | string | `buy` \| `sell` |
| `asset` | string | raw user input (e.g., "Tesla", "TSLA", "xTSLA") |
| `amount` | number | dollar value or token quantity |
| `amount_type` | string | `usd` \| `quantity` |

The asset string is then passed to the xStock resolver.

### Asset Resolution — xStock Resolver

`resolve_token(asset_query)` in `backend/services/xstock.py` performs fuzzy matching against 61 tokens (xStocks + crypto). It returns:

- `match` — the resolved token dict (`symbol`, `name`, `address`, `backed_ticker`, etc.)
- `confidence` — 0.0–1.0 match confidence
- `alternatives` — other candidate symbols when confidence is low

If `confidence < 0.8` and alternatives exist, the tool result signals `ambiguous_asset` back to GPT, which then asks the user to clarify — the trade is not queued.

### Guardrail Validation

Every parsed trade passes through `validate_trade(user_id, intent)` in `backend/services/guardrails.py` before a quote is requested or a trade is stored. If `approved` is `False`, the tool result carries the blocking `reason` and the trade is rejected — GPT informs the user in plain language.

### Uniswap V3 Quote

After guardrails pass, `uniswap_get_quote(token_in, token_out, amount_in)` is called. The quote is best-effort: if it fails (e.g., no pool liquidity, placeholder address), the trade is still saved with `quote_note` explaining why a quote is unavailable. The quoted output is included in the `trade_intent` SSE event and in the GPT follow-up text.

### Conversation Persistence

- Every user and assistant message is stored in Firestore immediately.
- The context window sent to GPT is the system prompt plus the last 50 messages (`_build_openai_messages`).
- Assistant messages that follow a tool call carry `metadata.function_call` for auditability.
- Conversation `updated_at` is touched on every new message.

### Conversation Sessions

Users can maintain multiple named conversations. Sessions are scoped per user:

- Created automatically on the first message if no `conversation_id` is provided.
- Title is auto-generated from the first 50 characters of the opening message.
- Listed ordered by `updated_at` descending.

### AI Model Preference

Users can switch between allowed GPT models. The preference is stored as `ai_model` on the Firestore user document and returned by `GET /chat/provider`. Allowed values: `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`. The frontend also maintains a local `localStorage` preference under `merlin_preferred_model`.

## Code Map

| File | Purpose |
|------|---------|
| `backend/services/chat.py` | Core chat service — OpenAI client, streaming SSE generator, all three tool handlers, conversation history builder |
| `backend/routers/chat.py` | FastAPI router — all 8 chat/market endpoints, request/response models |
| `backend/db/conversations.py` | Firestore CRUD for conversations and messages |
| `backend/db/trades.py` | Firestore CRUD for trade records; `save_quoted_trade()` called by chat service |
| `backend/services/xstock.py` | xStock token registry (61 tokens), `resolve_token()` fuzzy matcher, `list_all_assets()` |
| `backend/services/guardrails.py` | `validate_trade()` — runs all safety checks on a parsed trade intent |
| `backend/services/uniswap.py` | `get_quote()`, `resolve_swap_addresses()`, `get_token_decimals()`, `WETH` constant |
| `backend/services/prices.py` | `get_token_price()`, `get_prices_batch()`, `is_xstock()` |
| `backend/services/balances.py` | `get_all_balances()` — on-chain ERC-20 balance scan for portfolio queries |
| `backend/db/users.py` | `get_user_by_id()` — used by portfolio handler to look up wallet address |
| `frontend/app/chat/page.tsx` | Full chat UI — SSE consumer, message list, trade confirmation cards, voice input (Web Speech API), TTS (browser `speechSynthesis`), persona selector, model selector, language selector, session sidebar |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/chat` | Bearer JWT | Stream a chat message; returns SSE. Body: `{message, conversation_id?}` |
| `GET` | `/chat/history` | Bearer JWT | Fetch messages for a conversation. Query: `conversation_id`, `limit` (default 100, max 500) |
| `DELETE` | `/chat/history` | Bearer JWT | Delete all messages in a conversation. Query: `conversation_id` |
| `GET` | `/chat/sessions` | Bearer JWT | List user's conversations, most recent first. Query: `limit` (default 50, max 200) |
| `POST` | `/chat/sessions` | Bearer JWT | Create a new empty conversation. Returns conversation doc |
| `DELETE` | `/chat/sessions` | Bearer JWT | Delete a conversation and all its messages. Query: `conversation_id` |
| `GET` | `/chat/provider` | Bearer JWT | Get user's stored AI model preference |
| `PATCH` | `/chat/provider` | Bearer JWT | Update AI model preference. Body: `{model}`. Allowed: `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo` |
| `GET` | `/market/assets` | Bearer JWT | List all tradable assets. Query: `asset_type` (stock, etf, commodity_etf, crypto) |

## Firestore Schema

```
users/{userId}/
  conversations/{conversationId}/
    id          string   — document ID
    title       string   — auto-generated from first user message (truncated at 50 chars)
    created_at  string   — ISO-8601 UTC
    updated_at  string   — ISO-8601 UTC (touched on every new message)

    messages/{messageId}/
      id          string   — document ID
      role        string   — "user" | "assistant" | "system"
      content     string   — message text
      created_at  string   — ISO-8601 UTC
      metadata    map      — optional; keys: function_call (tool name), trade_intent (object)

  trades/{tradeId}/
    id              string
    type            string   — "buy" | "sell" | "swap"
    asset_in        string   — symbol sold
    asset_out       string   — symbol bought
    amount_in       number
    amount_out      number
    price_usd       number | null
    tx_hash         string   — on-chain tx hash (empty string when status is "quoted")
    status          string   — "quoted" | "pending" | "confirmed" | "failed"
    privacy_mode    string   — "public" | "shielded" | "compliant"
    created_at      string   — ISO-8601 UTC
    conversation_id string   — conversation that produced this trade

  ai_model          string   — stored on the user document; AI model preference
```

## Configuration

| Variable | Location | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | `Secret Manager` / `.env` | Required. Used to instantiate `AsyncOpenAI` client. Raises `RuntimeError` at first request if missing. |
| Model name | `backend/services/chat.py` → `MODEL = "gpt-4o-mini"` | Default model for all chat completions. |
| System prompt | `backend/services/chat.py` → `SYSTEM_PROMPT` | Defines Merlin identity, tool usage rules, xStock compliance rules, and communication style. |
| Context window limit | `backend/services/chat.py` → `_build_openai_messages()`, `limit=50` | Number of prior messages included in each OpenAI call. |
| Allowed models | `backend/routers/chat.py` → `allowed_models` set | `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`. Requests for other values return HTTP 400. |

## Current Limitations

- **No persona integration in the LLM call.** The frontend renders a persona selector (Elon, Buffett, AI Momentum) and persists the chosen persona ID, but the selected persona is not passed to the backend and does not alter the system prompt or tool behavior. Persona-aware context injection is not yet implemented.
- **Context window is a hard slice of 50 messages.** There is no summarization or token-budget management. Long conversations will silently drop the oldest messages. This can cause the model to lose earlier intent signals in extended sessions.
- **No voice input backend.** The frontend implements voice input via the browser Web Speech API (`webkitSpeechRecognition`) and TTS via `window.speechSynthesis`. Both are entirely client-side. There is no server-side STT or TTS pipeline.
- **Model selector is UI-only for non-GPT providers.** The frontend offers Claude and Grok options in the model dropdown (`MODEL_OPTIONS`) but the backend only validates and uses OpenAI models. Selecting Claude or Grok from the UI has no effect on the actual model used.
- **No streaming abort.** There is no mechanism for the client to cancel an in-flight SSE stream (e.g., `AbortController` wired to a server-side cancellation). The stream runs to completion even if the user navigates away.
- **No multi-tool fan-out.** A single user message can only trigger one tool call per streaming pass. Compound requests (e.g., "buy Tesla and show me my portfolio") are not split into parallel tool invocations.
- **Quoted trades are not automatically expired.** Trades written to Firestore with `status: "quoted"` accumulate indefinitely. There is no TTL or cleanup job to remove stale unconfirmed quotes.

## Related

- `specs/project-spec.md` — full project specification
- `agents/chat-intent-parser.md` — NLU agent definition for this pipeline's Node 1
- `agents/xstock-resolver.md` — asset resolution agent
- `agents/guardrails.md` — guardrail checks enforced on every trade
- `agents/trade-execution.md` — downstream 6-step trade execution pipeline (quote → simulate → policy → execute → confirm → persist)
- `agents/persona-engine.md` — persona system (not yet integrated into chat service)
- `sources/futurewallet-docs.md` — FutureWallet platform documentation (xStocks trading mechanics reference)
