# Trading Engine

## Status: Live (quoting + confirmation) | In Progress (on-chain execution)

## Overview

The trading engine executes token swaps on Uniswap V3 (Ethereum mainnet) using a six-step pipeline: quote, simulate, policy guardrails, execute, confirm, and persist. The backend is strictly non-custodial — it builds and returns unsigned transactions to the frontend for signing; private keys never leave the client. Two execution paths exist: a standard ETH-gas path and a gasless path (EIP-7702 + ERC-4337 + AmbirePaymaster) that pays gas in USDC via a Pimlico bundler.

## Architecture

### Six-Step Pipeline

```
1. Quote      — QuoterV2.quoteExactInputSingle via eth_call (on-chain, no LP fees charged)
2. Simulate   — Guardrails validation (8 checks), allowance check, amount sanity check
3. Policy     — validate_trade() in services/guardrails.py (all 8 checks must pass)
4. Execute    — Build unsigned tx (standard) or PackedUserOperation (gasless); return to frontend
5. Confirm    — Frontend broadcasts; calls POST /trade/confirm with tx_hash; backend monitors receipt
6. Persist    — Firestore: users/{uid}/trades document created at quote time, updated on confirmation
```

### Execution Modes

| Mode | Path | Gas Payment | Broadcast |
|------|------|-------------|-----------|
| Standard | SwapRouter02.exactInputSingle | ETH (user signs EOA tx) | Frontend via eth_sendRawTransaction |
| Gasless | AmbireAccount7702.executeBySender + EntryPoint | USDC debited via AmbirePaymaster | Frontend via eth_sendUserOperation to Pimlico bundler |

### Standard Flow

```
POST /trade/quote
  resolve tokens → validate guardrails → get Uniswap quote → check allowance
  → build approval_tx (if needed) + swap_tx (unsigned)
  → store quote in memory (5-min TTL) → save "quoted" trade to Firestore
  → return QuoteResponse

Frontend:
  sign + broadcast approval_tx (if needed) → sign + broadcast swap_tx

POST /trade/confirm
  look up quote_id → update Firestore trade status to "pending" + set tx_hash

GET /trade/status/{id}
  if pending: fetch eth_getTransactionReceipt → update to "confirmed" or "failed"
```

### Gasless Flow

```
POST /trade/quote-gasless
  resolve tokens → validate guardrails → get Uniswap quote
  → build calls: [approve(token_in → router, amount_in_raw), exactInputSingle]
  → encode executeBySender(calls) calldata
  → get EntryPoint nonce → fetch EIP-1559 gas prices
  → assemble PackedUserOperation (ERC-4337 v0.7)
  → call Ambire paymaster relay for paymasterData
  → call Pimlico bundler eth_estimateUserOperationGas
  → return GaslessQuoteResponse with user_operation + eip7702_auth

Frontend:
  sign EIP-7702 authorization (first delegation only)
  → sign UserOp hash with EOA key
  → submit eth_sendUserOperation to bundler_url
```

## Implementation Details

### Uniswap V3 Integration

All contract interactions use raw ABI encoding (no web3py / eth-abi dependency). Function selectors are pre-computed constants. RPC calls go through `services/provider.py`.

- **QuoterV2**: `quoteExactInputSingle` called via `eth_call` — returns `(amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate)`. Uses `sqrtPriceLimitX96 = 0` (no price limit).
- **SwapRouter02**: `exactInputSingle` with `ExactInputSingleParams` struct. Deadline defaults to `now + 20 minutes` (production target is `block.timestamp + 300` per the agent spec). Gas estimate adds a 20% buffer.
- **Fee tier**: 0.3% (3000) used as default for all quotes and gasless batch calls. Multi-hop and alternative fee tier routing is not yet implemented.
- **ETH input**: Detected when `token_in.address == "native"`. WETH address is substituted for the contract call; `tx.value` is set to `amount_in` so the router handles wrapping automatically.
- **Approvals (standard)**: Checks current allowance via `allowance(owner, spender)` eth_call before deciding whether to include an approval transaction. Uses `MAX_UINT256` for the approval amount in standard mode.
- **Approvals (gasless)**: Always includes a finite approval (`amount_in_raw`) in the batch to avoid residual on-chain allowance. The approve and swap execute atomically inside `executeBySender`.

### Gasless Mode (EIP-7702 + ERC-4337 v0.7)

Implemented in `services/eip7702.py`. All ABI encoding is manual hex.

