# xStock Resolver

## Status: Live

## Overview

The xStock Resolver is the canonical token identification layer for Merlin's trading pipeline. It maintains an in-memory registry of 61 xStock tracker certificate tokens — ERC-20s on Ethereum mainnet issued by Backed Finance — and resolves free-form user input (company names, tickers, partial strings, xStocks.fi ticker format) to a single, unambiguous token record. When resolution is ambiguous, the resolver returns ranked candidates and requires explicit user clarification before any trade intent is forwarded downstream.

## Architecture

```
User input (raw string)
        |
        v
  Normalize input
  (lowercase, strip whitespace + punctuation)
        |
        v
  Stage 1: Exact symbol match
  ("xTSLA" or "TSLAx" → xTSLA)
        |
        v
  Stage 2: Exact ticker match
  ("TSLA" → xTSLA, "FB" → xMETA alias)
        |
        v
  Stage 3: Exact company name match
  ("Tesla" → xTSLA, "Alphabet" → xGOOG)
        |
        v
  Stage 4: Partial / fuzzy match
  (difflib.SequenceMatcher, threshold ≥ 0.6)
        |
        v
  Ambiguity check
  (single winner → resolve, multiple ≥ threshold → return candidates)
        |
        v
  Canonical token record
  {symbol, xstocks_ticker, name, ticker, type, address, confidence}
        |
        v
  Downstream pipeline (Node 2+)
```

Crypto assets (ETH, USDC, USDT, WETH) are handled via a separate `CRYPTO_ASSETS` dict and bypass the xStock matching stages entirely. The resolver checks crypto identity before entering the xStock stages so that "ETH" or "Ethereum" never incorrectly fuzzy-matches an xStock token.

Price data is fetched independently of resolution: CoinMarketCap for crypto assets, Backed Finance REST API for xStock tokens. Both price sources share a 60-second in-memory TTL cache to avoid redundant API calls during high-frequency chat sessions.

## Implementation Details

- **Registry size**: 61 xStock tokens in `XSTOCK_REGISTRY` list at module load time (no DB read required)
- **Token record fields**: `symbol` (Merlin canonical, e.g. `xTSLA`), `xstocks_ticker` (xStocks.fi format, e.g. `TSLAx`), `name` (full company/fund name), `ticker` (underlying exchange ticker), `type` (`stock` | `etf` | `commodity`), `address` (Ethereum mainnet ERC-20 contract address)
- **Ticker conventions**: Two parallel formats are supported. xStocks.fi uses `TICKERx` (e.g. `TSLAx`, `SPYx`). Merlin uses `xTICKER` (e.g. `xTSLA`, `xSPY`). Both are accepted as input and normalized to the Merlin `xTICKER` form internally.
- **Known ticker aliases**: `GOOGL` → `xGOOG`, `FB` → `xMETA`. These are hardcoded in the alias table alongside any other legacy or dual-class tickers.
- **Fuzzy matching**: `difflib.SequenceMatcher(None, normalized_input, candidate_field)` run across symbol, ticker, and name fields. Scores below 0.6 are discarded. The highest-scoring candidate above threshold wins; if two or more candidates score within 0.05 of each other, the result is `ambiguous` and all candidates are returned.
- **Confidence scale**: `exact` (1.0, direct symbol/ticker hit), `high` (0.85–0.99, company name match), `partial` (0.6–0.84, fuzzy substring), `ambiguous` (multiple candidates, user clarification required)
- **Crypto assets**: `ETH`, `USDC`, `USDT`, `WETH` are defined in a separate `CRYPTO_ASSETS` dict with CoinMarketCap IDs and decimals. They are returned with `type: crypto` and bypass xStock resolution entirely.
- **Price oracle — crypto**: CoinMarketCap `/v1/cryptocurrency/quotes/latest` endpoint, keyed by `COINMARKETCAP_API_KEY` environment variable.
- **Price oracle — xStocks**: Backed Finance public API at `https://api.backed.fi/api/v2/public`. Endpoint returns NAV and last-trade price per token.
- **Price cache**: Shared in-memory dict, 60-second TTL. Cache is per-symbol. Stale entries are evicted on next read, not on a background timer.
- **No blockchain reads for price**: Prices are sourced entirely from Backed Finance API and CoinMarketCap. There is no on-chain price verification (Uniswap pool reads, Chainlink oracles) at this stage.

