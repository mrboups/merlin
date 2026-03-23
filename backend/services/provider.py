"""
JSON-RPC client for Ethereum node interactions.

Reads RPC URLs from environment variables:
  ETH_RPC_URL    — Ethereum mainnet
  SEPOLIA_RPC_URL — Sepolia testnet

Network selection: Sepolia is preferred when both are set (development default).
In production, set only ETH_RPC_URL to force mainnet.
"""

import os

import httpx

ETH_RPC_URL = os.environ.get("ETH_RPC_URL", "")
SEPOLIA_RPC_URL = os.environ.get("SEPOLIA_RPC_URL", "")


def _get_rpc_url() -> str:
    """Get the active RPC URL. Prefer Sepolia for dev, mainnet for prod."""
    if SEPOLIA_RPC_URL:
        return SEPOLIA_RPC_URL
    if ETH_RPC_URL:
        return ETH_RPC_URL
    raise ValueError("No RPC URL configured. Set ETH_RPC_URL or SEPOLIA_RPC_URL.")


_request_id = 0


def _next_id() -> int:
    global _request_id
    _request_id += 1
    return _request_id


async def _rpc_call(method: str, params: list = []) -> object:
    """Make a JSON-RPC 2.0 call to the Ethereum node."""
    url = _get_rpc_url()
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": _next_id(),
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

        if "error" in data:
            raise ValueError(f"RPC error: {data['error']}")

        return data.get("result")


async def get_balance(address: str) -> float:
    """Get ETH balance for an address in ETH (not wei)."""
    result = await _rpc_call("eth_getBalance", [address, "latest"])
    wei = int(result, 16)
    return wei / 1e18


async def get_block_number() -> int:
    """Get the latest block number."""
    result = await _rpc_call("eth_blockNumber")
    return int(result, 16)
