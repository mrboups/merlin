"""
AI Chat Service — Anthropic Claude Haiku with tool use.

Handles:
  - Streaming chat responses via SSE
  - Tool use for trade intent parsing, price queries, portfolio queries
  - Trade intent resolution via xStock resolver
  - Guardrail validation on every parsed trade
  - Conversation history persistence in Firestore
"""

from __future__ import annotations

import json
import logging
import os
from typing import AsyncGenerator

import anthropic

from db.conversations import add_message, create_conversation, get_messages
from db.trades import save_quoted_trade
from services.guardrails import validate_trade
from services.uniswap import (
    WETH,
    get_quote as uniswap_get_quote,
    get_token_decimals,
    is_placeholder_address,
    resolve_swap_addresses,
)
from services.xstock import CRYPTO_ASSETS, list_all_assets, resolve_token
from services.prices import get_token_price, is_xstock
from services.balances import get_all_balances
from db.users import get_user_by_id

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Anthropic client
# ---------------------------------------------------------------------------

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY environment variable is not set.")
        _client = anthropic.AsyncAnthropic(api_key=api_key)
    return _client


MODEL = "claude-haiku-4-5-20251001"

SYSTEM_PROMPT = """\
You are Merlin, an AI trading assistant for a privacy-preserving non-custodial Ethereum wallet.
You help users trade tokenized stock tracker certificates (xStocks) and crypto on Ethereum.

When a user wants to trade, extract the intent and call the parse_trade_intent tool.
When a user asks about prices, call the get_price tool.
When a user asks about their portfolio, call the get_portfolio tool.

Important rules:
- Be concise, helpful, and never give financial advice.
- Always confirm trades before execution — show the user what will happen.
- xStocks are tracker certificates, NOT actual shares. Never say "shares" or "stock ownership".
- Available xStock assets include: xTSLA (Tesla), xAAPL (Apple), xGOOG (Alphabet), \
xAMZN (Amazon), xMSFT (Microsoft), xNVDA (NVIDIA), xMETA (Meta), xNFLX (Netflix), \
xCOIN (Coinbase), xPLTR (Palantir), xGME (GameStop), xSPY (S&P 500), xQQQ (Nasdaq 100), \
xGLD (Gold), and 50+ more.
- Crypto assets: ETH, USDC, USDT, WETH.
- xStocks are NOT available to US persons or sanctioned countries.
- If the user's request is ambiguous, ask for clarification.
- If the user doesn't specify an amount, ask for the amount.
"""

