# API Reference

## Base URL
- **Production (proxied)**: `https://merlin-app.web.app/api/v1`
- **Production (direct)**: `https://merlin-api-795485039698.europe-west1.run.app/api/v1`
- **Local**: `http://localhost:8000/api/v1`

The proxied URL routes through Firebase Hosting rewrites (`/api/**` → Cloud Run). Use the proxied URL in the frontend to avoid CORS issues.

## Authentication

All endpoints except `/api/v1/health` require a Bearer JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

JWT tokens are obtained via the `/auth/register/complete` or `/auth/login/complete` endpoints. Tokens expire after 24 hours. The token payload includes the user's Firestore document ID as the `sub` claim.

If the token is missing or expired, the API returns `401 Unauthorized`:
```json
{"detail": "Not authenticated"}
```

## Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/health` | No | Service health check |

**Response** `200 OK`:
```json
{"status": "ok", "service": "merlin-api", "version": "0.1.0"}
```

---

### Auth (`/api/v1/auth`)

Authentication uses WebAuthn/Passkey for passwordless login. The flow is two-step: begin (server generates a challenge) then complete (client sends the signed credential).

#### POST `/auth/register/begin`

Start WebAuthn registration. Generates credential creation options for the client.

**Request**:
```json
{
  "display_name": "string"
}
```

**Response** `200 OK`:
```json
{
  "options": {
    "rp": {"name": "Merlin Wallet", "id": "merlin-app.web.app"},
    "user": {"id": "base64url", "name": "string", "displayName": "string"},
    "challenge": "base64url",
    "pubKeyCredParams": [{"type": "public-key", "alg": -7}, {"type": "public-key", "alg": -257}],
    "timeout": 60000,
    "authenticatorSelection": {
      "residentKey": "preferred",
      "userVerification": "preferred"
    },
    "attestation": "none"
  },
  "session_id": "string"
}
```

**Errors**: `400` if display_name is empty or exceeds 64 characters.

#### POST `/auth/register/complete`

Complete registration with the attestation response from the authenticator. Creates the user document in Firestore and returns a JWT.

**Request**:
```json
{
  "session_id": "string",
  "credential": {
    "id": "base64url",
    "rawId": "base64url",
    "response": {
      "clientDataJSON": "base64url",
      "attestationObject": "base64url"
    },
    "type": "public-key"
  }
}
```

**Response** `200 OK`:
```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": "firestore_doc_id",
    "display_name": "string"
  }
}
```

**Errors**: `400` if session_id is invalid/expired or credential verification fails.

#### POST `/auth/login/begin`

Start WebAuthn authentication. Returns credential request options. Send an empty body for discoverable credentials (passkey auto-fill) or include a `user_id` to request a specific credential.

**Request**:
```json
{}
```
or:
```json
{
  "user_id": "string"
}
```

**Response** `200 OK`:
```json
{
  "options": {
    "challenge": "base64url",
    "timeout": 60000,
    "rpId": "merlin-app.web.app",
    "allowCredentials": [],
    "userVerification": "preferred"
  },
  "session_id": "string"
}
```

#### POST `/auth/login/complete`

Complete login with the assertion response from the authenticator. Returns a JWT and user info.

**Request**:
```json
{
  "session_id": "string",
  "credential": {
    "id": "base64url",
    "rawId": "base64url",
    "response": {
      "clientDataJSON": "base64url",
      "authenticatorData": "base64url",
      "signature": "base64url",
      "userHandle": "base64url"
    },
    "type": "public-key"
  }
}
```

**Response** `200 OK`:
```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": "firestore_doc_id",
    "display_name": "string",
    "address": "0x... | null"
  }
}
```

**Errors**: `400` if session_id is invalid/expired or assertion verification fails. `404` if no matching credential found.

#### POST `/auth/logout`

Stateless logout. The server does not invalidate the JWT; the client discards it.

**Response** `200 OK`:
```json
{"status": "ok"}
```

#### PATCH `/auth/address`

