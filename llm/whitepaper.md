# Merlin: Chat-Native Trading for Tokenized Real-World Assets

**Version 1.0 — March 2026**

---

## Abstract

Merlin is the first non-custodial Ethereum wallet where the chat window is the entire trading interface. By combining conversational AI with client-side key management, Merlin gives users access to 80+ tokenized stocks, ETFs, commodities, and native crypto assets — all through natural language. Users type "buy $50 of Tesla" and a production AI agent resolves the asset, fetches a real-time quote from Uniswap V3, runs eight safety checks, and presents a one-tap confirmation. The transaction is signed client-side with the user's private key and submitted to Ethereum mainnet. No charts. No order books. No new interface to learn. Two billion people already know how to use a chat window — Merlin takes that universal muscle memory and points it at financial markets. Privacy is a first-class transaction mode via Railgun zero-knowledge proofs and Privacy Pools compliant privacy, not an afterthought bolted on after launch.

---

## 1. The Problem

Trading user experience is fundamentally broken.

Every platform — centralized exchange, decentralized exchange, brokerage app, wallet with a swap tab — forces users through the same gauntlet: candlestick charts, order types (market, limit, stop-loss, trailing stop), slippage settings, gas estimation, approve-then-swap workflows, wallet connection popups, and confirmation dialogs spread across multiple screens. Each platform invents its own version of this complexity, and each one demands that users learn it from scratch.

Cryptocurrency compounds the problem. A user who wants to buy a tokenized stock on Ethereum must first acquire ETH for gas, connect a wallet, navigate to a DEX, find the right trading pair, set slippage tolerance, approve the token contract, submit the swap, and then wait for block confirmation — all while praying they did not paste the wrong contract address. The failure modes are catastrophic and unforgiving: funds sent to wrong addresses are gone, approvals on malicious contracts drain wallets, and front-running bots extract value from every transaction.

Meanwhile, tokenized real-world assets (RWA) represent one of the fastest-growing sectors in crypto. Stocks, bonds, ETFs, and commodities living on-chain as ERC-20 tokens offer 24/7 trading, global access without brokerage accounts, instant settlement, and genuine self-custody. The total value locked in RWA protocols has grown exponentially. But the people who would benefit most from tokenized assets — retail investors who want simple stock exposure without intermediaries — are the exact people who cannot navigate the current interfaces.

The result is a paradox: the technology exists to let anyone on Earth trade Tesla stock at 3am on a Sunday with no broker, no settlement delay, and no counterparty risk. But the interface gatekeeps that technology behind a wall of complexity that only crypto-native users can scale.

Privacy faces the same structural neglect. Most wallets treat privacy as an optional feature buried in settings. On Ethereum, every transaction is public by default — balances, trading patterns, and counterparties are visible to anyone with a block explorer. Users who want financial privacy must use entirely separate protocols with their own interfaces and learning curves. No wallet has made privacy a built-in mode that works as easily as a public transaction.

The industry does not need another trading interface. It needs to eliminate the trading interface entirely.

---

## 2. The Innovation: Chat IS the Trading Interface

There is one interface that two billion people already know how to use: a chat window.

ChatGPT, Claude, Gemini, and dozens of other large language models trained the entire world to converse with AI in 2023 and 2024. That interaction pattern — type a message, get an intelligent response — is now universal. It crosses age, language, technical literacy, and geography. A teenager in Lagos and a retiree in Tokyo both know how to talk to a chatbot.

Merlin takes that muscle memory and redirects it at financial markets.

This is not a chatbot that gives trading tips. It is not an AI assistant embedded inside a traditional trading application. It is a complete reversal of the paradigm: **the conversation is the trading interface, and there is no other screen.** Asset discovery, market analysis, trade execution, portfolio management, and risk control all happen within the same chat thread, in natural language, with an AI agent that maintains full conversational context.

A user opens Merlin and sees a chat window. They type: "Buy $100 of Apple." The AI agent parses the intent using Claude tool use — not regex, not keyword matching, but structured tool invocation that understands context, amounts, asset names, and modifiers. The agent resolves "Apple" to the xAAPL token via fuzzy matching across 80+ supported assets, fetches a real-time quote from Uniswap V3, runs the request through eight safety guardrails, and presents a confirmation card showing the exact amount of xAAPL the user will receive, the exchange rate, and estimated fees. The user taps confirm. The client-side wallet signs an EIP-1559 transaction with the user's private key, submits it to Ethereum mainnet, and monitors for on-chain confirmation. The AI reports back: "Done. Bought 0.58 xAAPL for $100.00."

