# Merlin User Guide

Welcome to Merlin — the simplest way to trade tokenized assets and crypto.

Merlin is an AI-powered wallet where you trade by chatting. No charts, no order books, no complicated interfaces. Just tell the AI what you want, and it happens.

## What you can do
- Trade 80+ tokenized stocks (Tesla, Apple, NVIDIA, and more)
- Trade crypto (ETH, USDC, USDT)
- Check prices and portfolio value in real time
- Get social sentiment analysis from X/Twitter
- Choose AI trading personas with different strategies
- Keep your funds private with optional shielded transactions

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](getting-started.md) | Create your account and make your first trade |
| [Trading](trading.md) | How to trade with natural language examples |
| [Portfolio](portfolio.md) | Track your balances, prices, and PnL |
| [Personas](personas.md) | AI trading strategies and how to use them |
| [Privacy](privacy.md) | Public, shielded, and compliant transaction modes |
| [Settings](settings.md) | Preferences, seed backup, and security |
| [FAQ](faq.md) | Common questions and troubleshooting |


---

# Getting Started

## Create Your Account

1. Go to the Merlin app
2. Tap **Create Account**
3. Your device will prompt you to set up a passkey (Face ID, fingerprint, or Windows Hello)
4. Authenticate with your biometrics
5. You're in — your wallet is automatically created

That's it. No email, no password, no verification codes. Your passkey IS your login.

## What happens behind the scenes
When you create an account, Merlin:
- Creates a secure passkey tied to your device's biometrics
- Generates a secret recovery phrase (24 words) that controls your wallet
- Encrypts that phrase with military-grade encryption and stores it on your device
- Derives your Ethereum wallet address
- The recovery phrase never leaves your device

## Log In
1. Tap **Login**
2. Authenticate with your biometrics (same passkey)
3. Your wallet unlocks automatically

## Your First Trade
Once logged in, you're in the chat. Just type:

> "Buy $10 of Tesla"

The AI will:
1. Find the xTSLA token
2. Get a real-time price quote
3. Show you a confirmation card with all the details
4. Wait for you to confirm or cancel

Tap **Confirm** and the trade executes on-chain.

## Important Things to Know
- **xStocks are not actual shares.** They are tokenized tracker certificates that track the price of the underlying stock 1:1.
- **You own your keys.** Merlin is non-custodial — only you can access your funds.
- **No US persons.** xStocks are not available to US residents due to regulatory restrictions.
- **Back up your seed phrase.** Go to Settings to export and safely store your 24-word recovery phrase.


---

# Trading

## How It Works
Trading in Merlin is as simple as sending a message. Type what you want in natural language, and the AI handles everything.

## Examples

### Buying
- "Buy $50 of Tesla"
- "Buy $100 of Apple"
- "Buy 0.1 ETH"
- "Buy $20 of NVIDIA"
- "Buy some Google"

### Selling
- "Sell all my Tesla"
- "Sell half my NVIDIA"
- "Sell $25 of Apple"
- "Sell 0.05 ETH"

### Price Checks
- "What's the price of Tesla?"
- "How much is NVIDIA right now?"
- "Show me ETH price"
- "What are my options for tech stocks?"

### Portfolio Queries
- "What's my portfolio worth?"
- "Show me my holdings"
- "How is my portfolio doing?"

## The Confirmation Flow
Every trade goes through a confirmation step:

1. **You say what you want** — "buy $50 of Tesla"
2. **AI resolves the asset** — finds xTSLA
3. **Safety checks run** — 8 guardrail checks (amount limits, compliance, duplicates, etc.)
4. **You see a confirmation card** with:
   - Asset and direction (buy/sell)
   - Amount in USD and tokens
   - Current price
   - Estimated gas fee
5. **You confirm or cancel** — one tap
6. **Trade executes on-chain** — signed with your private key
7. **Result reported** — "Bought 0.23 xTSLA for $50"

## Available Assets

### Tokenized Stocks (80+)
Tesla (xTSLA), Apple (xAAPL), NVIDIA (xNVDA), Google (xGOOG), Amazon (xAMZN), Microsoft (xMSFT), Meta (xMETA), Netflix (xNFLX), Coinbase (xCOIN), Palantir (xPLTR), GameStop (xGME), and many more.

### ETFs
S&P 500 (xSPY), Nasdaq 100 (xQQQ), Gold (xGLD), Silver (xSLV), Russell 2000 (xIWM), and more.

