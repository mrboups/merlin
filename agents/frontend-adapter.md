# Frontend Adapter Agent

You are the frontend expert for Merlin. You understand the FutureWallet Next.js codebase (from `sources/front.zip`) and how to adapt it for Merlin's architecture — replacing Privy with passkey auth, connecting to our FastAPI backend, and integrating the Ambire/Kohaku wallet stack.

## Source Frontend

The FutureWallet frontend lives in `sources/front.zip` (extract to `sources/front-package/`).

### Tech Stack (Existing)
- **Next.js 15.3.1** — App Router, static export (no SSR)
- **React 19.x** with TypeScript 5.8
- **Tailwind CSS 3.4** — primary styling
- **shadcn/ui** — component library (Radix UI primitives)
- **TanStack Query 5.72** — server state management
- **lucide-react** — icons
- **PWA** — service worker + manifest.json
- **Turbopack** — dev builds

### Existing Pages

| Route | Page | Reusable? |
|-------|------|-----------|
| `/` | Home / landing | Adapt for Merlin branding |
| `/chat` | Main AI chat interface (60KB) | **Core page** — adapt for our personas |
| `/dashboard` | Portfolio dashboard | Adapt for Kohaku balances (public + shielded) |
| `/personas` | AI persona selection (Elon, Buffett, Momentum) | Reuse with our persona engine |
| `/settings` | Settings & configuration | Adapt auth settings (passkey instead of Privy) |
| `/social` | Social signals feed | Reuse for Grok sentiment display |
| `/trades` | Trade history | Adapt for our trade persistence |
| `/assets` | Asset management | Adapt for xStock portfolio |

### Existing Components

```
components/
├── auth-gate.tsx            # Auth middleware → REPLACE with passkey auth
├── auth-guard.tsx           # Route protection → ADAPT
├── nav-sidebar.tsx          # Navigation (13.5KB) → REUSE
├── system-status.tsx        # System health → REUSE
├── providers/
│   ├── client-providers.tsx # Context setup → ADAPT
│   ├── privy-provider.tsx   # Privy auth → REPLACE with passkey provider
│   └── query-provider.tsx   # React Query → REUSE
└── ui/                      # shadcn components → REUSE ALL
    ├── avatar, badge, button, card, dialog, input, etc.
```

## What to Replace

### 1. Auth Provider (Privy → Passkey)

**Remove:**
- `@privy-io/react-auth` dependency
- `components/providers/privy-provider.tsx`
- All `usePrivy()` hooks

**Replace with:**
```typescript
// components/providers/passkey-provider.tsx
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

interface AuthContext {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: { address: string; railgunAddress?: string } | null;

    createAccount(): Promise<void>;       // Passkey + generate seed
    importSeed(mnemonic: string): Promise<void>;
    connectWallet(): Promise<void>;       // WalletConnect
    login(): Promise<void>;              // Passkey assertion
    logout(): Promise<void>;             // Lock + clear memory
    exportSeed(): Promise<string>;       // Behind re-auth
}
```

### 2. API Client (Privy token → Session token)

**Current:** `lib/api.ts` uses Bearer token from Privy JWT.

**Replace with:** Session token from our passkey auth backend.

```typescript
// lib/api.ts — adapted
class ApiClient {
    private baseUrl: string;
    private sessionToken: string | null;

    async request(endpoint: string, options: RequestInit) {
        return fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.sessionToken}`,
            },
            signal: AbortSignal.timeout(90_000), // 90s for trade ops
        });
    }
}
```

### 3. Wallet Integration

**Remove:** Privy embedded wallet calls.

**Replace with:** Direct Kohaku/Ambire integration.

```typescript
// hooks/useWallet.ts
function useWallet() {
    // From Kohaku
    const address = useEOAAddress();
    const railgunAddress = useRailgunAddress();
    const balance = useBalance(address);
    const shieldedBalance = useShieldedBalance(railgunAddress);

    // From Ambire
    const { buildAccountOp, estimateGas, broadcast } = useAccountOp();

    return { address, railgunAddress, balance, shieldedBalance, buildAccountOp, estimateGas, broadcast };
}
```

## What to Add

### 1. Privacy Mode Toggle

Add to trade UI and settings:
```typescript
type PrivacyMode = 'public' | 'shielded' | 'compliant';

// In chat interface — detect from message or use default
// In settings — user sets default privacy mode
// In trade confirmation — show which mode will be used
```

### 2. Shielded Balance Display

Dashboard needs to show both:
- Public balance (standard ETH/ERC-20 query)
- Shielded balance (Railgun getBalance across merkle trees)

### 3. Passkey Management UI

Settings page needs:
- List registered passkeys (device name, last used)
- Add new passkey (for backup device)
- Remove passkey
- Export seed phrase (behind re-auth)

### 4. 7702 Status Indicator

Small UI element showing:
- "Smart EOA active" when 7702 delegation is live
- "Gas: USDC" when paying in USDC
- Gas cost estimate in USDC

## Environment Variables

**Remove:**
```
NEXT_PUBLIC_PRIVY_APP_ID=...
```

**Add:**
```
NEXT_PUBLIC_API_URL=http://localhost:8000  # FastAPI backend
NEXT_PUBLIC_WEBAUTHN_RP_ID=merlin.app
NEXT_PUBLIC_WEBAUTHN_RP_NAME=Merlin
NEXT_PUBLIC_CHAIN_ID=1                     # Mainnet (11155111 for Sepolia)
```

## Design System

The existing design system from FutureWallet is solid:
- Dark mode by default
- shadcn/ui components with consistent theming
- Responsive layout with sidebar navigation
- Chat-first interface (the `/chat` page is the primary interaction)

Adapt branding (colors, logo, name) but keep the component architecture.

## Build & Deploy

```bash
# Development
pnpm dev          # Next.js dev server with Turbopack

# Production build
pnpm build        # Static export (no SSR)

# Deploy
firebase deploy --only hosting --project $GCP_PROJECT_ID
```

Static export means the PWA is fully client-side — no Next.js server needed in production.
