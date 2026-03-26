# Feature Specifications

Detailed specifications for each major feature of the Merlin platform.

## Status Legend

| Status | Meaning |
|--------|---------|
| **Live** | Deployed and functional in production |
| **In Progress** | Partially implemented, active development |
| **Planned** | Designed but not yet implemented |

## Feature Index

| Feature | Status | Spec |
|---------|--------|------|
| [Passkey Authentication](auth-passkey.md) | Live | WebAuthn passkeys, seed encryption, session management |
| [AI Chat Pipeline](ai-chat-pipeline.md) | Live | Claude tool use, SSE streaming, intent parsing |
| [Trading Engine](trading-engine.md) | Live (quoting) / In Progress (execution) | Uniswap V3 quotes, swap building, 6-step pipeline |
| [xStock Resolver](xstock-resolver.md) | Live | 61+ token registry, fuzzy matching, price oracle |
| [Privacy System](privacy-railgun.md) | Planned | Railgun ZK proofs, Privacy Pools, three transaction modes |
| [Persona Engine](persona-engine.md) | Live (built-in) / Planned (custom) | 4 built-in trading strategies, custom persona creation |
| [Social Intelligence](social-intelligence.md) | Live | Grok sentiment analysis, X/Twitter signals |
| [EIP-7702 Gasless](eip7702-gasless.md) | Live (UserOp) / In Progress (bundler) | AmbirePaymaster, USDC gas, ERC-4337 |
| [Portfolio & Balances](portfolio-balances.md) | Live | On-chain balances, price tracking, PnL |
| [Deployment & Infra](deployment-infra.md) | Live | GCP, Firebase Hosting, Cloud Run, Firestore |

## Architecture Overview

```
User → Chat UI → Anthropic Claude (tool use) → Intent Parser
                                                  ↓
                                          xStock Resolver → Guardrails → Trading Engine
                                                                              ↓
                                          Persona Engine ←──────── Quote + Confirmation
                                                                              ↓
                                          Privacy (Railgun) ←── Wallet Signs → Broadcast
                                                                              ↓
                                          EIP-7702 (gasless) ←── Bundler → On-chain
                                                                              ↓
                                          Portfolio ← Trade Persisted → Social Signals
```

## Related

- [Project Spec](../project-spec.md) — high-level project specification
- [Tech Stack](../tech-stack.md) — full technology stack details
- [Development Plan](../development-plan.md) — phase-by-phase progress
- [Project Description](../project-description.md) — product narrative


---

# Passkey Authentication

## Status: Live

## Overview

Merlin uses WebAuthn passkeys as the sole authentication mechanism for new accounts — no email, no password, no third-party auth provider. A passkey credential authenticates the user and derives the key material used to encrypt their BIP-39 seed phrase, which is stored encrypted in IndexedDB and never transmitted unencrypted. Sessions are managed server-side via 24-hour JWT tokens and client-side via a `WalletManager` that holds the decrypted seed in memory with a 15-minute auto-lock.

## Architecture

### Data Flow

```
[Browser] WebAuthn credential creation (platform authenticator)
    → challenge fetched from backend (Firestore-backed, 5-min TTL)
    → credential attested and verified by py-webauthn (backend)
    → JWT issued (24h), user record created in Firestore

[Browser] BIP-39 24-word mnemonic generated via @scure/bip39
    → encryption key derived: HKDF-SHA256(credentialId, salt)
    → seed encrypted: Scrypt(key) → AES-128-CTR + keccak256 MAC
    → encrypted blob stored in IndexedDB

[Browser] WalletManager.unlock(passkey assertion)
    → re-derives encryption key from credentialId
    → decrypts seed blob from IndexedDB
    → holds decrypted seed in memory
    → auto-locks after 15 minutes of inactivity

[Browser] BIP-44 key derivation on demand
    → @scure/bip32: m/44'/60'/0'/0/{index}
    → EOA private key used by Kohaku TxSigner
```

### Modules Involved

| Module | Role |
|--------|------|
| `backend/auth/` | WebAuthn registration and authentication, JWT sessions |
| `backend/db/` | User and credential persistence (Firestore), challenge lifecycle |
| `backend/routers/auth.py` | HTTP API surface (6 endpoints) |
| `frontend/lib/auth.ts` | AuthProvider, WalletManager, passkey initiation |
| `frontend/lib/crypto.ts` | Seed generation, Scrypt+AES encryption, HKDF key derivation, BIP-44 |
| `frontend/components/` | Auth gate, route protection, auth context provider |

## Implementation Details

### WebAuthn Registration (backend: py-webauthn 2.1.0)

Registration is a two-step challenge/response flow:

1. `POST /auth/register/begin` — backend generates a random challenge, stores it in Firestore with a 5-minute TTL, returns `PublicKeyCredentialCreationOptions`.
2. `POST /auth/register/complete` — browser submits the attestation response; py-webauthn verifies attestation, extracts the public key and credential ID, writes a `StoredCredential` record under the user's Firestore document, deletes the challenge on first read (single-use), and issues a JWT.

Registration enforces:
- `authenticatorAttachment: platform` — device-bound passkeys only
- `userVerification: required` — biometric/PIN required on every use
- `residentKey: required` — discoverable credentials (no username needed at login)
- Supported algorithms: ES256 (alg -7, P-256) and RS256 (alg -257)
- RP ID: `merlin.app`, origin: `https://merlin.app`

Multiple passkeys per account are supported. Each additional passkey registration goes through the same begin/complete flow with the existing user's ID. The stored credential schema tracks `credentialId` (base64url), raw public key bytes, sign counter (anti-replay), transports, device type, `createdAt`, and `lastUsedAt`.

### WebAuthn Authentication (backend: py-webauthn 2.1.0)

1. `POST /auth/login/begin` — backend generates a fresh challenge, stores it in Firestore (5-min TTL). No username required (resident key / passkey flow).
2. `POST /auth/login/complete` — browser submits the assertion; py-webauthn verifies signature using the stored public key, validates that the sign counter is strictly greater than the stored value (replay protection), updates `lastUsedAt` and the stored counter, deletes the challenge, and issues a new JWT.

### Seed Generation

On new account creation (after successful registration), the browser generates a 24-word BIP-39 mnemonic using `@scure/bip39` with the English wordlist (`generateMnemonic(wordlist, 256)`). The mnemonic is never sent to the server.

### Seed Encryption

The encryption key is derived from the passkey credential ID using HKDF-SHA256:

```
encryptionKey = HKDF-SHA256(
    ikm  = credentialId (raw bytes),
    salt = random 32-byte salt (stored alongside ciphertext),
    info = "merlin-seed-encryption"
)
```

The derived key feeds Ambire keystore's Scrypt+AES-128-CTR pattern:

```
derivedKey (64 bytes) = Scrypt(
    password = encryptionKey,
    salt     = storedSalt,
    N = 131072, r = 8, p = 1, dkLen = 64
)

ciphertext = AES-128-CTR(
    key = derivedKey[0:16],
    iv  = derivedKey[16:32],
    plaintext = mnemonic (UTF-8)
)

mac = keccak256(derivedKey[32:64] || ciphertext)
```

The encrypted blob `{ salt, iv, ciphertext, mac }` is serialized as JSON and stored in IndexedDB under the key `merlin_encrypted_seed`. The mac is verified on every decrypt to detect tampering or key mismatch before attempting decryption.

### BIP-44 Key Derivation

Once the seed is decrypted into memory by `WalletManager`, EOA keys are derived on demand:

```
hdNode = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic))
child  = hdNode.derive("m/44'/60'/0'/0/{index}")
privateKey = child.privateKey   // 32-byte Uint8Array
address    = computeAddress(privateKey)
```

Default account uses index 0. Additional accounts increment the index. Derived private keys are passed to Kohaku's TxSigner and are never stored anywhere — they live only in memory for the duration of a signing operation.

### WalletManager (frontend/lib/auth.ts)

`WalletManager` is a singleton that owns the in-memory lifecycle of the decrypted seed:

- `unlock(assertion)` — decrypts the IndexedDB blob using the re-derived key from the asserted credentialId, holds the mnemonic in a `Uint8Array` buffer, resets the auto-lock timer.
- `lock()` — zero-fills the mnemonic buffer (`buffer.fill(0)`), clears the reference, cancels the auto-lock timer.
- `isUnlocked()` — returns true if the buffer is populated.
- `deriveAccount(index)` — derives and returns an `{ address, privateKey }` pair without exposing the mnemonic.
- Auto-lock fires after 15 minutes of inactivity. The timer resets on any `deriveAccount` call. The timeout value is configurable via the `WALLET_AUTO_LOCK_SECONDS` constant in `frontend/lib/auth.ts`.

Re-authentication is required (fresh passkey assertion → `unlock()`) before: sending transactions, exporting the seed phrase, and adding new passkeys.

### Session Management

- Backend issues JWTs signed with a server secret (python-jose, HS256, 24-hour expiry).
- The JWT is stored in an `httpOnly` cookie to prevent XSS access.
- `get_current_user` FastAPI dependency (`backend/auth/dependencies.py`) validates the JWT and resolves the user on every protected route.
- `POST /auth/logout` clears the cookie and invalidates the session server-side.
- The `PATCH /auth/address` endpoint lets the frontend register the derived EOA address against the authenticated user record after first unlock.

## Code Map

| File | Purpose |
|------|---------|
| `backend/auth/webauthn.py` | py-webauthn registration and authentication verification; challenge generation; credential validation logic |
| `backend/auth/session.py` | JWT creation and verification via python-jose; 24-hour token lifecycle |
| `backend/auth/models.py` | Pydantic request/response models for all auth endpoints (RegistrationBeginRequest, AuthenticationCompleteRequest, etc.) |
| `backend/auth/dependencies.py` | `get_current_user` FastAPI dependency; validates JWT from cookie and resolves the authenticated user |
| `backend/db/users.py` | User CRUD operations in Firestore; credential sub-collection read/write; stored credential schema |
| `backend/db/challenges.py` | WebAuthn challenge store backed by Firestore; single-use semantics; 5-minute TTL enforcement |
| `backend/routers/auth.py` | FastAPI router mounting all 6 auth endpoints with dependency injection |
| `frontend/lib/auth.ts` | `AuthProvider` React context, `WalletManager` singleton (unlock/lock/auto-lock/deriveAccount), passkey registration and assertion flows using `@simplewebauthn/browser` |
| `frontend/lib/crypto.ts` | BIP-39 mnemonic generation (`@scure/bip39`), HKDF key derivation, Scrypt+AES-128-CTR encryption/decryption, keccak256 MAC, BIP-44 derivation via `@scure/bip32` |
| `frontend/components/auth-gate.tsx` | UI component that conditionally renders children only when the wallet is unlocked; displays passkey prompt otherwise |
| `frontend/components/auth-guard.tsx` | Next.js route-level protection; redirects unauthenticated users to onboarding |
| `frontend/components/providers/auth-provider.tsx` | Mounts `AuthProvider` context at the app root; connects to `WalletManager` lifecycle events |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register/begin` | Generate a WebAuthn challenge and return `PublicKeyCredentialCreationOptions`. Stores challenge in Firestore with 5-min TTL. |
| `POST` | `/auth/register/complete` | Verify attestation via py-webauthn, store credential, create user record, issue JWT cookie. |
| `POST` | `/auth/login/begin` | Generate a WebAuthn challenge and return `PublicKeyCredentialRequestOptions` for resident-key (passwordless) flow. |
| `POST` | `/auth/login/complete` | Verify assertion via py-webauthn, validate sign counter, update credential, issue JWT cookie. |
| `POST` | `/auth/logout` | Clear JWT cookie and invalidate the server-side session. |
| `PATCH` | `/auth/address` | Store the derived EOA address against the authenticated user record. Called after first `WalletManager.unlock()`. |

## Firestore Schema

### `users` collection

```
users/{userId}
  id:          string         // UUID, matches WebAuthn user.id
  createdAt:   timestamp
  address:     string | null  // EOA address, set after first unlock

  credentials/{credentialId}  // sub-collection, one doc per registered passkey
    credentialId:  string      // base64url encoded
    publicKey:     bytes       // raw COSE public key bytes
    counter:       number      // sign count for replay protection
    transports:    string[]    // ["internal", "hybrid", ...]
    deviceType:    string      // "singleDevice" | "multiDevice"
    createdAt:     timestamp
    lastUsedAt:    timestamp
