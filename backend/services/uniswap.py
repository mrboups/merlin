"""
Uniswap V3 Swap Service.

Builds unsigned swap transactions and fetches quotes from Uniswap V3
contracts on Ethereum mainnet.  The backend never holds private keys —
it returns unsigned calldata for the frontend to sign and submit.

Contract interactions use raw ABI encoding (no web3py dependency).
All RPC calls go through services/provider.py.
"""

from __future__ import annotations

import logging
import time

from services.provider import _rpc_call, eth_call

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Contract addresses (Ethereum mainnet)
# ---------------------------------------------------------------------------

UNISWAP_SWAP_ROUTER_02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
UNISWAP_QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"

WETH = "0xC02aaA39b223FE8D0A0e5695F863489fa5693b42"
USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7"

# Max uint256 for infinite approvals
MAX_UINT256 = (1 << 256) - 1

# ---------------------------------------------------------------------------
# Pre-computed function selectors (first 4 bytes of keccak256 of signature)
# ---------------------------------------------------------------------------

# ERC-20
SELECTOR_APPROVE = "095ea7b3"      # approve(address,uint256)
SELECTOR_ALLOWANCE = "dd62ed3e"    # allowance(address,address)
SELECTOR_BALANCE_OF = "70a08231"   # balanceOf(address)
SELECTOR_DECIMALS = "313ce567"     # decimals()

# QuoterV2.quoteExactInputSingle((address,address,uint256,uint24,uint160))
SELECTOR_QUOTE_EXACT_INPUT_SINGLE = "c6a5026a"

# SwapRouter02.exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
SELECTOR_EXACT_INPUT_SINGLE = "04e45aaf"

# ---------------------------------------------------------------------------
# Default gas estimates
# ---------------------------------------------------------------------------

DEFAULT_SWAP_GAS = 200_000
DEFAULT_APPROVAL_GAS = 60_000

# ---------------------------------------------------------------------------
# Token decimals cache
# ---------------------------------------------------------------------------

_KNOWN_DECIMALS: dict[str, int] = {
    WETH.lower(): 18,
    USDC.lower(): 6,
    USDT.lower(): 6,
}


# ---------------------------------------------------------------------------
# ABI encoding helpers
# ---------------------------------------------------------------------------


def _encode_address(addr: str) -> str:
    """Pad a 20-byte address to 32 bytes (left-padded with zeros)."""
    return addr.lower().replace("0x", "").zfill(64)


def _encode_uint256(value: int) -> str:
    """Encode an unsigned 256-bit integer as 64 hex characters."""
    if value < 0:
        raise ValueError("uint256 cannot be negative")
    encoded = hex(value)[2:]
    if encoded.endswith("L"):
        encoded = encoded[:-1]
    return encoded.zfill(64)


def _encode_uint24(value: int) -> str:
    """Encode a uint24 as a 32-byte (64-char) hex word."""
    return _encode_uint256(value)


def _encode_uint160(value: int) -> str:
    """Encode a uint160 as a 32-byte (64-char) hex word."""
    return _encode_uint256(value)


def _decode_uint256(hex_str: str, offset: int = 0) -> int:
    """Decode a uint256 from a hex string at a given 32-byte word offset."""
    start = offset * 64
    word = hex_str[start:start + 64]
    if not word:
        return 0
    return int(word, 16)


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------


async def get_token_decimals(token_address: str) -> int:
    """
    Get the number of decimals for an ERC-20 token.

    Uses a local cache for well-known tokens, otherwise queries the contract.
    """
    key = token_address.lower()
    if key in _KNOWN_DECIMALS:
        return _KNOWN_DECIMALS[key]

    calldata = "0x" + SELECTOR_DECIMALS
    try:
        result = await eth_call(token_address, calldata)
        raw = result.replace("0x", "")
        decimals = _decode_uint256(raw, 0)
        _KNOWN_DECIMALS[key] = decimals
        return decimals
    except Exception:
        # Default to 18 if the call fails
        logger.warning("Failed to fetch decimals for %s, defaulting to 18", token_address)
        return 18


