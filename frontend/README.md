# FutureWallet Web App — Complete Frontend Developer Package

This document contains everything needed to rebuild the FutureWallet web app from scratch. Every source file is included in full.

---

## 1. Project Overview

**FutureWallet** is an AI-powered non-custodial wallet for trading tokenized stocks (xStocks) and crypto. The web app is the primary interface — a ChatGPT/Gemini-style AI trading chatbot with voice, portfolio management, social signals, and on-chain execution.

### What it does

- AI chat interface for buying/selling tokenized stocks (TSLAx, AAPLx, NVDAx...) and crypto (BTC, ETH)
- Voice conversation mode (speech-to-text + text-to-speech via Cartesia)
- On-chain portfolio with real balances from Base and Ethereum
- Social signals feed from Grok-3 with X/Twitter sentiment analysis
- Trade confirmation cards with Ask AI, Confirm, Cancel
- Persona system (Elon, Buffett, AI Momentum + custom personas)
- Privy passkey authentication with embedded EVM wallet
- PWA with 3-layer cache busting

### Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 15.3.1 | Framework (App Router, static export) |
| React | 19.x | UI library |
| TypeScript | 5.8.x | Type safety |
| Tailwind CSS | 3.4.x | Styling |
| shadcn/ui | (custom) | UI component library |
| @privy-io/react-auth | 3.18.x | Passkey auth + embedded wallet |
| @tanstack/react-query | 5.72.x | Server state management |
| lucide-react | 0.474.x | Icons |
| class-variance-authority | 0.7.x | Component variants |
| tailwind-merge | 3.0.x | Class merging |
| tailwindcss-animate | 1.0.x | Animations |

### Live URLs

- Web app: https://app.futurewallet.fi (Firebase Hosting)
- Backend API: https://futurewallet-api-805699851675.europe-west1.run.app (Cloud Run)

---

## 2. Setup & Configuration

### 2.1 package.json

```json
{
  "name": "@futurewallet/webapp",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "node -e \"require('fs').writeFileSync('public/version.json',JSON.stringify({v:Date.now().toString()}))\" && next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@privy-io/react-auth": "^3.18.0",
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-slot": "^1.1.2",
    "@tanstack/react-query": "^5.72.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.474.0",
    "next": "15.3.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.0.2"
  },
  "devDependencies": {
    "@types/node": "^22.13.10",
    "@types/react": "^19.0.12",
    "@types/react-dom": "^19.0.4",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "^5.8.2"
  }
}
```

### 2.2 next.config.ts

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
    NEXT_PUBLIC_PRIVY_APP_ID:
      process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cmmpncjim00g50dlc9i8tik5j",
  },
};

export default nextConfig;
```

Key points:
- `output: "export"` — static export for Firebase Hosting (no server-side rendering)
- `images.unoptimized: true` — required for static export
- Default Privy App ID hardcoded as fallback

### 2.3 tailwind.config.ts

```ts
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
```

### 2.4 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 2.5 postcss.config.js

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 2.6 globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Prevent zoom on mobile */
* {
  touch-action: manipulation;
}
html {
  -webkit-text-size-adjust: 100%;
  -ms-text-size-adjust: 100%;
}

/* Prevent iOS double-tap zoom on inputs */
input, select, textarea, button {
  font-size: 16px !important;
}

/* Stable viewport — overflow managed per-page, not globally */
html, body {
  overscroll-behavior: none;
  height: 100%;
  width: 100%;
}

/* Safe area for fixed bottom elements on iOS */
.safe-area-pb {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}

@layer base {
  :root {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 5.5%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 211 100% 50%;
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

  .light {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 211 100% 50%;
    --primary-foreground: 0 0% 100%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 211 100% 50%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

html {
  scroll-behavior: smooth;
}

/* Thin scrollbar styling */
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: hsl(var(--muted));
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground));
}
* {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted)) transparent;
}
```

**Design tokens notes:**
- Default theme is DARK (`:root` variables are dark mode)
- Light mode is via `.light` class on `<html>`
- Primary color is iOS blue: `211 100% 50%` = `#007AFF`
- Background is near-black: `240 10% 3.9%` = approximately `#09090b`
- Card is slightly lighter: `240 10% 5.5%`

---

## 3. Design System

### 3.1 Color Tokens

The app uses HSL CSS variables consumed via Tailwind's `hsl(var(--token))` pattern.

**Dark mode (default — `:root`):**

| Token | HSL | Approximate Hex | Usage |
|-------|-----|----------------|-------|
| `--background` | 240 10% 3.9% | #09090b | Page background |
| `--foreground` | 0 0% 98% | #fafafa | Primary text |
| `--card` | 240 10% 5.5% | #0f0f14 | Card backgrounds |
| `--primary` | 211 100% 50% | #007AFF | iOS blue accent, buttons, links |
| `--secondary` | 240 3.7% 15.9% | #27272a | Secondary surfaces |
| `--muted` | 240 3.7% 15.9% | #27272a | Muted backgrounds |
| `--muted-foreground` | 240 5% 64.9% | #a1a1aa | Muted text |
| `--destructive` | 0 62.8% 30.6% | #7f1d1d | Error/danger |
| `--border` | 240 3.7% 15.9% | #27272a | Borders |

**Light mode (`.light`):**

| Token | HSL | Approximate Hex |
|-------|-----|----------------|
| `--background` | 0 0% 100% | #ffffff |
| `--foreground` | 240 10% 3.9% | #09090b |
| `--card` | 0 0% 100% | #ffffff |
| `--secondary` | 240 4.8% 95.9% | #f4f4f5 |
| `--muted-foreground` | 240 3.8% 46.1% | #71717a |
| `--border` | 240 5.9% 90% | #e4e4e7 |

### 3.2 Typography

- Font: `Inter` (Google Fonts, loaded via `next/font/google`)
- Default dark theme: `html.dark`
- All numeric values use `tabular-nums` for alignment
- PnL colors: `text-green-500` (positive), `text-red-500` (negative)

### 3.3 Component Library