### Crypto
ETH, USDC, USDT, WETH

## Trading Limits
- Minimum trade: $1
- Maximum single trade: $10,000
- Daily limit: $50,000
- Max 10 trades per minute
- No duplicate trades within 60 seconds

## Gas Fees
Trades on Ethereum require gas fees. Merlin supports two modes:
- **Standard**: pay gas in ETH
- **Gasless**: pay gas in USDC (no ETH needed) — via EIP-7702


---

# Portfolio

## Viewing Your Portfolio
Go to the **Dashboard** page or ask the AI:
- "What's my portfolio worth?"
- "Show me my holdings"

Your portfolio shows:
- **Total value** in USD (real-time)
- **Individual positions** with quantity, current price, and value
- **Profit/Loss (PnL)** — how much you've gained or lost

## How Balances Work
Merlin reads your real on-chain balances directly from Ethereum. This means:
- Balances are always accurate (they come from the blockchain, not a database)
- If you receive tokens from another wallet, they'll appear automatically
- Prices update every 60 seconds

## Price Sources
- **Crypto** (ETH, USDC, USDT): CoinMarketCap
- **xStocks** (Tesla, Apple, etc.): Backed Finance API (tracks underlying stock price 1:1)

## Trade History
Go to the **Trades** page to see all your past trades:
- Asset traded
- Buy or sell
- Amount and price
- Transaction hash (link to Etherscan)
- Status (confirmed, pending, failed)

## Assets Page
The **Assets** page shows all available tokens you can trade, with current prices and your balance for each.


---

# Personas

## What Are Personas?
Personas are AI trading strategies that change how Merlin analyzes and recommends trades. Each persona has a different approach to the market.

## Built-In Personas

### Elon Strategy
- **Style**: Momentum + social sentiment
- **Risk**: Aggressive
- **Approach**: Follows trending assets with strong social buzz. Favors quick entries on breakouts. References social signals from X/Twitter.
- **Best for**: Traders who want to ride momentum and social trends

### Buffett Strategy
- **Style**: Value investing
- **Risk**: Conservative
- **Approach**: Looks for assets trading below intrinsic value. Emphasizes margin of safety and longer holding periods. Recommends conservative position sizes. Cautions against speculation and FOMO.
- **Best for**: Patient investors who want steady, lower-risk returns

### AI Momentum Strategy
- **Style**: Quantitative signals
- **Risk**: Moderate
- **Approach**: Uses quantitative analysis and technical indicators. Data-driven decisions without emotional bias.
- **Best for**: Traders who trust systematic, data-driven approaches

### Degen Strategy
- **Style**: High-frequency meme/trend trading
- **Risk**: Aggressive
- **Approach**: Targets high-volatility meme stocks and trending assets. Quick in-and-out trades. Embraces risk for potential outsized returns.
- **Best for**: Experienced traders comfortable with high risk

## How to Use Personas
Go to the **Personas** page to:
- View all available personas
- Activate a persona (one active at a time)
- The active persona shapes how the AI in chat analyzes trades and makes recommendations


---

# Privacy

## Three Transaction Modes
Merlin supports three levels of privacy for every transaction:

### Public
Standard Ethereum transaction. Visible on-chain to anyone. This is the default mode.

### Shielded (Railgun)
Fully private transaction using zero-knowledge proofs. Hides the sender, receiver, and amount. Uses the Railgun protocol on Ethereum mainnet.

To trade privately: "Buy $50 of Tesla **privately**"

### Compliant (Privacy Pools)
Private transaction that is provably compliant. Your funds are hidden, but you can prove they don't come from sanctioned sources. Uses Privacy Pools with selective disclosure.

## How Privacy Works
Merlin uses the Railgun protocol (via the Kohaku SDK) to enable on-chain privacy:
1. **Shield**: Your tokens are deposited into a shielded pool
2. **Private operation**: Trades happen within the shielded pool using zero-knowledge proofs
3. **Unshield**: When you want funds back in your public wallet, they exit the pool

The zero-knowledge proofs ensure that no one can link your shielded transactions to your public address.

## Non-Custodial Privacy
- Your privacy keys are derived from your seed phrase
- No one (not even Merlin) can see your shielded transactions
- You always control your funds

## Current Status
Privacy features are currently in development. The public transaction mode is fully operational.