```

### `challenges` collection

```
challenges/{challengeId}
  challenge:   string     // base64url encoded random bytes
  userId:      string | null  // null for login (pre-user-resolution)
  type:        string     // "registration" | "authentication"
  createdAt:   timestamp
  expiresAt:   timestamp  // createdAt + 5 minutes; enforced in queries
```

Challenges are deleted from Firestore on first successful use (single-use semantics). A background cleanup job or Firestore TTL policy removes expired unclaimed challenges.

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `WEBAUTHN_RP_ID` | Relying Party ID (`merlin.app` in production, `localhost` in dev) | Yes |
| `WEBAUTHN_RP_NAME` | Relying Party display name (`Merlin`) | Yes |
| `WEBAUTHN_ORIGIN` | Expected origin (`https://merlin.app`) | Yes |
| `JWT_SECRET` | HMAC-SHA256 signing secret for python-jose | Yes |
| `JWT_ALGORITHM` | Algorithm (`HS256`) | Yes |
| `FIREBASE_PROJECT_ID` | Firestore project for credential and challenge storage | Yes |

### Constants (frontend/lib/auth.ts)

| Constant | Value | Description |
|----------|-------|-------------|
| `WALLET_AUTO_LOCK_SECONDS` | `900` (15 minutes) | Inactivity timeout before WalletManager locks |
| `CHALLENGE_TTL_SECONDS` | `300` (5 minutes) | Challenge validity window (mirrors backend) |

### Constants (backend)

| Constant | Value | Location |
|----------|-------|----------|
| JWT expiry | 24 hours | `backend/auth/session.py` |
| Challenge TTL | 5 minutes | `backend/db/challenges.py` |
| Scrypt N | 131072 | `frontend/lib/crypto.ts` |
| Scrypt r | 8 | `frontend/lib/crypto.ts` |
| Scrypt p | 1 | `frontend/lib/crypto.ts` |
| dkLen | 64 bytes | `frontend/lib/crypto.ts` |

## Current Limitations

- **Seed phrase import (Path 2) is not implemented.** Users cannot onboard with an existing BIP-39 mnemonic. The flow is defined in the agent spec but has no backend or frontend implementation yet.
- **Wallet connection (Path 3) is not implemented.** WalletConnect and injected provider detection (`window.ethereum`) are not wired up. No external wallet can be connected.
- **Railgun key derivation is not wired.** After BIP-44 derivation, no Railgun spending/viewing keys are derived. Privacy features are blocked behind this gap.
- **Multiple passkey management UI is not implemented.** The backend supports multiple credentials per user, but there is no UI to list, add, or revoke passkeys.
- **Seed export / backup UI is not implemented.** The re-auth gate and display screen for exporting the 24-word mnemonic are not built.
- **Sign counter enforcement is in place but not alerting.** Counter decrements reject authentication correctly but do not surface a user-visible warning or trigger credential revocation.
- **Challenge cleanup.** Expired challenges are not automatically purged. A Firestore TTL policy or Cloud Scheduler job needs to be configured for the `challenges` collection.
- **Device recovery flow is not implemented.** If a user loses all devices, the seed phrase import path (not yet built) is the only recovery mechanism. The unrecoverable scenario (no seed backup, all devices lost) has no in-app guidance.

## Related

- `specs/project-spec.md` — overall architecture, tech stack decisions, Kohaku infrastructure
- `specs/development-plan.md` — implementation phases and milestone tracking
- `agents/passkey-auth.md` — passkey auth agent spec: WebAuthn patterns, encryption flow, session rules, recovery matrix
- `agents/ambire-7702.md` — Ambire keystore encryption reference (Scrypt+AES pattern origin)
- `agents/kohaku-expert.md` — Railgun key derivation that follows BIP-44 derivation


---

# AI Chat Pipeline

## Status: Live

## Overview

The AI Chat Pipeline is the primary interface through which users interact with Merlin. It accepts free-form natural language messages, classifies intent via Claude Haiku tool use, and produces either a streamed conversational response or a structured trade confirmation card that the user signs on-chain. All responses are delivered as Server-Sent Events (SSE), giving the frontend real-time streaming text with no polling.

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
  ├─ Build Claude messages array (system prompt + last 50 messages from Firestore)
  │
  ▼
Claude Haiku  — stream=True, tool_choice="auto"
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
        │     │     Low confidence (<0.8) → emit ambiguous_asset tool result → Claude asks clarification
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
        │     └─ Second Claude call with tool result → stream confirmation text
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

### Claude Tool Use — 3 Tools

| Tool | Trigger | Parameters |
|------|---------|------------|
| `parse_trade_intent` | User wants to buy or sell | `side` (buy/sell), `asset` (string), `amount` (number), `amount_type` (usd/quantity) |
| `get_price` | User asks about a price | `asset` (string) |
| `get_portfolio` | User asks about portfolio/balance/holdings | none |

All three tools go through a second Claude streaming call after the tool result is produced, so the user always receives a natural language follow-up in addition to any structured event.

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

Claude Haiku extracts the following fields via `parse_trade_intent`:

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

If `confidence < 0.8` and alternatives exist, the tool result signals `ambiguous_asset` back to Claude, which then asks the user to clarify — the trade is not queued.

### Guardrail Validation

Every parsed trade passes through `validate_trade(user_id, intent)` in `backend/services/guardrails.py` before a quote is requested or a trade is stored. If `approved` is `False`, the tool result carries the blocking `reason` and the trade is rejected — Claude informs the user in plain language.

### Uniswap V3 Quote

After guardrails pass, `uniswap_get_quote(token_in, token_out, amount_in)` is called. The quote is best-effort: if it fails (e.g., no pool liquidity, placeholder address), the trade is still saved with `quote_note` explaining why a quote is unavailable. The quoted output is included in the `trade_intent` SSE event and in the Claude follow-up text.

### Conversation Persistence

- Every user and assistant message is stored in Firestore immediately.
- The context window sent to Claude is the system prompt plus the last 50 messages (`_build_claude_messages`).
- Assistant messages that follow a tool call carry `metadata.function_call` for auditability.
- Conversation `updated_at` is touched on every new message.

### Conversation Sessions

Users can maintain multiple named conversations. Sessions are scoped per user:

- Created automatically on the first message if no `conversation_id` is provided.
- Title is auto-generated from the first 50 characters of the opening message.
- Listed ordered by `updated_at` descending.

### AI Model Preference

Users can switch between allowed Claude models. The preference is stored as `ai_model` on the Firestore user document and returned by `GET /chat/provider`. Allowed values: `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`, `claude-opus-4-20250514`. The frontend also maintains a local `localStorage` preference under `merlin_preferred_model`.

## Code Map

| File | Purpose |
|------|---------|
| `backend/services/chat.py` | Core chat service — Anthropic client, streaming SSE generator, all three tool handlers, conversation history builder |
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
| `PATCH` | `/chat/provider` | Bearer JWT | Update AI model preference. Body: `{model}`. Allowed: `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`, `claude-opus-4-20250514` |
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
| `ANTHROPIC_API_KEY` | `Secret Manager` / `.env` | Required. Used to instantiate `AsyncAnthropic` client. Raises `RuntimeError` at first request if missing. |
| Model name | `backend/services/chat.py` → `MODEL = "claude-haiku-4-5-20251001"` | Default model for all chat completions. |
| System prompt | `backend/services/chat.py` → `SYSTEM_PROMPT` | Defines Merlin identity, tool usage rules, xStock compliance rules, and communication style. |
| Context window limit | `backend/services/chat.py` → `_build_claude_messages()`, `limit=50` | Number of prior messages included in each Claude call. |
| Allowed models | `backend/routers/chat.py` → `allowed_models` set | `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`, `claude-opus-4-20250514`. Requests for other values return HTTP 400. |

## Current Limitations

- **No persona integration in the LLM call.** The frontend renders a persona selector (Elon, Buffett, AI Momentum) and persists the chosen persona ID, but the selected persona is not passed to the backend and does not alter the system prompt or tool behavior. Persona-aware context injection is not yet implemented.
- **Context window is a hard slice of 50 messages.** There is no summarization or token-budget management. Long conversations will silently drop the oldest messages. This can cause the model to lose earlier intent signals in extended sessions.
- **No voice input backend.** The frontend implements voice input via the browser Web Speech API (`webkitSpeechRecognition`) and TTS via `window.speechSynthesis`. Both are entirely client-side. There is no server-side STT or TTS pipeline.
- **Model selector is UI-only for non-Claude providers.** The frontend offers Grok options in the model dropdown (`MODEL_OPTIONS`) but the backend only validates and uses Anthropic Claude models. Selecting Grok from the UI has no effect on the actual model used.
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


---

# Trading Engine

## Status: Live (quoting + confirmation) | In Progress (on-chain execution)

## Overview

The trading engine executes token swaps on Uniswap V3 (Ethereum mainnet) using a six-step pipeline: quote, simulate, policy guardrails, execute, confirm, and persist. The backend is strictly non-custodial — it builds and returns unsigned transactions to the frontend for signing; private keys never leave the client. Two execution paths exist: a standard ETH-gas path and a gasless path (EIP-7702 + ERC-4337 + AmbirePaymaster) that pays gas in USDC via a Pimlico bundler.

## Architecture

### Six-Step Pipeline

```
1. Quote      — QuoterV2.quoteExactInputSingle via eth_call (on-chain, no LP fees charged)
2. Simulate   — Guardrails validation (8 checks), allowance check, amount sanity check
3. Policy     — validate_trade() in services/guardrails.py (all 8 checks must pass)
4. Execute    — Build unsigned tx (standard) or PackedUserOperation (gasless); return to frontend
5. Confirm    — Frontend broadcasts; calls POST /trade/confirm with tx_hash; backend monitors receipt
6. Persist    — Firestore: users/{uid}/trades document created at quote time, updated on confirmation
```

### Execution Modes

| Mode | Path | Gas Payment | Broadcast |
|------|------|-------------|-----------|
| Standard | SwapRouter02.exactInputSingle | ETH (user signs EOA tx) | Frontend via eth_sendRawTransaction |
| Gasless | AmbireAccount7702.executeBySender + EntryPoint | USDC debited via AmbirePaymaster | Frontend via eth_sendUserOperation to Pimlico bundler |

### Standard Flow

```
POST /trade/quote
  resolve tokens → validate guardrails → get Uniswap quote → check allowance
  → build approval_tx (if needed) + swap_tx (unsigned)
  → store quote in memory (5-min TTL) → save "quoted" trade to Firestore
  → return QuoteResponse

Frontend:
  sign + broadcast approval_tx (if needed) → sign + broadcast swap_tx

POST /trade/confirm
  look up quote_id → update Firestore trade status to "pending" + set tx_hash

GET /trade/status/{id}
  if pending: fetch eth_getTransactionReceipt → update to "confirmed" or "failed"
```

### Gasless Flow

```
POST /trade/quote-gasless
  resolve tokens → validate guardrails → get Uniswap quote
  → build calls: [approve(token_in → router, amount_in_raw), exactInputSingle]
  → encode executeBySender(calls) calldata
  → get EntryPoint nonce → fetch EIP-1559 gas prices
  → assemble PackedUserOperation (ERC-4337 v0.7)
  → call Ambire paymaster relay for paymasterData
  → call Pimlico bundler eth_estimateUserOperationGas
  → return GaslessQuoteResponse with user_operation + eip7702_auth

Frontend:
  sign EIP-7702 authorization (first delegation only)
  → sign UserOp hash with EOA key
  → submit eth_sendUserOperation to bundler_url
```

## Implementation Details

### Uniswap V3 Integration

All contract interactions use raw ABI encoding (no web3py / eth-abi dependency). Function selectors are pre-computed constants. RPC calls go through `services/provider.py`.

