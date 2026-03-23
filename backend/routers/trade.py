"""
Trade execution endpoints.

POST /trade/quote           — get a swap quote with unsigned transaction data
POST /trade/quote-gasless   — get a swap quote as a UserOperation (USDC gas via
                              EIP-7702 + AmbirePaymaster + ERC-4337 bundler)
POST /trade/confirm         — confirm a trade was submitted on-chain
GET  /trade/status/{id}     — check trade status

The backend is non-custodial: it builds unsigned transactions and returns
them to the frontend.  The frontend signs with the user's private key,
submits to the network, and calls /trade/confirm with the tx hash.

Gasless mode (quote-gasless):
  1. Backend builds batch calls [approve token_in → router, swap].
  2. Wraps them in executeBySender() targeting AmbireAccount7702.
  3. Assembles a PackedUserOperation (ERC-4337 v0.7).
  4. Fetches a paymaster signature from the Ambire relay (gas in USDC).
  5. Returns the unsigned UserOp to the frontend.
  Frontend then:
    a. Signs an EIP-7702 authorization if this is the first delegation.
    b. Signs the UserOp hash with the EOA key.
    c. Submits eth_sendUserOperation to the bundler URL.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth.dependencies import get_current_user
from db.trades import save_quoted_trade, update_trade_status
from services.eip7702 import AMBIRE_PAYMASTER, ERC4337_ENTRYPOINT, USDC, build_gasless_trade
from services.guardrails import validate_trade
from services.provider import _rpc_call
from services.uniswap import (
    UNISWAP_SWAP_ROUTER_02,
    WETH,
    build_approval_tx,
    build_swap_tx,
    check_allowance,
    get_quote,
    get_token_decimals,
    is_placeholder_address,
    resolve_swap_addresses,
)
from services.xstock import CRYPTO_ASSETS, resolve_token

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory quote store (quotes expire after 5 minutes)
# ---------------------------------------------------------------------------

QUOTE_TTL_SECONDS = 5 * 60
_quotes: dict[str, dict] = {}


def _store_quote(quote_id: str, data: dict) -> None:
    """Store a quote with an expiration timestamp."""
    data["_expires_at"] = time.time() + QUOTE_TTL_SECONDS
    _quotes[quote_id] = data


def _get_quote(quote_id: str) -> dict | None:
    """Retrieve a quote if it exists and hasn't expired."""
    q = _quotes.get(quote_id)
    if q is None:
        return None
    if time.time() > q.get("_expires_at", 0):
        _quotes.pop(quote_id, None)
        return None
    return q


def _cleanup_expired_quotes() -> None:
    """Remove expired quotes from memory."""
    now = time.time()
    expired = [qid for qid, q in _quotes.items() if now > q.get("_expires_at", 0)]
    for qid in expired:
        _quotes.pop(qid, None)


# ---------------------------------------------------------------------------
# Token info helpers
# ---------------------------------------------------------------------------

# Quick lookup for crypto symbols -> their info dict
_CRYPTO_BY_SYMBOL = {a["symbol"].upper(): a for a in CRYPTO_ASSETS}

# Known decimals for common tokens
_DECIMALS: dict[str, int] = {
    "ETH": 18,
    "WETH": 18,
    "USDC": 6,
    "USDT": 6,
}


def _get_decimals(symbol: str, token_info: dict) -> int:
    """Get decimals for a token, defaulting to 18 for xStocks."""
    if symbol.upper() in _DECIMALS:
        return _DECIMALS[symbol.upper()]
    # xStock tokens are standard ERC-20 with 18 decimals
    return 18


def _resolve_pair(
    token_in_symbol: str, token_out_symbol: str
) -> tuple[dict, dict]:
    """
    Resolve token_in and token_out symbols to their info dicts.

    For a "buy" of an xStock with USD, token_in is typically ETH or USDC,
    and token_out is the xStock.

    Raises HTTPException if a token can't be resolved.
    """
    in_resolution = resolve_token(token_in_symbol)
    out_resolution = resolve_token(token_out_symbol)

    if not in_resolution.get("match"):
        raise HTTPException(
            status_code=400,
            detail=f"Could not resolve input token '{token_in_symbol}'.",
        )
    if not out_resolution.get("match"):
        raise HTTPException(
            status_code=400,
            detail=f"Could not resolve output token '{token_out_symbol}'.",
        )

    return in_resolution["match"], out_resolution["match"]