async def get_token_balance(token_address: str, owner: str) -> int:
    """Get ERC-20 token balance in smallest unit."""
    calldata = "0x" + SELECTOR_BALANCE_OF + _encode_address(owner)
    result = await eth_call(token_address, calldata)
    raw = result.replace("0x", "")
    return _decode_uint256(raw, 0)


# ---------------------------------------------------------------------------
# Allowance
# ---------------------------------------------------------------------------


async def check_allowance(token: str, owner: str, spender: str) -> int:
    """
    Check current ERC-20 allowance via eth_call.

    Returns the allowance amount in the token's smallest unit.
    """
    calldata = (
        "0x"
        + SELECTOR_ALLOWANCE
        + _encode_address(owner)
        + _encode_address(spender)
    )
    result = await eth_call(token, calldata)
    raw = result.replace("0x", "")
    return _decode_uint256(raw, 0)


# ---------------------------------------------------------------------------
# Approval transaction
# ---------------------------------------------------------------------------


async def build_approval_tx(
    token: str,
    spender: str,
    amount: int = MAX_UINT256,
) -> dict:
    """
    Build an unsigned ERC-20 approve transaction.

    Args:
        token:   ERC-20 contract address.
        spender: Address to approve (typically the SwapRouter).
        amount:  Amount to approve (default: max uint256 for infinite).

    Returns:
        Unsigned transaction dict with to, data, value, gas, chainId.
    """
    calldata = (
        "0x"
        + SELECTOR_APPROVE
        + _encode_address(spender)
        + _encode_uint256(amount)
    )

    gas = DEFAULT_APPROVAL_GAS
    try:
        gas_hex = await _rpc_call(
            "eth_estimateGas",
            [{"to": token, "data": calldata, "value": "0x0"}],
        )
        gas = int(gas_hex, 16)
    except Exception:
        logger.debug("Gas estimation failed for approval, using default %d", DEFAULT_APPROVAL_GAS)

    return {
        "to": token,
        "data": calldata,
        "value": "0x0",
        "gas": hex(gas),
        "chainId": 1,
    }


# ---------------------------------------------------------------------------
# Quoting
# ---------------------------------------------------------------------------


async def get_quote(
    token_in: str,
    token_out: str,
    amount_in: int,
    fee: int = 3000,
) -> dict:
    """
    Get a swap quote from Uniswap V3 QuoterV2.

    Calls quoteExactInputSingle on the QuoterV2 contract via eth_call.
    The QuoterV2 function takes a struct QuoteExactInputSingleParams:
        (address tokenIn, address tokenOut, uint256 amountIn,
         uint24 fee, uint160 sqrtPriceLimitX96)

    Returns:
        {
            "amount_out": int,
            "sqrt_price_x96_after": int,
            "gas_estimate": int,
        }

    Raises ValueError if the quote call fails.
    """
    if amount_in <= 0:
        raise ValueError("amount_in must be positive")

    # Encode the struct fields inline (Solidity ABI encoding for a single
    # tuple parameter encodes the fields directly without an offset pointer
    # when there are no dynamic types).
    calldata = (
        "0x"
        + SELECTOR_QUOTE_EXACT_INPUT_SINGLE
        + _encode_address(token_in)       # tokenIn
        + _encode_address(token_out)      # tokenOut
        + _encode_uint256(amount_in)      # amountIn
        + _encode_uint24(fee)             # fee
        + _encode_uint160(0)              # sqrtPriceLimitX96 = 0 (no limit)
    )

    result = await eth_call(UNISWAP_QUOTER_V2, calldata)
    raw = result.replace("0x", "")

    # QuoterV2.quoteExactInputSingle returns:
    #   (uint256 amountOut, uint160 sqrtPriceX96After,
    #    uint32 initializedTicksCrossed, uint256 gasEstimate)
    amount_out = _decode_uint256(raw, 0)
    sqrt_price_x96_after = _decode_uint256(raw, 1)
    # word 2 is initializedTicksCrossed (uint32, but padded to 32 bytes)
    gas_estimate = _decode_uint256(raw, 3)

    return {
        "amount_out": amount_out,
        "sqrt_price_x96_after": sqrt_price_x96_after,
        "gas_estimate": gas_estimate if gas_estimate > 0 else DEFAULT_SWAP_GAS,
    }