- **QuoterV2**: `quoteExactInputSingle` called via `eth_call` — returns `(amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate)`. Uses `sqrtPriceLimitX96 = 0` (no price limit).
- **SwapRouter02**: `exactInputSingle` with `ExactInputSingleParams` struct. Deadline defaults to `now + 20 minutes` (production target is `block.timestamp + 300` per the agent spec). Gas estimate adds a 20% buffer.
- **Fee tier**: 0.3% (3000) used as default for all quotes and gasless batch calls. Multi-hop and alternative fee tier routing is not yet implemented.
- **ETH input**: Detected when `token_in.address == "native"`. WETH address is substituted for the contract call; `tx.value` is set to `amount_in` so the router handles wrapping automatically.
- **Approvals (standard)**: Checks current allowance via `allowance(owner, spender)` eth_call before deciding whether to include an approval transaction. Uses `MAX_UINT256` for the approval amount in standard mode.
- **Approvals (gasless)**: Always includes a finite approval (`amount_in_raw`) in the batch to avoid residual on-chain allowance. The approve and swap execute atomically inside `executeBySender`.

### Gasless Mode (EIP-7702 + ERC-4337 v0.7)

Implemented in `services/eip7702.py`. All ABI encoding is manual hex.

- **AmbireAccount7702**: The user's EOA delegates to this contract via an EIP-7702 Type 4 authorization (signed once; reused on subsequent trades). `executeBySender((address,uint256,bytes)[])` selector `0xabc5345e` executes the call batch.
- **PackedUserOperation layout**: `accountGasLimits = verificationGasLimit[16] ++ callGasLimit[16]`; `gasFees = maxPriorityFeePerGas[16] ++ maxFeePerGas[16]`; `paymasterAndData = paymaster[20] ++ pvgl[16] ++ ppgl[16] ++ paymasterData`.
- **Gas defaults** (used when bundler estimation unavailable): callGasLimit 300k, verificationGasLimit 150k, paymasterVerificationGasLimit 42k, paymasterPostOpGasLimit 0, preVerificationGas 50k.
- **Paymaster relay**: `https://relayer.ambire.com`. Requires `PIMLICO_API_KEY` and `PIMLICO_POLICY_ID` env vars.
- **initCode**: Always `0x` — the EOA is upgraded via EIP-7702 delegation, not factory deployment.

### Token Resolution

- `services/xstock.py` (`resolve_token`) handles both xStock symbols and crypto assets.
- `is_placeholder_address()` detects zero-address (`0x000...000`) tokens that are registered in the xStock registry but have no verified contract address yet. Any attempt to quote or trade these returns HTTP 400.
- Token decimals are cached in `_KNOWN_DECIMALS`: WETH = 18, USDC = 6, USDT = 6. Unknown tokens fall back to an on-chain `decimals()` call, with a default of 18 on failure. xStock tokens default to 18 decimals without an on-chain call.

### Guardrails (Policy Step)

Eight checks run sequentially in `services/guardrails.py`. All must pass for the quote to proceed.

| # | Check | Limit |
|---|-------|-------|
| 1 | Side validation | "buy" or "sell" only |
| 2 | Asset validation | Known xStock or supported crypto |
| 3 | Amount validation | $1 minimum, $10,000 maximum per trade (USD-denominated only) |
| 4 | US person block | xStock tokens blocked for users with `country == "US"` or `is_us_person == true` |
| 5 | Sanctioned country | KP, IR, CU, SY, RU, BY, MM, VE, ZW, SD blocked |
| 6 | Daily notional limit | $50,000/day cumulative (USD-denominated trades only) |
| 7 | Duplicate detection | Identical side + symbol + amount within 60-second window rejected |
| 8 | Rate limit | Max 10 trades per minute |

The result `{"approved": bool, "checks": [...], "reason": str | None}` is stored on the Firestore trade document for audit.

### Quote Storage

Quotes are stored in a module-level dict `_quotes` keyed by UUID. Each entry includes an `_expires_at` timestamp (5-minute TTL). The in-memory store is cleared on each quote request via `_cleanup_expired_quotes()`. On `POST /trade/confirm`, the quote entry is deleted from memory after the trade record is updated in Firestore.

## Code Map

| File | Purpose |
|------|---------|
| `backend/services/uniswap.py` | QuoterV2 quoting, SwapRouter02 swap building, allowance checking, approval building, token decimals cache, ABI encoding helpers |
| `backend/services/eip7702.py` | EIP-7702 authorization construction, AmbireAccount7702 executeBySender encoding, PackedUserOperation assembly, paymaster relay integration, Pimlico bundler gas estimation |
| `backend/routers/trade.py` | FastAPI router: 4 endpoints, quote TTL store, token resolution helpers, guardrail invocation, Firestore trade persistence |
| `backend/services/guardrails.py` | 8-check trade validator: side, asset, amount, US person, sanctioned country, daily limit, duplicate detection, rate limit |
| `backend/db/trades.py` | Firestore CRUD: save_trade, save_quoted_trade, get_trades, get_trade_count, update_trade_status |
| `backend/services/provider.py` | Ethereum RPC abstraction: _rpc_call, eth_call (used by uniswap.py and eip7702.py) |
| `backend/services/xstock.py` | xStock token registry, resolve_token, is_supported_asset |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/trade/quote` | JWT | Get quote + unsigned swap/approval transactions (standard ETH-gas mode). Returns `QuoteResponse` with `quote_id`, token info, amounts, `swap_tx`, optional `approval_tx`, and `expires_at`. |
| `POST` | `/trade/quote-gasless` | JWT | Get quote as a fully-assembled ERC-4337 v0.7 `PackedUserOperation` paying gas in USDC via AmbirePaymaster. Returns `GaslessQuoteResponse` with `user_operation`, `eip7702_auth`, `bundler_url`, `gas_estimate_usdc`. Requires `PIMLICO_API_KEY`; returns HTTP 503 if unavailable. |
| `POST` | `/trade/confirm` | JWT | Record that the frontend has signed and broadcast a trade. Body: `{quote_id, tx_hash}`. Updates Firestore trade status to `"pending"`. |
| `GET` | `/trade/status/{id}` | JWT | Poll trade status. If status is `"pending"`, fetches `eth_getTransactionReceipt` on-demand and updates Firestore to `"confirmed"` or `"failed"`. |

### Request / Response Models

**QuoteRequest**
```
token_in:     str   — "ETH", "USDC", or xStock symbol (e.g. "xTSLA")
token_out:    str   — same format
amount:       float — human-readable amount (gt 0)
amount_type:  str   — "usd" (default) or "quantity"
slippage:     float — tolerance in percent (0.01–50.0, default 0.5)
recipient:    str   — user's wallet address
```

**QuoteResponse**
```
quote_id:         str
token_in:         {symbol, address, decimals}
token_out:        {symbol, address, decimals}
amount_in:        str  — human-readable
amount_out:       str  — human-readable (8 decimal places, trailing zeros stripped)
amount_in_wei:    str  — smallest unit
amount_out_min_wei: str — slippage-adjusted minimum
price_impact:     float — currently 0.0 (mid-price comparison not yet implemented)
slippage:         float
needs_approval:   bool
approval_tx:      dict | null — {to, data, value, gas, chainId}
swap_tx:          dict       — {to, data, value, gas, chainId}
expires_at:       str  — ISO-8601 UTC
```

**GaslessQuoteRequest / GaslessQuoteResponse**: same trade fields as above; response replaces `swap_tx`/`approval_tx` with `user_operation`, `eip7702_auth`, `entrypoint`, `bundler_url`, `paymaster_mode`, `gas_estimate_usdc`.

**ExecuteRequest (confirm)**
```
quote_id: str  — from /trade/quote or /trade/quote-gasless
tx_hash:  str  — 66-char 0x-prefixed hash
```

## Firestore Schema

### Collection: `users/{user_id}/trades`

Document ID: auto-generated by Firestore.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Same as document ID |
| `type` | string | `"buy"` \| `"sell"` \| `"swap"` |
| `side` | string | `"buy"` \| `"sell"` (denormalized for guardrail queries) |
| `asset_in` | string | Symbol of token sold (e.g. `"USDC"`) |
| `asset_out` | string | Symbol of token bought (e.g. `"xTSLA"`) |
| `symbol` | string | Primary asset symbol (e.g. `"xTSLA"`) |
| `asset` | string | Human-readable asset name |
| `amount_in` | float | Input amount |
| `amount_out` | float | Output amount (0 until confirmed) |
| `price_usd` | float \| null | Execution price in USD (null until confirmed) |
| `tx_hash` | string | On-chain transaction hash (empty until broadcast) |
| `status` | string | `"quoted"` → `"pending"` → `"confirmed"` \| `"failed"` |
| `privacy_mode` | string | `"public"` \| `"shielded"` \| `"compliant"` (default `"public"`) |
| `amount` | float | Human-readable trade amount as entered |
| `amount_type` | string | `"usd"` \| `"quantity"` |
| `total_usd` | float | USD notional for daily limit tracking |
| `conversation_id` | string | Chat conversation that originated the trade (if applicable) |
| `guardrail_result` | map | Full guardrail check output stored for audit |
| `created_at` | string | ISO-8601 UTC timestamp |

### Supporting Collections (queried by guardrails)

- `users/{user_id}/trades` ordered by `created_at` — used for daily limit (`where created_at >= day_start`) and rate limit (`where created_at >= now - 60s`) and duplicate detection.
- `users/{user_id}` (profile document) — `country` (string, ISO 3166-1 alpha-2) and `is_us_person` (boolean) used for geofence checks.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ETH_RPC_URL` | Yes | Ethereum mainnet JSON-RPC endpoint |
| `PIMLICO_API_KEY` | Gasless only | Pimlico bundler API key |
| `PIMLICO_POLICY_ID` | Gasless only | Pimlico sponsorship policy ID |

### Contract Addresses (Ethereum Mainnet)

| Contract | Address |
|----------|---------|
| SwapRouter02 | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| QuoterV2 | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` |
| WETH | `0xC02aaA39b223FE8D0A0e5695F863489fa5693b42` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| AmbireAccount7702 | `0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d` |
| AmbirePaymaster | `0xA8B267C68715FA1Dca055993149f30217B572Cf0` |
| AmbireFactory | `0x26cE6745A633030A6faC5e64e41D21fb6246dc2d` |
| ERC-4337 EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |

### Gas Defaults

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `DEFAULT_SWAP_GAS` | 200,000 | Fallback for swap gas estimation failures |
| `DEFAULT_APPROVAL_GAS` | 60,000 | Fallback for approval gas estimation failures |
| `DEFAULT_CALL_GAS_LIMIT` (UserOp) | 300,000 | approve (~50k) + swap (~200k) + executeBySender overhead (~20k) + buffer |
| `DEFAULT_VERIFICATION_GAS_LIMIT` | 150,000 | validateUserOp + ecrecover + storage reads |
| `DEFAULT_PAYMASTER_VER_GAS_LIMIT` | 42,000 | AmbirePaymaster.validatePaymasterUserOp |
| `DEFAULT_PAYMASTER_POSTOP_GAS_LIMIT` | 0 | No postOp logic in AmbirePaymaster |
| `DEFAULT_PRE_VERIFICATION_GAS` | 50,000 | Bundle overhead |
| Swap gas buffer | +20% | Applied to all `eth_estimateGas` results |
| Quote TTL | 5 minutes | In-memory store; quotes expire and must be re-fetched |
| Standard tx deadline | now + 20 minutes | Set at build time; production target is block.timestamp + 300 |

### Ambire External Services

| Service | Base URL | Auth |
|---------|----------|------|
| Ambire Paymaster Relay | `https://relayer.ambire.com` | None (open relay for Ambire contracts) |
| Pimlico Bundler | `https://api.pimlico.io/v2/1/rpc?apikey={PIMLICO_API_KEY}` | `PIMLICO_API_KEY` in URL |

## Current Limitations

1. **No on-chain execution from backend**: The backend only builds and returns unsigned transactions. On-chain execution is entirely frontend-driven. There is no backend transaction broadcaster, no nonce management, and no retry logic server-side.