Associate a derived EOA address with the authenticated user. Called by the frontend after BIP-44 seed derivation on the client side.

**Request**:
```json
{
  "address": "0x1234567890abcdef1234567890abcdef12345678"
}
```

**Response** `200 OK`:
```json
{
  "status": "ok",
  "address": "0x1234567890abcdef1234567890abcdef12345678"
}
```

**Errors**: `400` if address is not a valid Ethereum address (0x + 40 hex chars). `401` if not authenticated.

---

### Chat (`/api/v1`)

The chat system uses OpenAI function calling to parse user intent and route to appropriate handlers (trade, price query, portfolio lookup, etc.). Responses are streamed via Server-Sent Events.

#### POST `/chat`

Send a message and receive a streaming SSE response. The AI agent parses user intent and may return structured data (trade quotes, prices, portfolio info) alongside natural language responses.

**Request**:
```json
{
  "message": "string (1-2000 chars)",
  "conversation_id": "string | null"
}
```

If `conversation_id` is null, a new conversation is created.

**Response**: `200 OK` with `Content-Type: text/event-stream`

Each SSE event is a JSON object with a `type` field:

| Type | Description | Payload |
|------|-------------|---------|
| `text` | AI response text chunk | `{"type": "text", "content": "string"}` |
| `trade_intent` | Parsed trade with quote data | `{"type": "trade_intent", "data": {trade object}}` |
| `price` | Price query result | `{"type": "price", "data": {"symbol": "...", "price_usd": N, "change_24h": N}}` |
| `portfolio` | Portfolio summary | `{"type": "portfolio", "data": {portfolio object}}` |
| `error` | Error during processing | `{"type": "error", "content": "string"}` |
| `done` | Stream complete | `{"type": "done", "conversation_id": "string"}` |

**Trade intent data structure**:
```json
{
  "type": "trade_intent",
  "data": {
    "side": "buy | sell",
    "asset": "xTSLA",
    "amount": 50.0,
    "amount_type": "usd | quantity",
    "privacy_mode": "public | shielded | compliant",
    "quote": {
      "quote_id": "string",
      "amount_in": "string",
      "amount_out": "string",
      "price_usd": 250.50,
      "gas_estimate": 0.003,
      "expires_at": "ISO 8601"
    }
  }
}
```

**Errors**: `400` if message is empty or exceeds 2000 characters. `401` if not authenticated.

#### GET `/chat/history`

Retrieve messages for a specific conversation.

**Query Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `conversation_id` | string | Yes | Conversation ID |

