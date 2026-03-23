"""
AI Chat Service — OpenAI GPT-4o-mini with function calling.

Handles:
  - Streaming chat responses via SSE
  - Function calling for trade intent parsing, price queries, portfolio queries
  - Trade intent resolution via xStock resolver
  - Guardrail validation on every parsed trade
  - Conversation history persistence in Firestore
"""

from __future__ import annotations

import json
import logging
import os
from typing import AsyncGenerator

from openai import AsyncOpenAI

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

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OpenAI client
# ---------------------------------------------------------------------------

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY environment variable is not set.")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """\
You are Merlin, an AI trading assistant for a privacy-preserving non-custodial Ethereum wallet.
You help users trade tokenized stock tracker certificates (xStocks) and crypto on Ethereum.

When a user wants to trade, extract the intent and call the parse_trade_intent function.
When a user asks about prices, call the get_price function.
When a user asks about their portfolio, call the get_portfolio function.

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
        "type": "function",
        "function": {
            "name": "parse_trade_intent",
            "description": "Parse a user's trade request into a structured intent. Call this when the user wants to buy or sell an asset.",
            "parameters": {
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
    },
    {
        "type": "function",
        "function": {
            "name": "get_price",
            "description": "Get the current price of an asset. Call this when the user asks about a price.",
            "parameters": {
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
    },
    {
        "type": "function",
        "function": {
            "name": "get_portfolio",
            "description": "Get the user's current portfolio and positions. Call this when the user asks about their portfolio, balance, or holdings.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
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

    # Build message history for OpenAI
    history = await _build_openai_messages(user_id, conversation_id)

    try:
        # First call: may produce text or a function call
        response = await client.chat.completions.create(
            model=MODEL,
            messages=history,
            tools=TOOLS,
            tool_choice="auto",
            stream=True,
        )

        collected_text = ""
        tool_calls_data: dict[int, dict] = {}

        async for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta is None:
                continue

            finish_reason = chunk.choices[0].finish_reason

            # Stream text content
            if delta.content:
                collected_text += delta.content
                yield _sse({"type": "text", "content": delta.content})

            # Accumulate tool call fragments
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_data:
                        tool_calls_data[idx] = {
                            "id": tc.id or "",
                            "name": tc.function.name or "" if tc.function else "",
                            "arguments": "",
                        }
                    if tc.id:
                        tool_calls_data[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls_data[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_data[idx]["arguments"] += tc.function.arguments

            # Handle finish
            if finish_reason == "tool_calls":
                # Process each tool call
                for idx in sorted(tool_calls_data.keys()):
                    tc_info = tool_calls_data[idx]
                    async for event in _handle_tool_call(
                        client, user_id, conversation_id, history,
                        tc_info, collected_text,
                    ):
                        yield event
                # Reset for potential continuation
                collected_text = ""
                tool_calls_data = {}

            elif finish_reason == "stop":
                # Save assistant response
                if collected_text.strip():
                    await add_message(
                        user_id, conversation_id,
                        role="assistant", content=collected_text,
                    )

    except Exception as e:
        logger.exception("Chat error for user %s", user_id)
        yield _sse({"type": "error", "content": f"An error occurred: {str(e)}"})

    yield _sse({"type": "done", "conversation_id": conversation_id})


# ---------------------------------------------------------------------------
# Tool call handling
# ---------------------------------------------------------------------------


async def _handle_tool_call(
    client: AsyncOpenAI,
    user_id: str,
    conversation_id: str,
    history: list[dict],
    tool_call: dict,
    preceding_text: str,
) -> AsyncGenerator[str, None]:
    """Handle a single function call from the model."""
    name = tool_call["name"]
    call_id = tool_call["id"]

    try:
        args = json.loads(tool_call["arguments"]) if tool_call["arguments"] else {}
    except json.JSONDecodeError:
        yield _sse({"type": "error", "content": f"Failed to parse function arguments for {name}."})
        return

    logger.info("Tool call: %s(%s)", name, json.dumps(args))

    if name == "parse_trade_intent":
        async for event in _handle_trade_intent(
            client, user_id, conversation_id, history, call_id, args,
        ):
            yield event

    elif name == "get_price":
        async for event in _handle_get_price(
            client, user_id, conversation_id, history, call_id, args,
        ):
            yield event

    elif name == "get_portfolio":
        async for event in _handle_get_portfolio(
            client, user_id, conversation_id, history, call_id, args,
        ):
            yield event

    else:
        yield _sse({"type": "error", "content": f"Unknown function: {name}"})


async def _handle_trade_intent(
    client: AsyncOpenAI,
    user_id: str,
    conversation_id: str,
    history: list[dict],
    call_id: str,
    args: dict,
) -> AsyncGenerator[str, None]:
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
        tool_result = json.dumps({
            "error": "asset_not_found",
            "message": f"Could not find an asset matching '{asset_query}'.",
            "suggestions": alternatives,
        })
        async for event in _send_tool_result(
            client, user_id, conversation_id, history, call_id,
            "parse_trade_intent", args, tool_result,
        ):
            yield event
        return

    # If ambiguous (low confidence), ask for clarification
    if confidence < 0.8 and alternatives:
        alt_names = ", ".join(alternatives)
        tool_result = json.dumps({
            "error": "ambiguous_asset",
            "message": f"'{asset_query}' is ambiguous. Did you mean one of: {alt_names}?",
            "alternatives": alternatives,
            "confidence": confidence,
        })
        async for event in _send_tool_result(
            client, user_id, conversation_id, history, call_id,
            "parse_trade_intent", args, tool_result,
        ):
            yield event
        return

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
        tool_result = json.dumps({
            "error": "guardrail_blocked",
            "message": guardrail_result["reason"],
            "checks": guardrail_result["checks"],
        })
        async for event in _send_tool_result(
            client, user_id, conversation_id, history, call_id,
            "parse_trade_intent", args, tool_result,
        ):
            yield event
        return

    # Guardrails passed — attempt to get a real Uniswap quote
    uniswap_quote = None
    quote_error = None
    estimated_output = None
    estimated_output_symbol = None

    try:
        # Determine swap pair: buying an asset means USDC -> asset,
        # selling means asset -> USDC
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

        # Determine decimals for input token
        decimals_in = await get_token_decimals(addr_in)
        decimals_out = await get_token_decimals(addr_out)

        # Convert amount to smallest unit
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

    yield _sse({"type": "trade_intent", "data": trade_data})

    # Send result back to the model for a confirmation message
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

    tool_result = json.dumps(tool_result_data)

    async for event in _send_tool_result(
        client, user_id, conversation_id, history, call_id,
        "parse_trade_intent", args, tool_result,
    ):
        yield event


async def _handle_get_price(
    client: AsyncOpenAI,
    user_id: str,
    conversation_id: str,
    history: list[dict],
    call_id: str,
    args: dict,
) -> AsyncGenerator[str, None]:
    """Handle price query."""
    asset_query = args.get("asset", "")
    resolution = resolve_token(asset_query)
    matched_token = resolution.get("match")

    if not matched_token:
        tool_result = json.dumps({
            "error": "asset_not_found",
            "message": f"Could not find an asset matching '{asset_query}'.",
        })
    else:
        # Price data is not available yet — return a clear message
        tool_result = json.dumps({
            "asset": matched_token["name"],
            "symbol": matched_token["symbol"],
            "error": "price_unavailable",
            "message": f"Real-time price data for {matched_token['name']} ({matched_token['symbol']}) is not available yet. Price feeds will be integrated with the Uniswap V3 oracle.",
        })

    async for event in _send_tool_result(
        client, user_id, conversation_id, history, call_id,
        "get_price", args, tool_result,
    ):
        yield event


async def _handle_get_portfolio(
    client: AsyncOpenAI,
    user_id: str,
    conversation_id: str,
    history: list[dict],
    call_id: str,
    args: dict,
) -> AsyncGenerator[str, None]:
    """Handle portfolio query."""
    # Portfolio data requires on-chain balance reads — not available yet
    tool_result = json.dumps({
        "error": "portfolio_unavailable",
        "message": "Portfolio data is not available yet. On-chain balance reading will be integrated with the wallet module.",
    })

    async for event in _send_tool_result(
        client, user_id, conversation_id, history, call_id,
        "get_portfolio", args, tool_result,
    ):
        yield event


# ---------------------------------------------------------------------------
# Send tool result back to the model and stream the response
# ---------------------------------------------------------------------------


async def _send_tool_result(
    client: AsyncOpenAI,
    user_id: str,
    conversation_id: str,
    history: list[dict],
    call_id: str,
    function_name: str,
    function_args: dict,
    result: str,
) -> AsyncGenerator[str, None]:
    """
    Send a tool result back to OpenAI and stream the model's follow-up response.
    """
    # Build updated message list with the assistant's tool call and our result
    updated = list(history)
    updated.append({
        "role": "assistant",
        "tool_calls": [
            {
                "id": call_id,
                "type": "function",
                "function": {
                    "name": function_name,
                    "arguments": json.dumps(function_args),
                },
            }
        ],
    })
    updated.append({
        "role": "tool",
        "tool_call_id": call_id,
        "content": result,
    })

    response = await client.chat.completions.create(
        model=MODEL,
        messages=updated,
        stream=True,
    )

    collected = ""
    async for chunk in response:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            collected += delta.content
            yield _sse({"type": "text", "content": delta.content})

    # Save assistant response
    if collected.strip():
        await add_message(
            user_id, conversation_id,
            role="assistant", content=collected,
            metadata={"function_call": function_name},
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _build_openai_messages(user_id: str, conversation_id: str) -> list[dict]:
    """
    Build the OpenAI messages array from conversation history.

    Includes the system prompt and up to 50 recent messages.
    """
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
    ]

    stored = await get_messages(user_id, conversation_id, limit=50)
    for msg in stored:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant", "system"):
            messages.append({"role": role, "content": content})

    return messages


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"
