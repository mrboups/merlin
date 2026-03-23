# Merlin — Project Specification

## Vision

Merlin is a privacy-preserving non-custodial wallet for Ethereum, built on Kohaku's privacy-first architecture. Users trade tokenized stocks (xStocks) and crypto through conversational AI agents — with privacy as a first-class transaction mode via Railgun/Privacy Pools.

## Core Decisions

### Wallet Infrastructure: Kohaku-based (no Privy)

We use Kohaku's wallet infrastructure directly:
- **Seed generation**: BIP-39 mnemonic (24 words) via `@scure/bip39`
- **Key derivation**: BIP-32/BIP-44 for ETH keys (`m/44'/60'/0'/0/{index}`), custom paths for Railgun spending/viewing keys
- **Seed encryption**: Scrypt (N=131072) + AES-128-CTR with keccak256 MAC (Ambire keystore pattern)
- **Transaction signing**: Client-side via derived private key
- **Privacy accounts**: Railgun account creation with spending, viewing, and master keys (future)

### Authentication & Account Creation

- **Passkey-only** for new account creation (WebAuthn / platform authenticator)
- **Seed phrase import** for existing wallet users (future)
- **No email/password, no social login, no Privy**

### Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| **Frontend** | Next.js 15 (App Router, static export) | Live |
| **UI** | shadcn/ui + Radix UI + Tailwind CSS 3.4 | Live |
| **State** | TanStack Query | Live |
| **Auth (frontend)** | `@simplewebauthn/browser` + custom AuthProvider | Live |
| **Crypto (frontend)** | `@noble/hashes`, `@noble/ciphers`, `@noble/curves`, `@scure/bip39`, `@scure/bip32` | Live |
| **Backend** | Python 3.12 + FastAPI | Live |
| **AI** | OpenAI GPT-4o-mini (function calling, streaming) | Live |
| **Social** | Grok/xAI (X/Twitter sentiment analysis) | Live |
| **Database** | Firestore (conversations, trades, signals, challenges) | Live |
| **Hosting** | Firebase Hosting (PWA) + Cloud Run (API) | Live |
| **Cloud** | Google Cloud Platform (europe-west1) | Live |

### Trading

| Component | Status |
|-----------|--------|
| xStock resolver (61 tokens + fuzzy matching) | Live |
| Guardrails (8 safety checks) | Live |
| Trade quoting + confirmation | Live |
| Price oracle (CoinMarketCap + Backed Finance) | Live |
| Portfolio (real on-chain balances + prices) | Live |
| Uniswap V3 on-chain execution | Not yet |
| EIP-7702 + Paymaster (USDC gas) | Not yet |
| Railgun privacy (shield/unshield) | Not yet |
| Persona engine (AI trading strategies) | Not yet |

## Deployed Services

| Service | URL |
|---------|-----|
| Frontend | https://merlin-app.web.app |
| Backend API | https://merlin-api-795485039698.europe-west1.run.app |
| API (via proxy) | https://merlin-app.web.app/api/v1/* |
| GitHub | https://github.com/mrboups/merlin |

## Project Structure

```
merlin/
  src/              # SDK (standalone TypeScript library)
  frontend/         # Next.js 15 PWA
  backend/          # FastAPI Python API
  agents/           # Agent definitions (9 specialized agents)
  specs/            # Specifications
  sources/          # Reference sources (gitignored)
  firebase.json     # Hosting config (rewrites /api/** to Cloud Run)
  firestore.rules   # Security rules
  .firebaserc       # Firebase project alias
```

## Backend Architecture

```
backend/
  main.py                    # FastAPI app, CORS, router registration
  auth/
    webauthn.py              # py-webauthn 2.1.0 registration/authentication
    session.py               # JWT token creation/verification
    models.py                # Pydantic request/response models
    dependencies.py          # get_current_user FastAPI dependency
  db/
    firestore.py             # AsyncClient singleton
    users.py                 # User CRUD + credential storage
    conversations.py         # Chat conversation persistence
    trades.py                # Trade record persistence
    signals.py               # Social signal persistence
    challenges.py            # WebAuthn challenge store (Firestore-backed)
  services/
    provider.py              # JSON-RPC client (ETH balance, eth_call)
    chat.py                  # OpenAI streaming chat with function calling
    xstock.py                # 61 xStock tokens + fuzzy matching
    guardrails.py            # 8 trade safety checks
    prices.py                # Price oracle (CoinMarketCap + Backed Finance)
    balances.py              # On-chain ERC-20 balance fetching
    social.py                # Grok sentiment analysis
  routers/
    auth.py                  # 6 endpoints (register, login, logout, address)
    chat.py                  # 8 endpoints (chat SSE, history, sessions, assets)
    portfolio.py             # 4 endpoints (portfolio, PnL, history, trades)
    social.py                # 1 endpoint (signals)
    personas.py              # 5 endpoints (stub — not yet implemented)
```

## API Endpoints

### Auth (`/api/v1/auth`)
| Method | Path | Status | Description |
|--------|------|--------|-------------|
| POST | `/register/begin` | Live | WebAuthn registration options |
| POST | `/register/complete` | Live | Verify + create user + JWT |
| POST | `/login/begin` | Live | WebAuthn authentication options |
| POST | `/login/complete` | Live | Verify + JWT |
| POST | `/logout` | Live | Client-side (JWT stateless) |
| PATCH | `/address` | Live | Set user's derived EOA address |

### Chat (`/api/v1`)
| Method | Path | Status | Description |
|--------|------|--------|-------------|
| POST | `/chat` | Live | Streaming SSE chat with OpenAI |
| GET | `/chat/history` | Live | Get conversation messages |
| DELETE | `/chat/history` | Live | Clear conversation |
| GET | `/chat/sessions` | Live | List conversations |
| POST | `/chat/sessions` | Live | Create conversation |
| GET | `/chat/provider` | Live | Get AI model preference |
| PATCH | `/chat/provider` | Live | Set AI model preference |
| GET | `/market/assets` | Live | List available xStock tokens |

### Portfolio (`/api/v1`)
| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/portfolio` | Live | Real on-chain balances + prices |
| GET | `/portfolio/pnl` | Live | PnL from trade history |
| GET | `/portfolio/history` | Live | Historical snapshots |
| GET | `/trades` | Live | Paginated trade history |

### Social (`/api/v1`)
| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/social/signals` | Live | Grok sentiment analysis |

### Personas (`/api/v1/agents`)
| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/personas` | 501 | Not implemented |
| POST | `/personas/custom` | 501 | Not implemented |
| POST | `/personas/{id}/activate` | 501 | Not implemented |
| PATCH | `/personas/{id}/config` | 501 | Not implemented |
| DELETE | `/personas/{id}` | 501 | Not implemented |