2. **Placeholder xStock addresses**: Tokens registered in the xStock registry with a zero address (`0x000...000`) are rejected at quote time with HTTP 400. Not all 80+ xStock tokens have verified mainnet contract addresses yet.

3. **No slippage UI**: Slippage tolerance is accepted as an API parameter (default 0.5%) but there is no frontend component for users to configure it. The API permits values up to 50%, which exceeds the agent spec's 1% cap — this needs alignment.

4. **Price impact not calculated**: The `price_impact` field in `QuoteResponse` is always `0.0`. A correct implementation would compare mid-price (derived from `sqrtPriceX96Before` and `sqrtPriceX96After`) against the execution price.

5. **Single fee tier**: Only the 0.3% (3000) pool is queried. There is no fee tier discovery or routing across 0.05%, 0.01%, or 1% pools to find the best price.

6. **No multi-hop routing**: Only `exactInputSingle` (single-hop) swaps are supported. Multi-hop paths through intermediate tokens (e.g. xTSLA → WETH → USDC) are not implemented.

7. **No on-chain confirmation polling**: The `GET /trade/status/{id}` endpoint checks the receipt on-demand per request but there is no background task or webhook that pushes confirmation updates. The frontend must poll.

8. **Gasless mode requires Pimlico**: The `/trade/quote-gasless` endpoint returns HTTP 503 if `PIMLICO_API_KEY` is not set. There is no fallback bundler.

9. **Standard tx deadline**: The current implementation sets `deadline = int(time.time()) + 20 * 60` (20 minutes) at quote build time rather than the intended `block.timestamp + 300` (5 minutes). This can be tightened once the frontend confirms execution timing.

10. **Daily limit enforcement**: The daily notional limit check only applies to USD-denominated amounts. Quantity-based trades (`amount_type == "quantity"`) bypass the USD daily limit check; they require a price oracle integration to enforce.

## Related

- Agent spec: `agents/trade-execution.md` — six-step pipeline definition, guardrail rules, output formats
- Guardrails agent: `agents/guardrails.md` — full 11-check guardrail specification (backend implements 8 of 11)
- xStock resolver: `agents/xstock-resolver.md` — token resolution logic
- EIP-7702 / Ambire source: `sources/kohaku-commons-main/` — AccountOp, keystore, paymaster reference implementation
- Project spec: `specs/project-spec.md` — full Merlin architecture overview


---

# xStock Resolver

## Status: Live

## Overview

The xStock Resolver is the canonical token identification layer for Merlin's trading pipeline. It maintains an in-memory registry of 61 xStock tracker certificate tokens — ERC-20s on Ethereum mainnet issued by Backed Finance — and resolves free-form user input (company names, tickers, partial strings, xStocks.fi ticker format) to a single, unambiguous token record. When resolution is ambiguous, the resolver returns ranked candidates and requires explicit user clarification before any trade intent is forwarded downstream.

## Architecture

```
User input (raw string)
        |
        v
  Normalize input
  (lowercase, strip whitespace + punctuation)
        |
        v
  Stage 1: Exact symbol match
  ("xTSLA" or "TSLAx" → xTSLA)
        |
        v
  Stage 2: Exact ticker match
  ("TSLA" → xTSLA, "FB" → xMETA alias)
        |
        v
  Stage 3: Exact company name match
  ("Tesla" → xTSLA, "Alphabet" → xGOOG)
        |
        v
  Stage 4: Partial / fuzzy match
  (difflib.SequenceMatcher, threshold ≥ 0.6)
        |
        v
  Ambiguity check
  (single winner → resolve, multiple ≥ threshold → return candidates)
        |
        v
  Canonical token record
  {symbol, xstocks_ticker, name, ticker, type, address, confidence}
        |
        v
  Downstream pipeline (Node 2+)
```

Crypto assets (ETH, USDC, USDT, WETH) are handled via a separate `CRYPTO_ASSETS` dict and bypass the xStock matching stages entirely. The resolver checks crypto identity before entering the xStock stages so that "ETH" or "Ethereum" never incorrectly fuzzy-matches an xStock token.

Price data is fetched independently of resolution: CoinMarketCap for crypto assets, Backed Finance REST API for xStock tokens. Both price sources share a 60-second in-memory TTL cache to avoid redundant API calls during high-frequency chat sessions.

## Implementation Details

- **Registry size**: 61 xStock tokens in `XSTOCK_REGISTRY` list at module load time (no DB read required)
- **Token record fields**: `symbol` (Merlin canonical, e.g. `xTSLA`), `xstocks_ticker` (xStocks.fi format, e.g. `TSLAx`), `name` (full company/fund name), `ticker` (underlying exchange ticker), `type` (`stock` | `etf` | `commodity`), `address` (Ethereum mainnet ERC-20 contract address)
- **Ticker conventions**: Two parallel formats are supported. xStocks.fi uses `TICKERx` (e.g. `TSLAx`, `SPYx`). Merlin uses `xTICKER` (e.g. `xTSLA`, `xSPY`). Both are accepted as input and normalized to the Merlin `xTICKER` form internally.
- **Known ticker aliases**: `GOOGL` → `xGOOG`, `FB` → `xMETA`. These are hardcoded in the alias table alongside any other legacy or dual-class tickers.
- **Fuzzy matching**: `difflib.SequenceMatcher(None, normalized_input, candidate_field)` run across symbol, ticker, and name fields. Scores below 0.6 are discarded. The highest-scoring candidate above threshold wins; if two or more candidates score within 0.05 of each other, the result is `ambiguous` and all candidates are returned.
- **Confidence scale**: `exact` (1.0, direct symbol/ticker hit), `high` (0.85–0.99, company name match), `partial` (0.6–0.84, fuzzy substring), `ambiguous` (multiple candidates, user clarification required)
- **Crypto assets**: `ETH`, `USDC`, `USDT`, `WETH` are defined in a separate `CRYPTO_ASSETS` dict with CoinMarketCap IDs and decimals. They are returned with `type: crypto` and bypass xStock resolution entirely.
- **Price oracle — crypto**: CoinMarketCap `/v1/cryptocurrency/quotes/latest` endpoint, keyed by `COINMARKETCAP_API_KEY` environment variable.
- **Price oracle — xStocks**: Backed Finance public API at `https://api.backed.fi/api/v2/public`. Endpoint returns NAV and last-trade price per token.
- **Price cache**: Shared in-memory dict, 60-second TTL. Cache is per-symbol. Stale entries are evicted on next read, not on a background timer.
- **No blockchain reads for price**: Prices are sourced entirely from Backed Finance API and CoinMarketCap. There is no on-chain price verification (Uniswap pool reads, Chainlink oracles) at this stage.

## Token Registry

### Stocks (45 tokens)

| xStock Symbol | Underlying Ticker | Company / Fund |
|---------------|-------------------|----------------|
| xTSLA | TSLA | Tesla Inc. |
| xAAPL | AAPL | Apple Inc. |
| xGOOG | GOOGL | Alphabet Inc. |
| xAMZN | AMZN | Amazon.com Inc. |
| xMSFT | MSFT | Microsoft Corp. |
| xNVDA | NVDA | NVIDIA Corp. |
| xMETA | META | Meta Platforms Inc. |
| xNFLX | NFLX | Netflix Inc. |
| xCOIN | COIN | Coinbase Global Inc. |
| xPLTR | PLTR | Palantir Technologies |
| xGME | GME | GameStop Corp. |
| xAMD | AMD | Advanced Micro Devices |
| xORCL | ORCL | Oracle Corp. |
| xCRM | CRM | Salesforce Inc. |
| xAVGO | AVGO | Broadcom Inc. |
| xINTC | INTC | Intel Corp. |
| xJPM | JPM | JPMorgan Chase & Co. |
| xV | V | Visa Inc. |
| xMA | MA | Mastercard Inc. |
| xBAC | BAC | Bank of America Corp. |
| xGS | GS | Goldman Sachs Group |
| xMSTR | MSTR | MicroStrategy Inc. |
| xHOOD | HOOD | Robinhood Markets Inc. |
| xLLY | LLY | Eli Lilly and Company |
| xADBE | ADBE | Adobe Inc. |
| xCRWD | CRWD | CrowdStrike Holdings |
| xPANW | PANW | Palo Alto Networks |
| xTSM | TSM | Taiwan Semiconductor |
| xKO | KO | The Coca-Cola Company |
| xPEP | PEP | PepsiCo Inc. |
| xWMT | WMT | Walmart Inc. |
| xHD | HD | The Home Depot Inc. |
| xMCD | MCD | McDonald's Corp. |
| xXOM | XOM | Exxon Mobil Corp. |
| xCVX | CVX | Chevron Corp. |
| xPFE | PFE | Pfizer Inc. |
| xMRK | MRK | Merck & Co. Inc. |
| xJNJ | JNJ | Johnson & Johnson |
| xUNH | UNH | UnitedHealth Group |
| xABT | ABT | Abbott Laboratories |
| xABBV | ABBV | AbbVie Inc. |
| xNVO | NVO | Novo Nordisk A/S |
| xRBLX | RBLX | Roblox Corp. |
| xAPP | APP | Applovin Corp. |
| xRIOT | RIOT | Riot Platforms Inc. |

### ETFs (12 tokens)

| xStock Symbol | Underlying Ticker | Fund Name |
|---------------|-------------------|-----------|
| xSPY | SPY | SPDR S&P 500 ETF Trust |
| xQQQ | QQQ | Invesco QQQ Trust |
| xGLD | GLD | SPDR Gold Trust |
| xSLV | SLV | iShares Silver Trust |
| xIWM | IWM | iShares Russell 2000 ETF |
| xIEMG | IEMG | iShares Core MSCI Emerging Markets ETF |
| xIJR | IJR | iShares Core S&P Small-Cap ETF |
| xSCHF | SCHF | Schwab International Equity ETF |
| xTBLL | TBLL | SPDR Bloomberg 3-12 Month T-Bill ETF |
| xTQQQ | TQQQ | ProShares UltraPro QQQ (3x leveraged) |
| xVTI | VTI | Vanguard Total Stock Market ETF |
| xVT | VT | Vanguard Total World Stock ETF |

### Commodities (3 tokens)

| xStock Symbol | Underlying Ticker | Description |
|---------------|-------------------|-------------|
| xPALL | PALL | Aberdeen Standard Physical Palladium ETF |
| xPPLT | PPLT | Aberdeen Standard Physical Platinum ETF |
| xCOPX | COPX | Global X Copper Miners ETF |

### Crypto Assets (separate registry, 4 assets)

| Symbol | Name | Price Source |
|--------|------|--------------|
| ETH | Ethereum | CoinMarketCap |
| USDC | USD Coin | CoinMarketCap |
| USDT | Tether | CoinMarketCap |
| WETH | Wrapped Ether | CoinMarketCap |

## Code Map

| File | Purpose |
|------|---------|
| `backend/services/xstock.py` | `XSTOCK_REGISTRY` list, `CRYPTO_ASSETS` dict, `resolve_token(input_str)` function, fuzzy matching logic, alias table, confidence scoring |
| `backend/services/prices.py` | `get_price(symbol)` function, CoinMarketCap client (crypto), Backed Finance API client (xStocks), 60-second TTL cache, cache invalidation |
| `backend/routers/chat.py` | `GET /market/assets` endpoint — returns serialized registry with metadata for frontend asset picker |

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/market/assets` | Returns all xStock tokens and crypto assets with symbol, name, ticker, type, and address. Does not include live prices — prices are fetched separately per symbol. | None (public) |

Example response shape:

```json
{
  "xstocks": [
    {
      "symbol": "xTSLA",
      "xstocks_ticker": "TSLAx",
      "name": "Tesla Inc.",
      "ticker": "TSLA",
      "type": "stock",
      "address": "0x..."
    }
  ],
  "crypto": [
    {
      "symbol": "ETH",
      "name": "Ethereum",
      "type": "crypto"
    }
  ]
}
```

## Firestore Schema

None. The token registry is loaded entirely in-memory from `XSTOCK_REGISTRY` at service startup. There is no Firestore collection for token metadata. This eliminates read latency and Firestore costs for a dataset that changes infrequently (new tokens are added via code deploy, not database writes).

## Configuration

| Environment Variable | Description | Required |
|---------------------|-------------|----------|
| `COINMARKETCAP_API_KEY` | CoinMarketCap Pro API key for crypto price quotes | Yes (crypto prices) |
| Backed Finance API URL | Hardcoded to `https://api.backed.fi/api/v2/public` — no env override needed | N/A |
| Price cache TTL | Hardcoded to 60 seconds in `prices.py` — not configurable at runtime | N/A |