The entire flow happens in one conversation turn. The user never leaves the chat. There is no chart to interpret, no order type to select, no slippage to configure, no gas token to acquire. Every intermediate step — asset resolution, quoting, safety checks, transaction building, signing, and confirmation — is handled by the system and surfaced only as conversational context.

This is what makes Merlin fundamentally different from every existing approach:

- **It is not a DEX.** Decentralized exchanges are trading interfaces for traders. Merlin is a wallet for everyone.
- **It is not a wallet with a swap tab.** Those are complex applications that happen to have a swap button buried in a menu. Merlin is a conversation that happens to have a wallet.
- **It is not a ChatGPT plugin.** Merlin owns the full stack — key generation, transaction signing, privacy protocols, on-chain execution. The AI is not calling someone else's API. It is the product.

The bet is simple: the next billion people who interact with financial markets will not learn trading interfaces. They will talk to an AI that trades for them. Merlin is that AI, with a real non-custodial wallet behind it.

---

## 3. Real-World Assets on Ethereum

Tokenized real-world assets are reshaping how the world accesses financial markets. When a stock, ETF, or commodity exists as an ERC-20 token on Ethereum, it inherits properties that traditional securities cannot offer: borderless access, 24/7 trading, instant settlement, programmable composability, and genuine self-custody with no custodian standing between the user and their asset.

Merlin integrates 80+ tokenized assets via Backed Finance and xStocks.fi. Each xStock is a tracker certificate that follows the price of its underlying asset 1:1, issued as a fully collateralized ERC-20 token on Ethereum. The lineup includes:

**Tokenized equities** — Tesla (xTSLA), Apple (xAAPL), NVIDIA (xNVDA), Google (xGOOG), Amazon (xAMZN), Microsoft (xMSFT), Coinbase (xCOIN), Palantir (xPLTR), GameStop (xGME), and 70+ additional publicly traded companies. Users can gain exposure to the world's most valuable companies without a brokerage account, without KYC friction, and without market hours.

**ETFs and commodities** — S&P 500 (xSPY), Nasdaq 100 (xQQQ), Gold (xGLD), Silver (xSLV), and other diversified instruments. Portfolio-level exposure in a single token.

**Native crypto assets** — ETH, USDC, USDT, and WETH. Standard Ethereum assets traded directly on Uniswap V3 with the deepest on-chain liquidity.

The critical advantage is unification. Traditional finance fragments across brokerages, exchanges, and wallet apps. A user who wants stocks, gold, and crypto must maintain accounts on three different platforms, each with its own interface, fee structure, and custody model. Merlin collapses this into a single conversation. The AI knows the difference between a stock token and a native crypto asset and routes accordingly. One interface, one wallet, one key pair — for all of it.

Tesla does not stop being valuable at 4pm EST. Gold does not pause on weekends. Tokenized assets on Ethereum respect this reality. Users can buy xTSLA at 3am on a Sunday, sell xGLD on Christmas Day, and rebalance their portfolio whenever they want — no market hours, no T+2 settlement, no broker in the middle.

---

## 4. System Architecture

Merlin's architecture enforces a hard separation between the backend (which builds unsigned transactions and runs AI inference) and the frontend (which holds keys and signs transactions). The backend never sees a private key. This is not a policy — it is a structural impossibility enforced by the system's design.

**Key generation and storage.** When a user creates an account, a BIP-39 mnemonic (24 words) is generated entirely client-side using audited cryptographic libraries (`@scure/bip39`). The mnemonic is immediately encrypted using Scrypt key derivation (N=131072, r=8, p=1) combined with AES-128-CTR symmetric encryption, authenticated with a keccak256 MAC. The encryption key is derived from the user's passkey credential. The encrypted blob is stored in the browser's IndexedDB. The raw mnemonic exists in memory only during account creation and transaction signing — it is never transmitted, never stored in plaintext, and never accessible to the backend.

**Key derivation.** Ethereum keys follow the BIP-44 standard path `m/44'/60'/0'/0/{index}`. Privacy keys for Railgun (spending key, viewing key) are derived from the same seed using custom derivation paths, ensuring a single mnemonic controls both public and private transaction capabilities.

**Authentication.** Merlin uses WebAuthn passkeys exclusively. No passwords, no email addresses, no social login, no third-party authentication providers. Users authenticate with their device's biometrics — Face ID, fingerprint, or Windows Hello. The passkey is bound to the device's secure enclave and cannot be phished, intercepted, or reused across origins. This is simpler and more secure than every password-based authentication system.

