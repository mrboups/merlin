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