- **AmbireAccount7702**: The user's EOA delegates to this contract via an EIP-7702 Type 4 authorization (signed once; reused on subsequent trades). `executeBySender((address,uint256,bytes)[])` selector `0xabc5345e` executes the call batch.
- **PackedUserOperation layout**: `accountGasLimits = verificationGasLimit[16] ++ callGasLimit[16]`; `gasFees = maxPriorityFeePerGas[16] ++ maxFeePerGas[16]`; `paymasterAndData = paymaster[20] ++ pvgl[16] ++ ppgl[16] ++ paymasterData`.
- **Gas defaults** (used when bundler estimation unavailable): callGasLimit 300k, verificationGasLimit 150k, paymasterVerificationGasLimit 42k, paymasterPostOpGasLimit 0, preVerificationGas 50k.
- **Paymaster relay**: `https://relayer.ambire.com`. Requires `PIMLICO_API_KEY` and `PIMLICO_POLICY_ID` env vars.
- **initCode**: Always `0x` — the EOA is upgraded via EIP-7702 delegation, not factory deployment.

### Token Resolution

- `services/xstock.py` (`resolve_token`) handles both xStock symbols and crypto assets.
- `is_placeholder_address()` detects zero-address (`0x000...000`) tokens that are registered in the xStock registry but have no verified contract address yet. Any attempt to quote or trade these returns HTTP 400.
- Token decimals are cached in `_KNOWN_DECIMALS`: WETH = 18, USDC = 6, USDT = 6. Unknown tokens fall back to an on-chain `decimals()` call, with a default of 18 on failure. xStock tokens default to 18 decimals without an on-chain call.

### Guardrails (Policy Step)

Eight checks run sequentially in `services/guardrails.py`. All must pass for the quote to proceed.

| # | Check | Limit |
|---|-------|-------|
| 1 | Side validation | "buy" or "sell" only |
| 2 | Asset validation | Known xStock or supported crypto |
| 3 | Amount validation | $1 minimum, $10,000 maximum per trade (USD-denominated only) |
| 4 | US person block | xStock tokens blocked for users with `country == "US"` or `is_us_person == true` |
| 5 | Sanctioned country | KP, IR, CU, SY, RU, BY, MM, VE, ZW, SD blocked |
| 6 | Daily notional limit | $50,000/day cumulative (USD-denominated trades only) |
| 7 | Duplicate detection | Identical side + symbol + amount within 60-second window rejected |
| 8 | Rate limit | Max 10 trades per minute |

The result `{"approved": bool, "checks": [...], "reason": str | None}` is stored on the Firestore trade document for audit.

### Quote Storage

Quotes are stored in a module-level dict `_quotes` keyed by UUID. Each entry includes an `_expires_at` timestamp (5-minute TTL). The in-memory store is cleared on each quote request via `_cleanup_expired_quotes()`. On `POST /trade/confirm`, the quote entry is deleted from memory after the trade record is updated in Firestore.

## Code Map

