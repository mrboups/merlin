# CLAUDE.md

## Project Overview

Merlin is a privacy-preserving non-custodial wallet for Ethereum — an optimized rebuild of FutureWallet, built on Kohaku's privacy-first architecture. Users trade tokenized stocks (xStocks) and crypto through conversational AI agents, with privacy as a first-class transaction mode via Railgun/Privacy Pools. Every trade can be public, shielded (Railgun), or compliant (Privacy Pools).

## Workspace Environment
- **Repository**: https://github.com/mrboups/merlin
- **Domain**: Non-custodial wallet app (PWA → iOS/Android)
- **Specs**: See `specs/project-spec.md` for full project specification
- **Agents**: See `agents/` for specialized agent definitions
- **Reference Sources**: See `sources/` for upstream references:
  - `sources/kohaku-master/` -- Ethereum Kohaku: privacy-first Ethereum tooling (Railgun, Privacy Pools, post-quantum 4337 accounts)
  - `sources/kohaku-commons-main/` -- Ambire wallet commons: EIP-7702, paymaster, keystore, AccountOp, gas estimation
  - `sources/wallet-main/` -- Ambire browser wallet UI (reference for wallet patterns)
  - `sources/front/` -- FutureWallet Next.js frontend (our UI starting point — adapt, don't rewrite)
  - `sources/futurewallet-docs.md` -- FutureWallet platform documentation
  - `sources/futurewallet-whitepaper.md` -- FutureWallet technical whitepaper
  - `sources/wdk-docs.md` -- Tether WDK documentation (reference only)
  - `sources/zerodev-docs.md` -- ZeroDev documentation (reference only — not using)
  - `sources/alchemy-wallets-docs.md` -- Alchemy Account Kit documentation (reference only)
  - `sources/dynamic-docs.md` -- Dynamic.xyz documentation (reference only)

## Tech Stack

### Frontend (PWA)
- **Framework**: Next.js 15 (static export)
- **Routing**: Next.js App Router (file-based)
- **Styling**: Tailwind CSS 3 + shadcn/ui
- **State**: React hooks + TanStack Query
- **Data Fetching**: TanStack Query
- **Auth**: WebAuthn/Passkey (@simplewebauthn/browser)
- **Crypto**: @noble/hashes, @noble/ciphers, @noble/curves, @scure/bip39, @scure/bip32
- **Location**: `frontend/`

### Backend
- **Language**: Python 3.12
- **Framework**: FastAPI
- **AI Pipeline**: LangGraph + LangChain
- **LLM**: OpenAI (primary — function calling for intent parsing), Grok (social sentiment)
- **Database**: Firestore (real-time sync, security rules)

### Wallet Infrastructure (Kohaku-based, no Privy)
- **Seed generation**: BIP-39 mnemonic via Kohaku
- **Key derivation**: BIP-32/BIP-44 (ETH) + custom paths (Railgun spending/viewing keys)
- **Transaction signing**: Kohaku TxSigner (Ethers v6 / Viem v2 adapters)
- **Privacy**: Railgun (full privacy), Privacy Pools (compliance-compatible)
- **Authentication**: Passkey/WebAuthn only (new accounts), seed phrase import, wallet connection
- **Post-quantum**: ZKNOX ERC-4337 hybrid signatures (ECDSA + FALCON/ML-DSA)

### SDK Core
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js >= 22
- **Build**: tsup (ESM output)
- **Test**: vitest
- **Lint**: eslint + typescript-eslint
- **Key dependencies**: ethers v6, viem v2, @noble/hashes, @noble/ciphers, @scure/base, ethereum-cryptography

### Infrastructure & Hosting
- **Cloud**: Google Cloud Platform (europe-west1)
- **Compute**: Cloud Run (serverless, auto-scaling)
- **Frontend Hosting**: Firebase Hosting (PWA)
- **Database**: Firestore
- **Secrets**: Google Secret Manager (production) / .env (local)
- **IaC**: Terraform
- **CI/CD**: GitHub Actions

### Trading
- **Chain**: Ethereum mainnet only (Sepolia for dev)
- **DEX**: Uniswap V3
- **Assets**: xStocks (80+ tokenized stock tracker certificates via xStocks.fi/Backed Finance)
- **Compliance**: US persons blocked for xStocks, sanctioned countries blocked

## Google Cloud Setup

### Project Details
- **GCP Project ID**: `merlin-wallet-prod`
- **Project Name**: Merlin Wallet
- **Project Number**: 795485039698
- **Billing Account**: `01BD75-FFCD2A-B7C532`
- **Active Account**: `mrboups@gmail.com`
- **Region**: `europe-west1`
- **Firebase Console**: https://console.firebase.google.com/project/merlin-wallet-prod/overview
- **GCP Console**: https://console.cloud.google.com/home/dashboard?project=merlin-wallet-prod

### Provisioned Services
| Service | Status | Details |
|---------|--------|---------|
| **Firestore** | Active | Native mode, `europe-west1`, real-time updates enabled |
| **Firebase Hosting** | Active | Site: `merlin-app`, URL: https://merlin-app.web.app |
| **Cloud Run** | Enabled | Region: `europe-west1` (no service deployed yet) |
| **Secret Manager** | Active | Secrets: `ETH_RPC_URL`, `SEPOLIA_RPC_URL`, `OPENAI_API_KEY`, `GROK_API_KEY` |
| **Artifact Registry** | Active | Repo: `merlin-docker` (Docker, `europe-west1`) |
| **Cloud Build** | Enabled | For building Docker images |

### Docker Registry
```
europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker
```

### Secret Manager Secrets
All secrets are created with placeholder values — replace with real values:
```bash
echo -n "YOUR_REAL_VALUE" | gcloud secrets versions add ETH_RPC_URL --data-file=- --project=merlin-wallet-prod
echo -n "YOUR_REAL_VALUE" | gcloud secrets versions add SEPOLIA_RPC_URL --data-file=- --project=merlin-wallet-prod
echo -n "YOUR_REAL_VALUE" | gcloud secrets versions add OPENAI_API_KEY --data-file=- --project=merlin-wallet-prod
echo -n "YOUR_REAL_VALUE" | gcloud secrets versions add GROK_API_KEY --data-file=- --project=merlin-wallet-prod
```

### Environment Configuration
See `.env.example` for all required variables. Copy to `.env` and fill in real values.

### Verify Setup
```bash
gcloud auth list                        # Must show mrboups@gmail.com as active
gcloud config get-value project         # Must show merlin-wallet-prod
firebase projects:list                  # Must show merlin-wallet-prod
```

### Deployment (always verify first — see Deployment Safety section)
```bash
# Backend (Cloud Run)
gcloud builds submit --project merlin-wallet-prod --region europe-west1
gcloud run deploy merlin-api --project merlin-wallet-prod --region europe-west1

# Frontend (Firebase Hosting)
firebase deploy --only hosting:merlin-app --project merlin-wallet-prod

# Docker build + push
docker build -t europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest .
docker push europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest
```

## Specialized Agents

Agent definitions live in `agents/`:

| Agent | File | Purpose |
|-------|------|---------|
| Kohaku Expert | `agents/kohaku-expert.md` | Kohaku SDK — Railgun accounts, Privacy Pools, key derivation, ZK proofs, post-quantum |
| Ambire 7702 | `agents/ambire-7702.md` | EIP-7702 delegation, AmbirePaymaster (gas in USDC), AccountOp, keystore encryption, broadcast modes |
| Passkey Auth | `agents/passkey-auth.md` | WebAuthn passkey creation/login, seed encryption, session management, recovery flows |
| Frontend Adapter | `agents/frontend-adapter.md` | Adapting FutureWallet Next.js frontend — replacing Privy, adding privacy modes, wallet integration |
| xStock Resolver | `agents/xstock-resolver.md` | Fuzzy matching of user input to xStock tokens (company names, tickers, partial matches) |
| Trade Execution | `agents/trade-execution.md` | 6-step trade pipeline: quote → simulate → policy → execute → confirm → persist |
| Persona Engine | `agents/persona-engine.md` | Modular AI persona system — built-in + custom trading strategies |
| Guardrails | `agents/guardrails.md` | 11 safety checks enforced on every trade |
| Chat Intent Parser | `agents/chat-intent-parser.md` | Natural language → structured trade/query/persona intents |

## Architecture

Merlin follows a modular architecture with four core modules coordinated by a top-level `Merlin` orchestrator class. Each module is self-contained with its own types, service, tests, and public API index.

The `Merlin` class provides convenience methods that delegate to the underlying services, but each service can also be used independently for advanced use cases.

### Modules
- `wallet`: Multi-chain wallet manager -- registers wallet implementations per blockchain, derives accounts by BIP-44 index or path, manages seed lifecycle
- `provider`: RPC provider abstraction -- manages chain configurations, creates JSON-RPC providers with fallback support, abstracts over ethers/viem/raw RPC
- `privacy`: Privacy protocol integration -- registers and manages privacy providers (Railgun, Privacy Pools), handles shield/unshield/private-transfer operations
- `transaction`: Transaction orchestrator -- routes transaction requests to wallet (public) or privacy (shielded) modules based on requested mode

### Data Flow
```
User -> Merlin (orchestrator)
         |-> WalletService  (account derivation, public tx signing)
         |-> ProviderService (RPC connections, chain configs)
         |-> PrivacyService  (shield/unshield/private transfer)
         |-> TransactionService (routes public vs shielded)
```

## Development Rules
- All code must be production-ready. No mocks, no placeholders, no dummy data.
- Every module must be self-contained with a clean public API (index file).
- Shared code goes in `lib/` or `types/`, never duplicated across modules.
- Environment variables go in `.env` (never committed) and are documented in `.env.example`.
- Every new module must include types and at minimum a smoke test.

## Production-Only Rule — MANDATORY

**We NEVER use dummy data, mock data, placeholder content, "coming soon" messages, or dev fallbacks in our deployed product.**

- Every feature must use real APIs, real data, and real integrations
- If a service isn't ready yet, don't ship the feature — hide it or return a clear error ("not available")
- **NEVER write "coming soon"** — either it works or it's not shown. No aspirational messages.
- No hardcoded fake portfolio values, fake prices, fake users, or fake trades
- No fake transaction hashes, fake confirmations, or fake success messages
- Auth must use real passkey/WebAuthn login — no simulated auth flows
- All data must come from real Firestore documents or real API responses
- If an API call fails, show a proper error state — not fake data
- Trade results must reflect actual on-chain execution — never say "Trade executed successfully" unless it really did

This is a BLOCKING requirement — no exceptions.

## Deployment Safety — MANDATORY

Before ANY deploy command (`gcloud builds submit`, `gcloud run deploy`, `firebase deploy`, etc.), you MUST:

1. **Read `.env`** and extract `GCP_PROJECT_ID` and `GCP_ACCOUNT`
2. **Verify gcloud account**: `gcloud auth list` — must match `GCP_ACCOUNT` from .env
3. **Verify gcloud project**: `gcloud config get-value project` — must match `GCP_PROJECT_ID` from .env
4. **Verify Firebase account** (if Firebase deploy): `firebase login:list` — must match `GCP_ACCOUNT`
5. **If ANY mismatch**: STOP and ask the user. Do NOT proceed.
6. **Verify live site matches local** (if hosting deploy): Fetch the current live site and compare with the local file to confirm they look like the same project. If the live site content looks completely different or belongs to another project, STOP and alert the user.
7. **Always use explicit `--project`** flag: `--project $GCP_PROJECT_ID`
8. **Always use explicit `--region`** flag: `--region $GCP_REGION`
9. **NEVER deploy to a project not matching .env values**

This is a BLOCKING requirement — no exceptions.

## Security Policy — MANDATORY

- **NEVER install MCP servers** (official or unofficial) without explicit user approval
- **NEVER install npm packages, GitHub repos, or any external dependency** without explicit user approval
- **NEVER run `npx`, `npm install`, `pip install`, or any package manager command that adds new dependencies** without explicit user approval
- When the user asks to install something, explain what it is and its risks FIRST, then wait for approval before proceeding

## Orchestrator & Agent System — MANDATORY

### Orchestrator

**`dev-orchestrator`** is the lead orchestrator for all development work. Use it for:
- Project scaffolding and module creation
- Coordinating multi-agent work
- Architecture decisions that span multiple domains
- Setting up new features end-to-end

The dev-orchestrator delegates to specialized agents and reviews their outputs before reporting.

### Integrated Agents — MUST USE

Merlin has **9 registered project agents**. These are integrated Claude Code agents (spawned via the Agent tool with `subagent_type`), NOT just markdown files. **You MUST use the integrated agents when developing — never use generic `general-purpose` agents for domain-specific work.**

| Agent (subagent_type) | Domain | When to use |
|---|---|---|
| `kohaku-expert` | Kohaku SDK, Railgun, Privacy Pools, key derivation, ZK proofs, post-quantum | Any privacy protocol work, account creation, Kohaku interfaces |
| `ambire-7702-wallet` | EIP-7702, AmbirePaymaster, AccountOp, keystore, gas estimation, broadcast modes | Transaction building, gasless in USDC, 7702 delegation, seed encryption |
| `passkey-auth` | WebAuthn, passkey creation/login, seed encryption, session management, recovery | Auth flows, account onboarding, lock/unlock, credential storage |
| `frontend-adapter` | Next.js frontend, replacing Privy, privacy modes, component adaptation | Any frontend/UI work, page modifications, provider changes |
| `xstock-resolver` | xStock token mapping, fuzzy matching, company name → token resolution | Token identification, trade intent parsing, asset lookup |
| `trade-executor` | 6-step trade pipeline, Uniswap V3, quoting, simulation, execution | Trade execution, swap routing, on-chain confirmation |
| `persona-engine` | AI personas, trading strategies, custom persona creation, operating modes | Persona logic, strategy configs, memory isolation, social intelligence |
| `guardrails-enforcer` | 11 safety checks, trade limits, compliance, deployment safety | Pre-trade validation, policy enforcement, audit logging |
| `chat-intent-parser` | Natural language → structured intents, amount parsing, disambiguation | Chat message processing, intent extraction, context-aware resolution |

### Delegation Rules

- **Always use the specialized agent** for its domain — never use `general-purpose` when a project agent exists for the task
- **Never do code changes yourself** — always delegate to the appropriate project agent
- **Never search the codebase yourself** (beyond simple Glob/Grep) — delegate to `Explore`
- **Never plan architecture yourself** — delegate to `Plan`
- **Launch agents in parallel** whenever tasks are independent
- **Review all agent outputs** before reporting to the user
- **For cross-domain work**, launch multiple specialized agents in parallel (e.g., `ambire-7702-wallet` + `kohaku-expert` for a shielded trade with USDC gas)

### Agent Routing Examples

```
User: "implement the passkey login flow"
→ Launch: passkey-auth

User: "build the Uniswap swap with USDC gas payment"
→ Launch in parallel: trade-executor + ambire-7702-wallet

User: "adapt the dashboard page to show shielded balances"
→ Launch in parallel: frontend-adapter + kohaku-expert

User: "parse 'buy $10 of Tesla privately' into a trade intent"
→ Launch: chat-intent-parser → then xstock-resolver → then guardrails-enforcer

User: "set up the project structure for a new module"
→ Launch: dev-orchestrator
```

### Source Documentation Rule — MANDATORY

All agents MUST reference the documentation in `sources/` when implementing features. These are the authoritative references:

| When building... | Read from sources/ |
|---|---|
| Kohaku/Railgun/Privacy integration | `sources/kohaku-master/` — actual source code + READMEs |
| Ambire/7702/Paymaster/Keystore | `sources/kohaku-commons-main/` — actual source code + contracts |
| Frontend adaptation | `sources/front/` — the FutureWallet Next.js app we're adapting |
| Feature parity with FutureWallet | `sources/futurewallet-docs.md` + `sources/futurewallet-whitepaper.md` |
| Wallet patterns / reference | `sources/wallet-main/` — Ambire browser wallet UI |
| xStocks trading mechanics | `sources/futurewallet-docs.md` (xStocks section) |

**Never guess or hallucinate interfaces, APIs, or contract addresses.** Always read the actual source code in `sources/` to verify.

This is a BLOCKING requirement — no exceptions.

## Commands
- `pnpm dev`: Start tsup in watch mode
- `pnpm build`: Production build (ESM + DTS)
- `pnpm test`: Run vitest test suite
- `pnpm test:watch`: Run vitest in watch mode
- `pnpm lint`: Lint source code with eslint
- `pnpm lint:fix`: Auto-fix lint issues
- `pnpm typecheck`: Run TypeScript type checking (no emit)
- `pnpm clean`: Remove dist directory

## Environment Variables
See **Google Cloud Setup** section above for full `.env` template.

| Variable | Description | Required |
|----------|-------------|----------|
| `GCP_PROJECT_ID` | Google Cloud project ID | Yes (deploy) |
| `GCP_ACCOUNT` | Google Cloud account email | Yes (deploy) |
| `GCP_REGION` | GCP region (europe-west1) | Yes (deploy) |
| `ETH_RPC_URL` | Ethereum mainnet RPC endpoint | For mainnet operations |
| `SEPOLIA_RPC_URL` | Sepolia testnet RPC endpoint | For testnet development |
| `OPENAI_API_KEY` | OpenAI API key for AI agents | Yes |
| `GROK_API_KEY` | Grok API key for social sentiment | For social features |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Yes (deploy) |
| `DEBUG` | Enable verbose logging ("true" / "false") | No |