def _determine_swap_pair(
    side: str, asset_symbol: str, asset_info: dict
) -> tuple[str, dict, str, dict]:
    """
    Determine the swap direction based on buy/sell side.

    For buying an asset:  USDC -> asset  (or ETH -> asset if buying with ETH)
    For selling an asset: asset -> USDC

    Returns: (token_in_symbol, token_in_info, token_out_symbol, token_out_info)
    """
    # Default counter-asset is USDC for xStocks, WETH for crypto-to-crypto
    if side == "buy":
        # Buying the asset with USDC
        token_in_symbol = "USDC"
        token_in_info = _CRYPTO_BY_SYMBOL["USDC"]
        token_out_symbol = asset_symbol
        token_out_info = asset_info
    else:
        # Selling the asset for USDC
        token_in_symbol = asset_symbol
        token_in_info = asset_info
        token_out_symbol = "USDC"
        token_out_info = _CRYPTO_BY_SYMBOL["USDC"]

    return token_in_symbol, token_in_info, token_out_symbol, token_out_info


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class QuoteRequest(BaseModel):
    token_in: str = Field(..., description="Input token: 'ETH', 'USDC', or xStock symbol like 'xTSLA'")
    token_out: str = Field(..., description="Output token: same format")
    amount: float = Field(..., gt=0, description="Human-readable amount")
    amount_type: str = Field("usd", description="'usd' or 'quantity'")
    slippage: float = Field(0.5, ge=0.01, le=50.0, description="Slippage tolerance in percent")
    recipient: str = Field(..., description="User's wallet address to receive output tokens")


class QuoteResponse(BaseModel):
    quote_id: str
    token_in: dict
    token_out: dict
    amount_in: str
    amount_out: str
    amount_in_wei: str
    amount_out_min_wei: str
    price_impact: float
    slippage: float
    needs_approval: bool
    approval_tx: dict | None
    swap_tx: dict
    expires_at: str


class ExecuteRequest(BaseModel):
    quote_id: str = Field(..., description="Quote ID from /trade/quote")
    tx_hash: str = Field(..., min_length=66, max_length=66, description="Transaction hash after signing and submitting")


class TradeStatusResponse(BaseModel):
    trade_id: str
    status: str
    tx_hash: str
    symbol: str
    side: str


class GaslessQuoteRequest(BaseModel):
    token_in: str = Field(
        ...,
        description="Input token: 'ETH', 'USDC', or xStock symbol like 'xTSLA'",
    )
    token_out: str = Field(..., description="Output token: same format")
    amount: float = Field(..., gt=0, description="Human-readable amount")
    amount_type: str = Field("usd", description="'usd' or 'quantity'")
    slippage: float = Field(
        0.5, ge=0.01, le=50.0, description="Slippage tolerance in percent"
    )
    recipient: str = Field(
        ..., description="User's EOA wallet address (sender of the UserOperation)"
    )


class GaslessQuoteResponse(BaseModel):
    quote_id: str
    token_in: dict
    token_out: dict
    amount_in: str          # Human-readable input amount
    amount_out: str         # Human-readable expected output amount
    user_operation: dict    # Full ERC-4337 v0.7 UserOperation (minus signature)
    eip7702_auth: dict      # EIP-7702 authorization object for the frontend to sign
    entrypoint: str         # EntryPoint contract address
    bundler_url: str        # Submit signed UserOp to this URL
    paymaster_mode: str     # "ambire" | "none"
    gas_estimate_usdc: str  # Estimated gas cost in USDC (informational)
    expires_at: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/trade/quote", response_model=QuoteResponse)