# ---------------------------------------------------------------------------
# Swap transaction
# ---------------------------------------------------------------------------


async def build_swap_tx(
    token_in: str,
    token_out: str,
    amount_in: int,
    amount_out_min: int,
    recipient: str,
    fee: int = 3000,
    deadline: int | None = None,
) -> dict:
    """
    Build an unsigned swap transaction for SwapRouter02.exactInputSingle.

    The SwapRouter02 exactInputSingle takes a struct ExactInputSingleParams:
        (address tokenIn, address tokenOut, uint24 fee, address recipient,
         uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)

    If token_in is WETH (i.e. user is swapping native ETH), the transaction
    value is set to amount_in and the router handles WETH wrapping.
    Otherwise, the user must have approved token_in to the router first.

    Args:
        token_in:       Input token address.
        token_out:      Output token address.
        amount_in:      Input amount in smallest unit.
        amount_out_min: Minimum output amount (slippage-protected).
        recipient:      User's wallet address to receive output tokens.
        fee:            Pool fee tier (500 = 0.05%, 3000 = 0.3%, 10000 = 1%).
        deadline:       Unix timestamp deadline (default: now + 20 minutes).

    Returns:
        Unsigned transaction dict with to, data, value, gas, chainId.
    """
    if deadline is None:
        deadline = int(time.time()) + 20 * 60  # 20 minutes from now

    is_native_eth = token_in.lower() == WETH.lower()

    # Encode ExactInputSingleParams struct
    calldata = (
        "0x"
        + SELECTOR_EXACT_INPUT_SINGLE
        + _encode_address(token_in)       # tokenIn
        + _encode_address(token_out)      # tokenOut
        + _encode_uint24(fee)             # fee
        + _encode_address(recipient)      # recipient
        + _encode_uint256(amount_in)      # amountIn
        + _encode_uint256(amount_out_min) # amountOutMinimum
        + _encode_uint160(0)              # sqrtPriceLimitX96 = 0 (no limit)
    )

    eth_value = amount_in if is_native_eth else 0

    # Estimate gas
    gas = DEFAULT_SWAP_GAS
    try:
        tx_obj = {
            "to": UNISWAP_SWAP_ROUTER_02,
            "data": calldata,
            "value": hex(eth_value),
        }
        if is_native_eth:
            tx_obj["from"] = recipient
        gas_hex = await _rpc_call("eth_estimateGas", [tx_obj])
        # Add a 20% buffer to estimated gas
        gas = int(int(gas_hex, 16) * 1.2)
    except Exception:
        logger.debug("Gas estimation failed for swap, using default %d", DEFAULT_SWAP_GAS)

    return {
        "to": UNISWAP_SWAP_ROUTER_02,
        "data": calldata,
        "value": hex(eth_value),
        "gas": hex(gas),
        "chainId": 1,
    }


# ---------------------------------------------------------------------------
# Convenience: resolve token address for swaps
# ---------------------------------------------------------------------------

# Placeholder address used in xstock registry for unverified tokens
_PLACEHOLDER_ADDRESS = "0x" + "0" * 40


def is_placeholder_address(address: str) -> bool:
    """Check if an address is the placeholder zero address."""
    return address.lower().replace("0x", "").strip("0") == ""


def resolve_swap_addresses(
    token_in_symbol: str,
    token_out_symbol: str,
    token_in_info: dict,
    token_out_info: dict,
) -> tuple[str, str]:
    """
    Resolve contract addresses for a swap pair.

    For native ETH, substitutes the WETH address.

    Raises ValueError if either token has a placeholder address.
    """
    addr_in = token_in_info.get("address", "")
    addr_out = token_out_info.get("address", "")

    # Native ETH -> WETH
    if addr_in == "native":
        addr_in = WETH
    if addr_out == "native":
        addr_out = WETH

    if is_placeholder_address(addr_in):
        raise ValueError(
            f"Token address not configured for {token_in_symbol}. "
            "This token cannot be traded yet."
        )
    if is_placeholder_address(addr_out):
        raise ValueError(
            f"Token address not configured for {token_out_symbol}. "
            "This token cannot be traded yet."
        )

    return addr_in, addr_out
