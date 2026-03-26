# Merlin

## The simplest way to trade tokenized assets and crypto

Merlin is an AI-powered non-custodial wallet where you trade real-world assets (RWA) and crypto by just talking. No trading interfaces to learn. No order books. No dashboards full of charts. Just a chat — the interface everybody already knows from ChatGPT, Claude, and every other LLM — except this one trades for you.

You type "buy $50 of Tesla" and it happens. On-chain. On Ethereum. With your own keys.

---

## The core innovation: a chat that trades

No one has done this before. Trading platforms have charts. Wallets have swap tabs. Brokerages have order forms. Every single one requires the user to learn a new interface.

But there's one interface that 2 billion people already know how to use: **a chat window.** ChatGPT, Claude, Gemini — the entire world learned to talk to AI in 2023. That muscle memory is universal. Merlin takes it and points it at financial markets.

This is not "a chatbot that gives trading tips." This is not "an AI assistant inside a trading app." This is a **complete reversal of the paradigm**: the chat IS the trading interface. There is no other screen. The conversation is where you discover assets, ask for analysis, place trades, check your portfolio, and manage risk. Everything happens in the same thread, in natural language, with an AI agent that understands context.

Every trading platform today puts a complex interface between the user and their money — candles, order types, slippage settings, gas estimation, approve-then-swap, wallet popups. Merlin removes all of it.

**The interface is a conversation.** The AI agent handles everything else:

- **You say what you want** — "buy $100 of Apple", "sell half my NVIDIA", "what's my portfolio worth?"
- **The agent figures out the rest** — resolves the asset, gets a quote from Uniswap V3, checks guardrails, builds the transaction
- **You confirm or reject** — one tap
- **The wallet signs and submits** — client-side, with your private key, on Ethereum mainnet

No intermediate steps. No learning curve. Trading becomes as simple as sending a message. The first person who uses ChatGPT can use Merlin — because it's the same interaction pattern they already know.

---

## RWA: the biggest trend in crypto, made accessible

Real-world assets on-chain (RWA) are the fastest-growing sector in crypto — and for good reason. Tokenized stocks, ETFs, and commodities give users something no traditional brokerage can: **24/7 trading, global access, instant settlement, and self-custody.**

Tesla doesn't stop being valuable at 4pm EST. Gold doesn't pause on weekends. But traditional markets do. Tokenized RWAs on Ethereum don't. You can buy xTSLA at 3am on a Sunday, sell xGLD on Christmas Day, rebalance your portfolio whenever you want — no market hours, no settlement delays, no broker in the middle.

Merlin puts 80+ tokenized real-world assets at your fingertips:

**Tokenized stocks (xStocks)** — Tesla, Apple, NVIDIA, Google, Amazon, Microsoft, Coinbase, Palantir, GameStop, and 70+ more via Backed Finance / xStocks.fi. Each xStock tracks the underlying asset 1:1, lives on Ethereum, and trades around the clock.

**ETFs and commodities** — S&P 500 (xSPY), Nasdaq 100 (xQQQ), Gold (xGLD), Silver (xSLV), and more. Diversified exposure without leaving the chain.

**Crypto** — ETH, USDC, USDT, WETH. Native Ethereum assets traded directly on Uniswap V3.

One interface for all of it. No switching between apps, brokerages, and wallets. The AI knows the difference and routes accordingly.

---

## An AI agent that gets better

Merlin is not a static chatbot with hardcoded responses. It is a trading agent built on:

- **Claude tool use** — the LLM parses natural language into structured trade intents, not regex or keyword matching
- **Persona system** — users choose or create trading personalities (momentum, value, quantitative, speculative) that shape how the AI analyses and recommends
- **Social intelligence** — real-time sentiment from X/Twitter via Grok, fed into the AI's context for socially-aware trading decisions
- **Guardrails** — 8 safety checks on every trade (amount limits, duplicate detection, rate limiting, compliance, sanctioned country blocking) that protect users from mistakes
- **Conversation memory** — every interaction is persisted, building a history the agent learns from to improve recommendations over time

The vision: through millions of user interactions — what they trade, when they hesitate, what they confirm, what they reject — Merlin builds the strongest trading-specific LLM. Every conversation makes the agent smarter. Every trade teaches it risk. Every rejected recommendation teaches it caution.

