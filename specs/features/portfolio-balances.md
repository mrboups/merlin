# Portfolio & Balances
## Status: Live
## Overview
Real-time on-chain portfolio tracking with ETH and ERC-20 token balances fetched via JSON-RPC, combined with USD price data from CoinMarketCap (crypto) and Backed Finance (xStocks). Includes PnL calculation from trade history and historical portfolio snapshots.
## Architecture
Frontend requests portfolio → Backend fetches on-chain balances (eth_call for each token) → Fetches USD prices → Combines into portfolio view → Returns with total value and per-asset breakdown.
## Implementation Details
- ETH balance: eth_getBalance RPC call
- ERC-20 balances: balanceOf(address) via eth_call for each token
- Only returns tokens with balance > 0
- Price sources:
  - Crypto (ETH, USDC, USDT): CoinMarketCap API (CMC_BASE_URL: https://pro-api.coinmarketcap.com)
  - xStocks: Backed Finance public API (https://api.backed.fi/api/v2/public) — no auth required
- In-memory price cache with 60-second TTL
- PnL calculation from Firestore trade history
- Historical snapshots stored in Firestore
## Code Map
| File | Purpose |
|------|---------|
| backend/services/balances.py | On-chain ETH + ERC-20 balance fetching |
| backend/services/prices.py | Price oracle (CoinMarketCap + Backed Finance) |
| backend/services/provider.py | JSON-RPC client (eth_call, eth_getBalance) |
| backend/routers/portfolio.py | 4 portfolio endpoints |
| backend/db/trades.py | Trade record persistence for PnL |
| frontend/app/dashboard/page.tsx | Portfolio dashboard UI |
| frontend/app/assets/page.tsx | Asset list/detail UI |
## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/portfolio | Real on-chain balances + USD prices |
| GET | /api/v1/portfolio/pnl | Profit/loss from trade history |
| GET | /api/v1/portfolio/history | Historical portfolio snapshots |
| GET | /api/v1/trades | Paginated trade history |
## Firestore Schema
- trades/{id}: {user_id, side, asset, symbol, amount, amount_type, price_usd, total_usd, tx_hash, status, created_at}
- portfolio_snapshots/{id}: {user_id, total_usd, assets: [...], timestamp}
## Configuration
| Variable | Description |
|----------|-------------|
| ETH_RPC_URL | Ethereum mainnet RPC endpoint |
| SEPOLIA_RPC_URL | Sepolia testnet RPC endpoint |
| COINMARKETCAP_API_KEY | CoinMarketCap API key |
## Current Limitations
- Sequential balance fetching (no batching/multicall)
- 60-second price cache may show stale prices
- No WebSocket for real-time price updates
- No charting or historical price data
- PnL calculation is basic (cost basis from trade history only)
## Related
- [trading-engine.md](trading-engine.md) — trades feed into PnL
- [xstock-resolver.md](xstock-resolver.md) — token registry for balance queries