| File | Purpose |
|------|---------|
| `backend/services/uniswap.py` | QuoterV2 quoting, SwapRouter02 swap building, allowance checking, approval building, token decimals cache, ABI encoding helpers |
| `backend/services/eip7702.py` | EIP-7702 authorization construction, AmbireAccount7702 executeBySender encoding, PackedUserOperation assembly, paymaster relay integration, Pimlico bundler gas estimation |
| `backend/routers/trade.py` | FastAPI router: 4 endpoints, quote TTL store, token resolution helpers, guardrail invocation, Firestore trade persistence |
| `backend/services/guardrails.py` | 8-check trade validator: side, asset, amount, US person, sanctioned country, daily limit, duplicate detection, rate limit |
| `backend/db/trades.py` | Firestore CRUD: save_trade, save_quoted_trade, get_trades, get_trade_count, update_trade_status |
| `backend/services/provider.py` | Ethereum RPC abstraction: _rpc_call, eth_call (used by uniswap.py and eip7702.py) |
| `backend/services/xstock.py` | xStock token registry, resolve_token, is_supported_asset |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/trade/quote` | JWT | Get quote + unsigned swap/approval transactions (standard ETH-gas mode). Returns `QuoteResponse` with `quote_id`, token info, amounts, `swap_tx`, optional `approval_tx`, and `expires_at`. |
| `POST` | `/trade/quote-gasless` | JWT | Get quote as a fully-assembled ERC-4337 v0.7 `PackedUserOperation` paying gas in USDC via AmbirePaymaster. Returns `GaslessQuoteResponse` with `user_operation`, `eip7702_auth`, `bundler_url`, `gas_estimate_usdc`. Requires `PIMLICO_API_KEY`; returns HTTP 503 if unavailable. |
| `POST` | `/trade/confirm` | JWT | Record that the frontend has signed and broadcast a trade. Body: `{quote_id, tx_hash}`. Updates Firestore trade status to `"pending"`. |
| `GET` | `/trade/status/{id}` | JWT | Poll trade status. If status is `"pending"`, fetches `eth_getTransactionReceipt` on-demand and updates Firestore to `"confirmed"` or `"failed"`. |

### Request / Response Models

**QuoteRequest**
```
token_in:     str   — "ETH", "USDC", or xStock symbol (e.g. "xTSLA")
token_out:    str   — same format
amount:       float — human-readable amount (gt 0)
amount_type:  str   — "usd" (default) or "quantity"
slippage:     float — tolerance in percent (0.01–50.0, default 0.5)
recipient:    str   — user's wallet address
```

**QuoteResponse**
```
quote_id:         str
token_in:         {symbol, address, decimals}
token_out:        {symbol, address, decimals}
amount_in:        str  — human-readable
amount_out:       str  — human-readable (8 decimal places, trailing zeros stripped)
amount_in_wei:    str  — smallest unit
amount_out_min_wei: str — slippage-adjusted minimum
price_impact:     float — currently 0.0 (mid-price comparison not yet implemented)
slippage:         float
needs_approval:   bool
approval_tx:      dict | null — {to, data, value, gas, chainId}
swap_tx:          dict       — {to, data, value, gas, chainId}
expires_at:       str  — ISO-8601 UTC
```

**GaslessQuoteRequest / GaslessQuoteResponse**: same trade fields as above; response replaces `swap_tx`/`approval_tx` with `user_operation`, `eip7702_auth`, `entrypoint`, `bundler_url`, `paymaster_mode`, `gas_estimate_usdc`.

**ExecuteRequest (confirm)**
```
quote_id: str  — from /trade/quote or /trade/quote-gasless
tx_hash:  str  — 66-char 0x-prefixed hash
```

## Firestore Schema

### Collection: `users/{user_id}/trades`

Document ID: auto-generated by Firestore.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Same as document ID |
| `type` | string | `"buy"` \| `"sell"` \| `"swap"` |
| `side` | string | `"buy"` \| `"sell"` (denormalized for guardrail queries) |
| `asset_in` | string | Symbol of token sold (e.g. `"USDC"`) |
| `asset_out` | string | Symbol of token bought (e.g. `"xTSLA"`) |
| `symbol` | string | Primary asset symbol (e.g. `"xTSLA"`) |
| `asset` | string | Human-readable asset name |
| `amount_in` | float | Input amount |
| `amount_out` | float | Output amount (0 until confirmed) |
| `price_usd` | float \| null | Execution price in USD (null until confirmed) |
| `tx_hash` | string | On-chain transaction hash (empty until broadcast) |
| `status` | string | `"quoted"` → `"pending"` → `"confirmed"` \| `"failed"` |
| `privacy_mode` | string | `"public"` \| `"shielded"` \| `"compliant"` (default `"public"`) |
| `amount` | float | Human-readable trade amount as entered |
| `amount_type` | string | `"usd"` \| `"quantity"` |
| `total_usd` | float | USD notional for daily limit tracking |
| `conversation_id` | string | Chat conversation that originated the trade (if applicable) |
| `guardrail_result` | map | Full guardrail check output stored for audit |
| `created_at` | string | ISO-8601 UTC timestamp |

### Supporting Collections (queried by guardrails)

- `users/{user_id}/trades` ordered by `created_at` — used for daily limit (`where created_at >= day_start`) and rate limit (`where created_at >= now - 60s`) and duplicate detection.
- `users/{user_id}` (profile document) — `country` (string, ISO 3166-1 alpha-2) and `is_us_person` (boolean) used for geofence checks.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ETH_RPC_URL` | Yes | Ethereum mainnet JSON-RPC endpoint |
| `PIMLICO_API_KEY` | Gasless only | Pimlico bundler API key |
| `PIMLICO_POLICY_ID` | Gasless only | Pimlico sponsorship policy ID |

### Contract Addresses (Ethereum Mainnet)

