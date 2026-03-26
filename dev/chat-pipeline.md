# Chat Pipeline

## Overview
Merlin's AI chat uses Claude Haiku with tool use to parse natural language into structured trade intents. Responses stream via Server-Sent Events (SSE).

## Message Flow
```
User types "buy $50 of Tesla"
    |
POST /api/v1/chat {message, conversation_id}
    |
Backend loads conversation history from Firestore
    |
Sends to Claude with system prompt + 3 function tools
    |
Claude streams response chunks via SSE:
  1. If function call detected:
     a. parse_trade_intent -> {side: "buy", asset: "Tesla", amount: 50, amount_type: "usd"}
     b. xStock resolver -> xTSLA (contract: 0x8ad3c73f...)
     c. Guardrails -> 8 safety checks (all pass)
     d. Uniswap V3 quote -> price, amount_out, gas estimate
     e. Trade saved to Firestore as "quoted"
     f. SSE: {"type": "trade_intent", "data": {...quote details...}}
  2. AI generates confirmation text
     SSE: {"type": "text", "content": "I can buy..."}
  3. Stream ends
     SSE: {"type": "done", "conversation_id": "..."}
```

## Claude Function Tools
1. **parse_trade_intent** — extracts: side (buy/sell), asset (name/ticker), amount (number), amount_type (usd/quantity)
2. **get_price** — fetches current price for any asset
3. **get_portfolio** — returns user's current holdings

## System Prompt
Defines Merlin as an AI trading assistant. Key rules:
- Be concise, never give financial advice
- Always confirm trades before execution
- xStocks are tracker certificates, NOT shares
- Lists available assets (xTSLA, xAAPL, etc.)
- US persons and sanctioned countries blocked
- Ask for clarification on ambiguous requests

## SSE Event Types
| Type | Description |
|------|-------------|
| text | AI response text chunk |
| trade_intent | Parsed trade with quote data |
| price | Price query result |
| portfolio | Portfolio data |
| error | Error message |
| done | Stream complete |

## Conversation Management
- Sessions: create, list, switch between conversations
- History: load/clear messages for a conversation
- Persistence: all messages stored in Firestore
- AI model preference: stored per user (GET/PATCH /chat/provider)

## Key Files
| File | Purpose |
|------|---------|
| backend/services/chat.py | Claude streaming, tool use, intent processing |
| backend/routers/chat.py | 8 chat + 1 market endpoint |
| backend/db/conversations.py | Conversation persistence |
| frontend/app/chat/page.tsx | Chat UI (messages, voice, TTS, trade cards) |
