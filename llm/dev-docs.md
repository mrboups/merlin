# Merlin Developer Documentation

Developer documentation for the Merlin platform. These docs cover architecture, implementation details, and how to extend the system.

Merlin is a privacy-preserving non-custodial wallet for Ethereum. Users trade tokenized stocks (xStocks) and crypto through conversational AI agents. Every transaction can be public, shielded (Railgun), or compliant (Privacy Pools).

## Table of Contents

### System Design
- [Architecture Overview](architecture.md) — Module map, data flow diagrams, key design decisions

### Frontend
- [Frontend Guide](frontend-guide.md) — Pages, components, state management, auth flow, design system

### Backend
- [Backend Guide](backend-guide.md) — Project structure, routers, services, Firestore schema, patterns

### Feature Pipelines
- [Auth Flow](architecture.md#auth-flow) — Passkey registration, WebAuthn ceremonies, seed encryption, session management
- [Chat Pipeline](architecture.md#chat-flow) — SSE streaming, Claude tool use, intent parsing, confirmation loop
- [Trading Pipeline](architecture.md#trade-flow) — Quote → simulate → policy → execute → confirm → persist
- [Privacy System](architecture.md#privacy-flow) — Railgun shielding, private swaps, Privacy Pools compliance mode

### Reference
- [API Reference](backend-guide.md#api-endpoints) — All HTTP endpoints, request/response shapes
- [Deployment Guide](backend-guide.md#deployment) — GCP Cloud Run (backend) + Firebase Hosting (frontend)

## Quick Start

```bash
# Frontend
cd frontend
pnpm install
pnpm dev          # Turbopack dev server on :3000

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# SDK
pnpm install
pnpm dev          # tsup watch mode
```

## Environment Variables

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

Key variables:

| Variable | Used By | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | Frontend | FastAPI backend URL |
| `NEXT_PUBLIC_WEBAUTHN_RP_ID` | Frontend | WebAuthn relying party ID |
| `NEXT_PUBLIC_CHAIN_ID` | Frontend | EVM chain (1 = mainnet, 11155111 = Sepolia) |
| `ANTHROPIC_API_KEY` | Backend | Claude Haiku for chat + intent parsing |
| `GROK_API_KEY` | Backend | Grok for social sentiment analysis |
| `ETH_RPC_URL` | Backend | Ethereum mainnet JSON-RPC endpoint |
| `SEPOLIA_RPC_URL` | Backend | Sepolia testnet JSON-RPC endpoint |
| `JWT_SECRET` | Backend | HS256 signing key for session tokens |
| `GCP_PROJECT_ID` | Deploy | Firebase + Cloud Run project |

## Repository Layout

```
merlin/
  frontend/       Next.js 15 PWA
  backend/        FastAPI Python API
  src/            TypeScript SDK (wallet, provider, privacy, transaction)
  agents/         Agent definition files
  specs/          Project specification
  sources/        Upstream reference codebases
  dev/            This documentation
  infra/          Terraform IaC
```


---

# Merlin System Architecture

## System Overview

Merlin is a modular full-stack application composed of four independently deployable layers:

1. **Frontend PWA** — Next.js 15 static export, runs entirely in the browser after load. No server-side rendering. Deployed to Firebase Hosting.
2. **FastAPI Backend** — Python API handling AI chat, trade routing, price feeds, auth ceremonies, and Firestore reads/writes. Deployed to Cloud Run.
3. **TypeScript SDK** (`src/`) — Wallet, provider, privacy, and transaction modules. Compiled to ESM and consumed by the frontend.
4. **Firestore** — Document database for users, conversations, trades, social signals, and WebAuthn challenges.

### Non-Custodial Guarantee

The backend never sees private keys or seed phrases. Key operations follow this principle:

- Seed phrases are generated client-side (BIP-39 via `@scure/bip39`)
- Seeds are encrypted with Scrypt + AES-256-GCM before storage in IndexedDB
- The encryption key is derived from the passkey assertion output — it never leaves the device
- The backend receives only the user's Ethereum address (derived public key) and a JWT session token
- Signing happens in the browser; the backend receives signed transactions, not raw keys

---

## Module Map

```
merlin/
  frontend/                     Next.js 15 PWA (static export, Firebase Hosting)
    app/                        App Router pages
      page.tsx                  / root (renders ChatPage)
      chat/page.tsx             /chat — primary AI chat interface
      dashboard/page.tsx        /dashboard — portfolio overview
      assets/page.tsx           /assets — asset list and token details
      trades/page.tsx           /trades — trade history
      personas/page.tsx         /personas — AI persona management
      social/page.tsx           /social — sentiment feed
      settings/page.tsx         /settings — preferences, seed backup/import
    components/
      ui/                       shadcn/ui primitives (Button, Card, Badge, etc.)
      providers/                ClientProviders, QueryProvider, AuthProvider
      nav-sidebar.tsx           Left navigation sidebar
      auth-gate.tsx             Blocks UI until authenticated
      auth-guard.tsx            Redirects to home if unauthenticated
      system-status.tsx         API health indicator
    lib/
      auth.ts                   AuthContext, WalletManager, seed encryption
      api.ts                    ApiClient — authenticated HTTP client
      constants.ts              API_URL, chain ID, RP ID
      crypto.ts                 Scrypt key derivation, AES-GCM encrypt/decrypt
      wallet.ts                 Address derivation, balance fetching

  backend/                      FastAPI Python API (Cloud Run)
    main.py                     App factory, CORS middleware, router registration
    auth/
      webauthn.py               py-webauthn 2.1.0 — registration + authentication
      session.py                JWT creation/verification (HS256, 24h expiry)
      models.py                 Pydantic request/response models
      dependencies.py           get_current_user FastAPI dependency
    db/
      firestore.py              AsyncClient singleton, collection references
      users.py                  User CRUD + WebAuthn credential storage
      conversations.py          Chat conversation read/write
      trades.py                 Trade record persistence
      signals.py                Social signal read/write
      challenges.py             WebAuthn challenge store (5-min TTL)
    services/
      chat.py                   Claude streaming with tool use (Claude Haiku)
      xstock.py                 61+ xStock token registry + fuzzy matching
      guardrails.py             8 pre-trade safety checks
      uniswap.py                Uniswap V3 quoting + swap calldata (raw ABI)
      eip7702.py                EIP-7702 delegation + UserOp construction
      prices.py                 Price oracle (CoinMarketCap + Backed Finance, 60s cache)
      balances.py               On-chain ETH + ERC-20 balance fetching
      social.py                 Grok sentiment analysis (grok-3-mini)
      provider.py               JSON-RPC client (eth_call, eth_getBalance, eth_sendRawTx)
    routers/
      auth.py                   6 endpoints: register-options, register-verify, auth-options,
                                auth-verify, logout, me
      chat.py                   8 chat endpoints + 1 market data endpoint
      portfolio.py              4 portfolio endpoints
      trade.py                  4 trade endpoints
      personas.py               5 persona endpoints
      social.py                 1 social endpoint

  src/                          TypeScript SDK (ESM, consumed by frontend)
    wallet/                     BIP-44 account derivation, Kohaku TxSigner
    provider/                   JSON-RPC provider abstraction (ethers v6 / viem v2)
    privacy/                    Railgun + Privacy Pools integration
    transaction/                Routes public vs shielded transaction requests
```

---

## Data Flow Diagrams

### Auth Flow

```
Browser                         Backend                         Firestore
  |                               |                               |
  | 1. User clicks "Create Account"|                              |
  |   startRegistration()         |                               |
  | → POST /auth/register-options |                               |
  |                               | generate challenge            |
  |                               | → store challenge (5-min TTL) |→ challenges/{id}
  |                               |← challenge, rp, user options  |
  |                               |                               |
  | navigator.credentials.create()|                               |
  | (WebAuthn ceremony — browser  |                               |
  |  generates passkey on device) |                               |
  |                               |                               |
  | → POST /auth/register-verify  |                               |
  |   { credential, address }     |                               |
  |                               | verify attestation            |
  |                               | verify challenge TTL          |
  |                               | store credential pubkey       |→ users/{address}
  |                               | issue JWT (24h, HS256)        |
  |                               |← { token, user }             |
  |                               |                               |
  | Store JWT in memory           |                               |
  | Generate BIP-39 mnemonic      |                               |
  |   (client-side, @scure/bip39) |                               |
  | Derive Ethereum address       |                               |
  |   (BIP-44 m/44'/60'/0'/0/0)   |                               |
  | Derive AES key from passkey   |                               |
  |   assertion (Scrypt)          |                               |
  | Encrypt seed (AES-256-GCM)    |                               |
  | Store ciphertext in IndexedDB |                               |
  | WalletManager.unlock()        |                               |

Login Flow (returning user):
  |                               |                               |
  | startAuthentication()         |                               |
  | → POST /auth/auth-options     |                               |
  |                               | fetch credentials for address |←users/{address}
  |                               | generate challenge → store    |→challenges/{id}
  |                               |← challenge, allowCredentials |
  |                               |                               |
  | navigator.credentials.get()   |                               |
  |   (WebAuthn assertion)        |                               |
  |                               |                               |
  | → POST /auth/auth-verify      |                               |
  |   { assertion, address }      |                               |
  |                               | verify assertion signature    |
  |                               | verify challenge              |
  |                               | issue JWT                     |
  |                               |← { token, user }             |
  |                               |                               |
  | Derive AES key from assertion |                               |
  | Decrypt seed from IndexedDB   |                               |
  | WalletManager.unlock()        |                               |
  | 15-minute auto-lock timer     |                               |
```

### Chat Flow

```
User types message
  |
  | → POST /chat/message (SSE)
  |   Authorization: Bearer {jwt}
  |   { conversation_id, message, wallet_address }
  |
Backend:
  | 1. get_current_user() — verify JWT
  | 2. Load conversation history from Firestore
  | 3. Build system prompt (persona config + wallet context)
  | 4. Call Claude Haiku with tool definitions:
  |      execute_trade(asset, side, amount, currency, privacy_mode)
  |      get_portfolio()
  |      get_price(symbol)
  |      get_market_data(symbol)
  |
  | 5. Stream text tokens back via SSE as they arrive
  |      event: delta
  |      data: {"content": "Let me check..."}
  |
  | If Claude calls execute_trade tool:
  |   a. Resolve xStock token (fuzzy match via xstock.py)
  |   b. Run 8 guardrail checks (guardrails.py)
  |        - Amount within limits ($10–$10,000)
  |        - Token on allowlist
  |        - Not sanctioned jurisdiction
  |        - Slippage within tolerance
  |        - Not duplicate recent trade
  |        - US person check for xStocks
  |        - Sufficient balance
  |        - Gas estimate within limits
  |   c. Get Uniswap V3 quote
  |   d. Stream trade confirmation card via SSE:
  |        event: trade_confirmation
  |        data: { asset, side, amount, quote, gas_estimate, privacy_mode }
  |
  | User confirms trade in UI
  | → POST /trade/execute
  |   { swap_calldata, signed_tx } (calldata built + signed on client)
  |
  | Backend broadcasts via JSON-RPC → Ethereum
  | Persist trade record → Firestore trades/{id}
  |
  | SSE complete:
  |   event: done
  |   data: {}
  |
Frontend:
  | Parse SSE events
  | Render text tokens incrementally
  | On trade_confirmation: show TradeConfirmCard component
  | On done: finalize message, persist to conversation
```

### Trade Flow

```
1. QUOTE
   Client: build swap params (tokenIn, tokenOut, amountIn, fee tier)
   → POST /trade/quote
   Backend: call Uniswap V3 Quoter (eth_call, raw ABI encoding)
   ← { amountOut, priceImpact, route }

2. SIMULATE
   Client: build swap calldata via Uniswap V3 Router ABI
   → POST /trade/simulate
   Backend: eth_call the swap with caller = user address
   Verify: non-zero output, no revert
   ← { success, simulatedAmountOut, gasEstimate }

3. POLICY (Guardrails)
   Backend: run 8 checks against trade params + simulation result
   Any check failure → reject with reason code
   ← { allowed: true } or { allowed: false, reason: "..." }

4. BUILD + SIGN (client-side)
   WalletManager.unlock() (passkey re-auth if locked)
   Build swap calldata (via SDK uniswap helpers)
   Sign transaction with BIP-44 derived key
   ← { signedTx: "0x..." }

5. EXECUTE
   → POST /trade/execute
   { signedTx }
   Backend: provider.eth_sendRawTransaction(signedTx)
   ← { txHash }

6. CONFIRM + PERSIST
   Backend: poll eth_getTransactionReceipt (up to 3 min)
   On receipt: persist trade record to Firestore
   ← { status: "confirmed", blockNumber, gasUsed }
   Frontend: show success state, update portfolio via TanStack Query invalidation
```

### Privacy Flow (Planned)

```
Shield (deposit to Railgun):
  Client: build RAILGUN deposit calldata
  Sign approval tx (ERC-20 allowance to RAILGUN contract)
  Sign shield tx
  Broadcast both via backend provider
  Wait for UTXO to appear in Railgun merkle tree

Private Swap:
  Client: generate ZK proof of UTXO ownership (in-browser, Railgun WASM)
  Build private swap params (Railgun relayer + Uniswap route)
  Submit to Railgun relayer network (no on-chain caller identity)

Unshield (withdraw from Railgun):
  Client: generate ZK proof
  Build unshield calldata
  Broadcast → funds arrive at public address

Privacy Pools (Compliant Mode):
  Same as Railgun but uses Privacy Pools contracts
  Generates ASP (Association Set Provider) membership proof
  Allows regulatory disclosure while maintaining on-chain privacy
```

---

## Key Design Decisions

### Non-Custodial Architecture

Private keys are generated, stored, and used exclusively in the browser. The FastAPI backend only ever receives:
- The user's Ethereum address (derived public key — safe to share)
- Signed transactions (the signature proves authorization without revealing the key)
- A JWT session token (identifies the user for Firestore reads/writes)

The backend cannot reconstruct a private key. If the backend were compromised, no user funds would be at risk.

### Claude Tool Use Over Regex Parsing

Trade intents are parsed by Claude Haiku using structured tool use, not regex. This handles:
- Natural language variations: "buy a hundred bucks of Apple" → `{asset: "AAPL", amount: 100, currency: "USD", side: "buy"}`
- Ambiguous references: "the stock we discussed earlier" resolved via conversation history
- Multi-step intents: "sell half my Tesla and buy Nvidia with the proceeds"
- Error recovery: model asks for clarification rather than silently misinterpreting

### Raw ABI Encoding (No web3py)

The backend calls Uniswap V3 contracts (Quoter, SwapRouter) using manually constructed ABI-encoded hex strings and `eth_call` via the JSON-RPC provider. This avoids the `web3py` dependency (large, version-conflict-prone) and keeps the backend lean. The encoding logic lives in `services/uniswap.py` and `services/provider.py`.

### SSE Streaming for Chat

Chat responses stream via Server-Sent Events. This gives the user immediate feedback as the AI generates text, rather than waiting for the full response. The frontend opens an EventSource connection; the backend uses FastAPI's `StreamingResponse` with `text/event-stream` content type. Trade confirmation cards are injected into the stream as structured JSON events, not as text, so the frontend can render them as interactive components.

### Stateless JWT Sessions

Sessions are stateless HS256 JWTs with 24-hour expiry. The backend does not store sessions in Firestore — every request is validated by verifying the JWT signature against `JWT_SECRET`. This means no session table, no logout coordination needed server-side, and Cloud Run can scale horizontally without shared session state.

### In-Memory Caching for Prices and Quotes

Price data (CoinMarketCap + Backed Finance) is cached in-process for 60 seconds. Uniswap quotes are cached for 5 minutes. This avoids redundant RPC calls during a conversation where the user asks "what's the price of AAPL?" multiple times. Cloud Run instances are ephemeral, so this cache is per-instance, per-deployment — acceptable for price data latency requirements.

### Static Export (No SSR)

The frontend uses `output: 'export'` in `next.config.ts`, producing a fully static bundle deployed to Firebase Hosting. There is no Next.js server in production. All data fetching is client-side via TanStack Query hitting the FastAPI backend. This simplifies deployment, eliminates cold starts on the frontend, and allows full offline support via the PWA service worker.


---

# Authentication Flow

## Overview
Merlin uses WebAuthn passkeys for passwordless authentication. No email, no social login — just biometrics (Face ID, fingerprint, Windows Hello). The passkey protects an encrypted BIP-39 seed phrase stored locally.

## Registration Flow
```
1. User taps "Create Account"
2. Frontend: POST /api/v1/auth/register/begin {display_name}
3. Backend: generates WebAuthn registration options (RP ID, challenge, user ID)
4. Backend: stores challenge in Firestore (5-min TTL, one-time use)
5. Frontend: navigator.credentials.create() — browser shows biometric prompt
6. User authenticates with biometrics
7. Frontend: POST /api/v1/auth/register/complete {credential attestation}
8. Backend: py-webauthn verifies attestation
9. Backend: creates user in Firestore, stores credential (public key, sign count)
10. Backend: returns JWT (24h expiry) + user_id
11. Frontend: generates BIP-39 mnemonic (24 words) via @scure/bip39
12. Frontend: derives encryption key from credential ID via HKDF-SHA256
13. Frontend: encrypts seed with Scrypt (N=131072, r=8, p=1) + AES-128-CTR + keccak256 MAC
14. Frontend: stores encrypted blob in IndexedDB
15. Frontend: derives ETH address from seed (BIP-44: m/44'/60'/0'/0/0) via @scure/bip32
16. Frontend: PATCH /api/v1/auth/address {address} — stores derived address
```

## Login Flow
```
1. User taps "Login"
2. Frontend: POST /api/v1/auth/login/begin {}
3. Backend: generates authentication options (discoverable credentials)
4. Backend: stores challenge in Firestore (5-min TTL)
5. Frontend: navigator.credentials.get() — browser shows biometric prompt
6. User authenticates
7. Frontend: POST /api/v1/auth/login/complete {credential assertion}
8. Backend: py-webauthn verifies assertion, updates sign count
9. Backend: returns JWT (24h expiry) + user info
10. Frontend: derives encryption key from credential ID via HKDF-SHA256
11. Frontend: decrypts seed from IndexedDB
12. Frontend: WalletManager unlocked — wallet ready
```

## Session Management
- JWT tokens: 24h expiry, stateless (no server-side sessions)
- WalletManager: in-memory decrypted seed with 15-min auto-lock
- Auto-lock: timer resets on activity, wallet re-locks requiring re-authentication
- Re-auth: sensitive operations (export seed, execute trade) require unlocked wallet

## Seed Import/Export
- Import: validate BIP-39 mnemonic → encrypt with current passkey-derived key → store in IndexedDB → re-derive address
- Export: decrypt seed from IndexedDB using in-memory key → display to user (sensitive)

## Security Model
- Private keys never leave the browser
- Backend stores only public key material (WebAuthn credential public key)
- Seed encrypted at rest with passkey-derived secret
- Challenge store: one-time use, 5-min TTL, Firestore-backed
- No session cookies — JWT in Authorization header

## Key Files
| File | Purpose |
|------|---------|
| frontend/lib/auth.ts | AuthContext, login/signup/logout, seed import/export |
| frontend/components/providers/auth-provider.tsx | AuthProvider implementation |
| frontend/components/auth-gate.tsx | Blocks UI until authenticated |
| frontend/components/auth-guard.tsx | Route protection |
| backend/auth/webauthn.py | py-webauthn ceremonies |
| backend/auth/session.py | JWT creation/verification |
| backend/auth/models.py | Pydantic models |
| backend/auth/dependencies.py | get_current_user dependency |
| backend/routers/auth.py | 6 auth endpoints |
| backend/db/users.py | User CRUD |
| backend/db/challenges.py | Challenge storage |


---

# Chat Pipeline

## Overview
Merlin's AI chat uses Claude Haiku with tool use to parse natural language into structured trade intents. Responses stream via Server-Sent Events (SSE).

## Message Flow
```
User types "buy $50 of Tesla"
    |
POST /api/v1/chat {message, conversation_id}
    |
Backend loads conversation history from Firestore
    |
Sends to Claude with system prompt + 3 tools
    |
Claude streams response chunks via SSE:
  1. If tool use detected:
     a. parse_trade_intent -> {side: "buy", asset: "Tesla", amount: 50, amount_type: "usd"}
     b. xStock resolver -> xTSLA (contract: 0x8ad3c73f...)
     c. Guardrails -> 8 safety checks (all pass)
     d. Uniswap V3 quote -> price, amount_out, gas estimate
     e. Trade saved to Firestore as "quoted"
     f. SSE: {"type": "trade_intent", "data": {...quote details...}}
  2. AI generates confirmation text
     SSE: {"type": "text", "content": "I can buy..."}
  3. Stream ends
     SSE: {"type": "done", "conversation_id": "..."}
```

## Claude Tools
1. **parse_trade_intent** — extracts: side (buy/sell), asset (name/ticker), amount (number), amount_type (usd/quantity)
2. **get_price** — fetches current price for any asset
3. **get_portfolio** — returns user's current holdings

## System Prompt
Defines Merlin as an AI trading assistant. Key rules:
- Be concise, never give financial advice
- Always confirm trades before execution
- xStocks are tracker certificates, NOT shares
- Lists available assets (xTSLA, xAAPL, etc.)
- US persons and sanctioned countries blocked
- Ask for clarification on ambiguous requests

## SSE Event Types
| Type | Description |
|------|-------------|
| text | AI response text chunk |
| trade_intent | Parsed trade with quote data |
| price | Price query result |
| portfolio | Portfolio data |
| error | Error message |
| done | Stream complete |

## Conversation Management
- Sessions: create, list, switch between conversations
- History: load/clear messages for a conversation
- Persistence: all messages stored in Firestore
- AI model preference: stored per user (GET/PATCH /chat/provider)

## Key Files
| File | Purpose |
|------|---------|
| backend/services/chat.py | Claude streaming, tool use, intent processing |
| backend/routers/chat.py | 8 chat + 1 market endpoint |
| backend/db/conversations.py | Conversation persistence |
| frontend/app/chat/page.tsx | Chat UI (messages, voice, TTS, trade cards) |


---

# Trading Pipeline

## Overview
Merlin's trading engine builds unsigned Uniswap V3 swap transactions. The backend is non-custodial — it returns unsigned calldata for the frontend to sign and submit.

## 6-Step Pipeline
```
1. QUOTE     — Uniswap V3 QuoterV2 on-chain quote (exactInputSingle)
2. SIMULATE  — eth_call dry-run of the swap
3. POLICY    — 8 guardrail safety checks
4. EXECUTE   — Frontend signs with private key, broadcasts tx
5. CONFIRM   — Wait for on-chain receipt, verify success
6. PERSIST   — Save trade record to Firestore
```

## Standard Trade Flow (ETH gas)
```
POST /api/v1/trade/quote
  -> Resolve asset -> check guardrails -> Uniswap V3 quote
  -> Build unsigned swap tx (approve + exactInputSingle)
  -> Store quote (5-min TTL) -> Return to frontend

Frontend:
  -> User confirms -> sign tx -> broadcast -> poll receipt
  -> POST /api/v1/trade/confirm {quote_id, tx_hash}
```

## Gasless Trade Flow (USDC gas via EIP-7702)
```
POST /api/v1/trade/quote-gasless
  -> Same quote + guardrails
  -> Build batch calls [approve, swap]
  -> Encode executeBySender() for AmbireAccount7702
  -> Assemble PackedUserOperation (ERC-4337 v0.7)
  -> Fetch paymaster signature from Ambire relay
  -> Return unsigned UserOp

Frontend:
  -> Sign EIP-7702 authorization (first time only)
  -> Sign UserOp hash
  -> Submit eth_sendUserOperation to bundler
```

## Guardrail Checks (8 mandatory)
1. Side validation — must be "buy" or "sell"
2. Asset validation — must be known xStock or supported crypto
3. Amount validation — min $1, max $10,000
4. US person block — xStocks blocked for US persons
5. Sanctioned country block — 10 blocked countries
6. Daily limit — max $50,000 daily notional
7. Duplicate detection — no identical trade within 60 seconds
8. Rate limit — max 10 trades per minute

## Contract Addresses (Ethereum Mainnet)
| Contract | Address |
|----------|---------|
| SwapRouter02 | 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 |
| QuoterV2 | 0x61fFE014bA17989E743c5F6cB21bF9697530B21e |
| WETH | 0xC02aaA39b223FE8D0A0e5695F863489fa5693b42 |
| USDC | 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 |
| USDT | 0xdAC17F958D2ee523a2206206994597C13D831ec7 |
| AmbireAccount7702 | 0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d |
| AmbirePaymaster | 0xA8B267C68715FA1Dca055993149f30217B572Cf0 |
| EntryPoint (4337) | 0x0000000071727De22E5E9d8BAf0edAc6f37da032 |

## Key Files
| File | Purpose |
|------|---------|
| backend/services/uniswap.py | Uniswap V3 quoting, swap building, raw ABI encoding |
| backend/services/eip7702.py | EIP-7702 delegation, UserOp construction, paymaster |
| backend/services/guardrails.py | 8 trade safety checks |
| backend/routers/trade.py | 4 trade endpoints |
| backend/db/trades.py | Trade persistence |


---

# Privacy System

## Overview
Merlin integrates privacy at the protocol level via Railgun (full privacy) and Privacy Pools (compliant privacy). Every transaction can be public, shielded, or compliant. This is planned for Phase 6.

## Three Transaction Modes
| Mode | Technology | Privacy | Compliance |
|------|-----------|---------|------------|
| Public | Standard Ethereum tx | None | Full transparency |
| Shielded | Railgun ZK proofs | Full | Anonymous |
| Compliant | Privacy Pools | Selective | Provably clean |

## Railgun Integration (via Kohaku SDK)
- Shield: deposit tokens into Railgun pool (prepareShield)
- Private transfer: move tokens within shielded pool
- Unshield: withdraw from pool to public address
- ZK-SNARK proof generation for all private operations
- Merkle tree indexing for UTXO tracking

## Key Derivation (Railgun-specific)
| Key Type | BIP-44 Path |
|----------|-------------|
| ETH keys | m/44'/60'/0'/0/{index} |
| Railgun spending key | m/44'/1984'/0'/0'/{index} |
| Railgun viewing key | m/420'/1984'/0'/0'/{index} |

## Private Trade Flow
```
1. User: "buy $10 of Tesla privately"
2. Chat parser detects privacy_mode: "shielded"
3. Standard flow: resolve -> guardrails -> quote
4. Shield USDC into Railgun pool
5. Wait for shield confirmation
6. Execute private swap (within shielded pool or unshield->swap->re-shield)
7. Confirm + persist
```

## Privacy Pools
- Selective disclosure using Association Set Providers (ASPs)
- Proves funds are NOT from sanctioned sources
- Compatible with regulatory requirements
- Planned integration via @kohaku-eth/privacy-pools

## Post-Quantum (Future)
- ZKNOX ERC-4337 hybrid signatures
- ECDSA + FALCON/ML-DSA dual signing
- Quantum-resistant account security
- Via @kohaku-eth/pq-account

## SDK Architecture
```
src/
  modules/
    wallet/      — Multi-chain wallet manager, BIP-44 derivation
    provider/    — RPC provider abstraction
    privacy/     — Railgun + Privacy Pools integration
    transaction/ — Routes public vs shielded transactions
```

## Current Status
- Phase 6 (not yet started)
- SDK module structure defined
- Kohaku source code available in sources/kohaku-master/
- Ambire commons available in sources/kohaku-commons-main/

## Key Files
| File | Purpose |
|------|---------|
| src/modules/privacy/ | Privacy module (types, service, index) |
| sources/kohaku-master/ | Kohaku SDK source (Railgun, Privacy Pools) |
| sources/kohaku-commons-main/ | Ambire wallet commons (7702, keystore) |


---

# Merlin Frontend Guide

The frontend is a Next.js 15 PWA with static export. It runs entirely in the browser after the initial load — no server-side rendering in production. Deployed to Firebase Hosting.

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Next.js | 15.3.1 | Framework, App Router, static export |
| React | 19.x | UI rendering |
| TypeScript | 5.8 | Type checking |
| Tailwind CSS | 3.4 | Styling |
| shadcn/ui | latest | Component library (Radix UI primitives) |
| TanStack Query | 5.72 | Server state management |
| @simplewebauthn/browser | latest | WebAuthn passkey ceremonies |
| lucide-react | latest | Icons |

---

## Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Root — renders `<ChatPage />` directly |
| `/chat` | `app/chat/page.tsx` | Primary AI chat interface (core feature) |
| `/dashboard` | `app/dashboard/page.tsx` | Portfolio overview — balances, asset breakdown, P&L |
| `/assets` | `app/assets/page.tsx` | Asset list, token search, individual token details |
| `/trades` | `app/trades/page.tsx` | Trade history with status, hash, and amounts |
| `/personas` | `app/personas/page.tsx` | AI persona selection and custom persona creation |
| `/social` | `app/social/page.tsx` | Grok-powered social sentiment feed |
| `/settings` | `app/settings/page.tsx` | User preferences, passkey management, seed backup/import |

### Page-Specific Notes

**`/chat` (`app/chat/page.tsx`)** is the primary page and the most complex. It:
- Opens an SSE connection to `POST /chat/message`
- Renders streaming AI text tokens incrementally
- Handles `trade_confirmation` SSE events by rendering `<TradeConfirmCard />`
- Manages conversation history (load on mount, append on send)
- Dispatches confirmed trades to `POST /trade/execute`

**`/dashboard` (`app/dashboard/page.tsx`)** shows:
- Public ETH and ERC-20 balances (fetched from `/portfolio/balances`)
- Shielded (Railgun) balances when privacy mode is active
- Portfolio value in USD using price oracle data
- Asset allocation breakdown

**`/settings` (`app/settings/page.tsx`)** handles:
- Registered passkey list (device name, last-used timestamp)
- Add new passkey (backup device registration flow)
- Export seed phrase (requires passkey re-authentication)
- Import seed phrase (for account recovery)
- Privacy mode default (public / shielded / compliant)

---

## Component Architecture

### Directory Layout

```
frontend/components/
  ui/                   shadcn/ui primitives — never modify these directly
    button.tsx
    card.tsx
    badge.tsx
    input.tsx
    dialog.tsx
    avatar.tsx
    dropdown-menu.tsx
    tabs.tsx
    scroll-area.tsx
    separator.tsx
    toast.tsx
    ... (all installed shadcn components)

  providers/
    client-providers.tsx    Wraps the entire app: QueryProvider + AuthProvider
    query-provider.tsx      TanStack QueryClient configuration
    auth-provider.tsx       AuthContext implementation + WalletManager lifecycle

  nav-sidebar.tsx           Left navigation sidebar with wallet info
  auth-gate.tsx             Full-screen overlay until authenticated
  auth-guard.tsx            Redirect to / if !isAuthenticated
  system-status.tsx         API health check badge (top-right of sidebar)
  version-check.tsx         PWA version update notification
```

### Provider Hierarchy

```tsx
// app/layout.tsx
<html lang="en" className="dark">
  <body>
    <ClientProviders>        // QueryClient + AuthContext
      <NavSidebar />         // Always rendered (auth-aware)
      <main>
        <AuthGate>           // Blocks children until authenticated
          {children}         // Page content
        </AuthGate>
      </main>
    </ClientProviders>
  </body>
</html>
```

### Key Custom Components

**`<NavSidebar />`** (`components/nav-sidebar.tsx`)
- Left fixed sidebar on desktop, bottom sheet on mobile
- Navigation links: Chat, Dashboard, Assets, Trades, Personas, Social, Settings
- Shows truncated wallet address and total portfolio value (USD)
- Active link highlighted based on `usePathname()`
- `<SystemStatus />` badge in the footer

**`<AuthGate />`** (`components/auth-gate.tsx`)
- Renders a full-screen auth UI when `!isAuthenticated`
- Three entry points: Create Account (passkey + seed gen), Import Seed, Connect Wallet
- Passes through `children` once authenticated

**`<AuthGuard />`** (`components/auth-guard.tsx`)
- Lightweight wrapper for individual pages
- Uses `useRouter().replace('/')` to redirect if `!isAuthenticated && !isLoading`
- Use on pages that should never be accessible without auth

**`<SystemStatus />`** (`components/system-status.tsx`)
- Polls `GET /health` every 60 seconds
- Shows green dot (operational), yellow (degraded), red (down)
- Tooltip with last-checked timestamp

---

## State Management

### Auth State (AuthContext)

Auth state is global, provided by `AuthProvider` in `components/providers/auth-provider.tsx`.

```typescript
interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: {
    address: string;         // Ethereum EOA address (0x...)
    railgunAddress?: string; // Railgun shielded address (zk...)
  } | null;

  // Account creation
  createAccount(): Promise<void>;        // Passkey reg + BIP-39 seed + encryption
  importSeed(mnemonic: string): Promise<void>;  // Import existing 12/24-word seed

  // Session
  login(): Promise<void>;               // Passkey assertion + seed decryption
  logout(): Promise<void>;              // Lock wallet + clear memory state

  // Wallet ops (require unlocked wallet)
  exportSeed(): Promise<string>;        // Re-auth required, returns plaintext mnemonic
  connectWallet(): Promise<void>;       // WalletConnect fallback flow

  // Trading (called by chat page after user confirmation)
  executeSwap(params: SwapParams): Promise<{ txHash: string }>;
  executeGaslessSwap(params: SwapParams): Promise<{ txHash: string }>;
}
```

Access anywhere via:
```typescript
import { useAuth } from '@/lib/auth';
const { isAuthenticated, user, login } = useAuth();
```

### Server State (TanStack Query)

All API data is fetched and cached via TanStack Query. Standard pattern:

```typescript
// Reading data
const { data, isLoading, error } = useQuery({
  queryKey: ['portfolio', 'balances', user?.address],
  queryFn: () => api.get('/portfolio/balances'),
  enabled: !!user?.address,
  staleTime: 30_000,  // 30s
});

// Mutations
const executeTrade = useMutation({
  mutationFn: (params: SwapParams) => api.post('/trade/execute', params),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['trades'] });
  },
});
```

#### Query Key Conventions

| Data | Query Key |
|------|-----------|
| Portfolio balances | `['portfolio', 'balances', address]` |
| Trade history | `['trades', address]` |
| Conversations | `['conversations', address]` |
| Single conversation | `['conversations', address, conversationId]` |
| Asset prices | `['prices', symbol]` |
| Market data | `['market', symbol]` |
| Personas | `['personas', address]` |
| Social signals | `['social', 'signals']` |

### Local State

Use `useState` for:
- UI toggle states (sidebar open/closed, modal visibility)
- Form input values
- Active conversation ID
- Pending trade confirmation state

Do not put UI state in TanStack Query or AuthContext.

---

## API Client

**`lib/api.ts`** — `ApiClient` class wrapping `fetch`.

```typescript
class ApiClient {
  private baseUrl: string;   // NEXT_PUBLIC_API_URL or /api/v1
  private getToken: () => string | null;  // Injected from AuthContext

  async get<T>(endpoint: string): Promise<T>
  async post<T>(endpoint: string, body: unknown): Promise<T>
  async delete<T>(endpoint: string): Promise<T>

  // All requests include:
  //   Authorization: Bearer {jwt}
  //   Content-Type: application/json
  //   signal: AbortSignal.timeout(90_000)
}
```

**`lib/constants.ts`**

```typescript
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '1');
export const WEBAUTHN_RP_ID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? 'localhost';
export const WEBAUTHN_RP_NAME = process.env.NEXT_PUBLIC_WEBAUTHN_RP_NAME ?? 'Merlin';
```

### SSE (Chat Streaming)

The chat page uses `EventSource` directly (not the `ApiClient` class) because the API client wraps `fetch`, not streaming:

```typescript
const es = new EventSource(`${API_URL}/chat/message`, {
  // Custom headers not supported by EventSource — use fetch + ReadableStream instead
});

// Implementation uses fetch with ReadableStream:
const response = await fetch(`${API_URL}/chat/message`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id, message }),
  signal: AbortSignal.timeout(90_000),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Parse SSE events from chunk
  parseSSEChunk(chunk);  // handles delta, trade_confirmation, done events
}
```

---

## Auth Flow (Frontend Detail)

### Libraries

- `@simplewebauthn/browser` — `startRegistration()`, `startAuthentication()`
- `@noble/hashes` — Scrypt key derivation
- `@noble/ciphers` — AES-256-GCM encrypt/decrypt
- `@scure/bip39` — BIP-39 mnemonic generation and validation
- `@scure/bip32` — BIP-32 HD key derivation

### WalletManager (`lib/auth.ts`)

`WalletManager` is a singleton that holds the decrypted seed in memory only while unlocked.

```typescript
class WalletManager {
  private seed: Uint8Array | null = null;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;

  unlock(seed: Uint8Array): void    // Starts 15-min auto-lock timer
  lock(): void                      // Clears seed from memory immediately
  isUnlocked(): boolean
  getAddress(): string              // Derives m/44'/60'/0'/0/0
  signTx(tx: TransactionRequest): Promise<string>  // Signs with derived key
  resetLockTimer(): void            // Call on user activity
}
```

The 15-minute auto-lock resets on any user interaction (keypress, click, touch) via event listeners attached in `AuthProvider`.

### Seed Storage (IndexedDB)

```typescript
interface EncryptedSeed {
  ciphertext: Uint8Array;   // AES-256-GCM encrypted seed
  iv: Uint8Array;           // 12-byte random IV
  salt: Uint8Array;         // 32-byte Scrypt salt
}
```

The AES key is derived from the passkey assertion's `clientDataJSON` + `authenticatorData` using Scrypt (`N=2^17, r=8, p=1`). The passkey never leaves the device; the key derivation input is deterministic per-credential-per-challenge — same passkey always produces the same key.

### Account Creation Sequence

```
1. startRegistration(options from POST /auth/register-options)
2. POST /auth/register-verify → receive JWT
3. generateMnemonic(wordlist, 128)         // 12 words
4. mnemonicToSeed(mnemonic)                // BIP-39 → 64-byte seed
5. deriveKey(assertionOutput, salt)        // Scrypt
6. encryptSeed(seed, aesKey, iv)          // AES-256-GCM
7. indexedDB.put('vault', encryptedSeed)
8. WalletManager.unlock(seed)
9. Set isAuthenticated = true in context
```

---

## Design System

### Dark Mode

Dark mode is the only supported mode. The `<html>` element always has `class="dark"`. Light mode is not implemented.

### Tailwind Configuration

Theme tokens are defined as CSS custom properties in `app/globals.css` using HSL values:

```css
:root {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --primary: 211 100% 50%;        /* Merlin blue */
  --primary-foreground: 0 0% 100%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 211 100% 50%;
  --radius: 0.5rem;
}
```

All shadcn/ui components reference these variables. To change brand colors, update `--primary` and `--ring`.

### Typography

- Font: Inter (loaded via `next/font/google`)
- Applied via `font-sans` class on `<body>`
- No custom font sizes — use Tailwind's default scale

### Layout

- Sidebar: fixed left, 64px collapsed / 240px expanded on desktop
- Main content: `ml-16` or `ml-60` depending on sidebar state
- Mobile: bottom navigation bar replaces sidebar
- Max content width: `max-w-4xl mx-auto` on most pages
- Chat page: full-height flex column, messages scroll area + input fixed at bottom

### Component Conventions

When building new UI:

1. Use existing shadcn/ui primitives first (`Button`, `Card`, `Badge`, `Input`, etc.)
2. Add new shadcn components via the registry pattern (copy component to `components/ui/`)
3. Compose custom components from primitives — do not use raw HTML elements where a primitive exists
4. Use `cn()` from `lib/utils.ts` for conditional class merging

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## Navigation

**`<NavSidebar />`** renders:
- Logo + "Merlin" wordmark at top
- Nav items (lucide icon + label):
  - Chat → `/chat`
  - Dashboard → `/dashboard`
  - Assets → `/assets`
  - Trades → `/trades`
  - Personas → `/personas`
  - Social → `/social`
  - Settings → `/settings`
- Wallet section at bottom: truncated address, total portfolio value in USD
- `<SystemStatus />` badge (API health)

Active route detection:
```typescript
const pathname = usePathname();
const isActive = (href: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href);
```

---

## Environment Variables

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WEBAUTHN_RP_ID=merlin.app
NEXT_PUBLIC_WEBAUTHN_RP_NAME=Merlin
NEXT_PUBLIC_CHAIN_ID=1
```

All `NEXT_PUBLIC_` variables are inlined at build time. Changing them requires a rebuild and redeploy.

---

## Build and Deploy

```bash
# Development
cd frontend
pnpm dev          # Turbopack dev server, hot reload

# Type checking
pnpm tsc --noEmit

# Production build
pnpm build        # Outputs static files to frontend/out/

# Deploy to Firebase Hosting
firebase deploy --only hosting:merlin-app --project merlin-wallet-prod
```

### Static Export Constraints

Because `output: 'export'` is set in `next.config.ts`:

- No `getServerSideProps` or `getInitialProps`
- No server components that fetch data at render time
- Dynamic routes require `generateStaticParams()` — or use client-side routing only
- API routes (`app/api/`) do not work in the exported bundle
- `next/image` requires `unoptimized: true` (already configured)

### PWA

- `manifest.json` at `public/manifest.json` defines name, icons, theme color, start URL
- Service worker registered via `next-pwa` plugin in `next.config.ts`
- Caches static assets and the app shell
- Installable on iOS Safari and Android Chrome


---

# Merlin Backend Guide

The backend is a FastAPI Python application deployed to Google Cloud Run. It handles AI chat, trade routing, auth ceremonies, price feeds, social sentiment, and Firestore persistence.

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.12 | Runtime |
| FastAPI | latest | API framework, async endpoints, SSE |
| Uvicorn | latest | ASGI server |
| py-webauthn | 2.1.0 | WebAuthn registration + authentication |
| python-jose | latest | JWT creation and verification (HS256) |
| google-cloud-firestore | latest | Async Firestore client |
| anthropic | latest | Claude Haiku, tool use, streaming |
| httpx | latest | Async HTTP client (price oracles, Grok) |
| pydantic | v2 | Request/response model validation |

---

## Project Structure

```
backend/
  main.py                    FastAPI app factory, middleware, router registration
  requirements.txt           Python dependencies

  auth/
    webauthn.py              Registration options/verify, auth options/verify
    session.py               JWT creation (create_token) and verification (decode_token)
    models.py                Pydantic models: RegistrationRequest, AuthRequest, UserOut
    dependencies.py          get_current_user — FastAPI dependency injected per-route

  db/
    firestore.py             AsyncClient singleton, get_db() factory
    users.py                 get_user, create_user, update_user, add_credential, get_credentials
    conversations.py         get_conversation, create_conversation, append_message, list_conversations
    trades.py                create_trade, get_trade, list_trades, update_trade_status
    signals.py               upsert_signal, get_signal, list_signals
    challenges.py            store_challenge, get_challenge, delete_challenge (5-min TTL)

  services/
    chat.py                  Claude streaming chat with tool use
    xstock.py                xStock token registry + fuzzy matching
    guardrails.py            Pre-trade safety check engine
    uniswap.py               Uniswap V3 Quoter + SwapRouter (raw ABI encoding)
    eip7702.py               EIP-7702 delegation + UserOp helpers
    prices.py                Price oracle (CoinMarketCap + Backed Finance)
    balances.py              On-chain ETH + ERC-20 balance fetching
    social.py                Grok API sentiment analysis
    provider.py              Raw JSON-RPC client

  routers/
    auth.py                  6 auth endpoints
    chat.py                  8 chat endpoints + 1 market endpoint
    portfolio.py             4 portfolio endpoints
    trade.py                 4 trade endpoints
    personas.py              5 persona endpoints
    social.py                1 social endpoint
```

---

## main.py

```python
app = FastAPI(title="Merlin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # From CORS_ORIGINS env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,      prefix="/auth")
app.include_router(chat_router,      prefix="/chat")
app.include_router(portfolio_router, prefix="/portfolio")
app.include_router(trade_router,     prefix="/trade")
app.include_router(personas_router,  prefix="/personas")
app.include_router(social_router,    prefix="/social")

@app.get("/health")
async def health():
    return {"status": "ok"}
```

`CORS_ORIGINS` defaults to `["http://localhost:3000", "http://localhost:3001"]` if not set. In production, set to the Firebase Hosting URL (`https://merlin-app.web.app`).

---

## Auth System

### WebAuthn (`auth/webauthn.py`)

Uses `py-webauthn` 2.1.0. Implements the full WebAuthn ceremony:

**Registration:**
1. `generate_registration_options(rp_id, rp_name, user_id, user_name)` → options JSON
2. Store challenge in Firestore (`challenges/`) with 5-minute TTL
3. `verify_registration_response(credential, expected_challenge, expected_rp_id, expected_origin)` → verified credential
4. Store credential public key + credential ID against user in Firestore

**Authentication:**
1. `generate_authentication_options(rp_id, allow_credentials=[...])` → options JSON
2. Store challenge in Firestore with 5-minute TTL
3. `verify_authentication_response(credential, expected_challenge, credential_public_key, sign_count)` → verified assertion
4. Update sign count in Firestore

### JWT Sessions (`auth/session.py`)

```python
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

def create_token(address: str) -> str:
    payload = {
        "sub": address,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
```

`JWT_SECRET` must be set as an environment variable. In production, it is loaded from Google Secret Manager.

### Auth Dependency (`auth/dependencies.py`)

```python
async def get_current_user(
    authorization: str = Header(...),
    db: AsyncClient = Depends(get_db),
) -> UserDocument:
    token = authorization.removeprefix("Bearer ")
    payload = decode_token(token)           # Raises 401 if invalid/expired
    address = payload["sub"]
    user = await users.get_user(db, address)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

Inject with `user: UserDocument = Depends(get_current_user)` on any protected endpoint.

---

## API Endpoints

### Auth Router (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register-options` | None | Generate WebAuthn registration options |
| POST | `/auth/register-verify` | None | Verify registration + issue JWT |
| POST | `/auth/auth-options` | None | Generate WebAuthn authentication options |
| POST | `/auth/auth-verify` | None | Verify authentication + issue JWT |
| POST | `/auth/logout` | JWT | Invalidate session (client-side JWT drop) |
| GET | `/auth/me` | JWT | Return current user profile |

**POST `/auth/register-options`**
```json
Request:  { "address": "0x...", "display_name": "My Device" }
Response: { "challenge": "...", "rp": { "id": "merlin.app", "name": "Merlin" }, "user": {...}, "pubKeyCredParams": [...] }
```

**POST `/auth/register-verify`**
```json
Request:  { "address": "0x...", "credential": { "id": "...", "response": {...}, "type": "public-key" } }
Response: { "token": "eyJ...", "user": { "address": "0x...", "display_name": "..." } }
```

**POST `/auth/auth-options`**
```json
Request:  { "address": "0x..." }
Response: { "challenge": "...", "allowCredentials": [{ "id": "...", "type": "public-key" }], "timeout": 60000 }
```

**POST `/auth/auth-verify`**
```json
Request:  { "address": "0x...", "assertion": { "id": "...", "response": {...} } }
Response: { "token": "eyJ...", "user": { "address": "0x...", "display_name": "..." } }
```

### Chat Router (`/chat`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/chat/message` | JWT | SSE streaming chat response |
| GET | `/chat/conversations` | JWT | List conversations |
| POST | `/chat/conversations` | JWT | Create new conversation |
| GET | `/chat/conversations/{id}` | JWT | Get conversation with messages |
| DELETE | `/chat/conversations/{id}` | JWT | Delete conversation |
| POST | `/chat/conversations/{id}/messages` | JWT | Append message to conversation |
| GET | `/chat/conversations/{id}/messages` | JWT | Get messages for conversation |
| POST | `/chat/clear` | JWT | Clear all conversations for user |
| GET | `/chat/market/{symbol}` | JWT | Get market data for a symbol |

**POST `/chat/message`** — SSE stream
```json
Request: {
  "conversation_id": "conv_abc123",
  "message": "Buy $100 of Apple stock"
}
```

SSE event types emitted:
```
event: delta
data: {"content": "Sure, let me check the current"}

event: delta
data: {"content": " price of AAPL for you..."}

event: trade_confirmation
data: {
  "asset": "AAPL",
  "token_address": "0x...",
  "side": "buy",
  "amount_usd": 100,
  "quote": {
    "amount_in": "1000000",
    "amount_out": "540000000000000000",
    "price_impact": 0.003,
    "route": ["USDC", "ETH", "AAPL"]
  },
  "gas_estimate": { "units": 185000, "cost_usdc": "2.14" },
  "privacy_mode": "public"
}

event: done
data: {}
```

### Portfolio Router (`/portfolio`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/portfolio/balances` | JWT | ETH + ERC-20 balances |
| GET | `/portfolio/summary` | JWT | Total value in USD, asset allocation |
| GET | `/portfolio/tokens` | JWT | List of held tokens with prices |
| GET | `/portfolio/history` | JWT | Portfolio value over time (Firestore) |

**GET `/portfolio/balances`**
```json
Response: {
  "address": "0x...",
  "eth": { "balance": "1.234", "value_usd": "3210.45" },
  "tokens": [
    { "symbol": "USDC", "address": "0x...", "balance": "500.00", "value_usd": "500.00" },
    { "symbol": "AAPL", "address": "0x...", "balance": "0.540", "value_usd": "97.20" }
  ],
  "total_usd": "3807.65"
}
```

### Trade Router (`/trade`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/trade/quote` | JWT | Get Uniswap V3 quote |
| POST | `/trade/simulate` | JWT | Simulate swap (eth_call) |
| POST | `/trade/execute` | JWT | Broadcast signed transaction |
| GET | `/trade/history` | JWT | Trade history for user |

**POST `/trade/quote`**
```json
Request: {
  "token_in": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "token_out": "0x...",
  "amount_in": "100000000",
  "fee": 3000
}
Response: {
  "amount_out": "540000000000000000",
  "price_impact": 0.003,
  "route": ["0xUSDC", "0xWETH", "0xAAPL"],
  "gas_estimate": 185000
}
```

**POST `/trade/execute`**
```json
Request:  { "signed_tx": "0x02f8..." }
Response: { "tx_hash": "0x...", "status": "pending" }
```

### Personas Router (`/personas`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/personas` | JWT | List built-in + user personas |
| POST | `/personas` | JWT | Create custom persona |
| GET | `/personas/{id}` | JWT | Get persona config |
| PUT | `/personas/{id}` | JWT | Update persona |
| DELETE | `/personas/{id}` | JWT | Delete persona |

### Social Router (`/social`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/social/signals` | JWT | Sentiment signals for watched tokens |

**GET `/social/signals`**
```json
Response: {
  "signals": [
    {
      "symbol": "AAPL",
      "sentiment_score": 0.72,
      "outlook": "bullish",
      "summary": "Strong earnings expectations ahead of Q1 report",
      "source_count": 847,
      "updated_at": "2026-03-24T10:00:00Z"
    }
  ]
}
```

---

## Services

### `services/chat.py` — Claude Chat

Manages the streaming chat loop with tool use.

**Tool definitions passed to Claude:**

```python
FUNCTIONS = [
    {
        "name": "execute_trade",
        "description": "Execute a buy or sell order for a token or xStock",
        "parameters": {
            "type": "object",
            "properties": {
                "asset": { "type": "string", "description": "Token symbol or company name" },
                "side": { "type": "string", "enum": ["buy", "sell"] },
                "amount": { "type": "number", "description": "Amount in USD or token units" },
                "currency": { "type": "string", "enum": ["usd", "token"], "default": "usd" },
                "privacy_mode": { "type": "string", "enum": ["public", "shielded", "compliant"], "default": "public" }
            },
            "required": ["asset", "side", "amount"]
        }
    },
    {
        "name": "get_portfolio",
        "description": "Get the user's current portfolio balances and values",
        "parameters": { "type": "object", "properties": {} }
    },
    {
        "name": "get_price",
        "description": "Get the current price of a token or xStock",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": { "type": "string", "description": "Token symbol" }
            },
            "required": ["symbol"]
        }
    }
]
```

When Claude returns a tool use, `chat.py` resolves the intent, runs guardrails, gets a Uniswap quote, then emits a `trade_confirmation` SSE event. The actual transaction is not built server-side — the client builds and signs it after user confirmation.

### `services/xstock.py` — xStock Token Registry

61+ xStock tokens maintained as a static registry:

```python
XSTOCK_TOKENS = {
    "AAPL": {
        "address": "0x...",
        "name": "Apple Inc.",
        "decimals": 18,
        "backed_id": "..."
    },
    "TSLA": { ... },
    "MSFT": { ... },
    # ... 58 more
}

def resolve_token(query: str) -> XStockToken | None:
    # 1. Exact symbol match
    # 2. Exact name match (case-insensitive)
    # 3. Fuzzy match using difflib.SequenceMatcher
    # Returns None if best match score < 0.6
```

### `services/guardrails.py` — Pre-Trade Safety

8 checks run before any trade is quoted or executed:

| Check | Condition | Error Code |
|-------|-----------|------------|
| Amount minimum | amount_usd >= 10 | AMOUNT_TOO_SMALL |
| Amount maximum | amount_usd <= 10_000 | AMOUNT_TOO_LARGE |
| Token allowlist | token in XSTOCK_TOKENS or APPROVED_CRYPTO | TOKEN_NOT_ALLOWED |
| Slippage | price_impact < 0.05 (5%) | SLIPPAGE_TOO_HIGH |
| Duplicate trade | no identical trade in last 30 seconds | DUPLICATE_TRADE |
| US person (xStocks) | not (is_us_person and is_xstock) | US_PERSON_RESTRICTED |
| Balance check | user_balance >= required_amount | INSUFFICIENT_BALANCE |
| Gas estimate | gas_cost_usd < amount_usd * 0.10 | GAS_TOO_HIGH |

All 8 checks are run in sequence. Returns `{ "allowed": True }` or `{ "allowed": False, "reason": "...", "code": "..." }`.

### `services/uniswap.py` — Uniswap V3 Integration

Interacts with Uniswap V3 contracts without using `web3py`. All ABI encoding is manual hex.

**Contracts used:**
- `QuoterV2` at `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` (mainnet)
- `SwapRouter02` at `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` (mainnet)

**Quoting:**
```python
async def get_quote(
    token_in: str,
    token_out: str,
    amount_in: int,
    fee: int = 3000,
) -> QuoteResult:
    # ABI-encode quoteExactInputSingle params
    calldata = encode_quote_calldata(token_in, token_out, amount_in, fee)
    result = await provider.eth_call(QUOTER_V2_ADDRESS, calldata)
    amount_out = decode_uint256(result[:32])
    price_impact = calculate_price_impact(amount_in, amount_out, token_in, token_out)
    return QuoteResult(amount_out=amount_out, price_impact=price_impact)
```

**Swap calldata building** (returned to client for signing):
```python
async def build_swap_calldata(params: SwapParams) -> str:
    # Returns hex-encoded calldata for exactInputSingle
    # Client uses this to build + sign the transaction
    return encode_swap_calldata(params)
```

### `services/prices.py` — Price Oracle

Fetches prices from two sources with a 60-second in-memory cache:

- **Crypto prices**: CoinMarketCap API (ETH, USDC, USDT, BTC, etc.)
- **xStock prices**: Backed Finance API (tokenized stock prices in USD)

```python
_price_cache: dict[str, tuple[float, datetime]] = {}
CACHE_TTL = 60  # seconds

async def get_price(symbol: str) -> float:
    if symbol in _price_cache:
        price, cached_at = _price_cache[symbol]
        if (datetime.utcnow() - cached_at).seconds < CACHE_TTL:
            return price
    # Fetch from appropriate source
    price = await _fetch_price(symbol)
    _price_cache[symbol] = (price, datetime.utcnow())
    return price
```

### `services/balances.py` — On-Chain Balances

Fetches balances via `provider.py` (raw JSON-RPC, no web3py):

```python
async def get_eth_balance(address: str) -> int:
    result = await provider.eth_getBalance(address, "latest")
    return int(result, 16)

async def get_erc20_balance(token_address: str, wallet_address: str) -> int:
    # ABI-encodes balanceOf(address) selector + padded address
    calldata = "0x70a08231" + wallet_address[2:].zfill(64)
    result = await provider.eth_call(token_address, calldata)
    return int(result, 16)
```

### `services/social.py` — Grok Sentiment

Queries Grok (`grok-3-mini`) for sentiment analysis on watched tokens:

```python
async def analyze_sentiment(symbol: str) -> SentimentResult:
    prompt = f"Analyze current social media sentiment for {symbol}. Return JSON with: sentiment_score (0-1), outlook (bullish/bearish/neutral), summary (1 sentence), source_count (estimated posts analyzed)."
    response = await grok_client.chat.completions.create(
        model="grok-3-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    return SentimentResult(**json.loads(response.choices[0].message.content))
```

Results are cached in Firestore `signals/` collection and refreshed every 15 minutes via a background task.

### `services/provider.py` — JSON-RPC Client

Raw JSON-RPC client wrapping `httpx.AsyncClient`:

```python
async def eth_call(to: str, data: str, block: str = "latest") -> str:
    return await _rpc_call("eth_call", [{"to": to, "data": data}, block])

async def eth_getBalance(address: str, block: str = "latest") -> str:
    return await _rpc_call("eth_getBalance", [address, block])

async def eth_sendRawTransaction(signed_tx: str) -> str:
    return await _rpc_call("eth_sendRawTransaction", [signed_tx])

async def eth_getTransactionReceipt(tx_hash: str) -> dict | None:
    return await _rpc_call("eth_getTransactionReceipt", [tx_hash])
```

Uses `ETH_RPC_URL` for mainnet, `SEPOLIA_RPC_URL` for testnet. Selected via `CHAIN_ID` env var.

### `services/eip7702.py` — EIP-7702 Delegation

Constructs EIP-7702 type-4 transactions for smart EOA delegation:

```python
async def build_delegation_tx(
    eoa_address: str,
    delegate_address: str,      # Ambire EntryPoint or custom logic contract
    chain_id: int,
) -> dict:
    # Returns unsigned type-4 transaction
    # Client signs with EOA key → submits via eth_sendRawTransaction
    ...

async def build_userop(
    sender: str,
    calldata: str,
    paymaster: str,             # AmbirePaymaster address
    paymaster_data: str,        # Encoded USDC gas payment
) -> dict:
    # Returns EIP-4337 UserOperation for bundler submission
    ...
```

---

## Firestore Schema

### `users/{address}`

```
{
  id: string,                   // Ethereum address (0x...)
  display_name: string,
  address: string,              // Duplicate for query convenience
  created_at: timestamp,
  updated_at: timestamp,
  credentials: [                // WebAuthn credentials
    {
      credential_id: string,    // Base64url-encoded credential ID
      public_key: bytes,        // COSE-encoded public key
      sign_count: number,
      device_name: string,
      created_at: timestamp,
      last_used: timestamp,
    }
  ],
  watched_tokens: string[],     // Token symbols user wants sentiment for
  settings: {
    default_privacy_mode: "public" | "shielded" | "compliant",
    slippage_tolerance: number, // 0.005 = 0.5%
  }
}
```

### `conversations/{id}`

```
{
  id: string,
  user_id: string,              // Ethereum address
  title: string,                // First message truncated to 50 chars
  created_at: timestamp,
  updated_at: timestamp,
  messages: [
    {
      id: string,
      role: "user" | "assistant" | "system",
      content: string,
      created_at: timestamp,
      metadata: {               // Optional, present on assistant messages with trades
        trade_confirmation?: {...},
        function_call?: {...},
      }
    }
  ]
}
```

### `trades/{id}`

```
{
  id: string,
  user_id: string,              // Ethereum address
  conversation_id: string,
  created_at: timestamp,
  updated_at: timestamp,

  side: "buy" | "sell",
  asset: string,                // e.g. "AAPL"
  token_address: string,
  amount_usd: number,
  amount_token: string,         // Raw token units (bigint as string)

  token_in: string,             // ERC-20 address
  token_out: string,
  amount_in: string,
  amount_out: string,

  privacy_mode: "public" | "shielded" | "compliant",
  tx_hash: string | null,
  status: "pending" | "confirmed" | "failed",
  block_number: number | null,
  gas_used: number | null,
  error: string | null,
}
```

### `signals/{symbol}`

```
{
  symbol: string,               // e.g. "AAPL"
  sentiment_score: number,      // 0.0 (bearish) to 1.0 (bullish)
  outlook: "bullish" | "bearish" | "neutral",
  summary: string,
  source_count: number,
  updated_at: timestamp,
}
```

### `challenges/{id}`

```
{
  id: string,
  challenge: string,            // Base64url-encoded WebAuthn challenge
  address: string,              // Ethereum address (for auth challenges only)
  created_at: timestamp,
  expires_at: timestamp,        // created_at + 5 minutes
}
```

Firestore TTL policy should be configured to auto-delete documents where `expires_at` is in the past. If not configured, `challenges.py` checks expiry on read and returns `None` for expired challenges.

---

## Key Patterns

### Async Throughout

Every function that touches I/O (Firestore, RPC, Anthropic, Grok, httpx) is `async`. FastAPI handles the event loop. Do not use synchronous Firestore or HTTP clients.

```python
# Correct
async def get_user(db: AsyncClient, address: str) -> UserDocument | None:
    doc = await db.collection("users").document(address).get()
    return doc.to_dict() if doc.exists else None

# Wrong — blocks the event loop
def get_user(db: Client, address: str) -> dict | None:
    doc = db.collection("users").document(address).get()
    return doc.to_dict()
```

### No web3py

All Ethereum contract interaction uses raw JSON-RPC via `services/provider.py`. ABI encoding is done manually in each service. This avoids the web3py dependency and keeps encoding explicit and auditable.

```python
# Correct: manual ABI encoding
selector = "0x70a08231"  # balanceOf(address)
padded_addr = wallet_address[2:].zfill(64)
calldata = selector + padded_addr

# Wrong: web3py
contract = w3.eth.contract(address=token, abi=ERC20_ABI)
balance = contract.functions.balanceOf(wallet).call()
```

### SSE Streaming

Chat responses use FastAPI `StreamingResponse` with `text/event-stream`:

```python
async def stream_chat(request: ChatRequest, user: UserDocument = Depends(get_current_user)):
    async def generate():
        async for chunk in chat_service.stream(request, user):
            yield f"event: {chunk.event}\ndata: {json.dumps(chunk.data)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

### In-Memory Caching

Price data and Uniswap quotes are cached in module-level dicts. Acceptable because:
- Data has natural staleness tolerance (60s prices, 5m quotes)
- Cloud Run instances handle steady-state traffic; cache warmup is fast
- No cross-instance coordination needed — stale-by-60s is fine for price display

For data that must be consistent (user state, trade records), always read from Firestore.

---

## Environment Variables

```
# Ethereum RPC
ETH_RPC_URL=https://mainnet.infura.io/v3/...
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/...
CHAIN_ID=1

# Auth
JWT_SECRET=<random 64-byte hex>
WEBAUTHN_RP_ID=merlin.app
WEBAUTHN_RP_NAME=Merlin
WEBAUTHN_ORIGIN=https://merlin-app.web.app

# AI
ANTHROPIC_API_KEY=sk-...
GROK_API_KEY=xai-...

# Price Oracles
COINMARKETCAP_API_KEY=...

# CORS
CORS_ORIGINS=https://merlin-app.web.app

# GCP (loaded automatically on Cloud Run via service account)
GCP_PROJECT_ID=merlin-wallet-prod
```

In production, sensitive values (`JWT_SECRET`, `ANTHROPIC_API_KEY`, `GROK_API_KEY`, `ETH_RPC_URL`) are loaded from Google Secret Manager via the Cloud Run service account. Local development uses `.env`.

---

## Deployment

### Cloud Run

The backend runs as a container on Cloud Run in `europe-west1`.

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

```bash
# Build and push image
docker build -t europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest .
docker push europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest

# Deploy to Cloud Run (verify gcloud project and account first — see CLAUDE.md)
gcloud run deploy merlin-api \
  --image europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest \
  --region europe-west1 \
  --project merlin-wallet-prod \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets "JWT_SECRET=JWT_SECRET:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,GROK_API_KEY=GROK_API_KEY:latest,ETH_RPC_URL=ETH_RPC_URL:latest,SEPOLIA_RPC_URL=SEPOLIA_RPC_URL:latest"
```

### Local Development

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example .env   # Fill in real values
uvicorn main:app --reload --port 8000
```

Swagger UI available at `http://localhost:8000/docs` during development.


---

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

The chat system uses Claude tool use to parse user intent and route to appropriate handlers (trade, price query, portfolio lookup, etc.). Responses are streamed via Server-Sent Events.

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


---

# Deployment Guide

## Overview

Merlin is deployed on Google Cloud Platform in the `europe-west1` region:

| Component | Service | URL |
|-----------|---------|-----|
| Frontend | Firebase Hosting (static PWA) | https://merlin-app.web.app |
| Backend | Cloud Run (serverless FastAPI) | https://merlin-api-795485039698.europe-west1.run.app |
| Database | Firestore (Native mode) | Real-time sync, security rules |
| Secrets | Google Secret Manager | Encrypted at rest |
| Docker | Artifact Registry | `europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker` |

API requests from the frontend are proxied through Firebase Hosting rewrites (`/api/**` routes to Cloud Run), so the frontend only talks to `merlin-app.web.app`.

## Prerequisites

- **gcloud CLI** installed and authenticated as `mrboups@gmail.com`
- **firebase CLI** installed and authenticated
- **Docker** installed (for backend image builds)
- **Node.js 22+** and **pnpm** (for frontend builds)
- **Python 3.12** (for local backend development)

Verify your setup:
```bash
gcloud auth list                  # Must show mrboups@gmail.com as ACTIVE
gcloud config get-value project   # Must show merlin-wallet-prod
firebase projects:list            # Must show merlin-wallet-prod
```

## GCP Project Details

| Property | Value |
|----------|-------|
| Project ID | `merlin-wallet-prod` |
| Project Number | `795485039698` |
| Region | `europe-west1` |
| Billing Account | `01BD75-FFCD2A-B7C532` |
| Active Account | `mrboups@gmail.com` |

## Environment Variables

Copy `.env.example` to `.env` and fill in real values. Never commit `.env` to version control.

| Variable | Description | Required For |
|----------|-------------|--------------|
| `GCP_PROJECT_ID` | `merlin-wallet-prod` | All deploys |
| `GCP_ACCOUNT` | `mrboups@gmail.com` | All deploys |
| `GCP_REGION` | `europe-west1` | All deploys |
| `ETH_RPC_URL` | Ethereum mainnet RPC endpoint | Backend runtime |
| `SEPOLIA_RPC_URL` | Sepolia testnet RPC endpoint | Development |
| `ANTHROPIC_API_KEY` | Anthropic API key (chat + intent parsing) | Backend runtime |
| `GROK_API_KEY` | Grok/xAI API key (social sentiment) | Optional |
| `COINMARKETCAP_API_KEY` | CoinMarketCap API key (price data) | Backend runtime |
| `CORS_ORIGINS` | Allowed origins, comma-separated | Production |

## Deployment Safety Protocol (MANDATORY)

Before running ANY deploy command (`gcloud builds submit`, `gcloud run deploy`, `firebase deploy`, `docker push`), you MUST complete all of these checks:

1. **Read `.env`** and extract `GCP_PROJECT_ID` and `GCP_ACCOUNT`
2. **Verify gcloud account matches**:
   ```bash
   gcloud auth list
   # Active account MUST be mrboups@gmail.com
   ```
3. **Verify gcloud project matches**:
   ```bash
   gcloud config get-value project
   # MUST return merlin-wallet-prod
   ```
4. **Verify Firebase account** (for Firebase deploys):
   ```bash
   firebase login:list
   # MUST show mrboups@gmail.com
   ```
5. **Always use explicit flags**:
   - `--project merlin-wallet-prod`
   - `--region europe-west1`
6. **If ANY mismatch: STOP.** Do not proceed. Ask the operator to fix the configuration.
7. **Never deploy to a project that does not match `.env` values.**

This protocol exists to prevent accidental deployment to the wrong GCP project.

---

## Deploy Backend (Cloud Run)

The backend is a FastAPI application packaged as a Docker container and deployed to Cloud Run.

### Option 1: Docker Build + Deploy

Build the image locally, push to Artifact Registry, then deploy:

```bash
# Build the Docker image
docker build -t europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest .

# Push to Artifact Registry
docker push europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest

# Deploy to Cloud Run
gcloud run deploy merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1 \
  --image europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest \
  --allow-unauthenticated \
  --set-secrets="ETH_RPC_URL=ETH_RPC_URL:latest,SEPOLIA_RPC_URL=SEPOLIA_RPC_URL:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,GROK_API_KEY=GROK_API_KEY:latest"
```

### Option 2: Cloud Build

Let Cloud Build handle the image build and push:

```bash
gcloud builds submit \
  --project merlin-wallet-prod \
  --region europe-west1
```

This uses the `cloudbuild.yaml` (if present) or the `Dockerfile` in the project root.

### Cloud Run Configuration

Key settings for the `merlin-api` service:

| Setting | Value | Notes |
|---------|-------|-------|
| Region | `europe-west1` | Matches Firestore region |
| Memory | 512 Mi | Adjust based on load |
| CPU | 1 | Scales with instances |
| Min instances | 0 | Scales to zero when idle |
| Max instances | 10 | Prevent runaway costs |
| Timeout | 300s | For long SSE chat streams |
| Concurrency | 80 | Requests per instance |
| Ingress | All | Firebase Hosting proxies traffic |

### Secret Manager Integration

Cloud Run accesses secrets via `--set-secrets` flag, which mounts Secret Manager values as environment variables at runtime. Available secrets:

```bash
# List all secrets
gcloud secrets list --project=merlin-wallet-prod

# Add or update a secret value
echo -n "YOUR_VALUE" | gcloud secrets versions add SECRET_NAME \
  --data-file=- \
  --project=merlin-wallet-prod

# View secret metadata (not the value)
gcloud secrets describe SECRET_NAME --project=merlin-wallet-prod

# Access a secret value (for debugging only)
gcloud secrets versions access latest --secret=SECRET_NAME --project=merlin-wallet-prod
```

Current secrets: `ETH_RPC_URL`, `SEPOLIA_RPC_URL`, `ANTHROPIC_API_KEY`, `GROK_API_KEY`.

---

## Deploy Frontend (Firebase Hosting)

The frontend is a Next.js 15 app with static export, deployed to Firebase Hosting.

### Build and Deploy

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
pnpm install

# Build the static export (outputs to frontend/out/)
pnpm build

# Deploy to Firebase Hosting
firebase deploy --only hosting:merlin-app --project merlin-wallet-prod
```

### Firebase Configuration Files

**`firebase.json`** -- Hosting configuration with API proxy rewrites:
```json
{
  "hosting": {
    "site": "merlin-app",
    "public": "frontend/out",
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "merlin-api",
          "region": "europe-west1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

The `/api/**` rewrite routes all API calls from the frontend to the Cloud Run backend. This eliminates CORS issues and keeps the backend URL internal.

**`.firebaserc`** -- Project alias:
```json
{
  "projects": {
    "default": "merlin-wallet-prod"
  }
}
```

**`firestore.rules`** -- Security rules enforce user-scoped read/write access. Users can only read and write their own documents.

### Preview Before Deploy

To verify changes before deploying to production:

```bash
# Preview channel (temporary URL, auto-expires)
firebase hosting:channel:deploy preview --project merlin-wallet-prod

# This creates a URL like:
# https://merlin-app--preview-abc123.web.app
```

---

## Firestore

Firestore is in Native mode in `europe-west1`. Collections:

| Collection | Description | Access |
|------------|-------------|--------|
| `users` | User profiles, passkey credentials, addresses | User-scoped |
| `conversations` | Chat sessions | User-scoped |
| `messages` | Chat messages (subcollection of conversations) | User-scoped |
| `trades` | Trade records (quotes, confirmations) | User-scoped |
| `portfolio_snapshots` | Historical portfolio values | User-scoped |

Security rules ensure users can only access their own documents. The backend uses a service account with full access.

### Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules --project merlin-wallet-prod
```

---

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | https://merlin-app.web.app | PWA entry point |
| Frontend (alt) | https://merlin-app.firebaseapp.com | Firebase default domain |
| Backend API (direct) | https://merlin-api-795485039698.europe-west1.run.app | Cloud Run direct access |
| Backend API (proxied) | https://merlin-app.web.app/api/v1/* | Through Firebase Hosting |
| Swagger docs | https://merlin-app.web.app/api/v1/docs | FastAPI auto-generated docs |
| ReDoc | https://merlin-app.web.app/api/v1/redoc | Alternative API docs |
| Firebase Console | https://console.firebase.google.com/project/merlin-wallet-prod/overview | Project dashboard |
| GCP Console | https://console.cloud.google.com/home/dashboard?project=merlin-wallet-prod | Cloud dashboard |
| Cloud Run Console | https://console.cloud.google.com/run?project=merlin-wallet-prod | Service management |

---

## Local Development

### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate    # Linux/macOS
.venv\Scripts\activate       # Windows

# Install dependencies
pip install -r requirements.txt

# Run with hot reload
uvicorn main:app --reload --port 8000

# API available at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

The backend reads environment variables from `.env` in the project root.

### Frontend

```bash
cd frontend

# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Available at http://localhost:3000
# API calls proxy to http://localhost:8000 via Next.js rewrites
```

### Running Both Together

Start the backend and frontend in separate terminals. The frontend Next.js dev server proxies `/api/**` requests to `http://localhost:8000`, matching the Firebase Hosting rewrite behavior in production.

---

## Monitoring and Logs

### Cloud Run Logs

```bash
# Stream live logs
gcloud run services logs read merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1 \
  --limit 100

# Tail logs in real time
gcloud run services logs tail merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1
```

### Cloud Run Metrics

View request count, latency, and error rates in the GCP Console:
```
https://console.cloud.google.com/run/detail/europe-west1/merlin-api/metrics?project=merlin-wallet-prod
```

### Firebase Hosting

View hosting release history and traffic in the Firebase Console:
```
https://console.firebase.google.com/project/merlin-wallet-prod/hosting/sites/merlin-app
```

---

## CI/CD (Planned)

GitHub Actions pipeline for automated deployment:

### Trigger
- Push to `main` branch
- Pull request (lint + test only, no deploy)

### Pipeline Steps

1. **Lint and typecheck**
   - `pnpm lint` (frontend)
   - `pnpm typecheck` (frontend)
   - Python linting (backend)

2. **Run tests**
   - `pnpm test` (frontend/SDK)
   - `pytest` (backend)

3. **Build and push Docker image**
   - Build from `Dockerfile`
   - Push to `europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:$SHA`
   - Tag as `:latest`

4. **Deploy backend to Cloud Run**
   - `gcloud run deploy merlin-api --image ...:$SHA`
   - Uses Workload Identity Federation (no service account keys)

5. **Build frontend**
   - `pnpm build` (Next.js static export)

6. **Deploy frontend to Firebase Hosting**
   - `firebase deploy --only hosting:merlin-app`

### Required GitHub Secrets
| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | `merlin-wallet-prod` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity pool provider |
| `GCP_SERVICE_ACCOUNT` | Service account for CI/CD |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase deployment credentials |

---

## Rollback

### Backend Rollback

Cloud Run keeps revision history. Roll back to a previous revision:

```bash
# List revisions
gcloud run revisions list \
  --service merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1

# Route all traffic to a previous revision
gcloud run services update-traffic merlin-api \
  --project merlin-wallet-prod \
  --region europe-west1 \
  --to-revisions REVISION_NAME=100
```

### Frontend Rollback

Firebase Hosting keeps release history. Roll back via the Firebase Console or CLI:

```bash
# List recent releases
firebase hosting:channel:list --project merlin-wallet-prod

# Roll back to a previous version (use the version ID from the console)
firebase hosting:clone merlin-app:VERSION_ID merlin-app:live --project merlin-wallet-prod
```

---

## Cost Management

Key cost drivers and controls:

| Service | Cost Driver | Control |
|---------|-------------|---------|
| Cloud Run | Request count + CPU/memory time | Max instances = 10, scale to zero |
| Firestore | Reads/writes/storage | Security rules prevent abuse |
| Secret Manager | Access operations | Minimal (< $1/month) |
| Artifact Registry | Storage | Prune old images periodically |
| Firebase Hosting | Bandwidth + storage | CDN caching reduces bandwidth |

### Prune Old Docker Images

```bash
# List images
gcloud artifacts docker images list \
  europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker \
  --project merlin-wallet-prod

# Delete a specific image digest
gcloud artifacts docker images delete \
  europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api@sha256:DIGEST \
  --project merlin-wallet-prod
```