**Response** `200 OK`:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Buy $50 of Tesla",
      "timestamp": "2026-03-24T10:30:00Z"
    },
    {
      "role": "assistant",
      "content": "I found xTSLA for you...",
      "timestamp": "2026-03-24T10:30:01Z"
    }
  ]
}
```

**Errors**: `404` if conversation not found or not owned by the authenticated user.

#### DELETE `/chat/history`

Clear all messages in a conversation. The conversation itself is not deleted.

**Query Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `conversation_id` | string | Yes | Conversation ID |

**Response** `200 OK`:
```json
{"status": "ok"}
```

#### GET `/chat/sessions`

List all conversations for the authenticated user, ordered by most recent.

**Response** `200 OK`:
```json
{
  "conversations": [
    {
      "id": "conv_abc123",
      "title": "Tesla trade",
      "created_at": "2026-03-24T10:00:00Z",
      "message_count": 12
    }
  ]
}
```

#### POST `/chat/sessions`

Create a new conversation.

**Request**:
```json
{
  "title": "string | null"
}
```

If title is null, the server generates one from the first message.

**Response** `201 Created`:
```json
{
  "id": "conv_abc123",
  "title": "New conversation",
  "created_at": "2026-03-24T10:00:00Z"
}
```

#### GET `/chat/provider`

Get the user's preferred AI model.

**Response** `200 OK`:
```json
{
  "model": "gpt-4o"
}
```

#### PATCH `/chat/provider`

Set the user's preferred AI model.

**Request**:
```json
{
  "model": "gpt-4o"
}
```

**Response** `200 OK`:
```json
{
  "status": "ok",
  "model": "gpt-4o"
}
```

---

### Market (`/api/v1/market`)

#### GET `/market/assets`

List all available trading assets. Includes xStock tokens (tokenized stock tracker certificates) and supported crypto assets.

**Response** `200 OK`:
```json
{
  "assets": [
    {
      "symbol": "xTSLA",
      "name": "Tesla",
      "ticker": "TSLA",
      "type": "stock",
      "address": "0x..."
    },
    {
      "symbol": "xAAPL",
      "name": "Apple",
      "ticker": "AAPL",
      "type": "stock",
      "address": "0x..."
    },
    {
      "symbol": "WETH",
      "name": "Wrapped Ether",
      "ticker": "ETH",
      "type": "crypto",
      "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    }
  ]
}
```

The asset list includes 80+ xStock tokens from xStocks.fi/Backed Finance. US persons are blocked from xStock trading; sanctioned countries are blocked entirely.

---

### Portfolio (`/api/v1/portfolio`, `/api/v1/trades`)

#### GET `/portfolio`

Get the authenticated user's real on-chain token balances with current USD prices. Reads balances from Ethereum mainnet via RPC.

**Response** `200 OK`:
```json
{
  "total_value": 1234.56,
  "positions": [
    {
      "asset": "Tesla",
      "symbol": "xTSLA",
      "quantity": 1.5,
      "value": 375.75,
      "price_usd": 250.50
    },
    {
      "asset": "Wrapped Ether",
      "symbol": "WETH",
      "quantity": 0.25,
      "value": 858.81,
      "price_usd": 3435.24
    }
  ]
}
```

**Errors**: `400` if the user has no address set (call `PATCH /auth/address` first).

#### GET `/portfolio/pnl`

Calculate unrealized profit/loss from the user's trade history. Cost basis is computed from confirmed trades stored in Firestore.

**Response** `200 OK`:
```json
{
  "total_market_value": 1234.56,
  "total_cost_basis": 1100.00,
  "total_unrealized_pnl": 134.56,
  "total_unrealized_pnl_pct": 12.23,
  "position_count": 3
}
```

#### GET `/portfolio/history`

Historical portfolio value snapshots. Values are recorded periodically and stored in Firestore.

**Response** `200 OK`:
```json
{
  "history": [
    {"date": "2026-03-20", "total_value": 1100.00},
    {"date": "2026-03-21", "total_value": 1150.25},
    {"date": "2026-03-22", "total_value": 1200.00},
    {"date": "2026-03-23", "total_value": 1180.50},
    {"date": "2026-03-24", "total_value": 1234.56}
  ]
}
```

#### GET `/trades`

Paginated trade history for the authenticated user.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 50 | Max results (1-100) |
| `offset` | int | 0 | Skip N results |

**Response** `200 OK`:
```json
{
  "trades": [
    {
      "id": "trade_abc123",
      "side": "buy",
      "asset": "xTSLA",
      "quantity": 1.5,
      "price_usd": 250.50,
      "total_usd": 375.75,
      "tx_hash": "0xabc...",
      "status": "confirmed",
      "privacy_mode": "public",
      "timestamp": "2026-03-24T10:35:00Z"
    }
  ],
  "total": 42
}
```

---

### Trade (`/api/v1/trade`)

Trade execution follows a quote-then-confirm pattern. The backend generates an unsigned transaction (or UserOperation for gasless), the frontend signs it client-side, broadcasts it, and then confirms the tx_hash back to the backend.

#### POST `/trade/quote`

Get a swap quote with an unsigned transaction. The quote includes routing through Uniswap V3 on Ethereum mainnet.

**Request**:
```json
{
  "side": "buy",
  "asset": "xTSLA",
  "amount": 50.0,
  "amount_type": "usd",
  "from_address": "0x..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `side` | `"buy" \| "sell"` | Trade direction |
| `asset` | string | Token symbol (e.g., `xTSLA`, `WETH`) |
| `amount` | number | Amount to trade |
| `amount_type` | `"usd" \| "quantity"` | Whether amount is in USD or token units |
| `from_address` | string | User's EOA address |

**Response** `200 OK`:
```json
{
  "quote_id": "qt_abc123",
  "side": "buy",
  "token_in": {
    "symbol": "WETH",
    "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "decimals": 18
  },
  "token_out": {
    "symbol": "xTSLA",
    "address": "0x...",
    "decimals": 18
  },
  "amount_in": "0.01455",
  "amount_out": "0.2",
  "price_usd": 250.50,
  "gas_estimate": 0.003,
  "unsigned_tx": {
    "to": "0x...",
    "data": "0x...",
    "value": "0x...",
    "gasLimit": "0x..."
  },
  "expires_at": "2026-03-24T10:35:00Z"
}
```

Quotes expire after 60 seconds. After expiry, request a new quote.

**Errors**: `400` if asset not found, amount <= 0, or address invalid. `422` if amount_type is not recognized.

#### POST `/trade/quote-gasless`

Get a swap quote as a PackedUserOperation for EIP-4337 execution with USDC gas payment via AmbirePaymaster (EIP-7702). The user pays gas in USDC instead of ETH.

**Request**: Same as `/trade/quote`.

**Response** `200 OK`:
```json
{
  "quote_id": "qt_def456",
  "side": "buy",
  "token_in": {"symbol": "USDC", "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "decimals": 6},
  "token_out": {"symbol": "xTSLA", "address": "0x...", "decimals": 18},
  "amount_in": "50.00",
  "amount_out": "0.2",
  "price_usd": 250.50,
  "gas_estimate": 1.25,
  "user_operation": {
    "sender": "0x...",
    "nonce": "0x...",
    "initCode": "0x",
    "callData": "0x...",
    "accountGasLimits": "0x...",
    "preVerificationGas": "0x...",
    "gasFees": "0x...",
    "paymasterAndData": "0x...",
    "signature": "0x"
  },
  "paymaster_data": "0x...",
  "expires_at": "2026-03-24T10:35:00Z"
}
```

**Errors**: Same as `/trade/quote`, plus `400` if user has insufficient USDC for gas.

#### POST `/trade/confirm`

Confirm that a quoted trade was submitted on-chain. The backend verifies the transaction hash matches the quote and updates the trade record in Firestore.

**Request**:
```json
{
  "quote_id": "qt_abc123",
  "tx_hash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
}
```

**Response** `200 OK`:
```json
{
  "status": "confirmed",
  "trade_id": "trade_xyz789"
}
```

Possible status values: `confirmed` (tx found and matched), `pending` (tx not yet mined), `failed` (tx reverted or mismatch).

**Errors**: `400` if quote_id not found or expired. `404` if tx_hash not found on-chain.

#### GET `/trade/status/{trade_id}`

Check the current status of a trade.

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `trade_id` | string | Trade ID from `/trade/confirm` |

**Response** `200 OK`:
```json
{
  "trade_id": "trade_xyz789",
  "status": "confirmed",
  "tx_hash": "0xabcdef...",
  "side": "buy",
  "asset": "xTSLA",
  "amount_in": "0.01455",
  "amount_out": "0.2",
  "timestamp": "2026-03-24T10:35:00Z"
}
```

Status values: `quoted` (not yet submitted), `submitted` (tx broadcast, awaiting confirmation), `confirmed` (tx mined successfully), `failed` (tx reverted or dropped).

**Errors**: `404` if trade_id not found or not owned by the authenticated user.

---

### Social (`/api/v1/social`)

Social intelligence powered by Grok (xAI) for sentiment analysis on crypto and stock assets.

#### GET `/social/signals`

Get social sentiment analysis. Uses Grok to analyze recent social media activity for trading signals.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `symbol` | string | null | Filter by asset symbol (e.g., `TSLA`) |
| `limit` | int | 50 | Max results (1-100) |

**Response** `200 OK`:
```json
{
  "signals": [
    {
      "symbol": "TSLA",
      "sentiment_score": 0.72,
      "summary": "Strong positive sentiment driven by Q1 delivery numbers exceeding expectations.",
      "outlook": "bullish",
      "post_count": 0,
      "signal_count": 1
    },
    {
      "symbol": "AAPL",
      "sentiment_score": 0.45,
      "summary": "Mixed sentiment around upcoming product event.",
      "outlook": "neutral",
      "post_count": 0,
      "signal_count": 1
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sentiment_score` | float | -1.0 (bearish) to 1.0 (bullish) |
| `outlook` | string | `"bullish"`, `"bearish"`, or `"neutral"` |
| `post_count` | int | Number of social posts analyzed |
| `signal_count` | int | Number of distinct signals generated |

**Errors**: `400` if symbol is not a recognized asset. Returns empty array if Grok API is unavailable (GROK_API_KEY not set).

---

### Personas (`/api/v1/agents`)

Persona endpoints manage AI trading personas -- modular strategy profiles that influence how the AI agent interprets and acts on trade requests. Currently returns `501 Not Implemented` for all endpoints.

#### GET `/personas`

List all personas (built-in and custom) available to the user.

**Response** (when implemented):
```json
{
  "personas": [
    {
      "id": "conservative",
      "name": "Conservative",
      "description": "Low-risk, diversified portfolio focus",
      "type": "builtin",
      "active": false
    },
    {
      "id": "custom_abc",
      "name": "My DeFi Strategy",
      "description": "Focus on DeFi tokens with high TVL",
      "type": "custom",
      "active": true
    }
  ]
}
```

**Current Response**: `501 Not Implemented`

#### POST `/personas/custom`

Create a custom persona with a trading strategy configuration.

**Request** (when implemented):
```json
{
  "name": "string",
  "description": "string",
  "strategy": {
    "risk_tolerance": "low | medium | high",
    "preferred_sectors": ["tech", "defi"],
    "max_position_size_usd": 500,
    "auto_rebalance": false
  }
}
```

**Current Response**: `501 Not Implemented`

#### POST `/personas/{id}/activate`

Activate a persona for the current session. Only one persona can be active at a time.

**Current Response**: `501 Not Implemented`

#### PATCH `/personas/{id}/config`

Update a custom persona's configuration. Built-in personas cannot be modified.

**Current Response**: `501 Not Implemented`

#### DELETE `/personas/{id}`

Delete a custom persona. Built-in personas cannot be deleted.

**Current Response**: `501 Not Implemented`

---

## Error Responses

All errors follow a consistent format:

```json
{
  "detail": "Error message here"
}
```

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Invalid input, missing required fields, malformed address |
| 401 | Unauthorized | Missing/expired JWT token |
| 404 | Not Found | Resource doesn't exist or user doesn't own it |
| 422 | Validation Error | Request body fails Pydantic validation |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Unexpected server error, RPC failure |
| 501 | Not Implemented | Feature not yet available (personas) |

### Validation Error Detail (422)

FastAPI returns structured validation errors:
```json
{
  "detail": [
    {
      "loc": ["body", "amount"],
      "msg": "ensure this value is greater than 0",
      "type": "value_error.number.not_gt"
    }
  ]
}
```

## Rate Limits

- Chat: 30 requests/minute per user
- Trade quotes: 10 requests/minute per user
- All other endpoints: 60 requests/minute per user

Rate-limited responses return `429` with a `Retry-After` header (seconds).

## CORS

Production CORS is configured to allow:
- `https://merlin-app.web.app`
- `https://merlin-app.firebaseapp.com`

Local development allows `http://localhost:3000`. Configure additional origins via the `CORS_ORIGINS` environment variable (comma-separated).
