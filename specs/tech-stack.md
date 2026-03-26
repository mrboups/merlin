# Merlin — Full Tech Stack Specification

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  USER ONBOARDING                                                │
│                                                                 │
│  Passkey (WebAuthn) ──→ unlocks encrypted seed (Scrypt+AES)    │
│                          ↓                                      │
│  OR Seed phrase import ──→ Kohaku key derivation (BIP-32/44)   │
│                          ↓                                      │
│  OR WalletConnect ──────→ External EOA                         │
│                          ↓                                      │
│                     Pure EOA (single address)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  TRANSACTION (per-tx, temporary)                                │
│                                                                 │
│  EOA signs EIP-7702 authorization (Type 4 tx)                  │
│       ↓                                                         │
│  Delegates to AmbireAccount7702 contract                       │
│       ↓                                                         │
│  Gains smart account features:                                  │
│    • Batch calls (multi-call in 1 tx)                          │
│    • Pay gas in USDC via AmbirePaymaster                       │
│    • EntryPoint 4337 compatibility                             │
│       ↓                                                         │
│  Execute: Uniswap swap / shield / unshield / transfer          │
│       ↓                                                         │
│  Delegation ends. EOA stays pure.                              │
└─────────────────────────────────────────────────────────────────┘
```

## Account Model

**Single pure EOA** — no permanent smart contract wallet.

- Users always have one Ethereum address (EOA)
- For each transaction, the EOA temporarily delegates to `AmbireAccount7702` via EIP-7702 (Pectra)
- This enables paymaster gas payment (USDC), batch calls, and ERC-4337 compatibility
- After the transaction, the delegation ends — the EOA stays pure
- No vendor lock-in, no proprietary smart accounts

### Onboarding Paths

| Method | Flow | Result |
|--------|------|--------|
| **Passkey (new user)** | WebAuthn → generate BIP-39 seed → encrypt with Scrypt+AES → store locally | New EOA |
| **Seed phrase import** | Enter mnemonic → Kohaku key derivation → EOA | Imported EOA |
| **Wallet connection** | WalletConnect / injected provider → external EOA | External EOA |

All three paths produce a standard Ethereum EOA that works identically with the rest of the stack.

## Layer-by-Layer Stack

### Authentication
| Component | Technology | Source |
|-----------|-----------|--------|
| Passkey creation/verification | SimpleWebAuthn (`@simplewebauthn/server` + `@simplewebauthn/browser`) | Build ourselves |
| Seed encryption at rest | Scrypt (N=131072, r=8, p=1) + AES-128-CTR | From `ambire-common` keystore controller |
| Session management | Passkey credential → unlock encrypted seed in memory | Build ourselves |

### Wallet Infrastructure
| Component | Technology | Source |
|-----------|-----------|--------|
| Key derivation (ETH) | BIP-39/BIP-44: `m/44'/60'/0'/0/{index}` | From `@kohaku-eth/railgun` |
| Key derivation (Railgun) | Spending: `m/44'/1984'/0'/0'/{index}`, Viewing: `m/420'/1984'/0'/0'/{index}` | From `@kohaku-eth/railgun` |
| Transaction signing | TxSigner interface (Ethers v6 / Viem v2 adapters) | From `@kohaku-eth/provider` |
| Provider abstraction | EthereumProvider (multi-backend: Ethers, Viem, Colibri, Helios) | From `@kohaku-eth/provider` |

### EIP-7702 + Gasless (Ambire)
| Component | Technology | Source |
|-----------|-----------|--------|
| Smart account delegation | `AmbireAccount7702.sol` — EOA temporarily gains smart account features | From `ambire-common` contracts |
| Paymaster (gas in USDC) | `AmbirePaymaster.sol` — relayer signs validation, EntryPoint sponsors gas | From `ambire-common` contracts |
| Tx abstraction | AccountOp — batch calls, fee routing, broadcast mode selection | From `ambire-common` libs |
| Gas estimation | Multi-path: deployless simulation, bundler estimation, provider estimation | From `ambire-common` estimation controller |
| Broadcast modes | `self` (EOA direct), `self7702` (smart EOA), `bundler` (4337+paymaster), `delegation` (first 7702 activation) | From `ambire-common` libs |
| Bundler | ERC-4337 EntryPoint (Pimlico / Stackup / self-hosted) | Standard infra |