| Contract | Address |
|----------|---------|
| SwapRouter02 | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| QuoterV2 | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` |
| WETH | `0xC02aaA39b223FE8D0A0e5695F863489fa5693b42` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| AmbireAccount7702 | `0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d` |
| AmbirePaymaster | `0xA8B267C68715FA1Dca055993149f30217B572Cf0` |
| AmbireFactory | `0x26cE6745A633030A6faC5e64e41D21fb6246dc2d` |
| ERC-4337 EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |

### Gas Defaults

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `DEFAULT_SWAP_GAS` | 200,000 | Fallback for swap gas estimation failures |
| `DEFAULT_APPROVAL_GAS` | 60,000 | Fallback for approval gas estimation failures |
| `DEFAULT_CALL_GAS_LIMIT` (UserOp) | 300,000 | approve (~50k) + swap (~200k) + executeBySender overhead (~20k) + buffer |
| `DEFAULT_VERIFICATION_GAS_LIMIT` | 150,000 | validateUserOp + ecrecover + storage reads |
| `DEFAULT_PAYMASTER_VER_GAS_LIMIT` | 42,000 | AmbirePaymaster.validatePaymasterUserOp |
| `DEFAULT_PAYMASTER_POSTOP_GAS_LIMIT` | 0 | No postOp logic in AmbirePaymaster |
| `DEFAULT_PRE_VERIFICATION_GAS` | 50,000 | Bundle overhead |
| Swap gas buffer | +20% | Applied to all `eth_estimateGas` results |
| Quote TTL | 5 minutes | In-memory store; quotes expire and must be re-fetched |
| Standard tx deadline | now + 20 minutes | Set at build time; production target is block.timestamp + 300 |

### Ambire External Services

| Service | Base URL | Auth |
|---------|----------|------|
| Ambire Paymaster Relay | `https://relayer.ambire.com` | None (open relay for Ambire contracts) |
| Pimlico Bundler | `https://api.pimlico.io/v2/1/rpc?apikey={PIMLICO_API_KEY}` | `PIMLICO_API_KEY` in URL |

## Current Limitations

1. **No on-chain execution from backend**: The backend only builds and returns unsigned transactions. On-chain execution is entirely frontend-driven. There is no backend transaction broadcaster, no nonce management, and no retry logic server-side.

2. **Placeholder xStock addresses**: Tokens registered in the xStock registry with a zero address (`0x000...000`) are rejected at quote time with HTTP 400. Not all 80+ xStock tokens have verified mainnet contract addresses yet.

3. **No slippage UI**: Slippage tolerance is accepted as an API parameter (default 0.5%) but there is no frontend component for users to configure it. The API permits values up to 50%, which exceeds the agent spec's 1% cap — this needs alignment.

4. **Price impact not calculated**: The `price_impact` field in `QuoteResponse` is always `0.0`. A correct implementation would compare mid-price (derived from `sqrtPriceX96Before` and `sqrtPriceX96After`) against the execution price.

5. **Single fee tier**: Only the 0.3% (3000) pool is queried. There is no fee tier discovery or routing across 0.05%, 0.01%, or 1% pools to find the best price.

6. **No multi-hop routing**: Only `exactInputSingle` (single-hop) swaps are supported. Multi-hop paths through intermediate tokens (e.g. xTSLA → WETH → USDC) are not implemented.

7. **No on-chain confirmation polling**: The `GET /trade/status/{id}` endpoint checks the receipt on-demand per request but there is no background task or webhook that pushes confirmation updates. The frontend must poll.

8. **Gasless mode requires Pimlico**: The `/trade/quote-gasless` endpoint returns HTTP 503 if `PIMLICO_API_KEY` is not set. There is no fallback bundler.

9. **Standard tx deadline**: The current implementation sets `deadline = int(time.time()) + 20 * 60` (20 minutes) at quote build time rather than the intended `block.timestamp + 300` (5 minutes). This can be tightened once the frontend confirms execution timing.

10. **Daily limit enforcement**: The daily notional limit check only applies to USD-denominated amounts. Quantity-based trades (`amount_type == "quantity"`) bypass the USD daily limit check; they require a price oracle integration to enforce.

## Related

- Agent spec: `agents/trade-execution.md` — six-step pipeline definition, guardrail rules, output formats
- Guardrails agent: `agents/guardrails.md` — full 11-check guardrail specification (backend implements 8 of 11)
- xStock resolver: `agents/xstock-resolver.md` — token resolution logic
- EIP-7702 / Ambire source: `sources/kohaku-commons-main/` — AccountOp, keystore, paymaster reference implementation
- Project spec: `specs/project-spec.md` — full Merlin architecture overview