## Current Limitations

- **Placeholder contract addresses**: Several of the 61 tokens in `XSTOCK_REGISTRY` have placeholder or unverified Ethereum mainnet contract addresses. Before executing any trade, the Trade Execution agent (Node 6) must validate the address against the Backed Finance API or Etherscan. Never use an address from this registry as a final settlement address without verification.
- **No on-chain price verification**: Prices are sourced from Backed Finance API and CoinMarketCap only. There is no cross-check against Uniswap V3 pool prices or Chainlink oracle feeds. Stale or incorrect API prices would not be caught at this layer.
- **No real-time streaming**: Price data is polled on-demand with a 60-second TTL cache. There is no WebSocket or SSE stream for live price ticks. Price displayed to the user may be up to 60 seconds old.
- **No on-chain liquidity check**: The resolver does not verify that a Uniswap V3 pool exists with sufficient liquidity for the resolved token before forwarding to the trade pipeline. Low-liquidity tokens will fail at the quote stage, not the resolution stage.
- **Extended registry not fully covered**: Backed Finance publishes 80+ tokens. The current registry contains 61. Tokens not in the list are not resolvable and the user is directed to xstocks.fi/products to check availability.
- **Alias table is hardcoded**: Ticker aliases (FB → META, GOOGL → GOOG) are maintained as a static dict. Any new dual-class or legacy ticker aliases must be added manually in code.

## Related

- `agents/xstock-resolver.md` — Agent definition for Node 1 of the trade pipeline
- `agents/trade-execution.md` — Trade Execution agent (Node 6) that consumes resolver output
- `agents/guardrails.md` — Guardrails agent that enforces US person / sanctioned country blocks after resolution
- `specs/project-spec.md` — Full Merlin platform specification
- `sources/futurewallet-docs.md` — FutureWallet xStocks section (upstream reference)
- https://xstocks.fi/products — Live xStocks token registry with current contract addresses
- https://api.backed.fi/api/v2/public — Backed Finance public API (price + NAV data)


---

# Privacy System (Railgun + Privacy Pools)

## Status: Planned (Phase 6)

---

## Overview

Merlin supports three transaction modes — public, shielded (Railgun), and compliant (Privacy Pools) — selectable per trade with no change to the public account model. Railgun provides full, unconditional privacy using UTXO-based zk-SNARKs: tokens enter an on-chain pool as encrypted commitments and can only be redeemed by proving ownership of the spending key. Privacy Pools is a newer, WIP alternative that adds optional selective disclosure via an Association Set Provider (ASP), allowing users to prove membership in a compliant set without revealing their transaction graph, which is the protocol of choice when regulatory transparency is required.

---

## Architecture

### Data Flow: Shielded Transaction

```
User selects "private" mode
        |
        v
WalletManager (BIP-32 seed in memory)
        |
        |-- Spending key: m/44'/1984'/0'/0'/{index}  (signs proofs)
        |-- Viewing key:  m/420'/1984'/0'/0'/{index}  (scans notes)
        |
        v
Merlin Host (implements @kohaku-eth/plugins Host interface)
  host.keystore.deriveAt(path)  ->  Hex private key
  host.storage.get/set(key)     ->  plaintext note/merkle cache
  host.provider                 ->  EthereumProvider (getLogs, waitForTransaction, ...)
  host.network.fetch(...)       ->  relayer/broadcaster HTTP calls
        |
        v
PrivacyService (src/modules/privacy/privacy.service.ts)
  registerProtocol(PrivacyProtocol.RAILGUN, chainId, RailgunProvider, config)
  getProvider(protocol, chainId)  ->  lazily init + return IPrivacyProvider
        |
        v
IPrivacyProvider implementation (to be built in Phase 6)
  Wraps createRailgunPlugin(host, params)  [from @kohaku-eth/railgun]
  Wraps createPPv1Plugin(host, params)     [from @kohaku-eth/privacy-pools]
        |
        v
Kohaku PluginInstance<RailgunAddress, ...>
  instanceId()           ->  0zk{masterPubKey}{viewingPubKey}{chainId}{version}
  balance([asset])       ->  AssetAmount[]  (sum across merkle trees)
  prepareShield(asset)   ->  PublicOperation  (RailgunSmartWallet.shield() calldata)
  prepareTransfer(asset) ->  PrivateOperation (ZK proof, transact() calldata)
  prepareUnshield(asset) ->  PrivateOperation (ZK proof, recipient output)
        |
        v
TransactionService routes result:
  PublicOperation  -> signed by WalletManager EOA, broadcast as normal tx
  PrivateOperation -> broadcast via Railgun relayer (no on-chain sender linkage)
```

### Privacy Mode Selection (per trade)

```
TransactionMode = 'public' | 'shielded' | 'compliant'

public    -> EOA signs + submits directly (or via EIP-7702 bundler with USDC gas)
shielded  -> Railgun: full privacy, no relayer knows sender
compliant -> Privacy Pools: optional ASP membership proof, selective disclosure
```

---

## Implementation Details

### Three Transaction Modes

| Mode | Protocol | Privacy Guarantee | Compliance | Status |
|------|----------|-------------------|------------|--------|
| `public` | None (EOA direct) | None | Full on-chain transparency | Live |
| `shielded` | Railgun | Full: sender, receiver, amount hidden | None — no disclosure | Phase 6 |
| `compliant` | Privacy Pools | Sender/amount hidden; can prove ASP membership | Optional PPOI disclosure | Phase 6 (WIP) |

### Railgun Integration (`@kohaku-eth/railgun`)

**Package status:** Production-ready.

**Plugin interface** (from `packages/plugins/src/base.ts`):

```typescript
// All features enabled for Railgun
type RGInstance = PluginInstance<
    RailgunAddress,    // "0zk{...}"
    {
        assetAmounts: {
            input: AssetAmount,
            internal: AssetAmount,
            output: AssetAmount,
        },
        privateOp: RGPrivateOperation,  // PrivateOperation & { bar: 'hi' }
        features: {
            prepareShield: true,
            prepareShieldMulti: true,
            prepareTransfer: true,
            prepareTransferMulti: true,
            prepareUnshield: true,
            prepareUnshieldMulti: true,
        }
    }
>;
```

**Factory:**

```typescript
const createRailgunPlugin: CreatePluginFn<RGInstance, RGPluginParameters> =
    (host: Host, params: RGPluginParameters) => RGInstance;
```

**Host requirements (Merlin must provide):**

```typescript
// Merlin constructs a Host satisfying @kohaku-eth/plugins Host interface:
const host: Host = {
    keystore: {
        deriveAt(path: string): Hex {
            // delegate to WalletManager BIP-32 derivation
            // path restricted to m/44'/1984'/... and m/420'/1984'/...
        }
    },
    storage: {
        // plaintext — backed by IndexedDB or localStorage
        // used for note cache, merkle tree snapshots, last-synced block
        set(key: string, value: string): void { ... },
        get(key: string): string | null { ... },
    },
    provider: {
        // wraps the Merlin ProviderService EthereumProvider
        getChainId(): Promise<bigint>,
        getLogs(params: Filter): Promise<TxLog[]>,
        getBlockNumber(): Promise<bigint>,
        waitForTransaction(txHash: string): Promise<void>,
        getBalance(address: string): Promise<bigint>,
        getCode(address: string): Promise<string>,
        getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null>,
        request(req: Pick<RpcRequest, 'method' | 'params'>): Promise<unknown>,
    },
    network: {
        fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
        // used by Railgun for relayer/broadcaster HTTP calls
    },
};
```

### Key Derivation Paths

| Key | BIP-32 Path | Purpose |
|-----|-------------|---------|
| ETH account | `m/44'/60'/0'/0/{index}` | Public signing, funding shield tx |
| Railgun spending | `m/44'/1984'/0'/0'/{index}` | Signs ZK proofs, creates nullifiers |
| Railgun viewing | `m/420'/1984'/0'/0'/{index}` | Scans chain for received notes |

**Derivation is deterministic** — same seed always produces the same Railgun keys. The spending key signs circuit inputs; the viewing key is shared with the indexer to scan for incoming notes without spending authority.

### Shield Operation (Public -> Private)

1. Call `plugin.prepareShield({ asset: { __type: 'erc20', contract: tokenAddress }, amount })`
2. Kohaku returns a `PublicOperation` containing `RailgunSmartWallet.shield()` calldata
3. Merlin signs and submits the transaction from the EOA (or via EIP-7702 bundler)
4. On confirmation, the token is locked in the Railgun smart wallet contract
5. An encrypted `ShieldNote` is created: `Note = { value, token, owner: viewingPubKey }`
6. The note is stored in the local notebook (sparse merkle tree, one per asset)
7. For ETH: wrap to WETH first, then shield via RelayAdapt

**Railgun contract addresses:**

| Network | Chain ID | RailgunSmartWallet |
|---------|----------|-------------------|
| Mainnet | 1 | `0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9` |
| Sepolia | 11155111 | TBD — verify from Kohaku source before use |

### Unshield Operation (Private -> Public)

1. Call `plugin.prepareUnshield({ asset, amount }, toAddress)`
2. Kohaku selects unspent UTXOs (notes) from the local notebook
3. Generates a zk-SNARK proof: spends selected notes, produces nullifiers, specifies recipient output
4. Returns a `PrivateOperation` containing encoded `transact()` calldata and the proof
5. Broadcast via Railgun relayer — the relayer submits on-chain; sender address is not linked
6. On confirmation, the tokens arrive at `toAddress` as a public ERC-20 balance
7. For ETH: WETH unshielded via RelayAdapt, unwrapped to ETH at recipient

### Private Transfer (Private -> Private, Within the Pool)

1. Call `plugin.prepareTransfer({ asset, amount }, recipientRailgunAddress)`
2. Kohaku selects UTXOs, generates ZK proof with recipient's `viewingPubKey` as output owner
3. Returns a `PrivateOperation` — broadcast via relayer
4. Recipient's indexer scans for new notes using their viewing key

**Multi-asset variants:** `prepareShieldMulti`, `prepareTransferMulti`, `prepareUnshieldMulti` — same flow, batched into a single proof/transaction.

### ZK-SNARK Proof Generation

- Circuits: Circomlibjs (bundled within `@kohaku-eth/railgun`)
- Hashing: Poseidon (ZK-friendly field hash) for note commitments and nullifiers; Keccak256 for on-chain binding
- Proof system: Groth16 (compact proof, fast on-chain verification)
- Proof is generated client-side in the browser/app — the proving key is loaded from the package
- Generation is async and CPU-intensive; expect 2–8 seconds per proof on a modern device
- The relayer receives the proof + encoded calldata but never sees plaintext note values

### Merkle Tree Indexing

- One sparse merkle tree per asset, one notebook per account
- Merkle roots are stored on-chain in the Railgun contract; local tree is reconstructed from logs
- Indexing uses `host.provider.getLogs()` to scan `Shield`, `Transact`, and `Nullifier` events
- Block-level snapshots are persisted via `host.storage` so syncing resumes from last processed block
- Balance = sum of all uncommitted notes in the local tree that have not been nullified
- **Sync must complete before calling `balance()`, `prepareTransfer()`, or `prepareUnshield()`** — the indexer must be current with the chain or operations will use stale state

### Privacy Pools Integration (`@kohaku-eth/privacy-pools`)

**Package status:** WIP — interfaces are stable but treat as pre-production.

**Factory:**

