# Merlin — Development Plan

## Progress Overview

```
Phase 0 (Infra + Scaffold)        ██████████ DONE
Phase 1 (Passkey Auth + Keys)     ██████████ DONE
Phase 2 (Chat + Portfolio + Social) ██████████ DONE
Phase 3 (Uniswap V3 Execution)   ░░░░░░░░░░ Not started
Phase 4 (EIP-7702 + Paymaster)    ░░░░░░░░░░ Not started
Phase 5 (Persona Engine)          ░░░░░░░░░░ Not started
Phase 6 (Privacy / Railgun)       ░░░░░░░░░░ Not started
Phase 7 (Production Hardening)    ░░░░░░░░░░ Not started
```

---

## Phase 0: Infrastructure + Scaffold — DONE

- [x] GCP project: `merlin-wallet-prod` (europe-west1)
- [x] Firestore: Native mode
- [x] Firebase Hosting: `merlin-app` → https://merlin-app.web.app
- [x] Artifact Registry: `merlin-docker`
- [x] Secret Manager: all secrets provisioned
- [x] Cloud Run: `merlin-api` deployed
- [x] Frontend: adapted from FutureWallet, passkey auth, renamed to Merlin
- [x] Backend: FastAPI skeleton with Dockerfile
- [x] Firebase config: `firebase.json` with Cloud Run rewrite
- [x] Firestore rules: user-scoped read/write
- [x] `.gitignore` updated

---

## Phase 1: Passkey Auth + Key Derivation — DONE

- [x] Backend WebAuthn: py-webauthn 2.1.0, registration/authentication
- [x] JWT sessions: python-jose, 24h expiry
- [x] Frontend WebAuthn: @simplewebauthn/browser, AuthProvider
- [x] Seed generation: BIP-39 24-word mnemonic (@scure/bip39)
- [x] Seed encryption: Scrypt + AES-128-CTR + keccak256 MAC (@noble/hashes, @noble/ciphers)
- [x] Encryption key: HKDF-SHA256 from passkey credential ID
- [x] Secure storage: IndexedDB for encrypted seed blobs
- [x] Key derivation: BIP-44 m/44'/60'/0'/0/{index} (@scure/bip32)
- [x] WalletManager: unlock/lock/15min auto-lock
- [x] Backend RPC provider: JSON-RPC via httpx
- [x] Firestore user CRUD with credential index

---

## Phase 2: Chat + Portfolio + Social — DONE

- [x] OpenAI chat: GPT-4o-mini with function calling, SSE streaming
- [x] Intent parsing: trade intents extracted via function calls
- [x] xStock resolver: 61 tokens, fuzzy matching, aliases, disambiguation
- [x] Guardrails: 8 safety checks (amount, asset, rate limit, duplicates, compliance)
- [x] Price oracle: CoinMarketCap (crypto) + Backed Finance (xStocks)
- [x] Portfolio: real on-chain ETH + ERC-20 balances with live prices
- [x] PnL: calculated from trade history cost basis
- [x] Social signals: Grok API sentiment analysis
- [x] Conversation persistence: Firestore (conversations + messages)
- [x] Trade records: Firestore with status tracking
- [x] Challenge store: migrated from in-memory to Firestore
- [x] Cloud Run env vars: all real API keys deployed
- [x] All endpoints require JWT auth

---

## Phase 3: Uniswap V3 On-Chain Execution — NOT STARTED

**Goal:** Execute real token swaps on Ethereum.

| Task | Description |
|------|-------------|
| 3A | Uniswap V3 Quoter contract integration (quote swap amounts) |
| 3B | SwapRouter transaction encoding (exactInputSingle, exactOutputSingle) |
| 3C | ERC-20 approval management |
| 3D | Client-side transaction signing (WalletManager private key) |
| 3E | Transaction submission + confirmation polling |
| 3F | Trade status tracking (quoted → submitted → confirmed / failed) |

**Architecture note:** Since Merlin is non-custodial, the backend quotes trades but the frontend signs and submits. The flow:
1. Backend: quote via Quoter contract → return unsigned tx
2. Frontend: sign with WalletManager → submit via RPC
3. Frontend: poll for confirmation → report back to backend
4. Backend: persist final trade status

---

## Phase 4: EIP-7702 + Paymaster — NOT STARTED

**Goal:** Pay gas in USDC, batch transactions.

| Task | Description |
|------|-------------|
| 4A | Integrate `ambire-common` package |
| 4B | EIP-7702 delegation (Type 4 tx to AmbireAccount7702) |
| 4C | AccountOp construction (batch calls, gas estimation) |
| 4D | AmbirePaymaster integration (USDC gas payment) |
| 4E | Broadcast mode selection (self, self7702, bundler) |

---

## Phase 5: Persona Engine — NOT STARTED

**Goal:** Modular AI trading strategies.

| Task | Description |
|------|-------------|
| 5A | IPersona interface + StrategyConfig types |
| 5B | 3 built-in personas: Elon, Buffett, AI Momentum |
| 5C | Custom persona creation API |
| 5D | Operating modes: manual, assisted, autonomous |
| 5E | Memory isolation per persona |
| 5F | Frontend: persona UI, switching, performance tracking |

---

## Phase 6: Privacy / Railgun — NOT STARTED

**Goal:** Shield, unshield, and trade privately.

| Task | Description |
|------|-------------|
| 6A | Railgun account: spending + viewing key derivation from seed |
| 6B | Shield/unshield operations (prepareShield, prepareUnshield) |
| 6C | Shielded balance tracking (merkle tree indexing) |
| 6D | Private trading flow (shield → swap → unshield) |
| 6E | Privacy Pools: ASP-based selective disclosure |
| 6F | Frontend: privacy mode toggle, shielded balances |

---

## Phase 7: Production Hardening — NOT STARTED

| Task | Description |
|------|-------------|
| 7A | Security audit (crypto, passkey, Firestore rules) |
| 7B | Monitoring (Cloud Logging, error tracking) |
| 7C | Rate limiting, DDoS protection |
| 7D | Recovery flows (seed export, multi-device passkeys) |
| 7E | Performance (caching, bundle optimization) |
| 7F | CI/CD (GitHub Actions) |