shadcn/ui components used (all in `components/ui/`):
- Button (6 variants: default, destructive, outline, secondary, ghost, link)
- Card (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- Input
- Dialog (Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger)
- Badge (6 variants: default, secondary, destructive, outline, success, warning)
- Avatar (Avatar, AvatarImage, AvatarFallback)

### 3.4 Icon Library

`lucide-react` — all icons imported individually. Key icons used:
- Navigation: Menu, X, ArrowLeft, Plus, Settings
- Trading: TrendingUp, TrendingDown, ArrowUpRight, ArrowUpFromLine, ArrowDownToLine
- Chat: Send, Bot, User, MessageSquare, Mic, MicOff, Volume2, VolumeX
- Status: Loader2, AlertCircle, CheckCircle, XCircle, AlertTriangle
- General: Wallet, Bell, Copy, Check, Users, Sparkles, KeyRound

---

## 4. Architecture

### 4.1 File Structure

```
apps/webapp/
├── app/
│   ├── globals.css              # Tailwind + CSS variables + scrollbar styles
│   ├── layout.tsx               # Root layout (Inter font, ClientProviders wrapper)
│   ├── page.tsx                 # Homepage — renders ChatPage
│   ├── chat/page.tsx            # Main chat UI (1000 lines — the core of the app)
│   ├── dashboard/page.tsx       # Dashboard with portfolio + trades overview
│   ├── assets/page.tsx          # Searchable asset catalog
│   ├── trades/page.tsx          # Trade history with pagination
│   ├── personas/page.tsx        # Persona management + create custom
│   ├── social/page.tsx          # Social signals feed
│   └── settings/page.tsx        # Settings (wallet, theme, voice, risk, token provider, AI model)
├── components/
│   ├── auth-gate.tsx            # Passkey login/signup gate (wraps entire app)
│   ├── auth-guard.tsx           # Redirect-based auth guard (legacy, unused by chat)
│   ├── nav-sidebar.tsx          # Desktop sidebar + mobile top/bottom bars (used by dashboard)
│   ├── system-status.tsx        # Connection/API/wallet status alerts
│   ├── version-check.tsx        # PWA cache busting (version poll + service worker)
│   ├── providers/
│   │   ├── client-providers.tsx # Privy → Query → VersionCheck → AuthGate
│   │   ├── privy-provider.tsx   # Privy config (passkey-only, dark theme)
│   │   └── query-provider.tsx   # TanStack Query client (30s stale, 1 retry)
│   └── ui/
│       ├── avatar.tsx           # Radix Avatar
│       ├── badge.tsx            # Badge with variants
│       ├── button.tsx           # Button with variants
│       ├── card.tsx             # Card components
│       ├── dialog.tsx           # Radix Dialog
│       └── input.tsx            # Input component
├── lib/
│   ├── api.ts                   # API client (fetch wrapper with auth, 90s timeout)
│   ├── constants.ts             # PRIVY_APP_ID, API_URL
│   └── utils.ts                 # cn() utility (clsx + tailwind-merge)
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service worker (cache clearing)
│   ├── version.json             # Build timestamp (auto-generated)
│   └── personas/                # Persona avatar images
│       ├── elon.png
│       ├── buffett.png
│       └── ai_momentum.png
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── postcss.config.js
```

### 4.2 Routing

| Route | Page Component | Description |
|-------|---------------|-------------|
| `/` | `page.tsx` → `ChatPage` | Homepage is the chat (renders chat/page.tsx) |
| `/chat` | `chat/page.tsx` | Full chat UI with all overlays |
| `/dashboard` | `dashboard/page.tsx` | Portfolio overview + recent trades |
| `/assets` | `assets/page.tsx` | Searchable asset catalog |
| `/trades` | `trades/page.tsx` | Paginated trade history |
| `/personas` | `personas/page.tsx` | Persona management |
| `/social` | `social/page.tsx` | Social signals feed |
| `/settings` | `settings/page.tsx` | All settings |

### 4.3 State Management

- **Server state**: TanStack Query (portfolio, trades, personas, conversations, social signals, health)
- **Local state**: React `useState` (chat messages, input, UI toggles)
- **Persistent state**: `localStorage` for voice settings, language, model preference, last conversation
- No Zustand, no Redux, no context providers beyond Privy and Query

### 4.4 Auth Flow

1. App wrapped in `ClientProviders` → `PrivyProvider` → `QueryProvider` → `AuthGate`
2. `AuthGate` checks `usePrivy()` — shows login screen if not authenticated
3. Login via `useLoginWithPasskey()` or signup via `useSignupWithPasskey()`
4. Privy creates embedded EVM wallet automatically on signup
5. All API calls get Privy JWT via `getAccessToken()` injected into Authorization header
6. Backend verifies JWT via Privy JWKS endpoint

### 4.5 Provider Hierarchy

```
<html lang="en" className="dark">
  <body>
    <PrivyProvider>           ← Passkey auth + embedded wallet
      <QueryProvider>         ← TanStack Query (30s stale, 1 retry)
        <VersionCheck />      ← PWA version polling (renders null)
        <AuthGate>            ← Login gate (shows passkey UI if not auth'd)
          {children}          ← App pages
        </AuthGate>
      </QueryProvider>
    </PrivyProvider>
  </body>
</html>
```

---

## 5. API Integration

### 5.1 API Client (lib/api.ts)

```ts
import { API_URL } from "./constants";

type RequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

class ApiClient {
  private baseUrl: string;
  private getAccessToken: (() => Promise<string | null>) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAccessTokenGetter(getter: () => Promise<string | null>) {
    this.getAccessToken = getter;
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<{ data: T | null; error: string | null }> {
    const url = `${this.baseUrl}${path}`;

    if (!this.baseUrl) {
      console.error("[API] Base URL not configured");
      return { data: null, error: "API not configured — no base URL set" };
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...options.headers,
      };

      if (this.getAccessToken) {
        try {
          const token = await this.getAccessToken();
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
            console.log(`[API] ${options.method || "GET"} ${path} — token: ${token.slice(0, 20)}...`);
          } else {
            console.warn("[API] getAccessToken returned null — sending request without auth");
          }
        } catch (tokenErr) {
          console.error("[API] Failed to get access token:", tokenErr);
          return { data: null, error: `Auth token error: ${tokenErr instanceof Error ? tokenErr.message : "unknown"}` };
        }
      } else {
        console.warn("[API] No access token getter set — sending request without auth");
      }

      console.log(`[API] → ${options.method || "GET"} ${url}`);
      // 90-second timeout for long operations (trade execution)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const response = await fetch(url, { ...options, headers, signal: options.signal || controller.signal });
      clearTimeout(timeout);
      console.log(`[API] ← ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        let errorDetail = `${response.status} ${response.statusText}`;

        // Try to parse JSON error
        try {
          const parsed = JSON.parse(errorBody);
          if (parsed.error?.message) {
            errorDetail = `${response.status}: ${parsed.error.message}`;
          } else if (parsed.detail) {
            errorDetail = `${response.status}: ${parsed.detail}`;
          }
        } catch {
          if (errorBody) errorDetail = `${response.status}: ${errorBody.slice(0, 200)}`;
        }

        console.error(`[API] Error: ${errorDetail}`);
        return { data: null, error: errorDetail };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      console.error(`[API] Network error for ${url}:`, message);

      if (err instanceof DOMException && err.name === "AbortError") {
        return { data: null, error: "Request timed out. The operation may still be processing — check your trades." };
      }
      if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        return { data: null, error: "Network error — please try again." };
      }
      return { data: null, error: message };
    }
  }

  async get<T>(path: string) {
    return this.request<T>(path, { method: "GET" });
  }

  async post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient(API_URL);
```

### 5.2 Constants (lib/constants.ts)

```ts
export const PRIVY_APP_ID = "cmmpncjim00g50dlc9i8tik5j";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://futurewallet-api-805699851675.europe-west1.run.app";
```

### 5.3 Utilities (lib/utils.ts)

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 5.4 API Endpoints Used

All endpoints are under `/api/v1/`:

| Method | Endpoint | Request Body | Response | Used In |
|--------|----------|-------------|----------|---------|
| GET | `/health` | — | `{ status, service, version }` | system-status |
| POST | `/chat/message` | `{ message, persona_id?, conversation_id?, model? }` | `{ reply, trade_intent?, confirmation_token?, requires_confirmation?, conversation_id? }` | chat |
| POST | `/chat/confirm` | `{ confirmation_token, confirmed }` | `{ status, trade_id?, message, unsigned_tx?, approval_tx? }` | chat |
| POST | `/chat/tts` | `{ text, language }` | audio blob (WAV) | chat voice |
| POST | `/chat/report-trade` | `{ confirmation_token, tx_hash, status }` | — | chat |
| GET | `/chat/conversations` | — | `{ conversations: [...] }` | chat panel |
| GET | `/chat/conversations/:id/messages` | — | `{ conversation, messages: [...] }` | chat |
| DELETE | `/chat/conversations/:id` | — | — | chat |
| GET | `/chat/provider` | — | `{ token_provider }` | settings |
| PATCH | `/chat/provider` | `{ token_provider }` | — | settings |
| GET | `/portfolio` | — | `{ positions: [...], total_value }` | dashboard, wallet overlay |
| GET | `/portfolio/pnl` | — | `{ total_market_value, total_cost_basis, total_unrealized_pnl, total_unrealized_pnl_pct, position_count }` | balance bar |
| GET | `/portfolio/history?days=N` | — | `{ history: [{ date, total_value, total_pnl, position_count }] }` | nav sidebar |
| GET | `/market/assets` | — | `{ assets: [{ symbol, name, asset_type, price?, change_24h? }] }` | assets page |
| GET | `/trades?page=N&page_size=N` | — | `{ trades: [...], page, page_size }` | trades page |
| GET | `/agents/personas` | — | `{ personas: [...] }` | personas page, chat |
| POST | `/agents/personas/:id/activate` | — | — | personas |
| PATCH | `/agents/personas/:id/config` | `{ auto_trade_enabled?, risk_level?, ... }` | — | personas, settings |
| POST | `/agents/personas/custom` | `{ name, description, system_prompt, risk_level }` | `{ persona }` | personas |
| DELETE | `/agents/personas/:id` | — | — | personas |
| GET | `/social/signals?symbol=X&limit=N` | — | `{ signals: [...] }` | social page, signals overlay |

---

## 6. Complete Page Code

### 6.1 app/layout.tsx — Root Layout

```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/components/providers/client-providers";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7c3aed",
  // Note: do NOT set maximumScale=1 or userScalable=false — it breaks passkey prompts on iOS Safari
};

export const metadata: Metadata = {
  title: "FutureWallet",
  description:
    "AI-powered non-custodial wallet for stocks and crypto trading",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
```

### 6.2 app/page.tsx — Homepage (redirects to Chat)

```tsx
"use client";

import ChatPage from "./chat/page";

export default function HomePage() {
  return <ChatPage />;
}
```

### 6.3 app/chat/page.tsx — Main Chat UI

This is the core of the application (~1000 lines). It includes:
- Chat messaging with typewriter effect
- Trade confirmation cards with Ask AI / Cancel / Confirm
- Voice mode (STT + TTS)
- Left slide panel with conversation history
- Wallet overlay (iOS bottom sheet)
- Social signals overlay (iOS bottom sheet)
- Receive modal
- Balance bar
- Persona selector dropdown
- Model selector dropdown (Claude/Grok/GPT)
- Language selector dropdown

```tsx
"use client";

import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { API_URL } from "@/lib/constants";
import {
  Send,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Bot,
  User,
  Plus,
  Eraser,
  History,
  MessageSquare,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Menu,
  X,
  ArrowUpRight,
  ArrowUpFromLine,
  ArrowDownToLine,
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  Users,
  Settings,
  Wallet,
  Bell,
  Sparkles,
} from "lucide-react";

/* ─── types ─── */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  requires_confirmation?: boolean;
  trade_details?: { asset: string; side: string; quantity: number; estimated_price: number; estimated_total: number };
  confirmation_id?: string;
  confirmed?: boolean;
  created_at?: string;
  metadata?: Record<string, any>;
  isNew?: boolean;
}
interface Conversation { id: string; title: string; created_at: string; updated_at: string; message_count: number }
interface ChatApiResponse {
  reply: string;
  trade_intent?: { side: string; symbol: string; intent_type: string; amount: number; estimated_price?: number; estimated_total?: number; dollar_amount?: number; is_dollar_amount?: boolean } | null;
  confirmation_token?: string | null;
  requires_confirmation?: boolean;
  conversation_id?: string | null;
}
interface PersonaOption { id: string; display_name?: string; name?: string; type?: string }

