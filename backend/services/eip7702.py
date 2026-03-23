"""
EIP-7702 delegation and ERC-4337 UserOperation construction for gasless trades.

Flow for a USDC-gas trade (bundler mode):
1. Build batch calls: [approve token_in → router, swap via Uniswap]
2. Encode executeBySender(calls) calldata targeting AmbireAccount7702
3. Get EntryPoint nonce for the sender
4. Fetch current gas prices (EIP-1559)
5. Assemble a PackedUserOperation (ERC-4337 v0.7 EntryPoint)
6. Optionally call the Ambire paymaster relay to get paymasterData
7. Optionally call the bundler's eth_estimateUserOperationGas for gas limits
8. Return the fully-assembled UserOp (minus the sender's signature)

The frontend must:
  a. Sign an EIP-7702 authorization (Type 4 tx authorization) if this is the
     first delegation, then include it when submitting the UserOp.
  b. Sign the UserOp hash with the EOA's private key.
  c. Submit eth_sendUserOperation to the bundler URL.

ERC-4337 v0.7 PackedUserOperation layout (as per EIP-4337 update and the
Ambire contracts we read from source):
  sender                  address
  nonce                   uint256
  initCode                bytes         (0x for already-deployed / 7702)
  callData                bytes
  accountGasLimits        bytes32       verificationGasLimit[16] ++ callGasLimit[16]
  preVerificationGas      uint256
  gasFees                 bytes32       maxPriorityFeePerGas[16] ++ maxFeePerGas[16]
  paymasterAndData        bytes         paymaster[20] ++ pvgl[16] ++ ppgl[16] ++ paymasterData
  signature               bytes

All ABI encoding is manual hex — no web3py / eth-abi dependency.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx

from services.provider import _rpc_call, eth_call

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Contract addresses (Ethereum mainnet)
# ---------------------------------------------------------------------------

AMBIRE_ACCOUNT_7702 = "0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d"
AMBIRE_PAYMASTER = "0xA8B267C68715FA1Dca055993149f30217B572Cf0"
AMBIRE_FACTORY = "0x26cE6745A633030A6faC5e64e41D21fb6246dc2d"
ERC4337_ENTRYPOINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"

# ---------------------------------------------------------------------------
# External service configuration
# ---------------------------------------------------------------------------

PIMLICO_API_KEY = os.environ.get("PIMLICO_API_KEY", "")
AMBIRE_RELAYER_BASE = "https://relayer.ambire.com"

# Gas defaults used when bundler estimation fails or is unavailable.
# These are conservative upper bounds sized for approve + Uniswap V3 swap:
#   callGasLimit:             approve (~50k) + swap (~200k) + executeBySender overhead (~20k) = ~270k → 300k
#   verificationGasLimit:     validateUserOp + ecrecover + storage reads ≈ 150k
#   paymasterVerGasLimit:     paymaster validatePaymasterUserOp ≈ 42k (matches Ambire's own stub)
#   paymasterPostOpGasLimit:  no postOp logic in AmbirePaymaster → 0
#   preVerificationGas:       bundle overhead ≈ 50k

DEFAULT_CALL_GAS_LIMIT = 300_000
DEFAULT_VERIFICATION_GAS_LIMIT = 150_000
DEFAULT_PAYMASTER_VER_GAS_LIMIT = 42_000
DEFAULT_PAYMASTER_POSTOP_GAS_LIMIT = 0
DEFAULT_PRE_VERIFICATION_GAS = 50_000

# ---------------------------------------------------------------------------
# Pre-computed function selectors
# ---------------------------------------------------------------------------

# executeBySender((address,uint256,bytes)[])
# keccak256("executeBySender((address,uint256,bytes)[])") = 0xabc5345e
# Verified on-chain: the Transaction struct is (address to, uint256 value, bytes data)
# and AmbireAccount.executeBySender takes Transaction[] as its parameter.
SELECTOR_EXECUTE_BY_SENDER = "abc5345e"

# EntryPoint.getNonce(address, uint192)  → keccak256("getNonce(address,uint192)")[0:4]
# = 0x35567e1a
SELECTOR_GET_NONCE = "35567e1a"

# ---------------------------------------------------------------------------
# Low-level ABI encoding helpers
# (mirror of the helpers in services/uniswap.py — kept local to avoid tight
#  coupling between unrelated service modules)
# ---------------------------------------------------------------------------


def _encode_address(addr: str) -> str:
    """Left-pad a 20-byte address to 32 bytes (64 hex chars)."""
    return addr.lower().replace("0x", "").zfill(64)


def _encode_uint256(value: int) -> str:
    """Encode uint256 as 64 hex chars."""
    if value < 0:
        raise ValueError("uint256 cannot be negative")
    return hex(value)[2:].rstrip("L").zfill(64)


def _encode_uint128(value: int) -> str:
    """Encode uint128 as 32 hex chars (16 bytes) — used in packed gas fields."""
    if value < 0:
        raise ValueError("uint128 cannot be negative")
    if value >= (1 << 128):
        raise ValueError(f"value {value} overflows uint128")
    return hex(value)[2:].rstrip("L").zfill(32)


def _decode_uint256(hex_str: str, word_offset: int = 0) -> int:
    """Read one 32-byte word from raw hex (no 0x prefix) at a given word offset."""
    start = word_offset * 64
    word = hex_str[start : start + 64]
    if not word:
        return 0
    return int(word, 16)


def _pad_bytes_to_word(data_hex: str) -> str:
    """Right-pad a hex byte string to the next 32-byte boundary."""
    # data_hex must NOT have "0x" prefix and must be an even number of chars
    length = len(data_hex)
    remainder = length % 64
    if remainder == 0:
        return data_hex
    padding = 64 - remainder
    return data_hex + "0" * padding


# ---------------------------------------------------------------------------
# executeBySender calldata encoding
# ---------------------------------------------------------------------------
#
# Solidity signature:
#   function executeBySender(Transaction[] calldata calls) external payable
#
# Transaction struct:
#   struct Transaction {
#       address to;      // slot 0: 32-byte word (address left-zero-padded)
#       uint256 value;   // slot 1: 32-byte word
#       bytes data;      // slot 2: dynamic — offset ptr, then length + data
#   }
#
# ABI encoding for an array of structs that each contain a dynamic type:
#
#   [selector 4 bytes]
#   [word 0] offset to the array from the start of the ABI data  = 0x20 (32)
#   [word 1] array length (N)
#   --- for each element i: offset to the tuple from the start of the array body
#       (i.e. from just after the length word) ---
#   [words 2..2+N-1] element offsets (relative to start of the element-offsets block)
#   --- for each element i: the tuple itself ---
#   [address word] to (padded to 32)
#   [uint256 word] value
#   [offset word]  offset to `data` bytes, relative to start of this tuple
#   [length word]  byte length of data
#   [data words]   data right-padded to 32-byte boundary


def encode_execute_by_sender(calls: list[dict]) -> str:
    """
    Encode the calldata for AmbireAccount7702.executeBySender(Transaction[]).

    Each call in `calls` is a dict with keys:
        to    (str)  — 0x-prefixed address
        value (int)  — wei value (0 for token calls)
        data  (str)  — 0x-prefixed calldata bytes (may be "0x")

    Returns a full 0x-prefixed hex string ready to use as tx calldata.
    """
    n = len(calls)
    if n == 0:
        # Empty array: selector + offset(0x20) + length(0)
        return "0x" + SELECTOR_EXECUTE_BY_SENDER + _encode_uint256(32) + _encode_uint256(0)

    # -----------------------------------------------------------------------
    # Step 1: Encode each call's `data` field into its raw hex (no 0x).
    # -----------------------------------------------------------------------
    call_data_hexes: list[str] = []
    for c in calls:
        raw = c.get("data", "0x") or "0x"
        call_data_hexes.append(raw.lower().replace("0x", ""))

    # -----------------------------------------------------------------------
    # Step 2: Compute per-element offsets for the outer array.
    #
    # The array body starts just after the N offset words.  Each element is:
    #   - 3 fixed words (to, value, bytes-offset)       = 3 * 32 = 96 bytes
    #   - 1 length word                                 = 32 bytes
    #   - data words (ceil(len/32)*32)                  = variable
    #
    # Offset[i] = sum of sizes of all elements 0..i-1 (in bytes).
    # -----------------------------------------------------------------------

    def _element_size(data_hex: str) -> int:
        """Total size in bytes of one encoded tuple element."""
        data_len = len(data_hex) // 2  # number of bytes in `data`
        padded_data_words = (data_len + 31) // 32
        # 3 fixed words + 1 length word + padded data words
        return (3 + 1 + padded_data_words) * 32

    element_sizes = [_element_size(d) for d in call_data_hexes]

    # Offset[0] = N * 32 bytes (the N offset words themselves)
    element_offsets: list[int] = []
    running = n * 32
    for sz in element_sizes:
        element_offsets.append(running)
        running += sz

    # -----------------------------------------------------------------------
    # Step 3: Assemble the ABI-encoded array body.
    # -----------------------------------------------------------------------
    array_body = ""

    # 3a. N offset words (each relative to start of the array body, i.e.
    #     just after the length word)
    for off in element_offsets:
        array_body += _encode_uint256(off)

    # 3b. Each element (tuple)
    for i, c in enumerate(calls):
        to_addr = c.get("to", "0x" + "0" * 40)
        value = int(c.get("value", 0))
        data_hex = call_data_hexes[i]
        data_len = len(data_hex) // 2

        # Within the tuple, `data` is a dynamic field whose offset is measured
        # from the start of *this tuple*. The tuple starts with 3 words:
        #   [0] address  [1] uint256  [2] bytes-offset-ptr
        # So the bytes content starts at offset 3*32 = 96.
        bytes_offset_in_tuple = 96

        array_body += _encode_address(to_addr)          # to   (32 bytes)
        array_body += _encode_uint256(value)             # value (32 bytes)
        array_body += _encode_uint256(bytes_offset_in_tuple)  # bytes ptr (32 bytes)
        array_body += _encode_uint256(data_len)          # bytes length (32 bytes)
        array_body += _pad_bytes_to_word(data_hex)       # bytes data (padded)

    # -----------------------------------------------------------------------
    # Step 4: Wrap in the top-level ABI envelope.
    #
    # The function takes one parameter (the array), so:
    #   word 0 = offset to array from start of ABI data = 32 (0x20)
    #   word 1 = array length
    #   word 2+ = array body (element offsets + elements)
    # -----------------------------------------------------------------------
    abi_params = (
        _encode_uint256(32)   # offset to array
        + _encode_uint256(n)  # array length
        + array_body
    )

    return "0x" + SELECTOR_EXECUTE_BY_SENDER + abi_params


# ---------------------------------------------------------------------------
# EntryPoint nonce
# ---------------------------------------------------------------------------


async def get_entrypoint_nonce(sender: str, key: int = 0) -> int:
    """
    Fetch the ERC-4337 nonce from the EntryPoint for `sender`.

    getNonce(address sender, uint192 key) → uint256
    selector: 0x35567e1a
    key=0 uses the default sequential nonce sequence.
    """
    calldata = (
        "0x"
        + SELECTOR_GET_NONCE
        + _encode_address(sender)
        + _encode_uint256(key)  # uint192 is ABI-encoded as uint256
    )
    try:
        result = await eth_call(ERC4337_ENTRYPOINT, calldata)
        raw = result.replace("0x", "")
        return _decode_uint256(raw, 0)
    except Exception as exc:
        logger.warning("Failed to fetch EntryPoint nonce for %s: %s", sender, exc)
        return 0


# ---------------------------------------------------------------------------
# Gas price helpers
# ---------------------------------------------------------------------------


async def get_eip1559_fees() -> tuple[int, int]:
    """
    Return (maxFeePerGas, maxPriorityFeePerGas) in wei.

    Uses eth_feeHistory for the base fee and a fixed 1.5 gwei priority fee,
    then sets maxFeePerGas = 2 * baseFee + maxPriorityFee (EIP-1559 headroom).
    """
    try:
        fee_history = await _rpc_call(
            "eth_feeHistory",
            [1, "latest", [50]],
        )
        base_fee_hex = fee_history.get("baseFeePerGas", ["0x1"])
        # baseFeePerGas is an array; index [-1] is the *next* block's base fee
        if isinstance(base_fee_hex, list) and len(base_fee_hex) >= 1:
            next_base_fee = int(base_fee_hex[-1], 16)
        else:
            next_base_fee = int(base_fee_hex, 16) if base_fee_hex else 1_000_000_000

        # 1.5 gwei priority fee is a reasonable default for mainnet
        max_priority_fee = 1_500_000_000  # 1.5 gwei

        # 2x base fee headroom + priority fee
        max_fee = 2 * next_base_fee + max_priority_fee

        return max_fee, max_priority_fee
    except Exception as exc:
        logger.warning("Failed to fetch EIP-1559 fees: %s. Using defaults.", exc)
        # Conservative defaults: 20 gwei max, 1.5 gwei priority
        return 20_000_000_000, 1_500_000_000


# ---------------------------------------------------------------------------
# Bundler gas estimation
# ---------------------------------------------------------------------------


async def estimate_user_op_gas(
    user_op: dict,
    bundler_url: str,
    entrypoint: str = ERC4337_ENTRYPOINT,
) -> dict:
    """
    Call the bundler's eth_estimateUserOperationGas endpoint.

    `user_op` should be the ERC-4337 v0.7 UserOperation dict (not packed —
    bundlers accept the unpacked format for estimation).

    Returns a dict with keys:
        callGasLimit            (int)
        verificationGasLimit    (int)
        preVerificationGas      (int)
        paymasterVerificationGasLimit   (int, may be absent if no paymaster)
        paymasterPostOpGasLimit         (int, may be absent if no paymaster)

    Falls back to DEFAULT_* values on any error.
    """
    defaults = {
        "callGasLimit": DEFAULT_CALL_GAS_LIMIT,
        "verificationGasLimit": DEFAULT_VERIFICATION_GAS_LIMIT,
        "preVerificationGas": DEFAULT_PRE_VERIFICATION_GAS,
        "paymasterVerificationGasLimit": DEFAULT_PAYMASTER_VER_GAS_LIMIT,
        "paymasterPostOpGasLimit": DEFAULT_PAYMASTER_POSTOP_GAS_LIMIT,
    }

    try:
        payload = {
            "jsonrpc": "2.0",
            "method": "eth_estimateUserOperationGas",
            "params": [user_op, entrypoint],
            "id": 1,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(bundler_url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        if "error" in data:
            logger.warning(
                "Bundler estimation error: %s. Using defaults.", data["error"]
            )
            return defaults

        result = data.get("result", {})

        def _parse_hex_field(val: str | int | None, default: int) -> int:
            if val is None:
                return default
            if isinstance(val, int):
                return val
            try:
                return int(val, 16)
            except (ValueError, TypeError):
                return default

        return {
            "callGasLimit": _parse_hex_field(
                result.get("callGasLimit"), DEFAULT_CALL_GAS_LIMIT
            ),
            "verificationGasLimit": _parse_hex_field(
                result.get("verificationGasLimit"), DEFAULT_VERIFICATION_GAS_LIMIT
            ),
            "preVerificationGas": _parse_hex_field(
                result.get("preVerificationGas"), DEFAULT_PRE_VERIFICATION_GAS
            ),
            "paymasterVerificationGasLimit": _parse_hex_field(
                result.get("paymasterVerificationGasLimit"),
                DEFAULT_PAYMASTER_VER_GAS_LIMIT,
            ),
            "paymasterPostOpGasLimit": _parse_hex_field(
                result.get("paymasterPostOpGasLimit"),
                DEFAULT_PAYMASTER_POSTOP_GAS_LIMIT,
            ),
        }

    except Exception as exc:
        logger.warning(
            "Bundler gas estimation failed (%s). Using conservative defaults.", exc
        )
        return defaults


# ---------------------------------------------------------------------------
# Paymaster relay
# ---------------------------------------------------------------------------
#
# The Ambire paymaster relay at /v2/paymaster/{chainId}/request accepts a
# JSON-RPC request and returns signed paymasterData.
#
# The paymasterAndData field in a PackedUserOperation is:
#   paymaster address (20 bytes)
#   ++ paymasterVerificationGasLimit (16 bytes)
#   ++ paymasterPostOpGasLimit (16 bytes)
#   ++ abi.encode(uint48 validUntil, uint48 validAfter, bytes signature)
#
# The relayer signs:
#   keccak256(abi.encode(
#       block.chainid, paymaster, entryPoint,
#       validUntil, validAfter,
#       sender, nonce, initCode, callData,
#       accountGasLimits, preVerificationGas, gasFees
#   ))
#
# Reference: AmbirePaymaster.sol → validatePaymasterUserOp


async def get_paymaster_data(
    user_op: dict,
    chain_id: int,
    relayer_base: str = AMBIRE_RELAYER_BASE,
) -> Optional[dict]:
    """
    Request paymasterData from the Ambire relayer.

    `user_op` is the ERC-4337 v0.7 UserOperation dict (unpacked, for the
    bundler API).  The paymaster field must already be set to AMBIRE_PAYMASTER.

    Returns a dict on success:
        {
            "paymaster": "0x...",
            "paymasterData": "0x...",
            "paymasterVerificationGasLimit": "0x...",
            "paymasterPostOpGasLimit": "0x...",
        }
    Returns None on any error — caller decides whether to continue without
    paymaster (fall back to regular execution).
    """
    url = f"{relayer_base}/v2/paymaster/{chain_id}/request"
    payload = {
        "jsonrpc": "2.0",
        "method": "pm_getPaymasterData",
        "params": [
            user_op,
            ERC4337_ENTRYPOINT,
            hex(chain_id),
        ],
        "id": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        if "error" in data:
            logger.warning(
                "Paymaster relay returned error for chain %d: %s",
                chain_id,
                data["error"],
            )
            return None

        result = data.get("result", {})
        # Normalise: relay may return 'data' key instead of 'paymasterData'
        paymaster_data = result.get("paymasterData") or result.get("data", {}).get(
            "paymasterData"
        )
        if not paymaster_data:
            logger.warning(
                "Paymaster relay response missing paymasterData: %s", result
            )
            return None

        return {
            "paymaster": result.get("paymaster", AMBIRE_PAYMASTER),
            "paymasterData": paymaster_data,
            "paymasterVerificationGasLimit": result.get(
                "paymasterVerificationGasLimit",
                hex(DEFAULT_PAYMASTER_VER_GAS_LIMIT),
            ),
            "paymasterPostOpGasLimit": result.get(
                "paymasterPostOpGasLimit",
                hex(DEFAULT_PAYMASTER_POSTOP_GAS_LIMIT),
            ),
        }

    except Exception as exc:
        logger.warning(
            "Failed to fetch paymaster data from %s: %s", url, exc
        )
        return None


# ---------------------------------------------------------------------------
# USDC gas cost estimate
# ---------------------------------------------------------------------------


def estimate_gas_cost_usdc(
    call_gas_limit: int,
    verification_gas_limit: int,
    pre_verification_gas: int,
    paymaster_ver_gas_limit: int,
    max_fee_per_gas: int,
    usdc_per_eth: float = 3500.0,
) -> str:
    """
    Estimate the USDC cost of executing a UserOp.

    Uses a rough model:
      total_gas = callGasLimit + verificationGasLimit + preVerificationGas
                  + paymasterVerificationGasLimit
      gas_cost_eth = total_gas * maxFeePerGas (wei)
      gas_cost_usdc = gas_cost_eth * usdc_per_eth

    The usdc_per_eth rate is a rough estimate. In production this should come
    from the price service (services/prices.py).  We use $3,500/ETH as a
    conservative placeholder here.

    Returns a human-readable string like "0.42".
    """
    total_gas = (
        call_gas_limit
        + verification_gas_limit
        + pre_verification_gas
        + paymaster_ver_gas_limit
    )
    gas_cost_wei = total_gas * max_fee_per_gas
    gas_cost_eth = gas_cost_wei / 1e18
    gas_cost_usdc = gas_cost_eth * usdc_per_eth
    return f"{gas_cost_usdc:.4f}"


# ---------------------------------------------------------------------------
# Core: build_gasless_trade
# ---------------------------------------------------------------------------


async def build_gasless_trade(
    user_address: str,
    calls: list[dict],
    chain_id: int = 1,
) -> dict:
    """
    Build a complete gasless trade package for ERC-4337 bundler submission.

    `calls` is a list of dicts, each with:
        to    (str)  — 0x-prefixed target contract address
        value (int)  — ETH value in wei (0 for token calls)
        data  (str)  — 0x-prefixed ABI-encoded calldata

    Raises ValueError if:
      - PIMLICO_API_KEY is not configured (so the frontend knows where to send)
      - The paymaster relay is unavailable AND falls back

    Returns:
    {
        "user_operation": {
            # Full ERC-4337 v0.7 UserOperation (unpacked — as expected by bundlers)
            "sender": "0x...",
            "nonce": "0x...",
            "factory": null,           # 0x for 7702 accounts (no factory)
            "factoryData": null,
            "callData": "0x...",       # executeBySender(calls)
            "callGasLimit": "0x...",
            "verificationGasLimit": "0x...",
            "preVerificationGas": "0x...",
            "maxFeePerGas": "0x...",
            "maxPriorityFeePerGas": "0x...",
            "paymaster": "0x...",
            "paymasterData": "0x...",
            "paymasterVerificationGasLimit": "0x...",
            "paymasterPostOpGasLimit": "0x...",
            "signature": "0x",         # Placeholder — frontend fills
        },
        "eip7702_auth": {
            # Authorization object the frontend must sign (EIP-7702 Type 4 tx)
            # Only populated — always included, delegation may already be active.
            # The frontend checks on-chain whether delegation is live and
            # includes this in the Type 4 tx only when needed.
            "chain_id": int,
            "address": "0x5A7FC...",   # AmbireAccount7702
            "nonce": int,              # Current EOA tx nonce
        },
        "entrypoint": "0x...",
        "bundler_url": "https://api.pimlico.io/...",
        "paymaster_mode": "ambire" | "none",
        "gas_estimate_usdc": "0.42",
    }
    """
    if not PIMLICO_API_KEY:
        raise ValueError(
            "PIMLICO_API_KEY is not configured. "
            "Gasless (bundler) mode requires a Pimlico bundler API key. "
            "Use /trade/quote for a standard ETH-gas transaction instead."
        )

    bundler_url = f"https://api.pimlico.io/v2/{chain_id}/rpc?apikey={PIMLICO_API_KEY}"

    # ------------------------------------------------------------------
    # 1. Encode executeBySender calldata
    # ------------------------------------------------------------------
    call_data = encode_execute_by_sender(calls)

    # ------------------------------------------------------------------
    # 2. Fetch EntryPoint nonce and EOA tx nonce (for EIP-7702 auth)
    # ------------------------------------------------------------------
    ep_nonce, eoa_nonce_hex, fees = await _fetch_nonces_and_fees(user_address)
    max_fee_per_gas, max_priority_fee_per_gas = fees

    # ------------------------------------------------------------------
    # 3. Build a stub UserOp for bundler estimation.
    #    Use the Ambire paymaster estimation stub so the bundler can
    #    simulate the full validation path including paymaster.
    #    paymasterData stub = abi.encode(uint48 0, uint48 0, sig_placeholder)
    # ------------------------------------------------------------------
    paymaster_stub_data = _make_paymaster_stub_data()

    stub_user_op = {
        "sender": user_address,
        "nonce": hex(ep_nonce),
        "factory": None,
        "factoryData": None,
        "callData": call_data,
        "callGasLimit": hex(DEFAULT_CALL_GAS_LIMIT),
        "verificationGasLimit": hex(DEFAULT_VERIFICATION_GAS_LIMIT),
        "preVerificationGas": hex(DEFAULT_PRE_VERIFICATION_GAS),
        "maxFeePerGas": hex(max_fee_per_gas),
        "maxPriorityFeePerGas": hex(max_priority_fee_per_gas),
        "paymaster": AMBIRE_PAYMASTER,
        "paymasterData": paymaster_stub_data,
        "paymasterVerificationGasLimit": hex(DEFAULT_PAYMASTER_VER_GAS_LIMIT),
        "paymasterPostOpGasLimit": hex(DEFAULT_PAYMASTER_POSTOP_GAS_LIMIT),
        "signature": _stub_signature(),
    }

    # ------------------------------------------------------------------
    # 4. Bundler gas estimation
    # ------------------------------------------------------------------
    gas = await estimate_user_op_gas(stub_user_op, bundler_url)

    call_gas_limit = gas["callGasLimit"]
    verification_gas_limit = gas["verificationGasLimit"]
    pre_verification_gas = gas["preVerificationGas"]
    paymaster_ver_gas_limit = gas["paymasterVerificationGasLimit"]
    paymaster_postop_gas_limit = gas["paymasterPostOpGasLimit"]

    # ------------------------------------------------------------------
    # 5. Build the real UserOp (without paymaster signature yet)
    # ------------------------------------------------------------------
    user_op_for_paymaster = {
        "sender": user_address,
        "nonce": hex(ep_nonce),
        "factory": None,
        "factoryData": None,
        "callData": call_data,
        "callGasLimit": hex(call_gas_limit),
        "verificationGasLimit": hex(verification_gas_limit),
        "preVerificationGas": hex(pre_verification_gas),
        "maxFeePerGas": hex(max_fee_per_gas),
        "maxPriorityFeePerGas": hex(max_priority_fee_per_gas),
        "paymaster": AMBIRE_PAYMASTER,
        "paymasterData": "0x",
        "paymasterVerificationGasLimit": hex(paymaster_ver_gas_limit),
        "paymasterPostOpGasLimit": hex(paymaster_postop_gas_limit),
        "signature": "0x",
    }

    # ------------------------------------------------------------------
    # 6. Request paymaster signature from Ambire relay
    # ------------------------------------------------------------------
    paymaster_result = await get_paymaster_data(user_op_for_paymaster, chain_id)
    paymaster_mode = "none"

    if paymaster_result:
        paymaster_mode = "ambire"
        final_paymaster = paymaster_result["paymaster"]
        final_paymaster_data = paymaster_result["paymasterData"]
        final_paymaster_ver_gas = paymaster_result.get(
            "paymasterVerificationGasLimit", hex(paymaster_ver_gas_limit)
        )
        final_paymaster_postop_gas = paymaster_result.get(
            "paymasterPostOpGasLimit", hex(paymaster_postop_gas_limit)
        )
    else:
        logger.warning(
            "Paymaster relay unavailable for chain %d. "
            "Returning UserOp without paymaster — user must pay ETH gas.",
            chain_id,
        )
        # Without paymaster, the user cannot pay gas in USDC.
        # We still return the UserOp so the frontend can decide whether to
        # submit it as a self7702 tx (ETH gas) or surface an error.
        final_paymaster = AMBIRE_PAYMASTER
        final_paymaster_data = "0x"
        final_paymaster_ver_gas = hex(paymaster_ver_gas_limit)
        final_paymaster_postop_gas = hex(paymaster_postop_gas_limit)

    # ------------------------------------------------------------------
    # 7. Assemble final UserOp
    # ------------------------------------------------------------------
    final_user_op = {
        "sender": user_address,
        "nonce": hex(ep_nonce),
        "factory": None,
        "factoryData": None,
        "callData": call_data,
        "callGasLimit": hex(call_gas_limit),
        "verificationGasLimit": hex(verification_gas_limit),
        "preVerificationGas": hex(pre_verification_gas),
        "maxFeePerGas": hex(max_fee_per_gas),
        "maxPriorityFeePerGas": hex(max_priority_fee_per_gas),
        "paymaster": final_paymaster,
        "paymasterData": final_paymaster_data,
        "paymasterVerificationGasLimit": final_paymaster_ver_gas,
        "paymasterPostOpGasLimit": final_paymaster_postop_gas,
        "signature": "0x",  # Placeholder — frontend signs with EOA key
    }

    # ------------------------------------------------------------------
    # 8. EIP-7702 authorization object (frontend decides whether to
    #    include it — only required on first delegation or re-delegation).
    # ------------------------------------------------------------------
    eip7702_auth = {
        "chain_id": chain_id,
        "address": AMBIRE_ACCOUNT_7702,
        "nonce": int(eoa_nonce_hex, 16) if isinstance(eoa_nonce_hex, str) else eoa_nonce_hex,
    }

    # ------------------------------------------------------------------
    # 9. Gas cost estimate (informational only)
    # ------------------------------------------------------------------
    gas_estimate_usdc = estimate_gas_cost_usdc(
        call_gas_limit=call_gas_limit,
        verification_gas_limit=verification_gas_limit,
        pre_verification_gas=pre_verification_gas,
        paymaster_ver_gas_limit=paymaster_ver_gas_limit,
        max_fee_per_gas=max_fee_per_gas,
    )

    return {
        "user_operation": final_user_op,
        "eip7702_auth": eip7702_auth,
        "entrypoint": ERC4337_ENTRYPOINT,
        "bundler_url": bundler_url,
        "paymaster_mode": paymaster_mode,
        "gas_estimate_usdc": gas_estimate_usdc,
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


async def _fetch_nonces_and_fees(
    user_address: str,
) -> tuple[int, str | int, tuple[int, int]]:
    """
    Concurrently fetch:
      - EntryPoint nonce (int)
      - EOA transaction nonce (hex str or int)
      - EIP-1559 fee estimates (max_fee, max_priority_fee)

    Returns (ep_nonce, eoa_nonce_hex, (max_fee, max_priority_fee)).
    """
    import asyncio

    ep_nonce_task = asyncio.create_task(get_entrypoint_nonce(user_address))
    eoa_nonce_task = asyncio.create_task(
        _rpc_call("eth_getTransactionCount", [user_address, "latest"])
    )
    fees_task = asyncio.create_task(get_eip1559_fees())

    ep_nonce = await ep_nonce_task
    eoa_nonce_hex = await eoa_nonce_task
    fees = await fees_task

    return ep_nonce, eoa_nonce_hex, fees


def _make_paymaster_stub_data() -> str:
    """
    Produce a stub paymasterData for gas estimation.

    The AmbirePaymaster.validatePaymasterUserOp decodes:
        abi.decode(paymasterAndData[52:], (uint48, uint48, bytes))
        → (validUntil, validAfter, signature)

    For estimation we use (0, 0, <65-byte dummy sig>) — same as Ambire's own
    getSigForCalculations() in userOperation.ts:
        0x0dc2d37f7b285a2243b2e1e6ba7195c578c72b395c0f76556f8961b0bca97ddc4
          4e2d7a249598f56081a375837d2b82414c3c94940db3c1e64110108021161ca1c01

    ABI encoding of (uint48 0, uint48 0, bytes stub_sig):
      word 0: validUntil  = 0 (uint48 padded to 32)
      word 1: validAfter  = 0
      word 2: offset to bytes = 96 (3 words in)
      word 3: bytes length = 65
      word 4-6: 65 bytes right-padded to 96 bytes
    """
    stub_sig = (
        "0dc2d37f7b285a2243b2e1e6ba7195c578c72b395c0f76556f8961b0bca97ddc4"
        "4e2d7a249598f56081a375837d2b82414c3c94940db3c1e64110108021161ca1c01"
    )
    # ABI encode (uint48(0), uint48(0), bytes(stub_sig))
    encoded = (
        _encode_uint256(0)        # validUntil
        + _encode_uint256(0)      # validAfter
        + _encode_uint256(96)     # offset to bytes
        + _encode_uint256(65)     # bytes length
        + _pad_bytes_to_word(stub_sig)  # 65 bytes padded to 96
    )
    return "0x" + encoded


def _stub_signature() -> str:
    """
    65-byte dummy ECDSA signature used as a placeholder during gas estimation.
    The signature is never validated on-chain; it just needs to be the right
    size so the bundler can compute calldata gas costs accurately.
    """
    return (
        "0x"
        "0dc2d37f7b285a2243b2e1e6ba7195c578c72b395c0f76556f8961b0bca97ddc4"
        "4e2d7a249598f56081a375837d2b82414c3c94940db3c1e64110108021161ca1c01"
    )