**Transaction flow.** The backend constructs unsigned transaction payloads — target contract, calldata, gas parameters, value — based on AI-parsed user intent. These unsigned payloads are sent to the frontend, where the client-side wallet decrypts the seed, derives the signing key, signs the EIP-1559 transaction, and broadcasts it via JSON-RPC to the Ethereum network. The backend monitors for on-chain confirmation and reports the result back through the AI conversation.

**Infrastructure.** The frontend is a Next.js 15 progressive web app deployed on Firebase Hosting, installable on mobile devices as a native-feeling application. The backend is a Python 3.12 FastAPI service running on Google Cloud Run in `europe-west1`, auto-scaling from zero to handle traffic spikes. Firestore provides real-time data synchronization for conversations, trade history, and user state. All secrets (RPC endpoints, API keys) are stored in Google Secret Manager.

---

## 5. AI Agent Design

Merlin's AI agent is built on Claude Haiku with structured tool use — a deliberate choice that optimizes for speed, cost, and reliable tool invocation over raw reasoning power. The agent does not generate trading advice from its training data. It uses tool calls to invoke deterministic backend services that fetch real prices, check real balances, and build real transactions.

**Tool use architecture.** The agent has access to three core tools: `parse_trade_intent` (extracts asset, amount, direction, and privacy mode from natural language), `get_price` (fetches real-time pricing from CoinMarketCap and Backed Finance oracles), and `get_portfolio` (reads actual on-chain ERC-20 balances for the user's address). When a user says "buy $50 of Tesla," the LLM invokes `parse_trade_intent`, which returns a structured object: `{asset: "xTSLA", amount_usd: 50, direction: "buy", mode: "public"}`. This structured output drives all downstream logic — quoting, guardrails, transaction building. There is no regex parsing, no brittle keyword matching, and no prompt engineering tricks. The LLM's native tool use capability handles ambiguity, typos, partial names, and conversational context.

**Streaming responses.** All AI responses are delivered via server-sent events (SSE), providing real-time token-by-token streaming. Users see the agent "thinking" in real time, which provides immediate feedback and reduces perceived latency. Trade confirmation cards are injected into the stream as structured events that the frontend renders as interactive UI elements.

**Eight safety guardrails.** Every trade request passes through eight checks before reaching execution: (1) amount validation — minimum and maximum trade sizes, (2) duplicate detection — prevents identical trades within a short window, (3) rate limiting — caps trade frequency per user, (4) balance verification — confirms the user has sufficient funds, (5) asset validation — ensures the target token exists and is supported, (6) compliance screening — blocks US persons from xStock purchases per regulatory requirements, (7) sanctioned country detection — blocks transactions from OFAC-sanctioned jurisdictions, and (8) slippage protection — rejects quotes where price impact exceeds safe thresholds. Any guardrail failure stops the trade and explains the reason conversationally.

**Persona system.** Merlin offers four built-in trading personas, each shaping how the AI analyzes markets and frames recommendations:

- **Elon** — momentum and social-driven. Weighs X/Twitter sentiment heavily, tracks trending tickers, favors high-volatility names.
- **Buffett** — value-oriented. Emphasizes fundamentals, warns against speculation, prefers established companies with strong track records.
- **AI Momentum** — quantitative. Relies on price patterns, volume analysis, and technical signals. Minimal narrative, maximum data.
- **Degen** — high-risk, high-conviction. Embraces volatility, meme stocks, and asymmetric bets. Explicit risk warnings on every recommendation.

Users can also create custom personas with their own risk tolerances, preferred sectors, and trading styles. Personas are modular — swapping a persona changes the AI's analytical lens without affecting the underlying execution infrastructure.

**Social intelligence.** Merlin integrates Grok (xAI) for real-time sentiment analysis from X/Twitter. When a user asks about a stock or the Elon persona is active, the agent pulls current social signals — trending mentions, sentiment polarity, notable posts — and weaves them into the conversational response. This is not simulated sentiment. It is live data from the platform where market-moving information often surfaces first.

**Conversation memory.** Every interaction is persisted in Firestore — messages, trade confirmations, rejections, portfolio queries. The agent maintains conversational context within a session and can reference prior trades and discussions. Over time, this interaction history becomes the foundation for personalized trading intelligence.

---

## 6. Privacy Architecture

Financial privacy on Ethereum is not a luxury — it is a necessity. Every transaction on a public blockchain reveals the sender's address, the recipient, the amount, and the token involved. For users trading tokenized stocks, this means their entire portfolio, trading strategy, and financial position are visible to anyone with a block explorer. Competitors, employers, and adversaries can monitor wallets in real time.

Merlin treats privacy as a first-class transaction mode, not an optional feature. The system supports three distinct privacy levels, selectable per transaction:

**Public mode.** A standard Ethereum transaction. Visible on-chain, verifiable by anyone. Appropriate when transparency is desired or required.

**Shielded mode (Railgun).** The transaction is executed through Railgun's zero-knowledge proof system. Railgun uses zkSNARKs to create a shielded pool on Ethereum mainnet where token transfers occur without revealing sender, recipient, or amount. The user's tokens are first "shielded" — deposited into the Railgun contract — and subsequent transfers within the shielded pool are fully private. When the user wants to exit, they "unshield" tokens back to a public address. The zero-knowledge proofs guarantee correctness: the Ethereum network verifies that the transaction is valid without learning anything about its contents.

**Compliant mode (Privacy Pools).** Privacy Pools extend Railgun's privacy model with a compliance layer. Users can generate zero-knowledge proofs that demonstrate their funds do not originate from sanctioned addresses — without revealing which specific addresses they do originate from. This is provable compliance without sacrificing privacy: a regulator can verify that a user is not interacting with blacklisted entities, but cannot determine the user's actual transaction history. Privacy Pools represent the most promising path toward privacy that satisfies both users and regulators.

**Key derivation for privacy.** Railgun requires separate spending and viewing keys beyond the standard Ethereum signing key. Merlin derives all three key types from the same BIP-39 seed using distinct derivation paths. A single mnemonic controls the user's public Ethereum identity and their private Railgun identity. The spending key authorizes shielded transactions. The viewing key allows the user (and only the user) to decrypt and view their shielded balance and transaction history.

**Post-quantum readiness.** The system architecture includes a forward-looking integration path for ZKNOX ERC-4337 hybrid signatures, which combine classical ECDSA with post-quantum lattice-based schemes (FALCON/ML-DSA). As quantum computing advances threaten current elliptic curve cryptography, Merlin's key derivation and signing infrastructure can adopt hybrid signatures without requiring users to create new accounts or migrate funds.

Privacy in Merlin is not a separate application or a different workflow. The user types "buy $50 of Tesla privately" and the agent routes through Railgun instead of the public mempool. Same chat, same confirmation flow, different privacy guarantees.

---

## 7. Security Model

Security in Merlin is structural, not procedural. The system is designed so that the most common attack vectors — phishing, credential theft, server compromise, man-in-the-middle attacks — cannot yield user funds even if they succeed.

**Passkey authentication.** WebAuthn passkeys are bound to a specific origin (the Merlin domain) and a specific device (the secure enclave). They cannot be phished because the browser enforces origin validation — a fake Merlin site on a different domain cannot trigger the passkey. They cannot be stolen remotely because the private key material never leaves the device's hardware security module. They cannot be reused because each authentication ceremony includes a unique challenge. This eliminates the entire class of credential-stuffing, phishing, and password-reuse attacks that plague password-based wallets.

**Seed encryption at rest.** The BIP-39 mnemonic is encrypted with Scrypt + AES-128-CTR before storage. Scrypt's memory-hard key derivation function makes brute-force attacks prohibitively expensive — with N=131072, an attacker needs approximately 128MB of RAM per guess, making GPU-accelerated attacks impractical. The encrypted seed is stored in IndexedDB, accessible only to the Merlin origin.

**Auto-lock.** After 15 minutes of inactivity, the decrypted seed is purged from memory. The user must re-authenticate with their passkey to unlock the wallet. This limits the window of exposure if a device is left unattended.

**EIP-7702 temporary delegation.** For gasless transactions (paying gas in USDC), Merlin uses EIP-7702 temporary delegation rather than deploying a permanent smart contract account. The delegation is valid only for the duration of the transaction batch — the user's EOA never permanently delegates authority to any contract. This avoids the persistent attack surface of smart contract wallets while enabling paymaster functionality.

**Non-custodial guarantee.** The backend constructs unsigned transactions. The frontend signs them. There is no API endpoint, database field, or server-side process that ever handles, transmits, or stores a private key or seed phrase. A complete compromise of the backend infrastructure — servers, database, API keys — cannot yield access to user funds because the backend architecturally cannot sign transactions.

**Trade guardrails.** The eight safety checks described in Section 5 operate as a defense-in-depth layer against user error: duplicate trades, excessive amounts, insufficient balances, and compliance violations are caught before a transaction is ever constructed.

---

## 8. The Learning Flywheel

Every interaction with Merlin generates signal. What users trade. When they hesitate. What they confirm. What they reject. Which persona they prefer. How they phrase requests. Which guardrail triggers cause them to modify their trade versus abandon it entirely.

This interaction data — anonymized and aggregated — feeds a learning flywheel. Trade patterns reveal which assets users want but cannot easily name (driving improvements to the fuzzy matching engine). Confirmation rates per persona reveal which analytical frames users trust (driving persona refinement). Rejection patterns reveal where guardrails are too aggressive or not aggressive enough (driving threshold calibration). Social signal correlation with actual trade outcomes reveals which sentiment indicators have predictive value (driving the social intelligence engine).

The vision is compound: through millions of user interactions, Merlin builds the most capable trading-specific AI agent. Not a general-purpose LLM that happens to know about finance — a specialized agent whose every capability has been shaped by real user behavior in real markets. Every conversation makes the intent parser more accurate. Every trade teaches the risk model. Every rejected recommendation teaches caution. The agent improves not through periodic retraining but through continuous feedback from production usage.

The personas accelerate this effect. Four distinct trading philosophies generating parallel interaction data across the same markets create a natural A/B testing framework. When the momentum persona recommends a trade that the value persona would reject, and the user confirms it, that is a signal about user risk appetite that no single-persona system could capture.

---

## 9. Roadmap

Merlin is a live product with real users. The following reflects the current state honestly, without aspirational timelines.

**Live today.** Passkey authentication via WebAuthn — users create accounts and log in with biometrics, no passwords. AI chat with Claude Haiku tool use — natural language trading intent is parsed into structured actions with streaming responses. Trade quoting and confirmation — real-time quotes from Uniswap V3 with interactive confirmation cards. Portfolio — real on-chain ERC-20 balances fetched live, priced against oracle feeds. Social sentiment — Grok-powered X/Twitter analysis surfaced in conversation. 80+ xStock assets with fuzzy name matching. Eight safety guardrails enforced on every trade. Firestore persistence for conversations, trades, and user state.

**In active development.** On-chain execution — completing the path from confirmed quote to signed, submitted, and confirmed Ethereum transaction. EIP-7702 bundler integration with Ambire paymaster — enabling users to pay gas fees in USDC instead of ETH, removing the requirement to hold native ETH. Persona engine — activating the four built-in trading personas with configurable risk parameters and enabling custom persona creation.

**Planned.** Railgun privacy integration — shield, unshield, and private transfer operations with zero-knowledge proofs, making "buy $50 of Tesla privately" a single conversational command. Privacy Pools — compliant privacy mode that proves non-association with sanctioned addresses without revealing transaction history. Post-quantum account security — ZKNOX ERC-4337 hybrid signatures combining ECDSA with lattice-based cryptography. Mobile-native PWA optimizations — push notifications, offline caching, and native-app installation experience. Voice trading — spoken natural language as an input modality alongside text.

---

## 10. Conclusion

Every generation of financial technology has been defined by its interface. Ticker tapes gave way to trading floors. Trading floors gave way to electronic terminals. Terminals gave way to web dashboards. Dashboards gave way to mobile apps. Each transition made markets more accessible by making the interface simpler.

The next transition is already here. Two billion people learned to talk to AI in 2023. That interaction pattern — natural language in, intelligent action out — is the most intuitive interface ever created. It requires no training, no tutorials, no onboarding flows. Everyone already knows how to use it.

Merlin applies this interface to financial markets for the first time. Not as a layer on top of an existing trading platform, but as the entire product. The chat is the wallet. The conversation is the trading floor. Natural language is the order type. An AI agent handles everything between the user's intent and the on-chain execution — asset resolution, quoting, safety checks, transaction building, signing, and confirmation.

Behind the conversation sits a real non-custodial Ethereum wallet with client-side key management, passkey authentication, privacy via zero-knowledge proofs, and access to 80+ tokenized real-world assets. The technology is production-grade. The security model is structural. The privacy architecture treats financial privacy as a right, not a feature.

The bet: the next billion people who interact with financial markets will not learn trading interfaces. They will talk to an AI that trades for them. Merlin is that AI, with a real wallet behind it.