```typescript
// src: packages/privacy-pools/src/v1/factory.ts
const createPPv1Plugin: CreatePluginFn<PPv1Instance, PPv1PluginParameters> =
    (host: Host, params: PPv1PluginParameters) => PPv1Instance;

// PPv1PluginParameters:
interface PPv1PluginParameters {
    entrypoint: IEntrypoint;       // { address, deploymentBlock }
    accountIndex?: number;          // BIP-32 account index (default: 0)
    broadcasterUrl: string | Record<string, string>;  // relayer URL(s)
    ipfsUrl?: string;               // IPFS gateway for ASP trees
    aspServiceFactory?: () => IAspService;
    initialState?: Record<string, RootState>;
}
```

**Key derivation** (from `packages/privacy-pools/src/account/keys.ts`):

```
m/28784'/1'/{accountIndex}'/{secretType}'/{depositIndex}'/{secretIndex}'

secretType: 0 = nullifier, 1 = salt
secretIndex: 0 = deposit secret, 1+ = withdrawal secrets

Derivation produces:
  nullifier = Poseidon(chainId, entrypointAddress, nullifierSecret)
  salt      = Poseidon(chainId, entrypointAddress, saltSecret)
  precommitment = Poseidon(nullifier, salt)
  nullifierHash = Poseidon(nullifier)
```

**Enabled features:**

```typescript
type PPv1Instance = PluginInstance<
    PPv1Address,   // Ethereum address (0x...)
    {
        features: {
            prepareShield: true,    // deposit
            prepareUnshield: true,  // withdrawal (via relayer)
            // No prepareTransfer — Privacy Pools v1 does not support pool-internal transfers
        },
        extras: {
            notes(assets, includeSpent?): Promise<INote[]>,
            ragequit(labels): Promise<PPv1PublicOperation>,  // emergency exit
            sync(): Promise<void>,
        }
    }
>;
```

**ASP-based selective disclosure:**

- The ASP (Association Set Provider) publishes Merkle trees of compliant deposit commitments
- On withdrawal, the user can optionally include a PPOI (Privacy Pools Optimistic Inclusion) proof
- The PPOI proof shows membership in the ASP-approved set without revealing which deposit is being withdrawn
- `aspServiceFactory` defaults to `IPFSAspService` — fetches ASP trees from IPFS
- `0xBow` is the default ASP implementation (`data/0xbowAsp.service.ts`)

**Ragequit** — emergency exit bypassing the relayer. Produces a `PPv1PublicOperation` with raw `ragequit()` calldata that the user submits directly. Only unapproved (non-ASP-included) deposits can be ragequitted.

**Privacy Pools contract addresses:**

| Network | Chain ID | Entrypoint | Deployment Block |
|---------|----------|-----------|-----------------|
| Mainnet | 1 | `0x6818809EefCe719E480a7526D76bD3e561526b46` | 22153713 |
| Sepolia | 11155111 | `0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB` | 8461453 |

### Post-Quantum Future (`@kohaku-eth/pq-account`)

**Package status:** Production-ready on Sepolia.

When post-quantum mode is active, every transaction (including privacy operations) is signed with a hybrid signature: both an ECDSA (pre-quantum) sig and a lattice-based (post-quantum) sig must be valid. Encoded as `abi.encode(preQuantumSig, postQuantumSig)`. This is an ERC-4337 smart account deployed per user — not compatible with the current pure-EOA model.

Supported schemes: ECDSA secp256k1 (K1), P-256 (R1), FALCON, ML-DSA, ML-DSA ETH.

Sepolia verifier contracts:
- MLDSA: `0x10c978aacef41c74e35fc30a4e203bf8d9a9e548`
- MLDSAETH: `0x710f295f1715c2b08bccdb1d9841b4f833f6dde4`
- FALCON: `0x0724bb7c9e52f3be199964a2d70ff83a103ed99c`
- ETHFALCON: `0x146f0d9087001995ca63b648e865f6dbbb2d2915`
- Hybrid Verifier: `0xD22492F0b9dd284a9EC0fFef3C1675deA9f01d85`

Post-quantum signing is planned for Phase 7+ after the EOA/7702 model is fully stable.

### Private Trade Flow (Shield -> Swap -> Shield)

The shielded xStock trade route — implemented in Phase 6D:

```
1. User: "buy $10 of Tesla privately"
2. Chat Intent Parser -> { asset: 'xTSLA', amount: $10, mode: 'shielded' }
3. Guardrails check
4. Trade Executor (shielded path):
   a. Shield USDC:
      plugin.prepareShield({ asset: USDC, amount })
      → EOA submits PublicOperation to RailgunSmartWallet
      → Wait for shield confirmation (indexer sync)
   b. Private swap option A (unshield → swap → re-shield):
      plugin.prepareUnshield({ asset: USDC, amount }, swapIntermediaryAddress)
      → Uniswap V3 swap: USDC → xTSLA
      plugin.prepareShield({ asset: xTSLA, amount })
   c. Private swap option B (direct unshield to user):
      plugin.prepareUnshield({ asset: USDC, amount }, userEOA)
      → Public Uniswap swap
      plugin.prepareShield({ asset: xTSLA, amount })
5. Confirm + persist
```

Option A preserves stronger privacy (swap router does not see the EOA) but requires two separate proof generations. Option B is simpler to implement and is the Phase 6 default.

---

## Code Map

| Path | Purpose |
|------|---------|
| `src/modules/privacy/privacy.service.ts` | `PrivacyService` — protocol registry, lazy init, facade methods |
| `src/modules/privacy/privacy.types.ts` | Re-exports all privacy types from `src/types/privacy.ts` |
| `src/types/privacy.ts` | `IPrivacyProvider`, `ShieldParams`, `UnshieldParams`, `PrivateTransferParams`, `ShieldedBalance`, `PrivacyProtocol` enum |
| `src/modules/privacy/index.ts` | Public module API |
| `src/modules/transaction/transaction.service.ts` | Routes `mode: 'shielded'` txs to `PrivacyService` |
| `sources/kohaku-master/kohaku-master/packages/plugins/src/base.ts` | `PluginInstance<TAccountId, C>`, `TxFeatureMap`, `CreatePluginFn` |
| `sources/kohaku-master/kohaku-master/packages/plugins/src/host/index.ts` | `Host`, `Keystore`, `Storage`, `SecretStorage`, `Network` interfaces |
| `sources/kohaku-master/kohaku-master/packages/plugins/src/shared.ts` | `AssetAmount`, `AssetId`, `PrivateOperation`, `PublicOperation` |
| `sources/kohaku-master/kohaku-master/packages/plugins/examples/railgun.ts` | `RGInstance` type, `createRailgunPlugin` example |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/v1/factory.ts` | `createPPv1Plugin`, `createPPv1Broadcaster` |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/v1/interfaces.ts` | `PPv1Instance`, `PPv1PluginParameters`, `PPv1AssetAmount` |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/plugin/base.ts` | `PrivacyPoolsV1Protocol` — full implementation |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/plugin/interfaces/protocol-params.interface.ts` | `IStateManager`, `INote`, `PPv1PrivateOperation`, `PPv1PublicOperation` |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/account/keys.ts` | `SecretManager`, Privacy Pools BIP-32 key derivation |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/config.ts` | `PrivacyPoolsV1_0xBow` contract addresses (mainnet + Sepolia) |

---

## API Endpoints

None yet — planned. The Merlin backend does not participate in privacy operations directly. All ZK proofs are generated client-side. The backend's role is limited to:

- Persisting trade intent + outcome in Firestore (no private data)
- Providing the RPC URL for the frontend's `EthereumProvider`
- Enforcing guardrails before the privacy operation is initiated

Possible future endpoint: `POST /trade/shield-status` — poll for indexer sync state.

---

## Firestore Schema

None yet — planned. Privacy state (notes, merkle trees, nullifiers, last-synced block) is stored **client-side only**, never sent to the backend. This is a hard privacy requirement.

Trade records for shielded trades will be stored in Firestore with only the following fields:

```
trades/{userId}/{tradeId}:
  mode: 'shielded' | 'compliant'
  asset: string              // token symbol only
  side: 'buy' | 'sell'
  amountUsd: number          // approximate, from intent
  status: 'pending' | 'confirmed' | 'failed'
  timestamp: Timestamp
  // NO tx hash, NO addresses, NO amounts in base units
```

The on-chain transaction hash must NOT be stored in Firestore for shielded trades — it can be used to deanonymize the user by correlating the shield tx with the account.

---

## Configuration

### Railgun

```typescript
// Phase 6: Merlin will pass this config to the RailgunProvider IPrivacyProvider impl
interface RailgunConfig extends PrivacyModuleConfig {
    protocol: PrivacyProtocol.RAILGUN;
    chainId: 1 | 11155111;
    rpcUrl: string;                   // from ETH_RPC_URL / SEPOLIA_RPC_URL env vars
    railgunContractAddress: string;
    // Indexing range
    deploymentBlock: bigint;
    // Storage prefix for note/merkle cache keys in host.storage
    storagePrefix?: string;
}

const RAILGUN_CONTRACTS = {
    1:         '0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9',  // mainnet
    11155111:  'TBD',                                           // Sepolia — verify from Kohaku source
} as const;
```

### Privacy Pools

```typescript
// from sources/kohaku-master/.../packages/privacy-pools/src/config.ts
const PRIVACY_POOLS_ENTRYPOINTS = {
    1: {
        entrypointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        deploymentBlock: 22153713n,
    },
    11155111: {
        entrypointAddress: '0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB',
        deploymentBlock: 8461453n,
    },
} as const;
```

### Relayer / Broadcaster

Railgun and Privacy Pools both use relayers to submit `PrivateOperation` transactions on-chain without linking the originating EOA. The relayer URL is a runtime config, not hardcoded. For Railgun, the broadcaster API is specified via `RGBroadcasterParameters.broadcasterUrl`. For Privacy Pools, via `PPv1PluginParameters.broadcasterUrl`.

---

## What Kohaku Provides vs What Merlin Must Build

### Kohaku Provides
- `createRailgunPlugin(host, params)` — full Railgun account with all six operations
- `createPPv1Plugin(host, params)` — Privacy Pools account (shield + unshield + ragequit + notes)
- ZK-SNARK proof generation (Circomlibjs, Groth16, client-side)
- Merkle tree reconstruction and note scanning
- Note encryption/decryption using viewing key
- Nullifier tracking (prevents double-spend)
- Relayer/broadcaster client (`PrivacyPoolsBroadcaster`, Railgun broadcaster)
- ASP integration (`IPFSAspService`, `0xBow` implementation)
- All BIP-32 path derivation logic (Railgun + Privacy Pools paths)
- `EthereumProvider` abstraction (Ethers v6, Viem v2, Colibri, Helios backends)
- `SecretStorage` interface definition (encrypted-at-rest storage API)

### Merlin Must Build
- Concrete `Host` implementation wiring `WalletManager` to `host.keystore.deriveAt()`
- `IPrivacyProvider` implementations for Railgun and Privacy Pools wrapping the Kohaku plugins
- `SecretStorage` implementation backed by IndexedDB (interface exists in Kohaku; no implementation provided)
- Plaintext `Storage` implementation for note/merkle cache (backed by IndexedDB or localStorage)
- `EthereumProvider` adapter connecting Merlin's `ProviderService` to the Kohaku interface
- Path restriction enforcement in `deriveAt()` — only allow Railgun-valid paths
- `TransactionService` routing: detect `mode: 'shielded'` and dispatch to `PrivacyService`
- Shield transaction submission from the EOA (including ERC-20 approval if required)
- Sync scheduling — when to trigger `plugin.balance()` / `stateManager.sync()`
- Frontend privacy mode toggle, shielded balance display, operation status tracking
- Firestore persistence (trade intent only — no private on-chain data)
- Gas estimation for shield transactions (public tx, standard estimation applies)

---

## Current Limitations