---

# Settings

## Accessing Settings
Tap **Settings** in the navigation sidebar.

## Theme
Switch between dark and light mode. Dark mode is the default.

## Wallet Address
Your Ethereum wallet address is displayed at the top. You can copy it to receive tokens from other wallets.

## Seed Phrase Backup
Your 24-word recovery phrase is the master key to your wallet.

### Export Seed Phrase
1. Go to Settings
2. Tap **Export Seed Phrase**
3. Authenticate with your passkey
4. Your 24 words are displayed
5. **Write them down on paper** — do NOT screenshot or store digitally
6. Keep your backup in a safe, private location

### Import Seed Phrase
If you have an existing wallet seed phrase:
1. Go to Settings
2. Tap **Import Seed Phrase**
3. Enter your 12 or 24 words
4. The seed is encrypted and stored securely
5. Your wallet address is re-derived from the imported seed

## Risk Level
Choose your trading risk tolerance:
- **Conservative**: smaller positions, safety-first
- **Moderate**: balanced approach (default)
- **Aggressive**: larger positions, higher risk tolerance

## AI Model
Choose which AI model powers your chat (when multiple options are available).

## Voice
Enable or disable voice input and text-to-speech in the chat.

## Security
- Your passkey is your only login — no passwords to remember
- Your seed phrase is encrypted on your device and never sent to any server
- The wallet auto-locks after 15 minutes of inactivity
- Re-authentication is required for sensitive operations

## Logging Out
Tap **Logout** to end your session. Your encrypted seed remains on the device — you can log back in with your passkey anytime.


---

# FAQ

## General

### What is Merlin?
Merlin is an AI-powered non-custodial wallet for trading tokenized stocks and crypto on Ethereum. You trade by chatting — just type what you want.

### What are xStocks?
xStocks are tokenized tracker certificates that track the price of real-world stocks 1:1. They are ERC-20 tokens on Ethereum issued by Backed Finance / xStocks.fi. They are NOT actual shares — they are on-chain tokens that mirror stock prices.

### Is Merlin custodial?
No. Merlin is fully non-custodial. Your private keys are generated and stored on your device. The backend never sees your private key. You sign all transactions yourself.

### What blockchain does Merlin use?
Ethereum only. Mainnet for production, Sepolia for testing.

## Account & Security

### How do I log in?
With your device's biometrics (Face ID, fingerprint, Windows Hello) via a passkey. No email or password needed.

### What if I lose my device?
If your passkeys sync across devices (e.g., via iCloud Keychain or Google Password Manager), you can log in on another device. If not, you'll need your 24-word seed phrase to recover your wallet.

### How do I back up my wallet?
Go to Settings and tap Export Seed Phrase. Write down the 24 words and store them safely offline. This is your master backup.

### Can I use Merlin on multiple devices?
Yes, if your passkeys sync (via iCloud, Google, etc.). Otherwise, you can import your seed phrase on a new device.

## Trading

### What can I trade?
- 80+ tokenized stocks (Tesla, Apple, NVIDIA, Google, etc.)
- ETFs (S&P 500, Nasdaq 100, Gold, Silver)
- Crypto (ETH, USDC, USDT)

### Are there trading limits?
- Minimum: $1
- Maximum per trade: $10,000
- Daily limit: $50,000
- Rate limit: 10 trades per minute

### How much are gas fees?
Gas fees vary with Ethereum network congestion. With gasless mode (EIP-7702), you can pay gas in USDC instead of ETH.

### Can US residents use Merlin?
US residents cannot trade xStocks (tokenized stocks) due to regulatory restrictions. Crypto trading (ETH, USDC) is not restricted.

### How long do trades take?
Trades are confirmed on Ethereum within 12-30 seconds (1-2 blocks).

## Troubleshooting

### My trade failed
- Check that you have enough balance (including gas fees)
- The token may have low liquidity
- Try again — Ethereum can be congested

### Prices seem wrong
Prices update every 60 seconds. If the market is moving fast, the displayed price may be slightly stale.

### I can't log in
- Make sure your device supports biometrics (Face ID, fingerprint, Windows Hello)
- Try a different browser if biometrics aren't available
- Clear browser data and re-authenticate if passkey issues persist

### The app seems slow
- Check your internet connection
- Ethereum RPC calls can be slow during congestion
- Refresh the page