## Token Registry

### Stocks (45 tokens)

| xStock Symbol | Underlying Ticker | Company / Fund |
|---------------|-------------------|----------------|
| xTSLA | TSLA | Tesla Inc. |
| xAAPL | AAPL | Apple Inc. |
| xGOOG | GOOGL | Alphabet Inc. |
| xAMZN | AMZN | Amazon.com Inc. |
| xMSFT | MSFT | Microsoft Corp. |
| xNVDA | NVDA | NVIDIA Corp. |
| xMETA | META | Meta Platforms Inc. |
| xNFLX | NFLX | Netflix Inc. |
| xCOIN | COIN | Coinbase Global Inc. |
| xPLTR | PLTR | Palantir Technologies |
| xGME | GME | GameStop Corp. |
| xAMD | AMD | Advanced Micro Devices |
| xORCL | ORCL | Oracle Corp. |
| xCRM | CRM | Salesforce Inc. |
| xAVGO | AVGO | Broadcom Inc. |
| xINTC | INTC | Intel Corp. |
| xJPM | JPM | JPMorgan Chase & Co. |
| xV | V | Visa Inc. |
| xMA | MA | Mastercard Inc. |
| xBAC | BAC | Bank of America Corp. |
| xGS | GS | Goldman Sachs Group |
| xMSTR | MSTR | MicroStrategy Inc. |
| xHOOD | HOOD | Robinhood Markets Inc. |
| xLLY | LLY | Eli Lilly and Company |
| xADBE | ADBE | Adobe Inc. |
| xCRWD | CRWD | CrowdStrike Holdings |
| xPANW | PANW | Palo Alto Networks |
| xTSM | TSM | Taiwan Semiconductor |
| xKO | KO | The Coca-Cola Company |
| xPEP | PEP | PepsiCo Inc. |
| xWMT | WMT | Walmart Inc. |
| xHD | HD | The Home Depot Inc. |
| xMCD | MCD | McDonald's Corp. |
| xXOM | XOM | Exxon Mobil Corp. |
| xCVX | CVX | Chevron Corp. |
| xPFE | PFE | Pfizer Inc. |
| xMRK | MRK | Merck & Co. Inc. |
| xJNJ | JNJ | Johnson & Johnson |
| xUNH | UNH | UnitedHealth Group |
| xABT | ABT | Abbott Laboratories |
| xABBV | ABBV | AbbVie Inc. |
| xNVO | NVO | Novo Nordisk A/S |
| xRBLX | RBLX | Roblox Corp. |
| xAPP | APP | Applovin Corp. |
| xRIOT | RIOT | Riot Platforms Inc. |

### ETFs (12 tokens)

| xStock Symbol | Underlying Ticker | Fund Name |
|---------------|-------------------|-----------|
| xSPY | SPY | SPDR S&P 500 ETF Trust |
| xQQQ | QQQ | Invesco QQQ Trust |
| xGLD | GLD | SPDR Gold Trust |
| xSLV | SLV | iShares Silver Trust |
| xIWM | IWM | iShares Russell 2000 ETF |
| xIEMG | IEMG | iShares Core MSCI Emerging Markets ETF |
| xIJR | IJR | iShares Core S&P Small-Cap ETF |
| xSCHF | SCHF | Schwab International Equity ETF |
| xTBLL | TBLL | SPDR Bloomberg 3-12 Month T-Bill ETF |
| xTQQQ | TQQQ | ProShares UltraPro QQQ (3x leveraged) |
| xVTI | VTI | Vanguard Total Stock Market ETF |
| xVT | VT | Vanguard Total World Stock ETF |

### Commodities (3 tokens)

| xStock Symbol | Underlying Ticker | Description |
|---------------|-------------------|-------------|
| xPALL | PALL | Aberdeen Standard Physical Palladium ETF |
| xPPLT | PPLT | Aberdeen Standard Physical Platinum ETF |
| xCOPX | COPX | Global X Copper Miners ETF |

### Crypto Assets (separate registry, 4 assets)