- Not yet implemented — full integration is planned for Phase 6
- Phase 6 depends on Phase 4 (EIP-7702 + AmbirePaymaster) being complete, because shielded trades use the bundler broadcast mode for USDC gas payment on shield/unshield public transactions
- Railgun Sepolia contract address is not yet confirmed from the Kohaku source — must be verified before Sepolia testing begins
- Privacy Pools is WIP in Kohaku — treat as pre-production; do not expose to users until the Kohaku team marks it production-ready
- Post-quantum signing (`@kohaku-eth/pq-account`) requires a permanent ERC-4337 smart account, which conflicts with the current pure-EOA model — deferred to Phase 7+
- `prepareTransfer` (pool-internal transfer) is not available in Privacy Pools v1 — only Railgun supports this
- `SecretStorage` has no Kohaku implementation — Merlin must implement encrypted IndexedDB storage before private keys for viewing/spending can be cached safely
- Hardware wallet support for Railgun is noted as a TODO in the Kohaku source (`host/index.ts` line 73)
- Proof generation is single-threaded; a Web Worker should be used in the browser to avoid blocking the UI (not provided by Kohaku)

---

## Related

- `specs/features/auth-passkey.md` — passkey auth and seed derivation (prerequisite: spending/viewing keys come from the same BIP-39 seed)
- `specs/tech-stack.md` — full stack overview, privacy layer table, private trade flow diagram
- `specs/development-plan.md` — Phase 6 task breakdown (6A–6F)
- `sources/kohaku-master/kohaku-master/packages/plugins/` — plugin base interfaces
- `sources/kohaku-master/kohaku-master/packages/privacy-pools/` — Privacy Pools full source
- `src/modules/privacy/` — Merlin privacy module (service, types, index)
- `src/modules/transaction/` — TransactionService (routes public vs shielded)


---

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


---

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


---

# EIP-7702 Gasless Trading

## Status: Live (UserOp construction) | In Progress (bundler submission)

## Overview

Merlin uses EIP-7702 (Pectra) to temporarily delegate an EOA to the `AmbireAccount7702` smart contract, enabling batch execution and smart account logic without a permanent on-chain deployment. Gas is paid in USDC instead of ETH via the `AmbirePaymaster`, which covers ETH gas upfront from its EntryPoint deposit and debits the user's USDC balance atomically as part of the batch. The full execution path uses ERC-4337 v0.7: the backend constructs a `PackedUserOperation`, fetches a paymaster signature, and returns the unsigned UserOp to the frontend for signing and bundler submission.

## Architecture

```
EOA (user's private key)
  |
  | signs EIP-7702 authorization (first delegation only)
  | signs UserOp hash
  v
Pimlico Bundler (eth_sendUserOperation)
  |
  v
ERC-4337 EntryPoint (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
  |-- validatePaymasterUserOp --> AmbirePaymaster (0xA8B267...)
  |                                  verifies relayer ECDSA sig
  |                                  pays ETH gas from deposit
  |
  |-- calls --> EOA (now delegated to AmbireAccount7702 via EIP-7702)
                  |
                  | executeBySender(Transaction[])
                  |-- approve token_in --> Uniswap SwapRouter02
                  |-- exactInputSingle --> Uniswap SwapRouter02
                  |-- fee call (USDC transfer) --> AmbirePaymaster reimbursal
```

## Implementation Details

### EIP-7702 Delegation (Pectra)

The EOA temporarily acquires smart account code by signing an EIP-7702 authorization off-chain:

```
{ chain_id, address: AmbireAccount7702, nonce: <EOA tx nonce> }
```

This authorization is included in a Type 4 transaction. After the block is processed, the EOA's code slot points to `AmbireAccount7702`. Delegation is required only once per EOA (or on re-delegation). The backend always returns `eip7702_auth` in the `quote-gasless` response; the frontend checks on-chain whether delegation is already active and includes the authorization in the UserOp submission only when needed.

### AmbirePaymaster — USDC Gas Payment

The `AmbirePaymaster` validates UserOps by verifying an ECDSA signature from the Ambire relayer. The relayer signs a hash over:

```
keccak256(abi.encode(
    block.chainid, paymaster, entryPoint,
    validUntil, validAfter,
    sender, nonce, initCode, callData,
    accountGasLimits, preVerificationGas, gasFees
))
```

`paymasterAndData` layout in a v0.7 `PackedUserOperation`:

```
paymaster address        (20 bytes)
paymasterVerGasLimit     (16 bytes)
paymasterPostOpGasLimit  (16 bytes)
abi.encode(uint48 validUntil, uint48 validAfter, bytes signature)
```

The paymaster has no `postOp` logic — `paymasterPostOpGasLimit` is always 0.

Paymaster resolution order:
1. Pimlico sponsorship policy (`pm_getPaymasterData` with `sponsorshipPolicyId`)
2. Ambire relayer fallback (`https://relayer.ambire.com/v2/paymaster/{chainId}/request`)
3. No paymaster — UserOp returned with `"0x"` paymaster data; frontend decides whether to submit as `self7702` with ETH gas

### ERC-4337 v0.7 PackedUserOperation

The backend constructs the UserOp in unpacked format (as expected by bundler RPC), assembled in `build_gasless_trade()`:

```
sender                   — user's EOA address
nonce                    — from EntryPoint.getNonce(sender, key=0)  [selector: 0x35567e1a]
factory / factoryData    — null (no factory needed with EIP-7702)
callData                 — encode_execute_by_sender(calls)          [selector: 0xabc5345e]
callGasLimit             — from bundler estimation or default 300,000
verificationGasLimit     — from bundler estimation or default 150,000
preVerificationGas       — from bundler estimation or default 50,000
maxFeePerGas             — 2 * nextBaseFee + maxPriorityFee (from eth_feeHistory)
maxPriorityFeePerGas     — 1.5 gwei fixed
paymaster                — AmbirePaymaster address
paymasterData            — signed by relayer (validUntil, validAfter, sig)
paymasterVerGasLimit     — from relayer/estimation or default 42,000
paymasterPostOpGasLimit  — 0
signature                — 0x placeholder (frontend fills with EOA ECDSA sig)
```

### executeBySender Calldata Encoding

`AmbireAccount7702.executeBySender(Transaction[] calldata calls)` — selector `0xabc5345e`.

`Transaction` struct: `{ address to, uint256 value, bytes data }`. All ABI encoding is manual hex — no `eth-abi` or `web3py` dependency. The encoder in `encode_execute_by_sender()` computes per-element byte offsets relative to the array body start, packs the outer ABI envelope (offset=32, length=N), and right-pads all `bytes` fields to 32-byte boundaries.

### Build Flow (`build_gasless_trade`)

1. Encode `executeBySender(calls)` calldata
2. Concurrently fetch: EntryPoint nonce (`eth_call` to EntryPoint), EOA tx nonce (`eth_getTransactionCount`), EIP-1559 fees (`eth_feeHistory`)
3. Assemble stub UserOp with default gas limits and Ambire paymaster stub data (65-byte dummy ECDSA sig: `0x0dc2d37f...1c01`)
4. Call `eth_estimateUserOperationGas` on Pimlico bundler; fall back to defaults on failure
5. Assemble real UserOp with estimated gas limits, empty `paymasterData`
6. Request paymaster signature (Pimlico policy first, then Ambire relayer)
7. Assemble final UserOp with paymaster data
8. Build `eip7702_auth` object using EOA tx nonce
9. Compute informational USDC gas cost estimate
10. Return the full package

### Batch Call Construction (in `trade.py`)

For a USDC-in swap:
```
calls = [
    { to: token_in, value: 0, data: approve(SwapRouter02, amount_in_raw) },
    { to: SwapRouter02, value: 0, data: exactInputSingle(..., amount_in_raw, amount_out_min, 0) }
]
```

The approval is always included in the batch regardless of existing on-chain allowance — the approve and swap execute atomically via `executeBySender`, making pre-flight allowance checks unreliable. A finite approval (`amount_in_raw`) is used rather than `MAX_UINT256` so no residual allowance persists after the UserOp lands.

For native ETH swaps, the approve call is omitted and `value` on the swap call is set to `amount_in_raw`.

Pool fee tier is hardcoded to 3000 (0.3%). `sqrtPriceLimitX96 = 0` (no price limit).

### Gas Stub for Estimation

The paymaster stub data sent to the bundler during `eth_estimateUserOperationGas`:

```
abi.encode(uint48(0), uint48(0), bytes(65-byte dummy sig))
```

The dummy signature (`0dc2d37f...1c01`) matches Ambire's own `getSigForCalculations()` from `userOperation.ts` in ambire-common. This allows the bundler to simulate the full validation path including paymaster code execution.

### Broadcast Modes

| Mode | Gas token | When used |
|------|-----------|-----------|
| `self` | ETH | Simple EOA transfer, cheapest for single calls |
| `self7702` | ETH | Batch calls via delegated EOA, no paymaster |
| `bundler` | USDC | Default for xStock trades — requires paymaster |
| `delegation` | ETH | First-time EIP-7702 activation (Type 4 tx) |
| `relayer` | — | Ambire relayer (legacy, not used for Merlin trades) |

USDC gas payment is exclusively available in `bundler` mode. The `quote-gasless` endpoint always targets `bundler` mode (`broadcast_mode: "bundler"` is stored in the quote record).

### Frontend Responsibilities

1. Receive `GaslessQuoteResponse` from `POST /trade/quote-gasless`
2. Check on-chain whether EOA is already delegated to `AmbireAccount7702`
3. If not delegated: sign EIP-7702 authorization (`eip7702_auth`) with EOA private key
4. Compute and sign the UserOp hash (ERC-4337 v0.7 hash over sender, nonce, callData, gas fields, paymasterAndData, chainId, entryPoint)
5. Set `user_operation.signature` to the 65-byte ECDSA signature
6. Submit `eth_sendUserOperation` to `bundler_url` with the final UserOp and EIP-7702 authorization

## Code Map