TOOLS = [
    {
        "name": "parse_trade_intent",
        "description": "Parse a user's trade request into a structured intent. Call this when the user wants to buy or sell an asset.",
        "input_schema": {
            "type": "object",
            "properties": {
                "side": {
                    "type": "string",
                    "enum": ["buy", "sell"],
                    "description": "Whether the user wants to buy or sell.",
                },
                "asset": {
                    "type": "string",
                    "description": "The asset name or symbol (e.g., Tesla, TSLA, xTSLA, ETH).",
                },
                "amount": {
                    "type": "number",
                    "description": "Dollar amount or token quantity.",
                },
                "amount_type": {
                    "type": "string",
                    "enum": ["usd", "quantity"],
                    "description": "Whether the amount is in USD or token quantity.",
                },
            },
            "required": ["side", "asset", "amount", "amount_type"],
        },
    },
    {
        "name": "get_price",
        "description": "Get the current price of an asset. Call this when the user asks about a price.",
        "input_schema": {
            "type": "object",
            "properties": {
                "asset": {
                    "type": "string",
                    "description": "The asset name or symbol.",
                },
            },
            "required": ["asset"],
        },
    },
    {
        "name": "get_portfolio",
        "description": "Get the user's current portfolio and positions. Call this when the user asks about their portfolio, balance, or holdings.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
]


# ---------------------------------------------------------------------------
# Main chat function (streaming SSE)
# ---------------------------------------------------------------------------


async def chat(
    user_id: str,
    message: str,
    conversation_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Process a user message and yield Server-Sent Event strings.

    Event types:
      - {"type": "text", "content": "..."}         — AI text chunk
      - {"type": "trade_intent", "data": {...}}     — parsed & validated trade
      - {"type": "error", "content": "..."}         — error message
      - {"type": "done", "conversation_id": "..."}  — stream complete

    Yields SSE-formatted strings: "data: {json}\n\n"
    """
    client = _get_client()

    # Create or load conversation
    if not conversation_id:
        conv = await create_conversation(user_id, first_message=message)
        conversation_id = conv["id"]

    # Persist user message
    await add_message(user_id, conversation_id, role="user", content=message)

    # Build message history for Claude
    messages = await _build_claude_messages(user_id, conversation_id)

    try:
        # Agentic loop: keep calling Claude until no more tool use
        while True:
            collected_text = ""
            tool_use_blocks: list[dict] = []

            async with client.messages.stream(
                model=MODEL,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                messages=messages,
                tools=TOOLS,
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            tool_use_blocks.append({
                                "id": event.content_block.id,
                                "name": event.content_block.name,
                                "input_json": "",
                            })
                    elif event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            collected_text += event.delta.text
                            yield _sse({"type": "text", "content": event.delta.text})
                        elif event.delta.type == "input_json_delta":
                            if tool_use_blocks:
                                tool_use_blocks[-1]["input_json"] += event.delta.partial_json

            # If no tool use, we're done
            if not tool_use_blocks:
                if collected_text.strip():
                    await add_message(
                        user_id, conversation_id,
                        role="assistant", content=collected_text,
                    )
                break

            # Build the assistant message with all content blocks
            assistant_content = []
            if collected_text:
                assistant_content.append({"type": "text", "text": collected_text})
            for tb in tool_use_blocks:
                try:
                    tool_input = json.loads(tb["input_json"]) if tb["input_json"] else {}
                except json.JSONDecodeError:
                    tool_input = {}
                assistant_content.append({
                    "type": "tool_use",
                    "id": tb["id"],
                    "name": tb["name"],
                    "input": tool_input,
                })

            messages.append({"role": "assistant", "content": assistant_content})

            # Process each tool call and build tool results
            tool_results = []
            for tb in tool_use_blocks:
                try:
                    tool_input = json.loads(tb["input_json"]) if tb["input_json"] else {}
                except json.JSONDecodeError:
                    tool_input = {}

                result, events = await _handle_tool_call(
                    user_id, conversation_id, tb["name"], tb["id"], tool_input,
                )
                for ev in events:
                    yield ev

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb["id"],
                    "content": result,
                })

            messages.append({"role": "user", "content": tool_results})

            # Continue the loop — Claude will respond to the tool results

    except Exception as e:
        logger.exception("Chat error for user %s", user_id)
        yield _sse({"type": "error", "content": f"An error occurred: {str(e)}"})

    yield _sse({"type": "done", "conversation_id": conversation_id})


# ---------------------------------------------------------------------------
# Tool call handling
# ---------------------------------------------------------------------------


async def _handle_tool_call(
    user_id: str,
    conversation_id: str,
    name: str,
    call_id: str,
    args: dict,
) -> tuple[str, list[str]]:
    """
    Handle a single tool call. Returns (result_string, list_of_sse_events).
    """
    events: list[str] = []

    if name == "parse_trade_intent":
        result = await _handle_trade_intent(user_id, conversation_id, args, events)
    elif name == "get_price":
        result = await _handle_get_price(args)
    elif name == "get_portfolio":
        result = await _handle_get_portfolio(user_id)
    else:
        result = json.dumps({"error": f"Unknown tool: {name}"})

    return result, events


async def _handle_trade_intent(
    user_id: str,
    conversation_id: str,
    args: dict,
    events: list[str],
) -> str:
    """Resolve token, run guardrails, return trade confirmation."""
    side = args.get("side", "buy")
    asset_query = args.get("asset", "")
    amount = args.get("amount", 0)
    amount_type = args.get("amount_type", "usd")

    # Resolve the asset via xStock resolver
    resolution = resolve_token(asset_query)
    matched_token = resolution.get("match")
    confidence = resolution.get("confidence", 0)
    alternatives = resolution.get("alternatives", [])

    if not matched_token:
        return json.dumps({
            "error": "asset_not_found",
            "message": f"Could not find an asset matching '{asset_query}'.",
            "suggestions": alternatives,
        })

    # If ambiguous (low confidence), ask for clarification
    if confidence < 0.8 and alternatives:
        alt_names = ", ".join(alternatives)
        return json.dumps({
            "error": "ambiguous_asset",
            "message": f"'{asset_query}' is ambiguous. Did you mean one of: {alt_names}?",
            "alternatives": alternatives,
            "confidence": confidence,
        })

    symbol = matched_token["symbol"]
    asset_name = matched_token["name"]

    # Build intent for guardrails
    intent = {
        "side": side,
        "asset": symbol,
        "resolved_symbol": symbol,
        "amount": amount,
        "amount_type": amount_type,
    }

    # Run guardrails
    guardrail_result = await validate_trade(user_id, intent)

    if not guardrail_result["approved"]:
        return json.dumps({
            "error": "guardrail_blocked",
            "message": guardrail_result["reason"],
            "checks": guardrail_result["checks"],
        })

    # Guardrails passed — attempt to get a real Uniswap quote
    uniswap_quote = None
    quote_error = None
    estimated_output = None
    estimated_output_symbol = None

    try:
        _crypto_by_symbol = {a["symbol"].upper(): a for a in CRYPTO_ASSETS}

        if side == "buy":
            token_in_info = _crypto_by_symbol.get("USDC", {})
            token_out_info = matched_token
            token_in_sym = "USDC"
            token_out_sym = symbol
        else:
            token_in_info = matched_token
            token_out_info = _crypto_by_symbol.get("USDC", {})
            token_in_sym = symbol
            token_out_sym = "USDC"

        addr_in, addr_out = resolve_swap_addresses(
            token_in_sym, token_out_sym, token_in_info, token_out_info,
        )

        decimals_in = await get_token_decimals(addr_in)
        decimals_out = await get_token_decimals(addr_out)

        if amount_type == "usd":
            amount_in_raw = int(amount * (10 ** decimals_in))
        else:
            amount_in_raw = int(amount * (10 ** decimals_in))

        if amount_in_raw > 0:
            uniswap_quote = await uniswap_get_quote(
                token_in=addr_in,
                token_out=addr_out,
                amount_in=amount_in_raw,
            )
            if uniswap_quote and uniswap_quote["amount_out"] > 0:
                estimated_output = uniswap_quote["amount_out"] / (10 ** decimals_out)
                estimated_output_symbol = token_out_sym

    except ValueError as e:
        quote_error = str(e)
        logger.info("Uniswap quote skipped: %s", e)
    except Exception as e:
        quote_error = f"Quote unavailable: {e}"
        logger.warning("Uniswap quote failed: %s", e)

    # Create a quoted trade record
    total_usd = amount if amount_type == "usd" else 0.0
    trade_id = await save_quoted_trade(
        user_id=user_id,
        asset=asset_name,
        symbol=symbol,
        side=side,
        amount=amount,
        amount_type=amount_type,
        total_usd=total_usd,
        conversation_id=conversation_id,
        guardrail_result=guardrail_result,
    )

    # Emit structured trade intent event with quote data
    trade_data = {
        "trade_id": trade_id,
        "side": side,
        "asset": asset_name,
        "symbol": symbol,
        "amount": amount,
        "amount_type": amount_type,
        "guardrails": guardrail_result,
    }
    if estimated_output is not None:
        trade_data["estimated_output"] = estimated_output
        trade_data["estimated_output_symbol"] = estimated_output_symbol
    if quote_error:
        trade_data["quote_note"] = quote_error

    events.append(_sse({"type": "trade_intent", "data": trade_data}))

    # Build tool result for Claude
    amount_display = f"${amount:,.2f}" if amount_type == "usd" else f"{amount} tokens"
    tool_result_data = {
        "success": True,
        "trade_id": trade_id,
        "side": side,
        "asset": asset_name,
        "symbol": symbol,
        "amount": amount,
        "amount_type": amount_type,
        "amount_display": amount_display,
        "guardrails_passed": True,
        "status": "quoted",
    }

    if estimated_output is not None:
        output_display = f"{estimated_output:.6f}".rstrip("0").rstrip(".")
        tool_result_data["estimated_output"] = f"{output_display} {estimated_output_symbol}"
        tool_result_data["note"] = (
            f"Estimated to receive ~{output_display} {estimated_output_symbol}. "
            "Ask the user to confirm before proceeding. "
            "The frontend will handle signing and submission."
        )
    elif quote_error:
        tool_result_data["note"] = (
            f"Quote not available: {quote_error}. "
            "The trade has been recorded but cannot be executed on-chain yet."
        )
    else:
        tool_result_data["note"] = (
            "Trade quoted. The frontend will handle signing and submission via /trade/quote."
        )

    return json.dumps(tool_result_data)


async def _handle_get_price(args: dict) -> str:
    """Handle price query."""
    asset_query = args.get("asset", "")
    resolution = resolve_token(asset_query)
    matched_token = resolution.get("match")

    if not matched_token:
        return json.dumps({
            "error": "asset_not_found",
            "message": f"Could not find an asset matching '{asset_query}'.",
        })

    symbol = matched_token["symbol"]
    backed_ticker = matched_token.get("backed_ticker", "")
    price_symbol = backed_ticker if backed_ticker and is_xstock(backed_ticker) else symbol

    try:
        price = await get_token_price(price_symbol)
        if price is not None:
            return json.dumps({
                "asset": matched_token["name"],
                "symbol": symbol,
                "price_usd": round(price, 2),
                "source": "backed_finance" if is_xstock(price_symbol) else "coinmarketcap",
            })
        else:
            return json.dumps({
                "asset": matched_token["name"],
                "symbol": symbol,
                "error": "price_unavailable",
                "message": f"Price data for {matched_token['name']} ({symbol}) is temporarily unavailable.",
            })
    except Exception as e:
        logger.warning("Price fetch failed for %s: %s", symbol, e)
        return json.dumps({
            "asset": matched_token["name"],
            "symbol": symbol,
            "error": "price_error",
            "message": f"Could not fetch price for {matched_token['name']}: {e}",
        })


async def _handle_get_portfolio(user_id: str) -> str:
    """Handle portfolio query — fetches real on-chain balances and live prices."""
    try:
        user = await get_user_by_id(user_id)
        address = user.get("address", "") if user else ""

        if not address:
            return json.dumps({
                "total_value": 0,
                "positions": [],
                "message": "No wallet address found. Create or import a wallet first.",
            })

        known_tokens = [
            {"symbol": "USDC", "name": "USD Coin", "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "decimals": 6},
            {"symbol": "USDT", "name": "Tether", "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7", "decimals": 6},
            {"symbol": "WETH", "name": "Wrapped Ether", "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "decimals": 18},
        ]

        balances = await get_all_balances(address, known_tokens)

        if not balances:
            return json.dumps({
                "address": address,
                "total_value": 0,
                "positions": [],
                "message": "No token balances found for this wallet.",
            })

        from services.prices import get_prices_batch

        symbols = [b["symbol"] for b in balances]
        prices = await get_prices_batch(symbols)

        positions = []
        total_value = 0.0
        for bal in balances:
            sym = bal["symbol"]
            qty = bal["balance"]
            price = prices.get(sym)
            value = round(qty * price, 2) if price else None
            positions.append({
                "asset": bal["name"],
                "symbol": sym,
                "quantity": round(qty, 8),
                "price_usd": round(price, 2) if price else None,
                "value": value,
            })
            if value:
                total_value += value

        return json.dumps({
            "address": address,
            "total_value": round(total_value, 2),
            "positions": positions,
        })

    except Exception as e:
        logger.warning("Portfolio fetch failed for user %s: %s", user_id, e)
        return json.dumps({
            "error": "portfolio_error",
            "message": f"Could not fetch portfolio: {e}",
        })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _build_claude_messages(user_id: str, conversation_id: str) -> list[dict]:
    """
    Build the Claude messages array from conversation history.

    Includes up to 50 recent messages. System prompt is passed separately.
    """
    messages: list[dict] = []

    stored = await get_messages(user_id, conversation_id, limit=50)
    for msg in stored:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": content})

    return messages


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"
