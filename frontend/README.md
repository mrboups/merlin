# Merlin — Frontend

Privacy-preserving non-custodial wallet for stocks & crypto. Next.js 15 PWA with passkey authentication.

## Tech Stack

- **Next.js 15** — App Router, static export
- **React 19** + TypeScript 5.8
- **Tailwind CSS 3.4** + shadcn/ui
- **TanStack Query** — server state
- **@simplewebauthn/browser** — passkey auth
- **@noble/hashes, @noble/ciphers, @noble/curves** — cryptography
- **@scure/bip39, @scure/bip32** — seed + key derivation

## Pages

| Route | Description |
|-------|-------------|
| `/` | AI trading chat (primary interface) |
| `/dashboard` | Portfolio with real on-chain balances |
| `/assets` | Browse xStock + crypto assets |
| `/trades` | Trade history |
| `/personas` | AI trading personas |
| `/social` | Social sentiment signals |
| `/settings` | Preferences + wallet management |

## Auth Flow

1. User clicks "Create Account" → WebAuthn passkey prompt
2. Backend verifies → returns JWT session token
3. Frontend generates BIP-39 seed → encrypts with Scrypt+AES (key derived from credential ID)
4. Encrypted seed stored in IndexedDB
5. ETH address derived via BIP-44 (`m/44'/60'/0'/0/0`)

## Development

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## Build & Deploy

```bash
pnpm build      # Static export → out/
firebase deploy --only hosting:merlin-app --project merlin-wallet-prod
```

## Environment

```
NEXT_PUBLIC_API_URL=/api/v1           # Proxied to Cloud Run via Firebase Hosting
NEXT_PUBLIC_RPC_URL=https://...       # Ethereum RPC (for client-side tx signing)
```

## Live

https://merlin-app.web.app