---

## Pure Ethereum, non-custodial, private

Merlin doesn't try to be multi-chain, cross-chain, or chain-abstract. It is built on Ethereum and only Ethereum — the most battle-tested, most liquid, most regulated smart contract platform. This is a deliberate choice:

**Non-custodial by design.** Your keys never leave your device. The seed phrase is generated client-side (BIP-39), encrypted with a passkey-derived secret (Scrypt + AES-128-CTR), and stored in your browser's IndexedDB. The backend never sees your private key. Transaction signing happens entirely in the browser.

**Passkey authentication.** No passwords, no email, no social login. You authenticate with your device's biometrics (Face ID, fingerprint, Windows Hello) via WebAuthn. The passkey protects your encrypted seed. It's simpler AND more secure than every password-based wallet.

**Privacy integrated at the protocol level.** Merlin uses Railgun for shielded transactions — zero-knowledge proofs that hide sender, receiver, and amount while remaining on Ethereum mainnet. Every trade can be:

- **Public** — standard Ethereum transaction, visible on-chain
- **Shielded** — Railgun ZK proof, private on-chain
- **Compliant** — Privacy Pools, private but provably compliant

This isn't privacy as an afterthought. It's privacy as a first-class transaction mode, built into the wallet's core architecture via the Kohaku SDK.

**EIP-7702 gasless trading.** Users pay gas in USDC instead of ETH via the Ambire paymaster. No need to hold ETH just to trade. One less barrier to entry.

---

## How it works

```
User speaks or types
      |
      v
AI agent (Claude Haiku, streaming)
      |
      +--> Parses intent via tool use
      +--> Resolves asset (xStock fuzzy matcher, 80+ tokens)
      +--> Runs 8 guardrail checks
      +--> Gets Uniswap V3 quote (on-chain)
      +--> Presents confirmation card
      |
User confirms
      |
      v
Client-side wallet
      +--> Signs EIP-1559 transaction with private key
      +--> Broadcasts via JSON-RPC
      +--> Polls for on-chain confirmation
      +--> Reports result back to AI
      |
      v
AI confirms to user: "Done. Bought 0.23 xTSLA for $50."
```

Everything happens in one conversation turn. The user never leaves the chat.

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Next.js 15 (static export PWA) | Fast, offline-capable, installable on mobile |
| **UI** | Tailwind + shadcn/ui | Clean, accessible, ship fast |
| **Auth** | WebAuthn passkeys | No passwords, phishing-resistant |
| **Crypto** | @noble/hashes, @noble/curves, @scure/bip39 | Audited, minimal, no ethers.js bloat |
| **Privacy** | Railgun (Kohaku SDK) + Privacy Pools | ZK-shielded transactions on Ethereum |
| **Backend** | Python 3.12 + FastAPI | Async, fast, Anthropic SDK native |
| **AI** | Claude Haiku (tool use) | Best trade-off of speed, cost, and tool use |
| **Social** | Grok/xAI | Real-time X/Twitter sentiment |
| **Database** | Firestore | Real-time sync, security rules, zero ops |
| **DEX** | Uniswap V3 | Deepest liquidity on Ethereum |
| **Gasless** | EIP-7702 + Ambire paymaster | Gas in USDC, no ETH needed |
| **Cloud** | GCP (Cloud Run + Firebase Hosting) | europe-west1, auto-scaling, serverless |

---

## What makes this different

**It's not a DEX.** DEXs are trading interfaces for traders. Merlin is a wallet for everyone.

**It's not a wallet with a swap tab.** Those are complex apps that happen to have a swap button. Merlin is a conversation that happens to have a wallet.

**It's not a ChatGPT plugin.** Merlin owns the full stack — keys, signing, privacy, execution. The AI isn't calling an API. It IS the product.

**It's not multi-chain.** Multi-chain means multi-compromise. Merlin is Ethereum-native, Ethereum-deep, Ethereum-only. One chain, done right.

The bet: the next billion crypto users won't learn trading interfaces. They'll talk to an AI that trades for them. Merlin is that AI, with a real wallet behind it.