| File | Purpose |
|------|---------|
| `backend/services/eip7702.py` | Core: `build_gasless_trade()`, `encode_execute_by_sender()`, `get_entrypoint_nonce()`, `get_eip1559_fees()`, `estimate_user_op_gas()`, `get_paymaster_data()`, `get_pimlico_paymaster_data()`, `estimate_gas_cost_usdc()` |
| `backend/routers/trade.py` | `POST /trade/quote-gasless` endpoint, batch call construction, `GaslessQuoteRequest` / `GaslessQuoteResponse` models |
| `sources/kohaku-commons-main/kohaku-commons-main/` | Ambire commons reference: AccountOp, broadcast modes, gas estimation, paymaster validation hash |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/trade/quote-gasless` | Build a Uniswap swap as a `PackedUserOperation` with USDC gas via AmbirePaymaster. Returns unsigned UserOp + EIP-7702 auth object + bundler URL. |
| POST | `/trade/quote` | Standard swap quote (ETH gas, unsigned tx). Fallback when gasless is unavailable. |
| POST | `/trade/confirm` | Record tx hash after frontend submits on-chain. Marks trade as pending. |
| GET | `/trade/status/{trade_id}` | Poll trade status. Checks `eth_getTransactionReceipt` when status is pending. |

### `POST /trade/quote-gasless`

**Request:**
```json
{
  "token_in": "USDC",
  "token_out": "xTSLA",
  "amount": 100.0,
  "amount_type": "usd",
  "slippage": 0.5,
  "recipient": "0x<EOA address>"
}
```

**Response (`GaslessQuoteResponse`):**
```json
{
  "quote_id": "<uuid>",
  "token_in": { "symbol": "USDC", "address": "0x...", "decimals": 6 },
  "token_out": { "symbol": "xTSLA", "address": "0x...", "decimals": 18 },
  "amount_in": "100.0",
  "amount_out": "0.52341",
  "user_operation": {
    "sender": "0x<EOA>",
    "nonce": "0x...",
    "factory": null,
    "factoryData": null,
    "callData": "0xabc5345e...",
    "callGasLimit": "0x...",
    "verificationGasLimit": "0x...",
    "preVerificationGas": "0x...",
    "maxFeePerGas": "0x...",
    "maxPriorityFeePerGas": "0x...",
    "paymaster": "0xA8B267C68715FA1Dca055993149f30217B572Cf0",
    "paymasterData": "0x...",
    "paymasterVerificationGasLimit": "0x...",
    "paymasterPostOpGasLimit": "0x0",
    "signature": "0x"
  },
  "eip7702_auth": {
    "chain_id": 1,
    "address": "0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d",
    "nonce": 42
  },
  "entrypoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  "bundler_url": "https://api.pimlico.io/v2/1/rpc?apikey=...",
  "paymaster_mode": "pimlico",
  "gas_estimate_usdc": "0.4200",
  "expires_at": "2026-03-24T12:05:00+00:00"
}
```

**Error responses:**
- `400` — token resolution failed, zero amount, insufficient liquidity
- `403` — guardrails blocked the trade
- `502` — Uniswap quote failed
- `503` — `PIMLICO_API_KEY` not configured, or both paymaster relays unreachable

## Contract Addresses

| Contract | Address |
|----------|---------|
| AmbireAccount7702 | `0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d` |
| AmbirePaymaster | `0xA8B267C68715FA1Dca055993149f30217B572Cf0` |
| AmbireFactory | `0x26cE6745A633030A6faC5e64e41D21fb6246dc2d` |
| ERC-4337 EntryPoint | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| USDC (Ethereum mainnet) | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |

## Function Selectors

| Function | Selector |
|----------|----------|
| `executeBySender((address,uint256,bytes)[])` | `0xabc5345e` |
| `EntryPoint.getNonce(address,uint192)` | `0x35567e1a` |

## Gas Defaults

These conservative upper bounds are used when bundler estimation fails or is unavailable. Sized for `approve` (~50k) + Uniswap V3 `exactInputSingle` (~200k) + `executeBySender` overhead (~20k).

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `callGasLimit` | 300,000 | approve + swap + executeBySender overhead |
| `verificationGasLimit` | 150,000 | validateUserOp + ecrecover + storage reads |
| `paymasterVerGasLimit` | 42,000 | validatePaymasterUserOp in AmbirePaymaster |
| `paymasterPostOpGasLimit` | 0 | AmbirePaymaster has no postOp logic |
| `preVerificationGas` | 50,000 | Bundle overhead (calldata encoding, intrinsic) |

## EIP-1559 Fee Strategy

- `maxPriorityFeePerGas`: fixed 1.5 gwei
- `maxFeePerGas`: `2 * nextBaseFee + maxPriorityFee` (fetched from `eth_feeHistory`, last element of `baseFeePerGas` array)
- Fallback on RPC failure: 20 gwei max, 1.5 gwei priority

## USDC Gas Estimation

The informational estimate in `gas_estimate_usdc` uses:

```
total_gas = callGasLimit + verificationGasLimit + preVerificationGas + paymasterVerGasLimit
gas_cost_eth = total_gas * maxFeePerGas / 1e18
gas_cost_usdc = gas_cost_eth * usdc_per_eth  (hardcoded 3500.0 USD/ETH)
```

The ETH/USD rate is a static placeholder. Production should wire this to `services/prices.py`.

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `PIMLICO_API_KEY` | Pimlico bundler + paymaster API key | Yes — gasless returns 503 if unset |
| `PIMLICO_POLICY_ID` | Pimlico sponsorship policy ID for `pm_getPaymasterData` | Yes for Pimlico paymaster; falls back to Ambire relayer if unset |
| `ETH_RPC_URL` | Ethereum mainnet JSON-RPC endpoint | Yes — nonce fetches, fee history, eth_call |
| Ambire relayer URL | `https://relayer.ambire.com` (hardcoded) | Fallback when Pimlico paymaster unavailable |

## Quote Lifecycle

Quotes are held in an in-memory dict (`_quotes`) with a 5-minute TTL (`QUOTE_TTL_SECONDS = 300`). A `trade_id` is written to Firestore at `users/{uid}/trades/{trade_id}` at quote time (status: `quoted`). On `POST /trade/confirm` the frontend supplies a `tx_hash`; the backend updates the Firestore record to `pending` and evicts the quote from memory. On `GET /trade/status/{id}` the backend polls `eth_getTransactionReceipt` and transitions to `confirmed` or `failed`.

## Current Limitations

- **Bundler submission not wired in frontend.** The backend returns a complete UserOp + bundler URL, but the frontend does not yet call `eth_sendUserOperation`. The frontend must: sign the EIP-7702 authorization, sign the UserOp hash, and POST to `bundler_url`.
- **No EIP-7702 authorization signing in frontend.** The `eip7702_auth` object is returned but the frontend has no code to sign it or include it in the submission.
- **No bundler gas estimation for first delegation.** When EIP-7702 delegation is active for the first time, the 7702 gas overhead (`ACTIVATOR_GAS_USED = 29300`) is not added to `preVerificationGas`.
- **Static USDC/ETH rate.** `estimate_gas_cost_usdc` uses a hardcoded 3500 USD/ETH. Should source from `services/prices.py`.
- **Pool fee tier hardcoded.** `exactInputSingle` always uses the 0.3% fee tier (3000). Multi-hop routing or alternate fee tiers are not supported.
- **No `quote-gasless` confirm endpoint.** `POST /trade/confirm` validates the quote ID but does not separately handle the gasless flow — the `user_op_hash` is not recorded, so there is no way to look up a UserOp by hash after submission.
- **Quote expiry in-memory only.** Quotes do not survive a process restart. On Cloud Run with multiple instances, a `confirm` call may land on a different instance than the `quote` call and fail with 404.

## Related

- `specs/project-spec.md` — full project specification
- `backend/services/uniswap.py` — swap calldata encoding, `SELECTOR_APPROVE`, `SELECTOR_EXACT_INPUT_SINGLE`
- `backend/services/guardrails.py` — `validate_trade()` called before UserOp construction
- `sources/kohaku-commons-main/kohaku-commons-main/src/libs/accountOp/accountOp.ts` — AccountOp type, `gasFeePayment`, broadcast modes
- `sources/kohaku-commons-main/kohaku-commons-main/src/libs/userOperation/userOperation.ts` — `getSigForCalculations()` (source of the dummy sig bytes)
- `agents/ambire-7702.md` — Ambire 7702 agent definition
- `agents/trade-execution.md` — 6-step trade pipeline agent


---

# Portfolio & Balances
## Status: Live
## Overview
Real-time on-chain portfolio tracking with ETH and ERC-20 token balances fetched via JSON-RPC, combined with USD price data from CoinMarketCap (crypto) and Backed Finance (xStocks). Includes PnL calculation from trade history and historical portfolio snapshots.
## Architecture
Frontend requests portfolio → Backend fetches on-chain balances (eth_call for each token) → Fetches USD prices → Combines into portfolio view → Returns with total value and per-asset breakdown.
## Implementation Details
- ETH balance: eth_getBalance RPC call
- ERC-20 balances: balanceOf(address) via eth_call for each token
- Only returns tokens with balance > 0
- Price sources:
  - Crypto (ETH, USDC, USDT): CoinMarketCap API (CMC_BASE_URL: https://pro-api.coinmarketcap.com)
  - xStocks: Backed Finance public API (https://api.backed.fi/api/v2/public) — no auth required
- In-memory price cache with 60-second TTL
- PnL calculation from Firestore trade history
- Historical snapshots stored in Firestore
## Code Map
| File | Purpose |
|------|---------|
| backend/services/balances.py | On-chain ETH + ERC-20 balance fetching |
| backend/services/prices.py | Price oracle (CoinMarketCap + Backed Finance) |
| backend/services/provider.py | JSON-RPC client (eth_call, eth_getBalance) |
| backend/routers/portfolio.py | 4 portfolio endpoints |
| backend/db/trades.py | Trade record persistence for PnL |
| frontend/app/dashboard/page.tsx | Portfolio dashboard UI |
| frontend/app/assets/page.tsx | Asset list/detail UI |
## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/portfolio | Real on-chain balances + USD prices |
| GET | /api/v1/portfolio/pnl | Profit/loss from trade history |
| GET | /api/v1/portfolio/history | Historical portfolio snapshots |
| GET | /api/v1/trades | Paginated trade history |
## Firestore Schema
- trades/{id}: {user_id, side, asset, symbol, amount, amount_type, price_usd, total_usd, tx_hash, status, created_at}
- portfolio_snapshots/{id}: {user_id, total_usd, assets: [...], timestamp}
## Configuration
| Variable | Description |
|----------|-------------|
| ETH_RPC_URL | Ethereum mainnet RPC endpoint |
| SEPOLIA_RPC_URL | Sepolia testnet RPC endpoint |
| COINMARKETCAP_API_KEY | CoinMarketCap API key |
## Current Limitations
- Sequential balance fetching (no batching/multicall)
- 60-second price cache may show stale prices
- No WebSocket for real-time price updates
- No charting or historical price data
- PnL calculation is basic (cost basis from trade history only)
## Related
- [trading-engine.md](trading-engine.md) — trades feed into PnL
- [xstock-resolver.md](xstock-resolver.md) — token registry for balance queries


---

# Deployment & Infrastructure
## Status: Live
## Overview
Merlin runs on Google Cloud Platform with Firebase Hosting for the PWA frontend and Cloud Run for the FastAPI backend. Firestore provides real-time database capabilities. All secrets are managed via Google Secret Manager in production.
## Architecture
```
User → Firebase Hosting (PWA) → /api/** rewrite → Cloud Run (FastAPI)
                                                    ↓
                                              Firestore (database)
                                              Secret Manager (secrets)
                                              Artifact Registry (Docker images)
```
## Implementation Details
- GCP Project: merlin-wallet-prod (europe-west1)
- Firebase Hosting: site "merlin-app" → https://merlin-app.web.app
- Cloud Run: merlin-api service, auto-scaling, serverless
- API proxy: firebase.json rewrites /api/** to Cloud Run service
- Firestore: Native mode, real-time sync, security rules in firestore.rules
- Artifact Registry: merlin-docker repository for Docker images
- Docker: multi-stage build for backend
- CORS: configurable via CORS_ORIGINS env var
- CI/CD: GitHub Actions (planned)
- Terraform: IaC (planned)
## Code Map
| File | Purpose |
|------|---------|
| firebase.json | Hosting config, API rewrites to Cloud Run |
| firestore.rules | Firestore security rules (user-scoped read/write) |
| .firebaserc | Firebase project alias (merlin-wallet-prod) |
| backend/main.py | FastAPI app, CORS middleware, router registration |
| backend/Dockerfile | Docker build for Cloud Run |
| .env.example | Environment variable template |
| .github/ | GitHub Actions CI/CD (planned) |
## Service URLs
| Service | URL |
|---------|-----|
| Frontend | https://merlin-app.web.app |
| Backend API | https://merlin-api-795485039698.europe-west1.run.app |
| API (via proxy) | https://merlin-app.web.app/api/v1/* |
## Secret Manager Secrets
| Secret | Purpose |
|--------|---------|
| ETH_RPC_URL | Ethereum mainnet RPC |
| SEPOLIA_RPC_URL | Sepolia testnet RPC |
| ANTHROPIC_API_KEY | Anthropic Claude for AI chat |
| GROK_API_KEY | Grok for social sentiment |
## Configuration
| Variable | Description | Required |
|----------|-------------|----------|
| GCP_PROJECT_ID | merlin-wallet-prod | Yes (deploy) |
| GCP_ACCOUNT | mrboups@gmail.com | Yes (deploy) |
| GCP_REGION | europe-west1 | Yes (deploy) |
| CORS_ORIGINS | Comma-separated allowed origins | Production |
| DEBUG | Enable verbose logging | No |
## Deployment Commands
```bash
# Backend (Cloud Run)
gcloud builds submit --project merlin-wallet-prod --region europe-west1
gcloud run deploy merlin-api --project merlin-wallet-prod --region europe-west1

# Frontend (Firebase Hosting)
firebase deploy --only hosting:merlin-app --project merlin-wallet-prod

# Docker
docker build -t europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest .
docker push europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest
```
## Current Limitations
- No CI/CD pipeline yet (manual deploys)
- No Terraform IaC (manual GCP setup)
- No staging environment (prod only)
- No health check monitoring/alerting
- No CDN configuration
- No rate limiting at infrastructure level
## Related
- [auth-passkey.md](auth-passkey.md) — auth endpoints on Cloud Run
- [ai-chat-pipeline.md](ai-chat-pipeline.md) — chat streaming on Cloud Run
