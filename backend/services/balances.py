"""
On-chain token balance fetcher.

Reads ETH balance and ERC-20 token balances via JSON-RPC eth_call.
Reuses the RPC provider from services.provider.
"""

from services.provider import get_balance, eth_call


# ERC-20 balanceOf(address) function selector
_BALANCE_OF_SELECTOR = "0x70a08231"


def _encode_address(address: str) -> str:
    """Encode an address as a 32-byte hex param (left-padded with zeros)."""
    # Strip 0x prefix, lowercase, pad to 64 hex chars
    addr = address.lower().removeprefix("0x")
    return addr.zfill(64)


async def get_eth_balance(address: str) -> float:
    """Get ETH balance in ETH (not wei). Delegates to provider.get_balance."""
    return await get_balance(address)


async def get_token_balance(
    address: str, token_address: str, decimals: int = 18
) -> float:
    """
    Get ERC-20 token balance via eth_call to balanceOf(address).

    Args:
        address: The holder's address.
        token_address: The ERC-20 contract address.
        decimals: Token decimals (default 18).

    Returns:
        Token balance as a float (human-readable units).
    """
    data = _BALANCE_OF_SELECTOR + _encode_address(address)
    result = await eth_call(token_address, data)

    if result is None or result == "0x" or result == "0x0":
        return 0.0

    raw = int(result, 16)
    return raw / (10**decimals)


async def get_all_balances(
    address: str, tokens: list[dict]
) -> list[dict]:
    """
    Get ETH balance plus all specified ERC-20 token balances.

    Args:
        address: The wallet address.
        tokens: List of dicts, each with keys:
            - symbol: str (e.g. "USDC")
            - name: str (e.g. "USD Coin")
            - address: str (contract address)
            - decimals: int

    Returns:
        List of balance dicts:
            [
                {"symbol": "ETH", "name": "Ethereum", "balance": 1.5,
                 "token_address": None, "decimals": 18},
                {"symbol": "USDC", "name": "USD Coin", "balance": 100.0,
                 "token_address": "0x...", "decimals": 6},
                ...
            ]
        Only includes tokens with balance > 0.
    """
    results: list[dict] = []

    # ETH balance
    eth_bal = await get_eth_balance(address)
    if eth_bal > 0:
        results.append({
            "symbol": "ETH",
            "name": "Ethereum",
            "balance": eth_bal,
            "token_address": None,
            "decimals": 18,
        })

    # ERC-20 balances
    for token in tokens:
        try:
            bal = await get_token_balance(
                address,
                token["address"],
                token.get("decimals", 18),
            )
            if bal > 0:
                results.append({
                    "symbol": token["symbol"],
                    "name": token.get("name", token["symbol"]),
                    "balance": bal,
                    "token_address": token["address"],
                    "decimals": token.get("decimals", 18),
                })
        except Exception:
            # Skip tokens that fail (contract may not exist on current network)
            continue

    return results