### Privacy (Kohaku)
| Component | Technology | Source |
|-----------|-----------|--------|
| Railgun (full privacy) | Shield/transfer/unshield with zk-SNARKs, merkle tree indexing | From `@kohaku-eth/railgun` |
| Privacy Pools (compliant) | Optional selective disclosure, ASP-based | From `@kohaku-eth/privacy-pools` |
| Post-quantum (future) | ZKNOX ERC-4337 hybrid signatures (ECDSA + FALCON/ML-DSA) | From `@kohaku-eth/pq-account` |

### Frontend
| Component | Technology | Source |
|-----------|-----------|--------|
| Framework | Next.js 15 (App Router, static export) | Adapted from FutureWallet |
| UI library | shadcn/ui + Radix UI | Adapted from FutureWallet |
| Styling | Tailwind CSS 3.4 | Adapted from FutureWallet |
| State | TanStack Query (server state) | Adapted from FutureWallet |
| Icons | lucide-react | Adapted from FutureWallet |
| PWA | Service worker + manifest.json | Adapted from FutureWallet |

**Status:** Frontend adapted from FutureWallet. Auth replaced with:
- Passkey/WebAuthn authentication (SimpleWebAuthn)
- BIP-39 seed generation + Scrypt/AES encryption (Ambire keystore pattern)
- BIP-44 key derivation for Ethereum
- Custom AuthProvider + WalletManager
- API calls pointing to our FastAPI backend on Cloud Run

### Backend
| Component | Technology | Source |
|-----------|-----------|--------|
| Language | Python 3.12 | Build ourselves |
| Framework | FastAPI | Build ourselves |
| AI chat | Claude Haiku (tool use, SSE streaming) | Live |
| LLM (intent parsing) | Anthropic Claude (tool use) | Build ourselves |
| LLM (social sentiment) | Grok (X/Twitter analysis) | Build ourselves |
| Persistence | Firestore (conversations, trades, signals, challenges) | Live |

### Infrastructure
| Component | Technology | Source |
|-----------|-----------|--------|
| Cloud | Google Cloud Platform (europe-west1) | |
| Compute | Cloud Run (serverless, auto-scaling) | |
| Frontend hosting | Firebase Hosting (PWA) | |
| Database | Firestore (real-time sync, security rules) | |
| Secrets | Google Secret Manager (prod) / .env (local) | |
| IaC | Terraform | |
| CI/CD | GitHub Actions | |

### Trading
| Component | Technology | Source |
|-----------|-----------|--------|
| Chain | Ethereum mainnet (Sepolia for dev) | |
| DEX | Uniswap V3 | Direct integration |
| Assets | xStocks (80+ tokenized tracker certificates via xStocks.fi) | |
| Execution | 6-step pipeline: Quote → Simulate → Policy → Execute → Confirm → Persist | Build ourselves |

## How to Consume Ambire Commons

Published on npm as `@ambire/common`. Ships raw TypeScript (no compiled dist).

```json
// package.json
{
  "dependencies": {
    "ambire-common": "npm:@ambire/common@^2.68.0"
  }
}
```

```typescript
// Import individual modules — no barrel exports
import { KeystoreController } from 'ambire-common/src/controllers/keystore/keystore'
import { AccountOp } from 'ambire-common/src/libs/accountOp/accountOp'
import { EOA7702 } from 'ambire-common/src/libs/account/EOA7702'
import { BROADCAST_OPTIONS } from 'ambire-common/src/libs/broadcast/broadcast'
```

Your bundler (Vite/Next.js) must transpile it. This is the intended pattern — wallet-main does the same.

**Staying updated:** `pnpm update ambire-common` pulls new releases. EIP-7702 improvements, paymaster updates, and new features flow automatically.

## Deployed Contracts (Already Live)