| Symbol | Name | Price Source |
|--------|------|--------------|
| ETH | Ethereum | CoinMarketCap |
| USDC | USD Coin | CoinMarketCap |
| USDT | Tether | CoinMarketCap |
| WETH | Wrapped Ether | CoinMarketCap |

## Code Map

| File | Purpose |
|------|---------|
| `backend/services/xstock.py` | `XSTOCK_REGISTRY` list, `CRYPTO_ASSETS` dict, `resolve_token(input_str)` function, fuzzy matching logic, alias table, confidence scoring |
| `backend/services/prices.py` | `get_price(symbol)` function, CoinMarketCap client (crypto), Backed Finance API client (xStocks), 60-second TTL cache, cache invalidation |
| `backend/routers/chat.py` | `GET /market/assets` endpoint — returns serialized registry with metadata for frontend asset picker |

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/market/assets` | Returns all xStock tokens and crypto assets with symbol, name, ticker, type, and address. Does not include live prices — prices are fetched separately per symbol. | None (public) |

Example response shape:

```json
{
  "xstocks": [
    {
      "symbol": "xTSLA",
      "xstocks_ticker": "TSLAx",
      "name": "Tesla Inc.",
      "ticker": "TSLA",
      "type": "stock",
      "address": "0x..."
    }
  ],
  "crypto": [
    {
      "symbol": "ETH",
      "name": "Ethereum",
      "type": "crypto"
    }
  ]
}
```

## Firestore Schema

None. The token registry is loaded entirely in-memory from `XSTOCK_REGISTRY` at service startup. There is no Firestore collection for token metadata. This eliminates read latency and Firestore costs for a dataset that changes infrequently (new tokens are added via code deploy, not database writes).

## Configuration

| Environment Variable | Description | Required |
|---------------------|-------------|----------|
| `COINMARKETCAP_API_KEY` | CoinMarketCap Pro API key for crypto price quotes | Yes (crypto prices) |
| Backed Finance API URL | Hardcoded to `https://api.backed.fi/api/v2/public` — no env override needed | N/A |
| Price cache TTL | Hardcoded to 60 seconds in `prices.py` — not configurable at runtime | N/A |

## Current Limitations

- **Placeholder contract addresses**: Several of the 61 tokens in `XSTOCK_REGISTRY` have placeholder or unverified Ethereum mainnet contract addresses. Before executing any trade, the Trade Execution agent (Node 6) must validate the address against the Backed Finance API or Etherscan. Never use an address from this registry as a final settlement address without verification.
- **No on-chain price verification**: Prices are sourced from Backed Finance API and CoinMarketCap only. There is no cross-check against Uniswap V3 pool prices or Chainlink oracle feeds. Stale or incorrect API prices would not be caught at this layer.
- **No real-time streaming**: Price data is polled on-demand with a 60-second TTL cache. There is no WebSocket or SSE stream for live price ticks. Price displayed to the user may be up to 60 seconds old.
- **No on-chain liquidity check**: The resolver does not verify that a Uniswap V3 pool exists with sufficient liquidity for the resolved token before forwarding to the trade pipeline. Low-liquidity tokens will fail at the quote stage, not the resolution stage.
- **Extended registry not fully covered**: Backed Finance publishes 80+ tokens. The current registry contains 61. Tokens not in the list are not resolvable and the user is directed to xstocks.fi/products to check availability.
- **Alias table is hardcoded**: Ticker aliases (FB → META, GOOGL → GOOG) are maintained as a static dict. Any new dual-class or legacy ticker aliases must be added manually in code.

## Related

- `agents/xstock-resolver.md` — Agent definition for Node 1 of the trade pipeline
- `agents/trade-execution.md` — Trade Execution agent (Node 6) that consumes resolver output
- `agents/guardrails.md` — Guardrails agent that enforces US person / sanctioned country blocks after resolution
- `specs/project-spec.md` — Full Merlin platform specification
- `sources/futurewallet-docs.md` — FutureWallet xStocks section (upstream reference)
- https://xstocks.fi/products — Live xStocks token registry with current contract addresses
- https://api.backed.fi/api/v2/public — Backed Finance public API (price + NAV data)