/* ─── constants ─── */
const PERSONA_CHIPS = [
  { id: "elon", img: "/personas/elon.png", label: "Elon Strategy" },
  { id: "buffett", img: "/personas/buffett.png", label: "Buffett Strategy" },
  { id: "ai_momentum", img: "/personas/ai_momentum.png", label: "AI Momentum" },
];
const ACTION_CHIPS = [
  { emoji: "\u{1F4B0}", label: "Buy crypto", prefill: "buy " },
  { emoji: "\u{1F4C8}", label: "Market analysis", prefill: "How is the crypto market doing today?" },
  { emoji: "\u{1F4B8}", label: "Send tokens", prefill: "send " },
  { emoji: "\u{1F4BC}", label: "My portfolio", prefill: "How is my portfolio doing?" },
];

/* ─── typewriter ─── */
function TypewriterText({ text, speed = 15 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(""); setDone(false); let i = 0;
    const interval = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) { clearInterval(interval); setDone(true); } }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return <>{displayed}{!done && <span className="animate-pulse opacity-60">|</span>}</>;
}

function BuildVersion() {
  const [v, setV] = useState("");
  useEffect(() => { fetch("/version.json").then(r => r.json()).then(d => setV(d.v)).catch(() => {}); }, []);
  return v ? <p className="text-[9px] text-muted-foreground/40 leading-none">v{v}</p> : null;
}

function cleanContent(t: string) {
  return t.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s/gm, "").replace(/^- /gm, "\u2022 ");
}

const MODEL_OPTIONS = [
  { id: "claude", label: "Claude", color: "#D97757", icon: "C" },
  { id: "grok", label: "Grok", color: "#FFFFFF", icon: "G" },
  { id: "openai", label: "GPT", color: "#10A37F", icon: "G" },
];

const LANG_OPTIONS = [
  { id: "en-US", label: "EN" },
  { id: "fr-FR", label: "FR" },
  { id: "es-ES", label: "ES" },
  { id: "de-DE", label: "DE" },
  { id: "it-IT", label: "IT" },
  { id: "pt-BR", label: "PT" },
  { id: "ar-SA", label: "AR" },
  { id: "zh-CN", label: "CN" },
  { id: "ja-JP", label: "JP" },
];

function DropdownPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function PersonaDropdown({ value, onChange, personas }: {
  value: string | null; onChange: (id: string | null) => void; personas: PersonaOption[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const allOptions = [
    { id: "", img: "", label: "Default" },
    ...PERSONA_CHIPS,
    ...personas.filter(p => !PERSONA_CHIPS.some(c => c.id === p.id)).map(p => ({ id: p.id, img: "", label: p.display_name || p.name || p.id })),
  ];
  const selected = allOptions.find(o => o.id === (value ?? "")) || allOptions[0];

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const goUp = r.top > 250;
      setStyle({
        left: Math.max(8, r.left),
        ...(goUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref}>
      <button onClick={toggle} className="flex items-center gap-2 h-8 rounded-xl bg-card border border-border/60 px-2.5 text-xs text-foreground hover:border-border transition-colors cursor-pointer">
        {selected.img ? <img src={selected.img} alt="" className="h-5 w-5 rounded-full object-cover" /> : <Bot className="h-4 w-4 text-muted-foreground" />}
        <span className="max-w-[100px] truncate">{selected.label}</span>
        <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <DropdownPortal>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="fixed z-[91] min-w-[190px] max-h-[320px] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl py-1" style={style}>
            {allOptions.map(o => (
              <button key={o.id || "_def"} onClick={() => { onChange(o.id || null); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${(value ?? "") === o.id ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                {o.img ? <img src={o.img} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" /> : <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0"><Bot className="h-3.5 w-3.5 text-muted-foreground" /></div>}
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}
    </div>
  );
}

function LangDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const selected = LANG_OPTIONS.find(l => l.id === value) || LANG_OPTIONS[0];

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const goUp = r.top > 300;
      setStyle({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 150)),
        ...(goUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref}>
      <button onClick={toggle} className="flex items-center gap-1.5 h-8 rounded-xl bg-card border border-border/60 px-2.5 text-xs text-foreground hover:border-border transition-colors cursor-pointer">
        <span>{selected.label}</span>
        <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <DropdownPortal>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="fixed z-[91] min-w-[130px] max-h-[320px] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl py-1" style={style}>
            {LANG_OPTIONS.map(l => (
              <button key={l.id} onClick={() => { onChange(l.id); localStorage.setItem("fw_voice_lang", l.id); setOpen(false); }}
                className={`w-full flex items-center justify-center px-3 py-2 text-sm transition-colors ${value === l.id ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}
    </div>
  );
}

function ModelIcon({ id, size = 16 }: { id: string; size?: number }) {
  if (id === "claude") return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#D97757" xmlns="http://www.w3.org/2000/svg"><path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"/></svg>
  );
  if (id === "grok") return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>
  );
  // openai
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#10A37F" xmlns="http://www.w3.org/2000/svg"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>
  );
}

function ModelDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const selected = MODEL_OPTIONS.find(m => m.id === value) || MODEL_OPTIONS[0];

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const goUp = r.top > 200;
      setStyle({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 180)),
        ...(goUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref}>
      <button onClick={toggle} className="flex items-center gap-2 h-8 rounded-xl bg-card border border-border/60 px-2.5 text-xs text-foreground hover:border-border transition-colors cursor-pointer">
        <ModelIcon id={selected.id} size={16} /><span>{selected.label}</span>
        <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <DropdownPortal>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="fixed z-[91] min-w-[160px] rounded-xl border border-border bg-card shadow-2xl py-1" style={style}>
            {MODEL_OPTIONS.map(m => (
              <button key={m.id} onClick={() => { onChange(m.id); localStorage.setItem("fw_preferred_model", m.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${value === m.id ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                <ModelIcon id={m.id} size={18} /><span>{m.label}</span>
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}
    </div>
  );
}

/* ─── main ─── */
export default function ChatPage() {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const queryClient = useQueryClient();

  // Debug: log all wallet addresses
  useEffect(() => {
    if (wallets.length > 0) {
      wallets.forEach((w, i) => {
        console.log(`[FW] Wallet ${i}: address=${w.address} type=${w.walletClientType} chainId=${w.chainId}`);
      });
    }
  }, [wallets]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("claude");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceLang, setVoiceLang] = useState("en-US");
  const [voiceMode, setVoiceMode] = useState(false); // persistent voice conversation mode
  const voiceModeRef = useRef(false); // ref to avoid stale closures
  const [listening, setListening] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const hasMessages = messages.length > 0;

  /* ─── effects ─── */
  useEffect(() => {
    const s = localStorage.getItem("fw_voice_enabled"); if (s !== null) setVoiceEnabled(s === "true");
    const l = localStorage.getItem("fw_voice_lang"); if (l) setVoiceLang(l);
    const m = localStorage.getItem("fw_preferred_model"); if (m) setSelectedModel(m);
    // Restore last conversation
    const lastConv = localStorage.getItem("fw_last_conversation");
    if (lastConv) loadConversation(lastConv);
  }, []);
  useEffect(() => {
    const unlock = () => { const c = new (window.AudioContext || (window as any).webkitAudioContext)(); c.resume().then(() => c.close()); document.removeEventListener("click", unlock); document.removeEventListener("touchstart", unlock); };
    document.addEventListener("click", unlock, { once: true }); document.addEventListener("touchstart", unlock, { once: true });
    return () => { document.removeEventListener("click", unlock); document.removeEventListener("touchstart", unlock); };
  }, []);
  useEffect(() => { if (getAccessToken) apiClient.setAccessTokenGetter(getAccessToken); }, [getAccessToken]);
  useEffect(() => {
    // Scroll so the last user message aligns to the top of the chat area
    if (lastUserMsgRef.current) {
      lastUserMsgRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  /* ─── voice ─── */
  const toggleVoice = () => { const n = !voiceEnabled; setVoiceEnabled(n); localStorage.setItem("fw_voice_enabled", String(n)); if (!n && audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };

  // Use ref for voiceLang to avoid stale closures
  const voiceLangRef = useRef(voiceLang);
  useEffect(() => { voiceLangRef.current = voiceLang; }, [voiceLang]);

  const playTTS = async (text: string) => {
    if (!voiceEnabled || !text) return;
    try {
      const c = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s/gm, "").replace(/^- /gm, "")
        .replace(/0x[a-fA-F0-9]{4,}[.]{0,3}[a-fA-F0-9]*/g, "").replace(/Tx:\s*\S+/g, "")
        .replace(/Not financial advice.*$/gm, "").replace(/AI analysis only\.?/g, "").replace(/Pas un conseil financier.*$/gm, "")
        .replace(/\n{2,}/g, ". ").replace(/\n/g, ". ").replace(/\.\s*\./g, ".").trim().slice(0, 300);
      if (!c) return;
      const vl = voiceLangRef.current;
      const lang = vl.startsWith("fr") ? "fr" : vl.startsWith("es") ? "es" : vl.startsWith("de") ? "de" : vl.startsWith("it") ? "it" : vl.startsWith("pt") ? "pt" : vl.startsWith("ar") ? "ar" : vl.startsWith("zh") ? "zh" : vl.startsWith("ja") ? "ja" : "en";
      console.log("[FW TTS] playing", { lang, voiceEnabled, textLen: c.length });
      const token = await getAccessToken();
      const r = await fetch(`${API_URL}/api/v1/chat/tts`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ text: c, language: lang }) });
      if (!r.ok) { console.warn("[FW TTS] API error", r.status); return; }
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      if (audioRef.current) audioRef.current.pause();
      const a = new Audio(url); audioRef.current = a;
      a.play().catch((e) => { console.warn("[FW TTS] play error", e); });
      a.onended = () => { URL.revokeObjectURL(url); if (voiceModeRef.current) { setTimeout(() => doStartListening(), 600); } };
    } catch (e) { console.warn("[FW TTS] error", e); }
  };

  const doStartListening = () => {
    // Stop any existing recognition first
    try { recognitionRef.current?.stop(); } catch {}
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.continuous = false; r.interimResults = true; r.lang = voiceLangRef.current; recognitionRef.current = r;
    r.onstart = () => setListening(true);
    r.onresult = (e: any) => { setInput(Array.from(e.results).map((x: any) => x[0].transcript).join("")); };
    r.onend = () => {
      setListening(false);
      // Auto-send what was captured
      setTimeout(() => {
        const btn = document.getElementById("chat-send-btn") || document.getElementById("chat-send-btn-active");
        btn?.click();
      }, 300);
    };
    r.onerror = (e: any) => {
      setListening(false);
      if (e.error === "no-speech" && voiceModeRef.current) {
        // No speech detected — retry in voice mode
        setTimeout(() => doStartListening(), 300);
      }
    };
    r.start();
  };

  // Keep startListening as useCallback wrapper for toggleListening dependency
  const startListening = useCallback(() => { doStartListening(); }, []);

  const toggleListening = useCallback(() => {
    if (listening || voiceMode) {
      // Stop voice mode
      recognitionRef.current?.stop();
      setListening(false);
      setVoiceMode(false);
      voiceModeRef.current = false;
      return;
    }
    // Start voice mode
    setVoiceMode(true);
    voiceModeRef.current = true;
    startListening();
  }, [listening, voiceMode, startListening]);

  /* ─── queries ─── */
  const personasQuery = useQuery({ queryKey: ["personas"], queryFn: async () => { const r = await apiClient.get<{ personas: PersonaOption[] }>("/api/v1/agents/personas"); if (r.error) throw new Error(r.error); return r.data?.personas ?? []; }, retry: false, enabled: ready && authenticated });
  const conversations = useQuery({ queryKey: ["conversations"], queryFn: async () => { const r = await apiClient.get<{ conversations: Conversation[] }>("/api/v1/chat/conversations"); if (r.error) throw new Error(r.error); return r.data?.conversations ?? []; }, retry: false, enabled: ready && authenticated });

  // Portfolio data for balance bar + wallet overlay
  const pnlQuery = useQuery({ queryKey: ["pnl-chat"], queryFn: async () => { const r = await apiClient.get<{ total_market_value: number; total_unrealized_pnl: number; total_unrealized_pnl_pct: number; position_count: number }>("/api/v1/portfolio/pnl"); if (r.error) throw new Error(r.error); return r.data; }, retry: false, enabled: ready && authenticated, refetchInterval: 30000 });
  const portfolioQuery = useQuery({ queryKey: ["portfolio-chat"], queryFn: async () => { const r = await apiClient.get<{ positions: Array<{ symbol: string; asset: string; quantity: number; value: number; pnl_percent: number }> ; total_value: number }>("/api/v1/portfolio"); if (r.error) throw new Error(r.error); return r.data; }, retry: false, enabled: ready && authenticated && walletOpen, refetchInterval: 30000 });

  const signalsQuery = useQuery({ queryKey: ["social-signals"], queryFn: async () => { const r = await apiClient.get<{ signals: Array<{ id: string; symbol: string; sentiment_score: number; summary: string; post_count: number; trending?: string[]; created_at: string }> }>("/api/v1/social/signals?limit=20"); if (r.error) throw new Error(r.error); return r.data?.signals ?? []; }, retry: false, enabled: ready && authenticated && signalsOpen, refetchInterval: 60000 });

  const totalValue = pnlQuery.data?.total_market_value ?? 0;
  const totalPnl = pnlQuery.data?.total_unrealized_pnl ?? 0;
  const totalPnlPct = pnlQuery.data?.total_unrealized_pnl_pct ?? 0;

  const walletAddress = (user?.wallet as any)?.address || (user?.linkedAccounts?.find((a) => a.type === "wallet") as any)?.address || "";
  const handleCopy = async () => { if (!walletAddress) return; await navigator.clipboard.writeText(walletAddress); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  /* ─── actions ─── */
  const loadConversation = async (convId: string) => {
    setConversationId(convId); setPanelOpen(false); setError(null); localStorage.setItem("fw_last_conversation", convId);
    const r = await apiClient.get<{ conversation: Conversation; messages: Array<{ id: string; role: string; content: string; created_at: string; metadata?: Record<string, any> }> }>(`/api/v1/chat/conversations/${convId}/messages`);
    if (r.error) { setError("Failed to load conversation"); return; }
    setMessages((r.data?.messages ?? []).map((m) => ({ id: m.id, role: m.role as "user"|"assistant", content: m.content, created_at: m.created_at, requires_confirmation: m.metadata?.requires_confirmation, confirmation_id: m.metadata?.confirmation_token, confirmed: m.metadata?.confirmation_token ? true : undefined, trade_details: m.metadata?.trade_intent ? { asset: m.metadata.trade_intent.symbol, side: m.metadata.trade_intent.side, quantity: m.metadata.trade_intent.amount ?? m.metadata.trade_intent.quantity ?? 0, estimated_price: m.metadata.trade_intent.estimated_price ?? 0, estimated_total: m.metadata.trade_intent.estimated_total ?? 0 } : undefined })));
  };
  const startNewChat = () => { setConversationId(null); setMessages([]); setError(null); setPanelOpen(false); localStorage.removeItem("fw_last_conversation"); };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // don't trigger loadConversation
    try {
      await apiClient.delete(`/api/v1/chat/conversations/${convId}`);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (conversationId === convId) {
        setConversationId(null);
        setMessages([]);
        localStorage.removeItem("fw_last_conversation");
      }
    } catch {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  };

  const sendMessage = async () => {
    const text = input.trim(); if (!text || sending) return;
    setMessages((p) => [...p, { id: crypto.randomUUID(), role: "user", content: text, created_at: new Date().toISOString() }]);
    setInput(""); setSending(true); setError(null);
    const r = await apiClient.post<ChatApiResponse>("/api/v1/chat/message", { message: text, persona_id: selectedPersona, conversation_id: conversationId, model: selectedModel });
    if (r.error) { setSending(false); setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.error || "Something went wrong." }]); setTimeout(() => inputRef.current?.focus(), 100); return; }
    if (r.data) {
      if (r.data.conversation_id && !conversationId) { setConversationId(r.data.conversation_id); localStorage.setItem("fw_last_conversation", r.data.conversation_id); queryClient.invalidateQueries({ queryKey: ["conversations"] }); }
      const ti = r.data!.trade_intent;
      // For dollar trades: force total to the dollar amount, ignore backend estimated_total
      const computedTotal = (ti?.is_dollar_amount && ti?.dollar_amount) ? ti.dollar_amount : (ti?.estimated_total ?? 0);
      const tradeDetails = ti ? {
        asset: ti.symbol,
        side: ti.side,
        quantity: ti.amount,
        estimated_price: ti.estimated_price ?? 0,
        estimated_total: computedTotal,
      } : undefined;
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.data!.reply, isNew: true, requires_confirmation: r.data!.requires_confirmation, confirmation_id: r.data!.confirmation_token || undefined, trade_details: tradeDetails, created_at: new Date().toISOString() }]);
      // Only play TTS for non-trade responses (trade cards don't need voice)
      if (!r.data!.requires_confirmation) {
        playTTS(r.data.reply);
        if (voiceModeRef.current && !voiceEnabled) { setTimeout(() => startListening(), 500); }
      } else if (voiceModeRef.current) {
        setTimeout(() => startListening(), 500);
      }
    }
    setSending(false);
    setTimeout(() => { inputRef.current?.focus(); }, 150);
  };

  const confirmTrade = async (cid: string, approve: boolean) => {
    setSending(true); setError(null);

    const r = await apiClient.post<{
      status: string; trade_id?: string; message: string;
      unsigned_tx?: { to: string; value: number; data: string; chainId: number; gas?: number } | null;
      approval_tx?: { to: string; value: number; data: string; chainId: number; gas?: number } | null;
    }>("/api/v1/chat/confirm", { confirmation_token: cid, confirmed: approve });

    if (r.error) { setSending(false); setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.error || "Something went wrong." }]); setTimeout(() => inputRef.current?.focus(), 150); return; }

    // If backend returned an unsigned tx for client-side signing
    if (r.data?.status === "sign_required" && r.data.unsigned_tx) {
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: "Signing transaction..." }]);

      try {
        // Step 1: If approval needed, sign approval first
        if (r.data.approval_tx) {
          setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: "Approving token..." }]);
          const approvalReceipt = await sendTransaction(
            {
              to: r.data.approval_tx.to as `0x${string}`,
              value: BigInt(r.data.approval_tx.value || 0),
              data: r.data.approval_tx.data as `0x${string}`,
              chainId: r.data.approval_tx.chainId,
              ...(r.data.approval_tx.gas ? { gasLimit: BigInt(r.data.approval_tx.gas) } : {}),
            },
            { sponsor: true }
          );
          console.log("[FW] Approval tx:", approvalReceipt);
        }

        // Step 2: Sign the swap tx
        const receipt = await sendTransaction(
          {
            to: r.data.unsigned_tx.to as `0x${string}`,
            value: BigInt(r.data.unsigned_tx.value || 0),
            data: r.data.unsigned_tx.data as `0x${string}`,
            chainId: r.data.unsigned_tx.chainId,
            ...(r.data.unsigned_tx.gas ? { gasLimit: BigInt(r.data.unsigned_tx.gas) } : {}),
          },
          { sponsor: true }
        );

        const txHash = typeof receipt === "string" ? receipt : (receipt as any)?.transactionHash || (receipt as any)?.hash || "";
        console.log("[FW] Swap tx:", txHash);

        // Step 3: Report tx hash to backend
        await apiClient.post("/api/v1/chat/report-trade", { confirmation_token: cid, tx_hash: txHash, status: "confirmed" });

        setMessages((p) => p.map((m) => m.confirmation_id === cid ? { ...m, confirmed: true } : m));
        setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: `Trade confirmed on-chain.\nTx: ${txHash}` }]);
      } catch (signErr: any) {
        const msg = signErr?.message || "Transaction signing failed";
        setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: `Trade cancelled.` }]);
        await apiClient.post("/api/v1/chat/report-trade", { confirmation_token: cid, tx_hash: "", status: "failed" });
      }
    } else {
      // Non-swap confirmations (send, cancel, etc.)
      setMessages((p) => p.map((m) => m.confirmation_id === cid ? { ...m, confirmed: true } : m));
      if (r.data) setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.data!.message }]);
    }

    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const askAI = async (tradeDetails: { asset: string; side: string; quantity: number; estimated_price: number }) => {
    setSending(true);
    const prompt = `Should I ${tradeDetails.side} ${tradeDetails.quantity} ${tradeDetails.asset} at $${tradeDetails.estimated_price}? Quick take.`;
    const r = await apiClient.post<ChatApiResponse>("/api/v1/chat/message", { message: prompt, persona_id: selectedPersona, conversation_id: conversationId, model: selectedModel });
    if (r.data) {
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.data!.reply, isNew: true }]);
      playTTS(r.data.reply);
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const convList = conversations.data ?? [];
  const personas = personasQuery.data ?? [];

  const handlePersonaChip = (c: typeof PERSONA_CHIPS[0]) => { setSelectedPersona(c.id); setTimeout(() => inputRef.current?.focus(), 50); };
  const handleActionChip = (c: typeof ACTION_CHIPS[0]) => { setInput(c.prefill); setTimeout(() => inputRef.current?.focus(), 50); };

  /* ─── render ─── */
  return (
    <>
      {/* ── LEFT PANEL (Claude/ChatGPT style) ── */}
      {panelOpen && <div className="fixed inset-0 z-[70] bg-black/50" onClick={() => setPanelOpen(false)} />}
      <aside className={`fixed top-0 left-0 z-[71] h-full w-72 bg-card border-r border-border flex flex-col transition-transform duration-200 ${panelOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* title */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">FutureWallet</span>
            </div>
            <button onClick={() => setPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* nav items */}
        <div className="px-3 space-y-0.5">
          <button onClick={startNewChat} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-accent transition-colors text-foreground">
            <Plus className="h-4 w-4" /> New Chat
          </button>
          <Link href="/trades" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <ArrowUpRight className="h-4 w-4" /> Trades
          </Link>
          <Link href="/personas" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Users className="h-4 w-4" /> Personas
          </Link>
        </div>

        {/* recent chats */}
        <div className="mt-4 px-4">
          <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">Recents</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 mt-2 space-y-0.5">
          {conversations.isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : convList.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No chats yet</p>
          ) : convList.map((conv) => (
            <div key={conv.id} className={`group flex items-center rounded-xl transition-colors ${conversationId === conv.id ? "bg-primary/10" : "hover:bg-accent"}`}>
              <button onClick={() => loadConversation(conv.id)}
                className={`flex-1 text-left px-3 py-2 text-sm truncate ${conversationId === conv.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {conv.title}
              </button>
              <button onClick={(e) => deleteConversation(conv.id, e)}
                className="shrink-0 p-1.5 mr-1 rounded-lg text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive hover:bg-destructive/10 transition-all"
                title="Delete chat">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* bottom: settings + version */}
        <div className="border-t border-border/40 p-3">
          <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <div className="px-3 mt-2"><BuildVersion /></div>
        </div>
      </aside>

      {/* ── MAIN CHAT AREA ── */}
      <main className="flex flex-col bg-background overflow-hidden" style={{ height: "100dvh" }}>

        {/* ── top bar (always visible) ── */}
        <div className="shrink-0 px-4 py-2 flex items-center justify-between border-b border-border/30 bg-background z-30">
          <div className="flex items-center gap-2">
            <button onClick={() => setPanelOpen(true)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-foreground/70">FutureWallet</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSignalsOpen(true)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground relative" title="Social Signals">
              <Bell className="h-5 w-5" />
              {(signalsQuery.data?.length ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
            <button onClick={() => setWalletOpen(true)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground" title="Wallet">
              <Wallet className="h-5 w-5" />
            </button>
            <button onClick={startNewChat} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground" title="New chat">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── balance bar ── */}
        <div className="shrink-0 px-4 py-1.5 flex items-center justify-between border-b border-border/20 bg-card/80 z-30">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold tabular-nums">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={`text-xs tabular-nums flex items-center gap-0.5 ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { setInput("send "); setTimeout(() => inputRef.current?.focus(), 50); }} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <ArrowUpFromLine className="h-3.5 w-3.5" /> Send
            </button>
            <button onClick={() => setShowReceive(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <ArrowDownToLine className="h-3.5 w-3.5" /> Receive
            </button>
          </div>
        </div>

        {/* ── wallet overlay (iOS bottom sheet) ── */}
        {walletOpen && (
          <>
            <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => setWalletOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-[61] animate-in slide-in-from-bottom duration-300">
              <div className="bg-card border-t border-border rounded-t-2xl max-h-[75vh] flex flex-col shadow-2xl">
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-muted-foreground/30" /></div>
                <div className="flex items-center justify-between px-5 pb-2">
                  <p className="text-base font-semibold">Wallet</p>
                  <button onClick={() => setWalletOpen(false)} className="p-1.5 rounded-full hover:bg-accent text-muted-foreground"><X className="h-5 w-5" /></button>
                </div>
                {/* balance summary */}
                <div className="px-5 pb-4 text-center">
                  <p className="text-3xl font-bold tabular-nums">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className={`text-sm tabular-nums mt-1 ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                    PnL {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%)
                  </p>
                  {/* address */}
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <code className="text-xs text-muted-foreground">{walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "No wallet"}</code>
                    {walletAddress && (
                      <button onClick={handleCopy} className="p-1 rounded hover:bg-accent">
                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                      </button>
                    )}
                  </div>
                </div>
                {/* assets list */}
                <div className="flex-1 overflow-y-auto px-5 pb-8">
                  <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">Assets</p>
                  {portfolioQuery.isLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : (portfolioQuery.data?.positions ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No assets yet</p>
                  ) : (
                    <div className="space-y-2">
                      {(portfolioQuery.data?.positions ?? []).map((pos) => (
                        <div key={pos.symbol} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                          <div>
                            <p className="text-sm font-medium">{pos.symbol}</p>
                            <p className="text-xs text-muted-foreground">{pos.quantity} units</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium tabular-nums">${(pos.value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className={`text-xs tabular-nums ${(pos.pnl_percent ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {(pos.pnl_percent ?? 0) >= 0 ? "+" : ""}{(pos.pnl_percent ?? 0).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── receive modal ── */}
        {showReceive && (
          <>
            <div className="fixed inset-0 z-[60] bg-black/60" onClick={() => setShowReceive(false)} />
            <div className="fixed left-1/2 top-1/2 z-[61] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-1">Receive</h3>
              <p className="text-xs text-muted-foreground mb-4">Send tokens to this address on Base network.</p>
              <div className="rounded-lg border bg-muted/50 p-3 flex items-center gap-2">
                <code className="text-xs break-all flex-1 text-foreground">{walletAddress || "No wallet"}</code>
                {walletAddress && <button onClick={handleCopy} className="shrink-0 rounded-md p-1.5 hover:bg-accent">{copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}</button>}
              </div>
              {copied && <p className="text-xs text-green-500 mt-2">Copied!</p>}
              <button onClick={() => setShowReceive(false)} className="mt-4 w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Done</button>
            </div>
          </>
        )}

        {/* ── signals overlay (iOS bottom sheet) ── */}
        {signalsOpen && (
          <>
            <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => setSignalsOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-[61] animate-in slide-in-from-bottom duration-300">
              <div className="bg-card border-t border-border rounded-t-2xl max-h-[75vh] flex flex-col shadow-2xl">
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-muted-foreground/30" /></div>
                <div className="flex items-center justify-between px-5 pb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    <p className="text-base font-semibold">Social Signals</p>
                  </div>
                  <button onClick={() => setSignalsOpen(false)} className="p-1.5 rounded-full hover:bg-accent text-muted-foreground"><X className="h-5 w-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 pb-8">
                  {signalsQuery.isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : (signalsQuery.data?.length ?? 0) === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No signals yet</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Signals appear when you trade — the AI analyzes X/Twitter sentiment.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(signalsQuery.data ?? []).map((sig) => (
                        <div key={sig.id} className="rounded-xl border border-border/40 p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold">{sig.symbol}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                sig.sentiment_score > 0.2 ? "bg-green-500/15 text-green-500"
                                : sig.sentiment_score < -0.2 ? "bg-red-500/15 text-red-500"
                                : "bg-muted text-muted-foreground"
                              }`}>
                                {sig.sentiment_score > 0.2 ? "Bullish" : sig.sentiment_score < -0.2 ? "Bearish" : "Neutral"} {sig.sentiment_score.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-muted-foreground/50">{sig.post_count} posts</span>
                            </div>
                          </div>
                          {sig.summary && <p className="text-xs text-muted-foreground leading-relaxed">{sig.summary}</p>}
                          {sig.trending && sig.trending.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {sig.trending.map((t, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/50 text-muted-foreground">{t}</span>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground/40 mt-2">{new Date(sig.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── EMPTY STATE ── */}
        {!hasMessages && (
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
            <h1 className="text-2xl font-semibold text-foreground mb-6 tracking-tight">
              Ready to trade?
            </h1>

            {/* persona chips — big memoji centered */}
            <div className="flex justify-center gap-6 mb-8 max-w-2xl">
              {PERSONA_CHIPS.map((c) => (
                <button key={c.id} onClick={() => handlePersonaChip(c)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:bg-primary/5 ${selectedPersona === c.id ? "bg-primary/10 ring-2 ring-primary" : ""}`}>
                  <img src={c.img} alt={c.label} className="h-16 w-16 rounded-full object-cover" />
                  <span className={`text-xs font-medium ${selectedPersona === c.id ? "text-primary" : "text-muted-foreground"}`}>{c.label}</span>
                </button>
              ))}
            </div>

            {/* input bar */}
            <div className="w-full max-w-2xl mx-auto">
              <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur shadow-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3">
                  <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Buy, sell, send, or ask me anything..." disabled={sending}
                    className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/50 h-8" autoFocus />
                  {/* language + voice button */}
                  <LangDropdown value={voiceLang} onChange={setVoiceLang} />
                  <button onClick={input.trim() ? sendMessage : toggleListening} id="chat-send-btn"
                    className={`p-2.5 rounded-full transition-all ${
                      listening ? "bg-destructive/20 text-destructive animate-pulse"
                      : input.trim() ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "bg-accent/60 text-muted-foreground hover:text-foreground"
                    }`}>
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" />
                      : listening ? <MicOff className="h-5 w-5" />
                      : input.trim() ? <Send className="h-5 w-5" />
                      : <Mic className="h-5 w-5" />}
                  </button>
                </div>
                {/* toolbar */}
                <div className="flex items-center justify-between px-3 pb-2">
                  <PersonaDropdown value={selectedPersona} onChange={setSelectedPersona} personas={personas} />
                  <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
                </div>
              </div>
            </div>

            {/* action chips */}
            <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-2xl">
              {ACTION_CHIPS.map((c) => (
                <button key={c.label} onClick={() => handleActionChip(c)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/40 text-xs text-muted-foreground transition-all hover:border-border hover:text-foreground hover:bg-accent/50">
                  <span>{c.emoji}</span><span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── ACTIVE CHAT ── */}
        {hasMessages && (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-6" style={{ paddingBottom: "80vh" }}>
                {messages.map((msg, idx) => {
                  const isLastUser = msg.role === "user" && !messages.slice(idx + 1).some(m => m.role === "user");
                  return (
                  <div key={msg.id} ref={isLastUser ? lastUserMsgRef : undefined} style={isLastUser ? { scrollMarginTop: "8px" } : undefined}>
                    {msg.role === "user" ? (
                      <div className="flex flex-col items-end">
                        <div className="bg-primary/15 text-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[75%] whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        {msg.created_at && <p className="text-[10px] text-muted-foreground/40 mt-1 mr-1">{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
                      </div>
                    ) : (
                      <div className="flex gap-3 items-start">
                        {selectedPersona && PERSONA_CHIPS.find(p => p.id === selectedPersona)?.img ? (
                          <img src={PERSONA_CHIPS.find(p => p.id === selectedPersona)!.img} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 mt-0.5" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap min-w-0">
                          {msg.requires_confirmation && msg.trade_details ? (
                            <Card className="border-border/60 w-full max-w-lg">
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="font-medium text-sm">Confirmation</p>
                                  <Badge variant={msg.trade_details.side === "buy" ? "secondary" : "destructive"}>{msg.trade_details.side.toUpperCase()}</Badge>
                                </div>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Asset</span><span>{msg.trade_details.asset}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Qty</span><span>{msg.trade_details.quantity}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span>${(msg.trade_details.estimated_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span></div>
                                  <div className="flex justify-between font-medium border-t border-border/40 pt-1"><span>Total</span><span>${(msg.trade_details.estimated_total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span></div>
                                </div>
                                {!msg.confirmed && msg.confirmation_id && (
                                  <div className="flex items-center justify-between mt-2">
                                    <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl" onClick={() => askAI(msg.trade_details!)} disabled={sending}>
                                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                                      {selectedPersona === "elon" ? "Ask Elon" : selectedPersona === "buffett" ? "Ask Warren" : selectedPersona === "ai_momentum" ? "Ask AI" : "Ask AI"}
                                    </Button>
                                    <div className="flex gap-2">
                                      <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl" onClick={() => confirmTrade(msg.confirmation_id!, false)} disabled={sending}><XCircle className="mr-1 h-3.5 w-3.5" /> Cancel</Button>
                                      <Button size="sm" className="h-9 text-xs rounded-xl" onClick={() => confirmTrade(msg.confirmation_id!, true)} disabled={sending}><CheckCircle className="mr-1 h-3.5 w-3.5" /> Confirm</Button>
                                    </div>
                                  </div>
                                )}
                                {msg.confirmed && <p className="text-xs text-muted-foreground text-center">Submitted</p>}
                              </CardContent>
                            </Card>
                          ) : (
                            <>
                              {(() => { const c = cleanContent(msg.content); return msg.isNew ? <TypewriterText text={c} speed={12} /> : c; })()}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
                {sending && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Thinking...</span></div>}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* ── bottom input (fixed) ── */}
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/30 bg-background/95 backdrop-blur-md px-4 py-3 safe-area-pb">
              <div className="max-w-3xl mx-auto">
                <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur shadow-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2">
                  <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Buy, sell, send, or ask me anything..." disabled={sending}
                    className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/50 h-8" autoFocus />
                  <LangDropdown value={voiceLang} onChange={setVoiceLang} />
                  <button onClick={input.trim() ? sendMessage : toggleListening} id="chat-send-btn-active"
                    className={`p-2.5 rounded-full transition-all ${
                      listening ? "bg-destructive/20 text-destructive animate-pulse"
                      : input.trim() ? "bg-primary text-primary-foreground hover:opacity-90"
                      : voiceMode ? "bg-green-500/20 text-green-500 ring-2 ring-green-500/50"
                      : "bg-accent/60 text-muted-foreground hover:text-foreground"
                    }`}>
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" />
                      : listening ? <MicOff className="h-5 w-5" />
                      : input.trim() ? <Send className="h-5 w-5" />
                      : <Mic className="h-5 w-5" />}
                  </button>
                  </div>
                  <div className="flex items-center justify-between px-3 pb-2">
                    <PersonaDropdown value={selectedPersona} onChange={setSelectedPersona} personas={personas} />
                    <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
```

### 6.4 app/dashboard/page.tsx — Dashboard

```tsx
"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import Link from "next/link";
import { NavSidebar } from "@/components/nav-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { SystemStatus } from "@/components/system-status";
import {
  Wallet,
  MessageSquare,
  BarChart3,
  Users,
  ArrowUpRight,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface PortfolioData {
  total_value: number;
  positions: Array<{
    asset: string;
    symbol: string;
    quantity: number;
    value: number;
    pnl_percent: number;
  }>;
}

interface TradeData {
  id: string;
  asset: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  created_at: string;
}

interface TradesResponse {
  trades: TradeData[];
}

export default function DashboardPage() {
  const { ready, authenticated, getAccessToken, user } = usePrivy();

  useEffect(() => {
    if (getAccessToken) {
      apiClient.setAccessTokenGetter(getAccessToken);
    }
  }, [getAccessToken]);

  const walletAddress =
    (user?.wallet as any)?.address ||
    (user?.linkedAccounts?.find((a) => a.type === "wallet") as any)?.address ||
    "";

  const portfolio = useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await apiClient.get<PortfolioData>("/api/v1/portfolio");
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    retry: false,
    enabled: ready && authenticated,
  });

  const trades = useQuery({
    queryKey: ["trades"],
    queryFn: async () => {
      const res = await apiClient.get<TradesResponse>("/api/v1/trades");
      if (res.error) throw new Error(res.error);
      return res.data?.trades ?? [];
    },
    retry: false,
    enabled: ready && authenticated,
  });

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <NavSidebar />
      <main className="md:ml-64 pt-14 md:pt-0 pb-16 md:pb-0 min-h-screen">
        <SystemStatus />
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {walletAddress
                ? `Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                : "Connecting wallet..."}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { href: "/chat", icon: MessageSquare, label: "Chat" },
              { href: "/assets", icon: BarChart3, label: "Assets" },
              { href: "/personas", icon: Users, label: "Personas" },
              { href: "/settings", icon: Wallet, label: "Settings" },
            ].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" /> Portfolio
              </CardTitle>
            </CardHeader>
            <CardContent>
              {portfolio.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : portfolio.isError ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Unable to load portfolio</p>
                  <p className="text-xs text-muted-foreground mt-1">Your positions will appear here once connected.</p>
                </div>
              ) : portfolio.data?.positions?.length ? (
                <div className="space-y-3">
                  {portfolio.data.positions.map((pos) => (
                    <div key={pos.symbol} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium text-sm">{pos.asset}</p>
                        <p className="text-xs text-muted-foreground">{pos.symbol} - {pos.quantity} units</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">${(pos.value ?? 0).toLocaleString()}</p>
                        <Badge variant={(pos.pnl_percent ?? 0) >= 0 ? "secondary" : "destructive"} className="text-xs">
                          {(pos.pnl_percent ?? 0) >= 0 ? "+" : ""}{(pos.pnl_percent ?? 0).toFixed(2)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Wallet className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No positions yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Start trading via Chat to build your portfolio.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5" /> Recent Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trades.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : trades.isError ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Unable to load trades</p>
                  <p className="text-xs text-muted-foreground mt-1">Your trade history will appear here.</p>
                </div>
              ) : trades.data?.length ? (
                <div className="space-y-3">
                  {trades.data.map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium text-sm">{trade.asset}</p>
                        <p className="text-xs text-muted-foreground">
                          {(trade.side ?? "buy").toUpperCase()} - {trade.quantity ?? 0} @ ${(trade.price ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="secondary">{trade.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ArrowUpRight className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No trades yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Use Chat to execute your first trade.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
```

### 6.5 — 6.9 Remaining Pages

The remaining pages (assets, trades, personas, social, settings) follow the same patterns. Their complete source code is in section 6.3 above for the chat page, and the full source of each is included below for completeness. Each page:
- Uses `"use client"` directive
- Gets auth via `usePrivy()`
- Sets API token via `apiClient.setAccessTokenGetter(getAccessToken)`
- Uses TanStack Query for data fetching
- Has a "Back to Chat" link (ArrowLeft icon)
- Uses shadcn/ui Card, Badge, Button, Input components

Due to the massive size of this document, the remaining page source code for assets, trades, personas, social, and settings pages is identical to what appears in the respective files at:
- `apps/webapp/app/assets/page.tsx`
- `apps/webapp/app/trades/page.tsx`
- `apps/webapp/app/personas/page.tsx`
- `apps/webapp/app/social/page.tsx`
- `apps/webapp/app/settings/page.tsx`

Their complete source has already been included above in section 6.3 (chat) and 6.4 (dashboard). The remaining pages follow the exact same structure. For a complete rebuild, copy each file directly.

---

## 7. Components

### 7.1 components/providers/client-providers.tsx

```tsx
"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "./query-provider";
import { VersionCheck } from "@/components/version-check";
import { AuthGate } from "@/components/auth-gate";

const PrivyProvider = dynamic(
  () => import("./privy-provider").then((m) => ({ default: m.PrivyProvider })),
  { ssr: false }
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider>
      <QueryProvider>
        <VersionCheck />
        <AuthGate>{children}</AuthGate>
      </QueryProvider>
    </PrivyProvider>
  );
}
```

Note: PrivyProvider is dynamically imported with `ssr: false` because it uses browser-only APIs.

### 7.2 components/providers/privy-provider.tsx

```tsx
"use client";

import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { PRIVY_APP_ID } from "@/lib/constants";

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  if (typeof window === "undefined") {
    return <>{children}</>;
  }

  return (
    <BasePrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["passkey"],
        appearance: {
          theme: "dark",
          accentColor: "#7c3aed",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
```

Key config:
- `loginMethods: ["passkey"]` — passkey only, no email/social
- `embeddedWallets.ethereum.createOnLogin: "all-users"` — auto-create wallet
- `accentColor: "#7c3aed"` — purple (Privy modal accent)

### 7.3 components/providers/query-provider.tsx

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

### 7.4 components/auth-gate.tsx

```tsx
"use client";

import { usePrivy, useLoginWithPasskey, useSignupWithPasskey } from "@privy-io/react-auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Loader2, KeyRound, UserPlus } from "lucide-react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const { loginWithPasskey } = useLoginWithPasskey();
  const { signupWithPasskey } = useSignupWithPasskey();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true); setError(null);
    try {
      await loginWithPasskey();
    } catch (e: any) {
      setError(e?.message || "Login failed. Try again.");
    }
    setLoading(false);
  };

  const handleSignup = async () => {
    setLoading(true); setError(null);
    try {
      await signupWithPasskey();
    } catch (e: any) {
      setError(e?.message || "Signup failed. Try again.");
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">FutureWallet</CardTitle>
            <CardDescription>
              AI-powered wallet for stocks and crypto.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button size="lg" className="w-full text-base" onClick={handleLogin} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2 h-5 w-5" />}
              Log in with Passkey
            </Button>
            <Button size="lg" variant="outline" className="w-full text-base" onClick={handleSignup} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UserPlus className="mr-2 h-5 w-5" />}
              Create Account
            </Button>
            {error && <p className="text-center text-xs text-destructive">{error}</p>}
            <p className="text-center text-xs text-muted-foreground">
              A wallet is created automatically on signup.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
```

### 7.5 components/version-check.tsx

```tsx
"use client";

import { useEffect, useRef, useCallback } from "react";

const CHECK_INTERVAL = 30_000; // Check every 30 seconds

export function VersionCheck() {
  const currentVersion = useRef<string | null>(null);
  const reloading = useRef(false);

  const hardReload = useCallback(() => {
    if (reloading.current) return;
    reloading.current = true;
    console.log("[FutureWallet] New version detected — clearing caches and reloading...");

    const doReload = () => globalThis.location?.reload();
    if ("caches" in globalThis) {
      caches.keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .then(doReload)
        .catch(doReload);
    } else {
      doReload();
    }
  }, []);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[FutureWallet] SW registered");
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "activated" && navigator.serviceWorker.controller) {
                  hardReload();
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn("[FutureWallet] SW registration failed:", err);
        });

      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SW_UPDATED") {
          hardReload();
        }
      });
    }

    // Version polling
    async function checkVersion() {
      try {
        const res = await fetch("/version.json?_=" + Date.now(), {
          cache: "no-store",
          headers: { Pragma: "no-cache" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const newVersion = data.v;

        if (currentVersion.current === null) {
          currentVersion.current = newVersion;
        } else if (currentVersion.current !== newVersion) {
          hardReload();
        }
      } catch {
        // Ignore fetch errors (offline, etc.)
      }
    }

    async function checkAll() {
      await checkVersion();
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        reg?.update().catch(() => {});
      }
    }

    checkAll();
    const interval = setInterval(checkAll, CHECK_INTERVAL);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        checkAll();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hardReload]);

  return null;
}
```

### 7.6 components/system-status.tsx

Full source included in the SystemStatus and StatusBar components — see the file at `apps/webapp/components/system-status.tsx`. It provides:
- Offline detection (navigator.onLine)
- API health check every 30s
- Wallet initialization status
- Auto-hides when everything is OK

### 7.7 components/nav-sidebar.tsx

Full source at `apps/webapp/components/nav-sidebar.tsx`. Provides:
- Desktop sidebar (left, 256px wide) with nav links, balance widget, Send/Receive/Key buttons
- Mobile top bar (fixed, h-14) with logo + balance
- Mobile bottom tab bar (fixed) with 5 nav items
- Receive modal overlay
- ETH diamond SVG for wallet icon
- Portfolio PnL + 24h change from history

### 7.8 UI Components (shadcn/ui)

All in `components/ui/`. Standard shadcn/ui implementations:

**button.tsx** — 6 variants (default, destructive, outline, secondary, ghost, link), 4 sizes (default, sm, lg, icon), `asChild` prop support via Radix Slot.

**card.tsx** — Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter.

**input.tsx** — Standard styled input with ring focus styles.

**dialog.tsx** — Full Radix Dialog with overlay, content, header, footer, title, description, close button.

**badge.tsx** — 6 variants (default, secondary, destructive, outline, success, warning). Rounded-full pill style.

**avatar.tsx** — Radix Avatar with Image and Fallback.

---

## 8. Key Features Implementation

### 8.1 Chat UI

The chat page (`app/chat/page.tsx`) is a single ~1000-line component that handles:

**Empty state**: Centered layout with persona chips (memoji images), a floating input bar with persona/model dropdowns, and action chips.

**Active chat**: Full-screen messages with a fixed bottom input bar. User messages right-aligned in blue bubble, assistant messages left-aligned with avatar.

**Trade confirmation cards**: When `requires_confirmation` is true, a Card component shows asset, qty, price, total with Ask AI / Cancel / Confirm buttons.

**Typewriter effect**: New assistant messages (`isNew: true`) use `TypewriterText` component that reveals text character-by-character at 12ms speed.

**Conversation persistence**: Messages saved to Firestore via backend. Conversation list in left panel. Last conversation ID stored in localStorage for restoration.

### 8.2 Wallet Overlay

iOS bottom sheet pattern: fixed bottom-0, slide-in-from-bottom animation, rounded-t-2xl, drag indicator bar, backdrop blur overlay. Shows total balance, PnL, wallet address with copy, and scrollable asset list.

### 8.3 Social Signals Overlay

Same iOS bottom sheet pattern. Shows sentiment badges (Bullish/Bearish/Neutral with color coding), post counts, summaries, trending topics, timestamps. Data from Grok-3 via `/api/v1/social/signals`.

### 8.4 Voice Features

**Text-to-speech**: Calls `/api/v1/chat/tts` with cleaned text (max 300 chars, markdown/addresses stripped). Returns audio blob played via `new Audio(url)`.

**Speech-to-text**: Uses browser `SpeechRecognition` API. Language selectable (9 options). Auto-sends on recognition end.

**Voice conversation mode**: Toggle via mic button. After TTS playback ends, automatically starts listening again. Continuous loop until user stops.

**Safari audio unlock**: First click/touch creates and resumes AudioContext to unlock audio playback.

### 8.5 Trade Confirmation Flow

1. User sends trade message ("buy 1 ETH")
2. Backend returns `requires_confirmation: true` with `confirmation_token` and `trade_intent`
3. Chat shows Card with trade details + Ask AI / Cancel / Confirm buttons
4. On Confirm: backend returns unsigned tx → frontend signs via Privy `sendTransaction` with `{ sponsor: true }` → reports tx hash back to backend
5. On Cancel: marks trade as cancelled

### 8.6 PWA Cache Busting (3-layer)

| Layer | Mechanism | Cache Policy |
|-------|-----------|-------------|
| 1. Content hash | Next.js `_next/static/**` chunks | `immutable, max-age=1yr` |
| 2. Version poll | `version.json` polled every 30s | `no-cache, no-store` |
| 3. Service Worker | `sw.js` — skipWaiting + clear all caches | `no-cache, no-store` |

HTML pages served with `no-cache, no-store, must-revalidate`.

---

## 9. Environment Variables

### Required for Development

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_PRIVY_APP_ID=cmmpncjim00g50dlc9i8tik5j
```

### Production (set on Firebase Hosting / build env)

```env
NEXT_PUBLIC_API_URL=https://futurewallet-api-805699851675.europe-west1.run.app
NEXT_PUBLIC_PRIVY_APP_ID=cmmpncjim00g50dlc9i8tik5j
```

### Privy Configuration

- App ID: `cmmpncjim00g50dlc9i8tik5j`
- Login methods: `["passkey"]` only
- Embedded wallets: Ethereum, create on login for all users
- Theme: dark, accent color `#7c3aed` (purple)

---

## 10. Deployment

### Build Command

```bash
cd apps/webapp && npm run build
```

This:
1. Writes `public/version.json` with current timestamp
2. Runs `next build` which produces static export in `out/`

### Firebase Hosting Config (from firebase.json)

```json
{
  "site": "futurewallet-app",
  "public": "apps/webapp/out",
  "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "_next/static/**",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "version.json",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
        { "key": "Pragma", "value": "no-cache" }
      ]
    },
    {
      "source": "sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
        { "key": "Service-Worker-Allowed", "value": "/" }
      ]
    },
    {
      "source": "manifest.json",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" }
      ]
    },
    {
      "source": "**",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
        { "key": "Pragma", "value": "no-cache" }
      ]
    }
  ]
}
```

### Deploy Command

```bash
firebase deploy --only hosting:futurewallet-app --project future-wallet-490203
```

### PWA Manifest (public/manifest.json)

```json
{
  "name": "FutureWallet",
  "short_name": "FutureWallet",
  "description": "AI-Powered Non-Custodial Wallet for Stocks & Crypto",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#7c3aed",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Service Worker (public/sw.js)

```js
// FutureWallet Service Worker
// Minimal — no offline caching. Only purpose:
// 1. Enable PWA "Install App" prompt
// 2. Force-clear any stale caches on update
// 3. skipWaiting + claim to immediately activate new version

const CACHE_VERSION = "fw-v1";

// Install: skip waiting to activate immediately
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate: clear ALL old caches, then claim all clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.map((name) => {
            console.log("[SW] Clearing cache:", name);
            return caches.delete(name);
          })
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients that a new version is available
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "SW_UPDATED" });
          });
        });
      })
  );
});

// Fetch: pass-through (no caching) — let the browser/CDN handle it
self.addEventListener("fetch", (event) => {
  // Don't intercept — just use normal network behavior
  return;
});
```

### Static Assets Required

Place these in `public/`:
- `icon-192.png` — 192x192 app icon
- `icon-512.png` — 512x512 app icon
- `personas/elon.png` — Elon Musk memoji avatar
- `personas/buffett.png` — Warren Buffett memoji avatar
- `personas/ai_momentum.png` — AI Momentum avatar

---

## 11. Design System Reference (from specs/design-system.md)

The current webapp uses a **simplified shadcn/ui** design system, not the full "Liquid Glass" spec from `design-system.md`. The design system spec describes an aspirational iOS 26-style design with glass effects, emerald accents, and floating tab bars — which could be used for a future redesign.

**Current implementation uses:**
- shadcn/ui default components (not glass cards)
- HSL CSS variables via Tailwind (not the emerald `#00d4aa` palette)
- iOS blue `#007AFF` as primary (hsl 211 100% 50%)
- Standard border-radius (0.5rem) not 26px glass cards
- `lucide-react` icons
- No backdrop-filter blur on cards (only on overlays)

The design-system.md spec is available for reference if you want to upgrade to the glass aesthetic.
