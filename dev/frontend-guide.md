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
