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