```
AmbireAccount7702:   0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d
AmbirePaymaster:     0xA8B267C68715FA1Dca055993149f30217B572Cf0
AmbireFactory:       0x26cE6745A633030A6faC5e64e41D21fb6246dc2d
ERC-4337 EntryPoint: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
```

## What Comes From Where

| From `ambire-common` | From `@kohaku-eth/*` | Adapted from FutureWallet | Build Ourselves |
|---|---|---|---|
| Keystore (seed encryption) | Railgun accounts | Next.js app shell | Passkey/WebAuthn auth |
| AccountOp (tx abstraction) | Shield/transfer/unshield | Chat UI | AI agent pipeline (9 nodes) |
| EIP-7702 delegation | Privacy Pools | Dashboard UI | Persona engine |
| AmbirePaymaster (gas in USDC) | Provider abstraction | Personas UI | xStock resolver |
| Gas estimation (multi-path) | Key derivation (BIP paths) | Trades history UI | Uniswap V3 integration |
| Broadcast mode selection | ZK proof generation | Settings UI | Guardrails (11 checks) |
| Account state tracking | Merkle tree indexing | shadcn components | Firestore persistence |
| Transaction humanization | Post-quantum (future) | PWA setup | Social intelligence |
| Network/chain config | | API client | Firestore persistence |

## Transaction Flow: xStock Trade (Default)

```
1. User: "buy $10 of Tesla"
   ↓
2. Chat Intent Parser → { side: 'buy', asset: 'xTSLA', amount: { value: 10, unit: 'usd' } }
   ↓
3. xStock Resolver → xTSLA contract address confirmed
   ↓
4. Persona (if active) → strategy analysis + hypothesis
   ↓
5. Guardrails → 11 safety checks (all pass)
   ↓
6. Trade Executor:
   a. Quote: Uniswap V3 quote (USDC → xTSLA)
   b. Simulate: eth_call dry-run
   c. Build AccountOp:
      - calls: [approve USDC, swap on Uniswap V3]
      - broadcastOption: 'bundler' (for USDC gas payment)
      - gasFeePayment: { inToken: USDC, isSponsored: false }
   d. Sign EIP-7702 authorization (delegate to AmbireAccount7702)
   e. Submit UserOp to bundler → EntryPoint → Paymaster validates → execute
   f. Confirm: wait for receipt, verify success
   g. Persist: log to Firestore
   ↓
7. Response: "Bought 0.0X xTSLA for $10. Tx: 0x..."
```

## Transaction Flow: Private Trade (Shielded)

```
1. User: "buy $10 of Tesla privately"
   ↓
2-5. Same as above, privacy mode = 'shielded'
   ↓
6. Trade Executor (privacy-wrapped):
   a. Shield USDC into Railgun pool (prepareShield)
   b. Wait for shield confirmation
   c. Execute private swap (unshield USDC → swap → re-shield xTSLA)
   d. OR: unshield → public swap → shield result
   e. Confirm + persist
   ↓
7. Response: "Privately bought xTSLA. Tx: 0x..."
```

## Broadcast Mode Selection

| Scenario | Mode | Gas Payment | 7702 Needed? |
|----------|------|-------------|--------------|
| Simple ETH transfer | `self` | ETH | No |
| Multi-call (batch) with ETH gas | `self7702` | ETH | Yes (if first time) |
| Any trade with USDC gas | `bundler` | USDC via paymaster | Yes |
| First 7702 activation | `delegation` | ETH (one-time) | Yes |
| Railgun shield/unshield | `bundler` or `self7702` | USDC or ETH | Depends |

**Default for xStock trades:** `bundler` mode → user pays gas in USDC, never needs ETH.

## Zero Vendor Lock-in

Everything is either:
- **Open source npm packages** (ambire-common, kohaku) — can fork if needed
- **Standard Ethereum infra** (EIP-7702, ERC-4337, EntryPoint) — no proprietary APIs
- **Self-hostable** (bundler, paymaster relay) — no mandatory third-party services
- **No third-party auth providers, no ZeroDev, no Dynamic** — pure Ethereum-native stack
