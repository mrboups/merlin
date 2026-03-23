"""
Price oracle for ETH, ERC-20 tokens, and xStocks.

Uses CoinMarketCap for crypto prices and the Backed Finance public API
for xStock prices (which track the underlying stock/ETF 1:1).

All prices are in USD. Results are cached in-memory with a 60-second TTL
to avoid rate limits.

Required env vars:
  COINMARKETCAP_API_KEY — for crypto prices (ETH, USDC, etc.)
"""

import os
import time
from typing import Optional

import httpx

COINMARKETCAP_API_KEY = os.environ.get("COINMARKETCAP_API_KEY", "")

CMC_BASE_URL = "https://pro-api.coinmarketcap.com"
BACKED_BASE_URL = "https://api.backed.fi/api/v2/public"

# Simple in-memory cache: symbol -> (price_usd, timestamp)
_price_cache: dict[str, tuple[float, float]] = {}
CACHE_TTL = 60  # seconds


def _get_cached(symbol: str) -> Optional[float]:
    """Return cached price if still valid, else None."""
    entry = _price_cache.get(symbol)
    if entry is None:
        return None
    price, ts = entry
    if time.time() - ts > CACHE_TTL:
        del _price_cache[symbol]
        return None
    return price


def _set_cached(symbol: str, price: float) -> None:
    _price_cache[symbol] = (price, time.time())


# ── xStock symbol helpers ────────────────────────────────────────────

# xStock tickers end with "x" and map to an underlying stock/ETF symbol.
# We use the Backed Finance public API which provides prices without auth.

XSTOCK_TICKERS: set[str] = {
    "ABTx", "ABBVx", "ACNx", "ADBEx", "GOOGLx", "AMZNx", "AMBRx", "AMDx",
    "AAPLx", "APPx", "ASTSx", "AZNx", "BACx", "BRKBx", "BTBTx", "BTGOx",
    "BMNRx", "SLMTx", "AVGOx", "CVXx", "CRCLx", "CSCOx", "KOx", "COINx",
    "CMCSAx", "CORZx", "CRWDx", "DHRx", "DFDVx", "LLYx", "XOMx", "GMEx",
    "GSx", "HDx", "HONx", "HUTx", "INTCx", "IBMx", "JNJx", "JPMx",
    "KRAQx", "LINx", "MRVLx", "MAx", "MCDx", "MDTx", "MRKx", "METAx",
    "MUx", "MSFTx", "MSTRx", "NFLXx", "NVOx", "NVDAx", "OKLOx", "OPENx",
    "ORCLx", "PLTRx", "PANWx", "PEPx", "PFEx", "PMx", "PLx", "PGx",
    "RIOTx", "HOODx", "RBLXx", "CRMx", "TMUSx", "TSLAx", "TMOx", "TONXx",
    "TSMx", "UNHx", "SPCEx", "Vx", "WMTx", "WBDx",
    # ETFs
    "IEMGx", "GLDx", "SLVx", "QQQx", "IWMx", "SPYx", "IJRx", "SCHFx",
    "TBLLx", "TQQQx", "VTIx", "VTx",
    # Commodities
    "PALLx", "PPLTx", "COPXx",
    # Strategy
    "STRKx", "STRCx",
}


def is_xstock(symbol: str) -> bool:
    return symbol in XSTOCK_TICKERS


# ── CoinMarketCap ────────────────────────────────────────────────────

async def _fetch_cmc_prices(symbols: list[str]) -> dict[str, float]:
    """
    Fetch prices for crypto symbols from CoinMarketCap.
    Returns a dict of symbol -> price_usd for successfully resolved symbols.
    """
    if not COINMARKETCAP_API_KEY:
        raise ValueError(
            "COINMARKETCAP_API_KEY not configured. Cannot fetch crypto prices."
        )

    symbol_str = ",".join(symbols)
    url = f"{CMC_BASE_URL}/v2/cryptocurrency/quotes/latest"
    headers = {
        "X-CMC_PRO_API_KEY": COINMARKETCAP_API_KEY,
        "Accept": "application/json",
    }
    params = {"symbol": symbol_str, "convert": "USD"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()

    results: dict[str, float] = {}
    cmc_data = data.get("data", {})

    for sym in symbols:
        entries = cmc_data.get(sym)
        if not entries:
            continue
        # v2 returns a list per symbol; take the first entry
        entry = entries[0] if isinstance(entries, list) else entries
        quote = entry.get("quote", {}).get("USD", {})
        price = quote.get("price")
        if price is not None:
            results[sym] = float(price)

    return results


# ── Backed Finance (xStock prices) ──────────────────────────────────

async def _fetch_xstock_price(symbol: str) -> Optional[float]:
    """
    Fetch xStock price from the Backed Finance public API.
    Endpoint: GET /api/v2/public/assets/{symbol}/price-data
    Returns the quote price in USD or None if unavailable.
    """
    url = f"{BACKED_BASE_URL}/assets/{symbol}/price-data"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                url, headers={"Content-Type": "application/json"}
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            quote = data.get("quote")
            if quote is not None:
                return float(quote)
            return None
    except (httpx.HTTPError, ValueError, KeyError):
        return None


# ── Public API ───────────────────────────────────────────────────────

async def get_eth_price() -> float:
    """Get current ETH price in USD."""
    cached = _get_cached("ETH")
    if cached is not None:
        return cached

    prices = await _fetch_cmc_prices(["ETH"])
    price = prices.get("ETH")
    if price is None:
        raise ValueError("Failed to fetch ETH price from CoinMarketCap.")
    _set_cached("ETH", price)
    return price


async def get_token_price(symbol: str) -> Optional[float]:
    """
    Get price for a token symbol in USD.

    For xStocks, fetches from Backed Finance API.
    For crypto tokens (ETH, USDC, etc.), fetches from CoinMarketCap.
    Returns None if the price is unavailable — never fakes a price.
    """
    cached = _get_cached(symbol)
    if cached is not None:
        return cached

    if is_xstock(symbol):
        price = await _fetch_xstock_price(symbol)
    else:
        try:
            prices = await _fetch_cmc_prices([symbol])
            price = prices.get(symbol)
        except (httpx.HTTPError, ValueError):
            price = None

    if price is not None:
        _set_cached(symbol, price)

    return price


async def get_prices_batch(symbols: list[str]) -> dict[str, Optional[float]]:
    """
    Get prices for multiple symbols at once.

    Batches crypto symbols into a single CoinMarketCap call.
    xStock symbols are fetched individually from Backed Finance.
    Returns a dict of symbol -> price (None if unavailable).
    """
    results: dict[str, Optional[float]] = {}

    # Separate xStock vs crypto symbols
    xstock_syms: list[str] = []
    crypto_syms: list[str] = []

    for sym in symbols:
        cached = _get_cached(sym)
        if cached is not None:
            results[sym] = cached
        elif is_xstock(sym):
            xstock_syms.append(sym)
        else:
            crypto_syms.append(sym)

    # Fetch crypto prices in one batch
    if crypto_syms:
        try:
            cmc_prices = await _fetch_cmc_prices(crypto_syms)
            for sym in crypto_syms:
                price = cmc_prices.get(sym)
                results[sym] = price
                if price is not None:
                    _set_cached(sym, price)
        except (httpx.HTTPError, ValueError):
            for sym in crypto_syms:
                results[sym] = None

    # Fetch xStock prices individually (Backed API has no batch endpoint)
    for sym in xstock_syms:
        price = await _fetch_xstock_price(sym)
        results[sym] = price
        if price is not None:
            _set_cached(sym, price)

    return results
