"""
xStock Token Registry and Fuzzy Matching Service.

Maintains a canonical registry of all xStock tokens (tokenized tracker
certificates on Ethereum via Backed Finance / xStocks.fi) and provides
fuzzy resolution from user input (company names, ticker symbols, partial
matches) to the exact xStock token.

Ticker conventions:
  - xStocks.fi uses "TICKERx" format (e.g. TSLAx, AAPLx)
  - Merlin internally uses "xTICKER" format (e.g. xTSLA, xAAPL)
  Both are stored so the system can interact with either convention.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Optional

# ---------------------------------------------------------------------------
# Token Registry
# ---------------------------------------------------------------------------
# Contract addresses are placeholders — replace with verified addresses from
# xstocks.fi or Etherscan before production launch.
# The "xstocks_ticker" field is the on-chain ticker (e.g. TSLAx).
# The "symbol" field is Merlin's internal format (e.g. xTSLA).
# ---------------------------------------------------------------------------

_PLACEHOLDER = "0x" + "0" * 40  # 0x0000000000000000000000000000000000000000

XSTOCK_REGISTRY: list[dict] = [
    # ── V1 Priority Stocks ────────────────────────────────────────────────
    {"symbol": "xTSLA", "xstocks_ticker": "TSLAx", "name": "Tesla", "ticker": "TSLA", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xAAPL", "xstocks_ticker": "AAPLx", "name": "Apple", "ticker": "AAPL", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xGOOG", "xstocks_ticker": "GOOGLx", "name": "Alphabet", "ticker": "GOOGL", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xAMZN", "xstocks_ticker": "AMZNx", "name": "Amazon", "ticker": "AMZN", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xMSFT", "xstocks_ticker": "MSFTx", "name": "Microsoft", "ticker": "MSFT", "type": "stock", "address": _PLACEHOLDER},

    # ── Extended Stocks ───────────────────────────────────────────────────
    {"symbol": "xNVDA", "xstocks_ticker": "NVDAx", "name": "NVIDIA", "ticker": "NVDA", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xMETA", "xstocks_ticker": "METAx", "name": "Meta Platforms", "ticker": "META", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xNFLX", "xstocks_ticker": "NFLXx", "name": "Netflix", "ticker": "NFLX", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xCOIN", "xstocks_ticker": "COINx", "name": "Coinbase", "ticker": "COIN", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xPLTR", "xstocks_ticker": "PLTRx", "name": "Palantir", "ticker": "PLTR", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xGME", "xstocks_ticker": "GMEx", "name": "GameStop", "ticker": "GME", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xAMD", "xstocks_ticker": "AMDx", "name": "AMD", "ticker": "AMD", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xORCL", "xstocks_ticker": "ORCLx", "name": "Oracle", "ticker": "ORCL", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xCRM", "xstocks_ticker": "CRMx", "name": "Salesforce", "ticker": "CRM", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xAVGO", "xstocks_ticker": "AVGOx", "name": "Broadcom", "ticker": "AVGO", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xINTC", "xstocks_ticker": "INTCx", "name": "Intel", "ticker": "INTC", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xJPM", "xstocks_ticker": "JPMx", "name": "JPMorgan Chase", "ticker": "JPM", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xV", "xstocks_ticker": "Vx", "name": "Visa", "ticker": "V", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xMA", "xstocks_ticker": "MAx", "name": "Mastercard", "ticker": "MA", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xBAC", "xstocks_ticker": "BACx", "name": "Bank of America", "ticker": "BAC", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xGS", "xstocks_ticker": "GSx", "name": "Goldman Sachs", "ticker": "GS", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xMSTR", "xstocks_ticker": "MSTRx", "name": "MicroStrategy", "ticker": "MSTR", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xHOOD", "xstocks_ticker": "HOODx", "name": "Robinhood", "ticker": "HOOD", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xLLY", "xstocks_ticker": "LLYx", "name": "Eli Lilly", "ticker": "LLY", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xADBE", "xstocks_ticker": "ADBEx", "name": "Adobe", "ticker": "ADBE", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xCRWD", "xstocks_ticker": "CRWDx", "name": "CrowdStrike", "ticker": "CRWD", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xPANW", "xstocks_ticker": "PANWx", "name": "Palo Alto Networks", "ticker": "PANW", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xTSM", "xstocks_ticker": "TSMx", "name": "TSMC", "ticker": "TSM", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xKO", "xstocks_ticker": "KOx", "name": "Coca-Cola", "ticker": "KO", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xPEP", "xstocks_ticker": "PEPx", "name": "PepsiCo", "ticker": "PEP", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xWMT", "xstocks_ticker": "WMTx", "name": "Walmart", "ticker": "WMT", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xHD", "xstocks_ticker": "HDx", "name": "Home Depot", "ticker": "HD", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xMCD", "xstocks_ticker": "MCDx", "name": "McDonald's", "ticker": "MCD", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xXOM", "xstocks_ticker": "XOMx", "name": "Exxon Mobil", "ticker": "XOM", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xCVX", "xstocks_ticker": "CVXx", "name": "Chevron", "ticker": "CVX", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xPFE", "xstocks_ticker": "PFEx", "name": "Pfizer", "ticker": "PFE", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xMRK", "xstocks_ticker": "MRKx", "name": "Merck", "ticker": "MRK", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xJNJ", "xstocks_ticker": "JNJx", "name": "Johnson & Johnson", "ticker": "JNJ", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xUNH", "xstocks_ticker": "UNHx", "name": "UnitedHealth", "ticker": "UNH", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xABT", "xstocks_ticker": "ABTx", "name": "Abbott", "ticker": "ABT", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xABBV", "xstocks_ticker": "ABBVx", "name": "AbbVie", "ticker": "ABBV", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xNVO", "xstocks_ticker": "NVOx", "name": "Novo Nordisk", "ticker": "NVO", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xRBLX", "xstocks_ticker": "RBLXx", "name": "Roblox", "ticker": "RBLX", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xAPP", "xstocks_ticker": "APPx", "name": "AppLovin", "ticker": "APP", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xRIOT", "xstocks_ticker": "RIOTx", "name": "Riot Platforms", "ticker": "RIOT", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xOKLO", "xstocks_ticker": "OKLOx", "name": "Oklo", "ticker": "OKLO", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xIBM", "xstocks_ticker": "IBMx", "name": "IBM", "ticker": "IBM", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xCSCO", "xstocks_ticker": "CSCOx", "name": "Cisco", "ticker": "CSCO", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xBRKB", "xstocks_ticker": "BRKBx", "name": "Berkshire Hathaway", "ticker": "BRKB", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xPG", "xstocks_ticker": "PGx", "name": "Procter & Gamble", "ticker": "PG", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xPM", "xstocks_ticker": "PMx", "name": "Philip Morris", "ticker": "PM", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xTMUS", "xstocks_ticker": "TMUSx", "name": "T-Mobile", "ticker": "TMUS", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xAZN", "xstocks_ticker": "AZNx", "name": "AstraZeneca", "ticker": "AZN", "type": "stock", "address": _PLACEHOLDER},
    {"symbol": "xACN", "xstocks_ticker": "ACNx", "name": "Accenture", "ticker": "ACN", "type": "stock", "address": _PLACEHOLDER},

    # ── ETFs & Index Funds ────────────────────────────────────────────────
    {"symbol": "xSPY", "xstocks_ticker": "SPYx", "name": "S&P 500 ETF", "ticker": "SPY", "type": "etf", "address": _PLACEHOLDER},
    {"symbol": "xQQQ", "xstocks_ticker": "QQQx", "name": "Nasdaq 100 ETF", "ticker": "QQQ", "type": "etf", "address": _PLACEHOLDER},
    {"symbol": "xGLD", "xstocks_ticker": "GLDx", "name": "Gold ETF", "ticker": "GLD", "type": "commodity_etf", "address": _PLACEHOLDER},
    {"symbol": "xSLV", "xstocks_ticker": "SLVx", "name": "Silver ETF", "ticker": "SLV", "type": "commodity_etf", "address": _PLACEHOLDER},
    {"symbol": "xIWM", "xstocks_ticker": "IWMx", "name": "Russell 2000 ETF", "ticker": "IWM", "type": "etf", "address": _PLACEHOLDER},
    {"symbol": "xVTI", "xstocks_ticker": "VTIx", "name": "Vanguard Total Stock Market", "ticker": "VTI", "type": "etf", "address": _PLACEHOLDER},
    {"symbol": "xTQQQ", "xstocks_ticker": "TQQQx", "name": "ProShares UltraPro QQQ", "ticker": "TQQQ", "type": "etf", "address": _PLACEHOLDER},
]

# Legacy ticker aliases (e.g. "FB" -> "META", "GOOG" -> "GOOGL")
_TICKER_ALIASES: dict[str, str] = {
    "FB": "META",
    "GOOG": "GOOGL",
    "GOOGLE": "GOOGL",
    "BRK.B": "BRKB",
    "BRK-B": "BRKB",
}

# Common name aliases for fuzzy matching
_NAME_ALIASES: dict[str, str] = {
    "google": "Alphabet",
    "facebook": "Meta Platforms",
    "fb": "Meta Platforms",
    "jnj": "Johnson & Johnson",
    "j&j": "Johnson & Johnson",
    "microstrategy": "MicroStrategy",
    "strategy": "MicroStrategy",
    "novo": "Novo Nordisk",
    "coca cola": "Coca-Cola",
    "coke": "Coca-Cola",
    "pepsi": "PepsiCo",
    "mc donalds": "McDonald's",
    "mcdonalds": "McDonald's",
    "exxon": "Exxon Mobil",
    "jp morgan": "JPMorgan Chase",
    "jpmorgan": "JPMorgan Chase",
    "p&g": "Procter & Gamble",
    "procter": "Procter & Gamble",
    "gamble": "Procter & Gamble",
    "berkshire": "Berkshire Hathaway",
    "philip morris": "Philip Morris",
    "palo alto": "Palo Alto Networks",
    "crowdstrike": "CrowdStrike",
    "united health": "UnitedHealth",
    "unitedhealth": "UnitedHealth",
    "s&p": "S&P 500 ETF",
    "s&p 500": "S&P 500 ETF",
    "sp500": "S&P 500 ETF",
    "nasdaq": "Nasdaq 100 ETF",
    "nasdaq 100": "Nasdaq 100 ETF",
    "gold": "Gold ETF",
    "silver": "Silver ETF",
    "russell": "Russell 2000 ETF",
    "russell 2000": "Russell 2000 ETF",
    "tmobile": "T-Mobile",
    "t mobile": "T-Mobile",
    "home depot": "Home Depot",
    "homedepot": "Home Depot",
    "bank of america": "Bank of America",
    "bofa": "Bank of America",
    "goldman": "Goldman Sachs",
}

# Build lookup indices at module load time
_by_symbol: dict[str, dict] = {}       # "xTSLA" -> token
_by_ticker: dict[str, dict] = {}       # "TSLA" -> token
_by_name_lower: dict[str, dict] = {}   # "tesla" -> token

for _token in XSTOCK_REGISTRY:
    _by_symbol[_token["symbol"].upper()] = _token
    _by_ticker[_token["ticker"].upper()] = _token
    _by_name_lower[_token["name"].lower()] = _token


# ---------------------------------------------------------------------------
# Supported crypto (non-xStock) assets
# ---------------------------------------------------------------------------

CRYPTO_ASSETS: list[dict] = [
    {"symbol": "ETH", "name": "Ethereum", "ticker": "ETH", "type": "crypto", "address": "native"},
    {"symbol": "USDC", "name": "USD Coin", "ticker": "USDC", "type": "crypto", "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"},
    {"symbol": "USDT", "name": "Tether", "ticker": "USDT", "type": "crypto", "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7"},
    {"symbol": "WETH", "name": "Wrapped Ether", "ticker": "WETH", "type": "crypto", "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"},
]

_crypto_by_symbol: dict[str, dict] = {a["symbol"].upper(): a for a in CRYPTO_ASSETS}
_crypto_by_name: dict[str, dict] = {a["name"].lower(): a for a in CRYPTO_ASSETS}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def list_tokens() -> list[dict]:
    """Return the full xStock registry."""
    return list(XSTOCK_REGISTRY)


def list_all_assets() -> list[dict]:
    """Return all tradable assets (xStocks + crypto)."""
    return list(XSTOCK_REGISTRY) + list(CRYPTO_ASSETS)


def get_token_by_symbol(symbol: str) -> Optional[dict]:
    """Exact lookup by Merlin symbol (e.g. 'xTSLA')."""
    return _by_symbol.get(symbol.upper())


def resolve_token(query: str) -> dict:
    """
    Fuzzy-match a user query to an xStock or crypto token.

    Returns a dict with:
      - "match": the token dict, or None
      - "confidence": float 0-1
      - "alternatives": list of other possible matches (if ambiguous)

    Resolution order:
      1. Exact xStock symbol match (xTSLA)
      2. Exact ticker match (TSLA)
      3. Exact crypto match (ETH, USDC)
      4. Name alias match (Google -> Alphabet)
      5. Exact company name match (Tesla)
      6. Prefix match on name/ticker
      7. Fuzzy substring / similarity match
    """
    raw = query.strip()
    if not raw:
        return {"match": None, "confidence": 0.0, "alternatives": [], "raw": query}

    normalized = raw.lower()

    # Strip leading "x" for symbol check, and also try with "x" prefix
    upper = raw.upper()

    # 1. Exact xStock symbol match
    if upper in _by_symbol:
        return _hit(_by_symbol[upper], 1.0, query)

    # Also try adding "x" prefix
    if f"X{upper}" in _by_symbol:
        return _hit(_by_symbol[f"X{upper}"], 1.0, query)

    # 2. Exact ticker match (resolve aliases first)
    resolved_ticker = _TICKER_ALIASES.get(upper, upper)
    if resolved_ticker in _by_ticker:
        return _hit(_by_ticker[resolved_ticker], 1.0, query)

    # 3. Exact crypto match
    if upper in _crypto_by_symbol:
        return _hit(_crypto_by_symbol[upper], 1.0, query)
    if normalized in _crypto_by_name:
        return _hit(_crypto_by_name[normalized], 1.0, query)

    # 4. Name alias match
    if normalized in _NAME_ALIASES:
        alias_name = _NAME_ALIASES[normalized].lower()
        if alias_name in _by_name_lower:
            return _hit(_by_name_lower[alias_name], 0.95, query)

    # 5. Exact company name match (case-insensitive)
    if normalized in _by_name_lower:
        return _hit(_by_name_lower[normalized], 1.0, query)

    # 6. Prefix match on name
    prefix_matches = []
    for name_lower, token in _by_name_lower.items():
        if name_lower.startswith(normalized) and len(normalized) >= 2:
            prefix_matches.append(token)

    # Prefix match on ticker
    for ticker_upper, token in _by_ticker.items():
        if ticker_upper.startswith(upper) and len(upper) >= 2:
            if token not in prefix_matches:
                prefix_matches.append(token)

    if len(prefix_matches) == 1:
        return _hit(prefix_matches[0], 0.9, query)
    if len(prefix_matches) > 1:
        return _ambiguous(prefix_matches, query)

    # 7. Fuzzy similarity match
    candidates: list[tuple[float, dict]] = []

    for token in XSTOCK_REGISTRY:
        best_score = 0.0
        # Match against name
        name_score = SequenceMatcher(None, normalized, token["name"].lower()).ratio()
        best_score = max(best_score, name_score)
        # Match against ticker
        ticker_score = SequenceMatcher(None, upper, token["ticker"]).ratio()
        best_score = max(best_score, ticker_score)
        # Substring containment bonus
        if normalized in token["name"].lower() or token["name"].lower() in normalized:
            best_score = max(best_score, 0.85)
        if best_score >= 0.6:
            candidates.append((best_score, token))

    # Also check crypto
    for token in CRYPTO_ASSETS:
        name_score = SequenceMatcher(None, normalized, token["name"].lower()).ratio()
        ticker_score = SequenceMatcher(None, upper, token["ticker"]).ratio()
        best_score = max(name_score, ticker_score)
        if best_score >= 0.6:
            candidates.append((best_score, token))

    if not candidates:
        return {"match": None, "confidence": 0.0, "alternatives": [], "raw": query}

    candidates.sort(key=lambda x: x[0], reverse=True)

    top_score, top_token = candidates[0]

    # If the top match is clearly ahead, return it
    if len(candidates) == 1 or (len(candidates) > 1 and top_score - candidates[1][0] > 0.15):
        confidence = min(top_score, 0.85)  # Cap fuzzy matches at 0.85
        return _hit(top_token, confidence, query)

    # Multiple close matches — ambiguous
    return _ambiguous([c[1] for c in candidates[:3]], query)


def is_supported_asset(symbol: str) -> bool:
    """Check if a symbol is a known xStock or crypto asset."""
    upper = symbol.upper()
    return (
        upper in _by_symbol
        or upper in _by_ticker
        or upper in _crypto_by_symbol
        or f"X{upper}" in _by_symbol
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hit(token: dict, confidence: float, raw: str) -> dict:
    return {
        "match": token,
        "confidence": confidence,
        "alternatives": [],
        "raw": raw,
    }


def _ambiguous(tokens: list[dict], raw: str) -> dict:
    return {
        "match": tokens[0] if tokens else None,
        "confidence": 0.5,
        "alternatives": [t["symbol"] for t in tokens[:5]],
        "raw": raw,
    }
