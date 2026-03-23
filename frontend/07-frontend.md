# Frontend

## Overview

FutureWallet has two separate frontend apps:

1. **apps/webapp/** — Next.js 15 web app for browser/desktop, uses `@privy-io/react-auth` for passkey auth, deployed to Firebase Hosting at `app.futurewallet.fi`
2. **apps/mobile/** — Expo 52 native app for iOS and Android only, uses `@privy-io/expo` for passkey auth

The web app is NOT an Expo web export. It is a standalone Next.js application with its own routing, components, and deployment pipeline.

---

## Web App (apps/webapp/)

Next.js 15 with App Router, shadcn/ui, Tailwind CSS. Uses `@privy-io/react-auth` for real passkey authentication.

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Chat (Home) | `/` | ChatGPT/Gemini-style AI trading chat — the homepage. Login when not authenticated. |
| Assets | `/assets` | Searchable asset catalog with real Alchemy prices |
| Trades | `/trades` | Full trade history with pagination and status badges |
| Personas | `/personas` | Persona management, activation, create/delete custom personas |
| Social | `/social` | Social signals feed with sentiment badges (bullish/bearish/neutral) and symbol filter |
| Settings | `/settings` | Wallet, theme, risk profile (risk level, max notional, max position), voice on/off, token provider (xStocks/Ondo) |

### Chat UI (Homepage)

Chat is the primary interface, inspired by ChatGPT and Gemini:
- **Empty state**: Centered input with persona chips (Elon, Buffett, AI Momentum with memoji images) and action chips (Buy crypto, Market analysis, Send tokens, My portfolio)
- **Active chat**: Messages fill the screen, fixed floating input bar at bottom (doesn't scroll with iOS keyboard)
- **Left slide panel** (Claude-style): FutureWallet title, New Chat, Trades, Personas links, recent chat list, Settings at bottom
- **Top bar**: Hamburger menu, FutureWallet title, bell icon (social signals overlay), wallet icon (wallet overlay), new chat button
- **Balance bar**: Total USD value, PnL with green/red coloring, Send/Receive buttons
- **Wallet overlay** (iOS bottom sheet): Big balance, PnL, wallet address with copy, asset list with on-chain balances (Base + Ethereum)
- **Social signals overlay** (iOS bottom sheet from bell icon): Sentiment badges, trending topics from Grok-3
- **Input bar toolbar**: Risk mode + persona selector (like Gemini's "Fast v"), mic icon when empty (voice), send arrow when text typed
- **Typewriter effect** on new assistant messages
- **No zoom on mobile**: font-size 16px on inputs, touch-action manipulation, 100dvh for Safari mobile viewport
- Other pages (trades, personas, settings, assets) have "Back to Chat" link instead of sidebar — old NavSidebar removed

### Voice Features

- **Text-to-speech**: Cartesia API (sonic-2 model, Ronald voice — deep mature). Multilingual: auto-detects response language (FR/ES/DE/EN)
- **Speech-to-text**: Browser SpeechRecognition API with language selector (EN/FR/ES/DE/IT/PT/AR/CN/JP), persisted in localStorage
- **Voice conversation mode**: Tap mic → stays on, auto-listens after each TTS response for continuous conversation
- **Safari audio unlock** on first user interaction
- Voice on/off toggle in Settings page

### Send/Transfer

- Chat supports "send 1 USDC to 0x..." commands (multilingual)
- Checks on-chain balance before sending, suggests buying more if insufficient
- Privy sponsored transactions (gas-free) via eth_sendTransaction with sponsor:true
- Detects which chain has the token (Base vs Ethereum)
- Confirmation card with Cancel/Confirm buttons

### Structure

```
apps/webapp/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout: ClientProviders (Privy → Query)
│   ├── page.tsx            # Chat homepage (ChatGPT/Gemini-style). Login when not authenticated.
│   ├── assets/page.tsx     # Asset catalog
│   ├── personas/page.tsx   # Persona management (built-in + custom sections)
│   ├── social/page.tsx     # Social signals feed
│   └── settings/page.tsx   # Settings (including voice on/off)
├── components/
│   ├── version-check.tsx   # 3-layer PWA cache busting (content hash + version poll + service worker)
│   ├── auth-gate.tsx       # Direct passkey login/signup (no Privy modal)
│   ├── system-status.tsx   # Connection/API/wallet status alerts (auto-hides when OK)
│   ├── providers/
│   │   ├── client-providers.tsx  # Wraps Privy + Query + VersionCheck
│   │   ├── privy-provider.tsx    # @privy-io/react-auth config
│   │   └── query-provider.tsx    # TanStack Query provider
│   └── ui/                 # shadcn/ui components (button, card, input, dialog, badge, avatar)
├── lib/
│   ├── api.ts              # API client (calls Cloud Run backend, 90-second timeout with AbortController)
│   ├── constants.ts        # App constants (API URL, etc.)
│   └── utils.ts            # Utilities
├── next.config.ts          # Next.js config (output: 'export' for static)
├── tailwind.config.ts      # Tailwind + shadcn theme
└── package.json
```

### Auth Flow

1. User visits `/` → if not authenticated, shown direct passkey login/signup (no Privy modal) with two buttons: "Log in with Passkey" + "Create Account"
2. User authenticates via `useLoginWithPasskey` or signs up via `useSignupWithPasskey`
3. Privy creates embedded wallet automatically on first login
4. Auto-creates user doc with `wallet_address` from Privy on first API call. Auth dependency caches user doc check (in-memory set)
5. Pages check auth state inline and show appropriate content (no AuthGuard redirects)
6. API calls include Privy JWT in Authorization header
7. API client does NOT redirect on 401 (was causing loops)
8. Backend verifies JWT via Privy JWKS endpoint with caching (lenient fallback: tries strict audience/issuer first, then relaxes)
9. No viewport `user-scalable=no` (breaks passkeys on iOS)

### API Integration

- API client in `lib/api.ts` calls the Cloud Run backend
- Backend URL: `https://futurewallet-api-805699851675.europe-west1.run.app`
- All data from real APIs (no mock data)
- Market data: Alchemy (primary) → CryptoCompare → CMC → Moralis → Bitquery (fallback chain)
- Chat messages persisted to Firestore (`users/{userId}/conversations/{convId}/messages`)
- Conversations: new chat, clear window, load history from database

### Deployment

```bash
cd apps/webapp && npm run build
firebase deploy --only hosting:futurewallet-app --project future-wallet-490203
```

- Firebase Hosting uses `cleanUrls: true` and `trailingSlash: false` (Next.js static export generates separate .html files per route, not SPA rewrites)
- `public/version.json` is auto-generated with a timestamp on each `npm run build` (used by VersionCheck component for auto-reload)

Live at: https://futurewallet-app.web.app / https://app.futurewallet.fi

---

## Native App (apps/mobile/)

Expo 52, React Native, NativeWind (Tailwind), Expo Router. **iOS and Android native only** — web is handled by apps/webapp/.

## Screens

### Auth Flow

| Screen | Route | Description |
|--------|-------|-------------|
| Login | `/(auth)/login` | Privy passkey login with FutureWallet branding |

### Main App (Tab Navigation)

| Tab | Route | Description |
|-----|-------|-------------|
| Dashboard | `/(app)/(tabs)/dashboard` | Portfolio summary, PnL chart, holdings, persona status |
| Chat | `/(app)/(tabs)/chat` | AI trading chat with trade confirmations |
| Assets | `/(app)/(tabs)/assets` | Searchable asset catalog with prices |
| Settings | `/(app)/(tabs)/settings` | Theme, risk profile, kill switch, logout |

### Detail Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Asset Detail | `/(app)/asset/[symbol]` | Price chart, market data, trade panel |
| Personas | `/(app)/personas/` | List with enable/disable toggles |
| Persona Detail | `/(app)/personas/[id]` | Config form, activity feed |
| Create Persona | `/(app)/personas/create` | Custom persona creation form |
| Trade History | `/(app)/history` | Paginated trade list |

## Routing Structure

```
app/
├── _layout.tsx          # Root: Providers (Privy → Query → Theme → Stack)
├── index.tsx            # Entry: redirect based on auth state
├── (auth)/
│   ├── _layout.tsx      # Stack
│   └── login.tsx        # Passkey login
└── (app)/
    ├── _layout.tsx      # AuthGuard + GeofenceGate
    ├── (tabs)/
    │   ├── _layout.tsx  # Bottom tab bar
    │   ├── dashboard.tsx
    │   ├── chat.tsx
    │   ├── assets.tsx
    │   └── settings.tsx
    ├── asset/[symbol].tsx
    ├── personas/index.tsx
    ├── personas/[id].tsx
    ├── personas/create.tsx
    └── history.tsx
```

## Component Library (shadcn-style)

All in `components/ui/`:

| Component | Variants | Description |
|-----------|----------|-------------|
| `Button` | default, secondary, destructive, outline, ghost | Pressable with loading state |
| `Card` | — | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| `Input` | — | TextInput with label, error state |
| `Dialog` | — | Modal overlay |
| `Sheet` | — | Bottom sheet |
| `Badge` | default, secondary, destructive, outline | Status badges |
| `Avatar` | — | Image with fallback initials |
| `Tabs` | — | Tab group with content panels |
| `Text` | size (sm/base/lg/xl/2xl), weight (normal/medium/semibold/bold) | Typography |

## Theme System

### Light + Dark Mode

- System detection via `useColorScheme()`
- Manual toggle in Settings (persisted via AsyncStorage)
- Three modes: `light`, `dark`, `system`
- CSS variables in `global.css` define colors for both themes
- NativeWind `dark:` prefix for conditional styling

### Color Palette

Primary color: **Purple** (262.1, 83.3%, 57.8%)

```css
:root {
  --background: 0 0% 100%;        /* White */
  --foreground: 240 10% 3.9%;     /* Near-black */
  --primary: 262.1 83.3% 57.8%;   /* Purple */
  --secondary: 240 4.8% 95.9%;    /* Light gray */
  --destructive: 0 84.2% 60.2%;   /* Red */
}
.dark {
  --background: 240 10% 3.9%;     /* Near-black */
  --foreground: 0 0% 98%;         /* Near-white */
  --primary: 263.4 70% 50.4%;     /* Purple (adjusted) */
}
```

## Providers (wrap order)

```tsx
<GestureHandlerRootView>
  <PrivyProvider>
    <QueryProvider>
      <ThemeProvider>
        <Stack />
      </ThemeProvider>
    </QueryProvider>
  </PrivyProvider>
</GestureHandlerRootView>
```

1. **PrivyProvider** — Auth context + embedded wallet
2. **QueryProvider** — TanStack Query for API data fetching/caching
3. **ThemeProvider** — Light/dark/system theme context

## Guards

- **AuthGuard** — Wraps `(app)/` layout. Redirects to login if not authenticated.
- **GeofenceGate** — Checks user's region. Shows blocked screen if US person.

## State Management

| Store | Library | Purpose |
|-------|---------|---------|
| `chatStore` | Zustand | Chat messages, pending confirmations |
| `priceStore` | Zustand | Asset prices (updated via polling or real-time) |
| Server state | TanStack Query | Portfolio, trades, personas, assets |

## Real-time Updates

Firestore listeners on:
- Trade status changes (user sees `executing → confirmed` in real-time)
- Price updates (for watched assets)

## API Communication

Uses `@futurewallet/shared` ApiClient with:
- Base URL from environment
- Auth token injected from Privy session
- Typed request/response via shared types
- 90-second timeout with AbortController (for long-running agent pipeline calls)