async def quote_trade(
    body: QuoteRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Get a swap quote with unsigned transaction data.

    Returns the unsigned swap transaction (and approval tx if needed)
    for the frontend to sign with the user's private key.
    """
    # Periodic cleanup
    _cleanup_expired_quotes()

    # Resolve both tokens
    in_resolution = resolve_token(body.token_in)
    out_resolution = resolve_token(body.token_out)

    token_in_info = in_resolution.get("match")
    token_out_info = out_resolution.get("match")

    if not token_in_info:
        raise HTTPException(400, detail=f"Could not resolve input token '{body.token_in}'.")
    if not token_out_info:
        raise HTTPException(400, detail=f"Could not resolve output token '{body.token_out}'.")

    token_in_symbol = token_in_info["symbol"]
    token_out_symbol = token_out_info["symbol"]

    # Resolve contract addresses (raises ValueError for placeholder addresses)
    try:
        addr_in, addr_out = resolve_swap_addresses(
            token_in_symbol, token_out_symbol, token_in_info, token_out_info,
        )
    except ValueError as e:
        raise HTTPException(400, detail=str(e))

    # Determine decimals
    decimals_in = _get_decimals(token_in_symbol, token_in_info)
    decimals_out = _get_decimals(token_out_symbol, token_out_info)

    # Convert human-readable amount to smallest unit
    if body.amount_type == "usd":
        # For USD-denominated amounts, the amount is in the input token
        # For USDC (6 decimals): $100 = 100_000_000
        # For ETH (18 decimals): we'd need a price feed, so require quantity
        amount_in_raw = int(body.amount * (10 ** decimals_in))
    else:
        # Quantity of input token
        amount_in_raw = int(body.amount * (10 ** decimals_in))

    if amount_in_raw <= 0:
        raise HTTPException(400, detail="Computed input amount is zero. Check amount and token decimals.")

    # Run guardrails
    intent = {
        "side": "buy" if body.token_out.upper() != "USDC" else "sell",
        "asset": token_out_symbol,
        "resolved_symbol": token_out_symbol,
        "amount": body.amount,
        "amount_type": body.amount_type,
    }
    guardrail_result = await validate_trade(user_id, intent)
    if not guardrail_result["approved"]:
        raise HTTPException(403, detail=guardrail_result["reason"])

    # Get Uniswap quote
    try:
        quote_result = await get_quote(
            token_in=addr_in,
            token_out=addr_out,
            amount_in=amount_in_raw,
        )
    except ValueError as e:
        raise HTTPException(502, detail=f"Uniswap quote failed: {e}")
    except Exception as e:
        logger.exception("Uniswap quote error")
        raise HTTPException(502, detail=f"Failed to get quote from Uniswap: {e}")

    amount_out = quote_result["amount_out"]
    if amount_out <= 0:
        raise HTTPException(400, detail="Insufficient liquidity for this trade.")

    # Apply slippage tolerance
    slippage_factor = 1 - (body.slippage / 100)
    amount_out_min = int(amount_out * slippage_factor)

    # Calculate price impact (rough estimate)
    # price_impact = 0 for now — a proper calculation requires comparing
    # mid-price vs execution price using sqrtPriceX96
    price_impact = 0.0

    # Check if approval is needed (only for ERC-20 input, not native ETH)
    is_native_eth = addr_in.lower() == WETH.lower() and token_in_info.get("address") == "native"
    needs_approval = False
    approval_tx = None

    if not is_native_eth:
        current_allowance = await check_allowance(
            token=addr_in,
            owner=body.recipient,
            spender=UNISWAP_SWAP_ROUTER_02,
        )
        if current_allowance < amount_in_raw:
            needs_approval = True
            approval_tx = await build_approval_tx(
                token=addr_in,
                spender=UNISWAP_SWAP_ROUTER_02,
            )

    # Build swap transaction
    swap_tx = await build_swap_tx(
        token_in=addr_in,
        token_out=addr_out,
        amount_in=amount_in_raw,
        amount_out_min=amount_out_min,
        recipient=body.recipient,
    )

    # Format human-readable amounts
    amount_in_human = body.amount
    amount_out_human = amount_out / (10 ** decimals_out)

    # Generate quote ID and expiry
    quote_id = str(uuid.uuid4())
    expires_at = datetime.fromtimestamp(
        time.time() + QUOTE_TTL_SECONDS, tz=timezone.utc
    ).isoformat()

    # Persist the quote in memory
    quote_data = {
        "quote_id": quote_id,
        "user_id": user_id,
        "token_in_symbol": token_in_symbol,
        "token_out_symbol": token_out_symbol,
        "token_in_address": addr_in,
        "token_out_address": addr_out,
        "amount_in_raw": amount_in_raw,
        "amount_out": amount_out,
        "amount_out_min": amount_out_min,
        "amount_in_human": amount_in_human,
        "amount_out_human": amount_out_human,
        "slippage": body.slippage,
        "recipient": body.recipient,
        "guardrail_result": guardrail_result,
    }
    _store_quote(quote_id, quote_data)

    # Also persist as a quoted trade in Firestore
    side = "buy" if token_out_symbol.upper() not in ("USDC", "USDT") else "sell"
    asset_symbol = token_out_symbol if side == "buy" else token_in_symbol
    asset_name = token_out_info["name"] if side == "buy" else token_in_info["name"]

    trade_id = await save_quoted_trade(
        user_id=user_id,
        asset=asset_name,
        symbol=asset_symbol,
        side=side,
        amount=body.amount,
        amount_type=body.amount_type,
        total_usd=body.amount if body.amount_type == "usd" else 0.0,
        guardrail_result=guardrail_result,
    )
    quote_data["trade_id"] = trade_id
    _store_quote(quote_id, quote_data)

    return QuoteResponse(
        quote_id=quote_id,
        token_in={
            "symbol": token_in_symbol,
            "address": addr_in,
            "decimals": decimals_in,
        },
        token_out={
            "symbol": token_out_symbol,
            "address": addr_out,
            "decimals": decimals_out,
        },
        amount_in=f"{amount_in_human}",
        amount_out=f"{amount_out_human:.8f}".rstrip("0").rstrip("."),
        amount_in_wei=str(amount_in_raw),
        amount_out_min_wei=str(amount_out_min),
        price_impact=price_impact,
        slippage=body.slippage,
        needs_approval=needs_approval,
        approval_tx=approval_tx,
        swap_tx=swap_tx,
        expires_at=expires_at,
    )


@router.post("/trade/confirm")
async def confirm_trade(
    body: ExecuteRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Confirm that a trade was submitted on-chain.

    The frontend calls this after signing the swap transaction and
    broadcasting it.  The backend records the tx_hash and marks the
    trade as pending confirmation.
    """
    quote = _get_quote(body.quote_id)
    if not quote:
        raise HTTPException(404, detail="Quote not found or expired.")

    if quote.get("user_id") != user_id:
        raise HTTPException(403, detail="Quote does not belong to this user.")

    trade_id = quote.get("trade_id")
    if not trade_id:
        raise HTTPException(500, detail="No trade record associated with this quote.")

    # Update the trade record with the tx hash and set status to pending
    await update_trade_status(
        user_id=user_id,
        trade_id=trade_id,
        status="pending",
        tx_hash=body.tx_hash,
    )

    # Remove the quote from memory — it's been consumed
    _quotes.pop(body.quote_id, None)

    return {
        "trade_id": trade_id,
        "tx_hash": body.tx_hash,
        "status": "pending",
        "message": "Trade submitted. Monitoring for on-chain confirmation.",
    }


@router.post("/trade/quote-gasless", response_model=GaslessQuoteResponse)
async def quote_gasless_trade(
    body: GaslessQuoteRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Get a swap quote as a UserOperation that pays gas in USDC via EIP-7702 +
    AmbirePaymaster + ERC-4337 bundler.

    The response contains:
      - user_operation: a fully-assembled ERC-4337 v0.7 UserOp (minus the
        user's signature) ready for eth_sendUserOperation.
      - eip7702_auth: the EIP-7702 authorization object the frontend must sign
        if the EOA hasn't yet delegated to AmbireAccount7702.
      - bundler_url: where to submit the signed UserOp.

    The bundler will forward it to the EntryPoint, which calls the
    AmbirePaymaster.  The paymaster pays ETH gas up-front from its EntryPoint
    deposit; the user's USDC balance is debited by the AmbireAccount7702 fee
    call that is included in the executeBySender batch.

    Requires PIMLICO_API_KEY to be set in the environment.  Returns HTTP 503
    if the bundler or paymaster relay is unavailable.
    """
    _cleanup_expired_quotes()

    # ------------------------------------------------------------------
    # 1. Resolve tokens
    # ------------------------------------------------------------------
    in_resolution = resolve_token(body.token_in)
    out_resolution = resolve_token(body.token_out)

    token_in_info = in_resolution.get("match")
    token_out_info = out_resolution.get("match")

    if not token_in_info:
        raise HTTPException(400, detail=f"Could not resolve input token '{body.token_in}'.")
    if not token_out_info:
        raise HTTPException(400, detail=f"Could not resolve output token '{body.token_out}'.")

    token_in_symbol = token_in_info["symbol"]
    token_out_symbol = token_out_info["symbol"]

    try:
        addr_in, addr_out = resolve_swap_addresses(
            token_in_symbol, token_out_symbol, token_in_info, token_out_info,
        )
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc))

    decimals_in = _get_decimals(token_in_symbol, token_in_info)
    decimals_out = _get_decimals(token_out_symbol, token_out_info)

    # ------------------------------------------------------------------
    # 2. Convert human-readable amount to smallest unit
    # ------------------------------------------------------------------
    amount_in_raw = int(body.amount * (10 ** decimals_in))
    if amount_in_raw <= 0:
        raise HTTPException(
            400,
            detail="Computed input amount is zero. Check amount and token decimals.",
        )

    # ------------------------------------------------------------------
    # 3. Guardrails
    # ------------------------------------------------------------------
    side = "buy" if body.token_out.upper() not in ("USDC", "USDT") else "sell"
    asset_symbol = token_out_symbol if side == "buy" else token_in_symbol
    intent = {
        "side": side,
        "asset": asset_symbol,
        "resolved_symbol": asset_symbol,
        "amount": body.amount,
        "amount_type": body.amount_type,
    }
    guardrail_result = await validate_trade(user_id, intent)
    if not guardrail_result["approved"]:
        raise HTTPException(403, detail=guardrail_result["reason"])

    # ------------------------------------------------------------------
    # 4. Uniswap quote
    # ------------------------------------------------------------------
    try:
        quote_result = await get_quote(
            token_in=addr_in,
            token_out=addr_out,
            amount_in=amount_in_raw,
        )
    except ValueError as exc:
        raise HTTPException(502, detail=f"Uniswap quote failed: {exc}")
    except Exception as exc:
        logger.exception("Uniswap quote error")
        raise HTTPException(502, detail=f"Failed to get quote from Uniswap: {exc}")

    amount_out = quote_result["amount_out"]
    if amount_out <= 0:
        raise HTTPException(400, detail="Insufficient liquidity for this trade.")

    slippage_factor = 1 - (body.slippage / 100)
    amount_out_min = int(amount_out * slippage_factor)

    amount_in_human = body.amount
    amount_out_human = amount_out / (10 ** decimals_out)

    # ------------------------------------------------------------------
    # 5. Build the batch calls:
    #    [approve token_in → SwapRouter02, swap via exactInputSingle]
    #
    #    For gasless mode the approval is always included in the batch
    #    (regardless of current on-chain allowance) because the UserOp is
    #    executed atomically — the approve and the swap happen in the same
    #    transaction via executeBySender, so we cannot pre-check whether a
    #    prior approval would still be valid when the UserOp lands.
    #
    #    We use a finite approval (amount_in_raw) rather than MAX_UINT256 so
    #    that any un-executed allowance doesn't persist on-chain.
    # ------------------------------------------------------------------
    is_native_eth = (
        addr_in.lower() == WETH.lower()
        and token_in_info.get("address") == "native"
    )

    calls: list[dict] = []

    from services.uniswap import (
        SELECTOR_APPROVE,
        SELECTOR_EXACT_INPUT_SINGLE,
        _encode_address as _enc_addr,
        _encode_uint24,
        _encode_uint160,
        _encode_uint256 as _enc_u256,
    )

    if not is_native_eth:
        # ERC-20 input: include approve call in the batch.
        # Use a finite approval (amount_in_raw) so no residual allowance remains
        # on-chain after the UserOp executes.
        approve_data = (
            "0x"
            + SELECTOR_APPROVE
            + _enc_addr(UNISWAP_SWAP_ROUTER_02)
            + _enc_u256(amount_in_raw)
        )
        calls.append({
            "to": addr_in,
            "value": 0,
            "data": approve_data,
        })

    # Swap call — encode exactInputSingle calldata directly so we get a raw
    # Call dict without needing the async build_swap_tx helper.
    eth_value_for_swap = amount_in_raw if is_native_eth else 0
    swap_data = (
        "0x"
        + SELECTOR_EXACT_INPUT_SINGLE
        + _enc_addr(addr_in)
        + _enc_addr(addr_out)
        + _encode_uint24(3000)          # default 0.3% pool fee tier
        + _enc_addr(body.recipient)     # output tokens go to the user's EOA
        + _enc_u256(amount_in_raw)
        + _enc_u256(amount_out_min)
        + _encode_uint160(0)            # sqrtPriceLimitX96 = 0 (no limit)
    )
    calls.append({
        "to": UNISWAP_SWAP_ROUTER_02,
        "value": eth_value_for_swap,
        "data": swap_data,
    })

    # ------------------------------------------------------------------
    # 6. Build gasless trade package (UserOp + paymaster data)
    # ------------------------------------------------------------------
    try:
        gasless = await build_gasless_trade(
            user_address=body.recipient,
            calls=calls,
            chain_id=1,
        )
    except ValueError as exc:
        # PIMLICO_API_KEY not set or similar configuration error
        raise HTTPException(
            503,
            detail=(
                f"Gasless mode unavailable: {exc}. "
                "Use /trade/quote for a standard ETH-gas transaction."
            ),
        )
    except Exception as exc:
        logger.exception("build_gasless_trade failed")
        raise HTTPException(
            503,
            detail=(
                f"Failed to build gasless trade: {exc}. "
                "Use /trade/quote for a standard ETH-gas transaction."
            ),
        )

    # ------------------------------------------------------------------
    # 7. Persist quote and trade record
    # ------------------------------------------------------------------
    quote_id = str(uuid.uuid4())
    expires_at = datetime.fromtimestamp(
        time.time() + QUOTE_TTL_SECONDS, tz=timezone.utc
    ).isoformat()

    asset_symbol_for_record = token_out_symbol if side == "buy" else token_in_symbol
    asset_name_for_record = (
        token_out_info["name"] if side == "buy" else token_in_info["name"]
    )

    trade_id = await save_quoted_trade(
        user_id=user_id,
        asset=asset_name_for_record,
        symbol=asset_symbol_for_record,
        side=side,
        amount=body.amount,
        amount_type=body.amount_type,
        total_usd=body.amount if body.amount_type == "usd" else 0.0,
        guardrail_result=guardrail_result,
    )

    quote_data = {
        "quote_id": quote_id,
        "trade_id": trade_id,
        "user_id": user_id,
        "token_in_symbol": token_in_symbol,
        "token_out_symbol": token_out_symbol,
        "token_in_address": addr_in,
        "token_out_address": addr_out,
        "amount_in_raw": amount_in_raw,
        "amount_out": amount_out,
        "amount_out_min": amount_out_min,
        "amount_in_human": amount_in_human,
        "amount_out_human": amount_out_human,
        "slippage": body.slippage,
        "recipient": body.recipient,
        "guardrail_result": guardrail_result,
        "broadcast_mode": "bundler",
        "gasless": gasless,
    }
    _store_quote(quote_id, quote_data)

    return GaslessQuoteResponse(
        quote_id=quote_id,
        token_in={
            "symbol": token_in_symbol,
            "address": addr_in,
            "decimals": decimals_in,
        },
        token_out={
            "symbol": token_out_symbol,
            "address": addr_out,
            "decimals": decimals_out,
        },
        amount_in=f"{amount_in_human}",
        amount_out=f"{amount_out_human:.8f}".rstrip("0").rstrip("."),
        user_operation=gasless["user_operation"],
        eip7702_auth=gasless["eip7702_auth"],
        entrypoint=gasless["entrypoint"],
        bundler_url=gasless["bundler_url"],
        paymaster_mode=gasless["paymaster_mode"],
        gas_estimate_usdc=gasless["gas_estimate_usdc"],
        expires_at=expires_at,
    )


@router.get("/trade/status/{trade_id}")
async def trade_status(
    trade_id: str,
    user_id: str = Depends(get_current_user),
):
    """
    Check the status of a trade.

    Returns the current status (quoted/pending/confirmed/failed)
    and the transaction hash if available.
    """
    from db.firestore import get_firestore

    db = get_firestore()
    doc_ref = (
        db.collection("users").document(user_id)
        .collection("trades").document(trade_id)
    )
    snapshot = await doc_ref.get()

    if not snapshot.exists:
        raise HTTPException(404, detail="Trade not found.")

    trade = snapshot.to_dict()

    # If trade is pending, check on-chain status
    if trade.get("status") == "pending" and trade.get("tx_hash"):
        try:
            receipt = await _rpc_call(
                "eth_getTransactionReceipt", [trade["tx_hash"]]
            )
            if receipt is not None:
                status_code = int(receipt.get("status", "0x0"), 16)
                new_status = "confirmed" if status_code == 1 else "failed"
                await update_trade_status(user_id, trade_id, new_status)
                trade["status"] = new_status
        except Exception:
            logger.debug("Failed to check tx receipt for %s", trade.get("tx_hash"))

    return {
        "trade_id": trade_id,
        "status": trade.get("status", "unknown"),
        "tx_hash": trade.get("tx_hash", ""),
        "symbol": trade.get("symbol", ""),
        "side": trade.get("side", ""),
        "asset": trade.get("asset", ""),
        "amount": trade.get("amount"),
        "amount_type": trade.get("amount_type"),
        "created_at": trade.get("created_at", ""),
    }
