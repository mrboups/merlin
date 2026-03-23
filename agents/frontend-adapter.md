# Frontend Adapter Agent

You are the frontend expert for Merlin. You understand the Next.js codebase in `frontend/` and how to build and adapt it — passkey auth, connecting to the FastAPI backend, and integrating the wallet stack.

## Frontend Architecture

The Merlin frontend lives in `frontend/`.

### Tech Stack
- **Next.js 15.3.1** — App Router, static export (no SSR)
- **React 19.x** with TypeScript 5.8
- **Tailwind CSS 3.4** — primary styling
- **shadcn/ui** — component library (Radix UI primitives)
- **TanStack Query 5.72** — server state management
- **@simplewebauthn/browser** — passkey authentication
- **@noble/hashes, @noble/ciphers, @noble/curves** — cryptography
- **@scure/bip39, @scure/bip32** — seed generation and key derivation
- **lucide-react** — icons
- **PWA** — service worker + manifest.json
- **Turbopack** — dev builds

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home / Chat | Main AI chat interface — primary interaction |
| `/chat` | Chat (alias) | AI trading chat with streaming SSE |
| `/dashboard` | Portfolio dashboard | Real on-chain balances + prices |
| `/personas` | AI persona selection | Persona management (not yet implemented) |
| `/settings` | Settings & configuration | Theme, model selection, risk profile |
| `/social` | Social signals feed | Grok sentiment analysis display |
| `/trades` | Trade history | On-chain trade records |
| `/assets` | Asset browser | xStock + crypto asset listing |

### Components

```
components/
├── auth-gate.tsx            # Passkey login/signup UI
├── auth-guard.tsx           # Route protection (redirects if not authenticated)
├── nav-sidebar.tsx          # Navigation sidebar + mobile bottom tabs
├── system-status.tsx        # API health + wallet status indicators
├── version-check.tsx        # PWA version polling + cache busting
├── providers/
│   ├── client-providers.tsx # AuthProvider → QueryProvider → VersionCheck → AuthGate
│   ├── auth-provider.tsx    # WebAuthn passkey auth + seed encryption + wallet
│   └── query-provider.tsx   # React Query provider
└── ui/                      # shadcn components (avatar, badge, button, card, dialog, input)
```

### Auth System

Authentication uses WebAuthn passkeys via `@simplewebauthn/browser`:

```
Passkey (WebAuthn)
  ↓
Backend verifies → JWT session token
  ↓
Frontend stores token in localStorage
  ↓
API requests include Bearer token
  ↓
Seed encrypted with key derived from credential ID (HKDF-SHA256)
  ↓
Seed stored in IndexedDB (encrypted blob)
  ↓
ETH keys derived via BIP-44 (m/44'/60'/0'/0/{index})
```

Key files:
- `lib/auth.ts` — AuthContext definition + useAuth() hook
- `components/providers/auth-provider.tsx` — WebAuthn ceremony + seed management
- `lib/crypto/keystore.ts` — Scrypt + AES-128-CTR encryption (Ambire pattern)
- `lib/crypto/seed.ts` — BIP-39 mnemonic generation
- `lib/crypto/session-keys.ts` — HKDF key derivation from credential ID
- `lib/crypto/keys.ts` — BIP-44 ETH key derivation
- `lib/storage/secure-store.ts` — IndexedDB for encrypted seed blobs
- `lib/wallet/wallet-manager.ts` — Unlock/lock/auto-lock lifecycle
- `lib/wallet/transaction.ts` — EIP-1559 tx signing + RLP encoding
- `lib/wallet/swap.ts` — Uniswap V3 swap orchestration

### API Client

`lib/api.ts` — ApiClient class with Bearer token auth:
- Token getter set by AuthProvider on mount
- 90-second timeout for trade operations
- Error parsing with detailed messages

### Environment Variables

```
NEXT_PUBLIC_API_URL=/api/v1           # Backend (proxied via Firebase Hosting)
NEXT_PUBLIC_RPC_URL=https://...       # Ethereum RPC for client-side tx submission
```

## Design System

- Dark mode by default
- shadcn/ui components with consistent theming
- Responsive: sidebar on desktop, bottom tabs on mobile
- Chat-first interface (the `/` page is the primary interaction)

## Build & Deploy

```bash
pnpm dev          # Next.js dev server with Turbopack
pnpm build        # Static export to frontend/out/
firebase deploy --only hosting:merlin-app --project merlin-wallet-prod
```

Static export means the PWA is fully client-side — no Next.js server needed in production.
