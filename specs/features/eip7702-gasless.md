# EIP-7702 Gasless Trading

## Status: Live (UserOp construction) | In Progress (bundler submission)

## Overview

Merlin uses EIP-7702 (Pectra) to temporarily delegate an EOA to the `AmbireAccount7702` smart contract, enabling batch execution and smart account logic without a permanent on-chain deployment. Gas is paid in USDC instead of ETH via the `AmbirePaymaster`, which covers ETH gas upfront from its EntryPoint deposit and debits the user's USDC balance atomically as part of the batch. The full execution path uses ERC-4337 v0.7: the backend constructs a `PackedUserOperation`, fetches a paymaster signature, and returns the unsigned UserOp to the frontend for signing and bundler submission.

## Architecture

```
EOA (user's private key)
  |
  | signs EIP-7702 authorization (first delegation only)
  | signs UserOp hash
  v
Pimlico Bundler (eth_sendUserOperation)
  |
  v
ERC-4337 EntryPoint (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
  |-- validatePaymasterUserOp --> AmbirePaymaster (0xA8B267...)
  |                                  verifies relayer ECDSA sig
  |                                  pays ETH gas from deposit
  |
  |-- calls --> EOA (now delegated to AmbireAccount7702 via EIP-7702)
                  |
                  | executeBySender(Transaction[])
                  |-- approve token_in --> Uniswap SwapRouter02
                  |-- exactInputSingle --> Uniswap SwapRouter02
                  |-- fee call (USDC transfer) --> AmbirePaymaster reimbursal
```

## Implementation Details

### EIP-7702 Delegation (Pectra)

The EOA temporarily acquires smart account code by signing an EIP-7702 authorization off-chain:

```
{ chain_id, address: AmbireAccount7702, nonce: <EOA tx nonce> }
```

This authorization is included in a Type 4 transaction. After the block is processed, the EOA's code slot points to `AmbireAccount7702`. Delegation is required only once per EOA (or on re-delegation). The backend always returns `eip7702_auth` in the `quote-gasless` response; the frontend checks on-chain whether delegation is already active and includes the authorization in the UserOp submission only when needed.

### AmbirePaymaster — USDC Gas Payment

The `AmbirePaymaster` validates UserOps by verifying an ECDSA signature from the Ambire relayer. The relayer signs a hash over:

```
keccak256(abi.encode(
    block.chainid, paymaster, entryPoint,
    validUntil, validAfter,
    sender, nonce, initCode, callData,
    accountGasLimits, preVerificationGas, gasFees
))
```

`paymasterAndData` layout in a v0.7 `PackedUserOperation`:

```
paymaster address        (20 bytes)
paymasterVerGasLimit     (16 bytes)
paymasterPostOpGasLimit  (16 bytes)
abi.encode(uint48 validUntil, uint48 validAfter, bytes signature)
```

The paymaster has no `postOp` logic — `paymasterPostOpGasLimit` is always 0.

Paymaster resolution order:
1. Pimlico sponsorship policy (`pm_getPaymasterData` with `sponsorshipPolicyId`)
2. Ambire relayer fallback (`https://relayer.ambire.com/v2/paymaster/{chainId}/request`)
3. No paymaster — UserOp returned with `"0x"` paymaster data; frontend decides whether to submit as `self7702` with ETH gas

### ERC-4337 v0.7 PackedUserOperation

The backend constructs the UserOp in unpacked format (as expected by bundler RPC), assembled in `build_gasless_trade()`:

```
sender                   — user's EOA address
nonce                    — from EntryPoint.getNonce(sender, key=0)  [selector: 0x35567e1a]
factory / factoryData    — null (no factory needed with EIP-7702)
callData                 — encode_execute_by_sender(calls)          [selector: 0xabc5345e]
callGasLimit             — from bundler estimation or default 300,000
verificationGasLimit     — from bundler estimation or default 150,000
preVerificationGas       — from bundler estimation or default 50,000
maxFeePerGas             — 2 * nextBaseFee + maxPriorityFee (from eth_feeHistory)
maxPriorityFeePerGas     — 1.5 gwei fixed
paymaster                — AmbirePaymaster address
paymasterData            — signed by relayer (validUntil, validAfter, sig)
paymasterVerGasLimit     — from relayer/estimation or default 42,000
paymasterPostOpGasLimit  — 0
signature                — 0x placeholder (frontend fills with EOA ECDSA sig)
```

### executeBySender Calldata Encoding

`AmbireAccount7702.executeBySender(Transaction[] calldata calls)` — selector `0xabc5345e`.

`Transaction` struct: `{ address to, uint256 value, bytes data }`. All ABI encoding is manual hex — no `eth-abi` or `web3py` dependency. The encoder in `encode_execute_by_sender()` computes per-element byte offsets relative to the array body start, packs the outer ABI envelope (offset=32, length=N), and right-pads all `bytes` fields to 32-byte boundaries.

### Build Flow (`build_gasless_trade`)

1. Encode `executeBySender(calls)` calldata
2. Concurrently fetch: EntryPoint nonce (`eth_call` to EntryPoint), EOA tx nonce (`eth_getTransactionCount`), EIP-1559 fees (`eth_feeHistory`)
3. Assemble stub UserOp with default gas limits and Ambire paymaster stub data (65-byte dummy ECDSA sig: `0x0dc2d37f...1c01`)
4. Call `eth_estimateUserOperationGas` on Pimlico bundler; fall back to defaults on failure
5. Assemble real UserOp with estimated gas limits, empty `paymasterData`
6. Request paymaster signature (Pimlico policy first, then Ambire relayer)
7. Assemble final UserOp with paymaster data
8. Build `eip7702_auth` object using EOA tx nonce
9. Compute informational USDC gas cost estimate
10. Return the full package

### Batch Call Construction (in `trade.py`)

For a USDC-in swap:
```
calls = [
    { to: token_in, value: 0, data: approve(SwapRouter02, amount_in_raw) },
    { to: SwapRouter02, value: 0, data: exactInputSingle(..., amount_in_raw, amount_out_min, 0) }
]
```

The approval is always included in the batch regardless of existing on-chain allowance — the approve and swap execute atomically via `executeBySender`, making pre-flight allowance checks unreliable. A finite approval (`amount_in_raw`) is used rather than `MAX_UINT256` so no residual allowance persists after the UserOp lands.

For native ETH swaps, the approve call is omitted and `value` on the swap call is set to `amount_in_raw`.

Pool fee tier is hardcoded to 3000 (0.3%). `sqrtPriceLimitX96 = 0` (no price limit).

### Gas Stub for Estimation

The paymaster stub data sent to the bundler during `eth_estimateUserOperationGas`:

```
abi.encode(uint48(0), uint48(0), bytes(65-byte dummy sig))
```

The dummy signature (`0dc2d37f...1c01`) matches Ambire's own `getSigForCalculations()` from `userOperation.ts` in ambire-common. This allows the bundler to simulate the full validation path including paymaster code execution.

### Broadcast Modes

| Mode | Gas token | When used |
|------|-----------|-----------|
| `self` | ETH | Simple EOA transfer, cheapest for single calls |
| `self7702` | ETH | Batch calls via delegated EOA, no paymaster |
| `bundler` | USDC | Default for xStock trades — requires paymaster |
| `delegation` | ETH | First-time EIP-7702 activation (Type 4 tx) |
| `relayer` | — | Ambire relayer (legacy, not used for Merlin trades) |

USDC gas payment is exclusively available in `bundler` mode. The `quote-gasless` endpoint always targets `bundler` mode (`broadcast_mode: "bundler"` is stored in the quote record).

### Frontend Responsibilities

1. Receive `GaslessQuoteResponse` from `POST /trade/quote-gasless`
2. Check on-chain whether EOA is already delegated to `AmbireAccount7702`
3. If not delegated: sign EIP-7702 authorization (`eip7702_auth`) with EOA private key
4. Compute and sign the UserOp hash (ERC-4337 v0.7 hash over sender, nonce, callData, gas fields, paymasterAndData, chainId, entryPoint)
5. Set `user_operation.signature` to the 65-byte ECDSA signature
6. Submit `eth_sendUserOperation` to `bundler_url` with the final UserOp and EIP-7702 authorization

## Code Map

| File | Purpose |
|------|---------|
| `backend/services/eip7702.py` | Core: `build_gasless_trade()`, `encode_execute_by_sender()`, `get_entrypoint_nonce()`, `get_eip1559_fees()`, `estimate_user_op_gas()`, `get_paymaster_data()`, `get_pimlico_paymaster_data()`, `estimate_gas_cost_usdc()` |
| `backend/routers/trade.py` | `POST /trade/quote-gasless` endpoint, batch call construction, `GaslessQuoteRequest` / `GaslessQuoteResponse` models |
| `sources/kohaku-commons-main/kohaku-commons-main/` | Ambire commons reference: AccountOp, broadcast modes, gas estimation, paymaster validation hash |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/trade/quote-gasless` | Build a Uniswap swap as a `PackedUserOperation` with USDC gas via AmbirePaymaster. Returns unsigned UserOp + EIP-7702 auth object + bundler URL. |
| POST | `/trade/quote` | Standard swap quote (ETH gas, unsigned tx). Fallback when gasless is unavailable. |
| POST | `/trade/confirm` | Record tx hash after frontend submits on-chain. Marks trade as pending. |
| GET | `/trade/status/{trade_id}` | Poll trade status. Checks `eth_getTransactionReceipt` when status is pending. |

### `POST /trade/quote-gasless`

**Request:**
```json
{
  "token_in": "USDC",
  "token_out": "xTSLA",
  "amount": 100.0,
  "amount_type": "usd",
  "slippage": 0.5,
  "recipient": "0x<EOA address>"
}
```

**Response (`GaslessQuoteResponse`):**
```json
{
  "quote_id": "<uuid>",
  "token_in": { "symbol": "USDC", "address": "0x...", "decimals": 6 },
  "token_out": { "symbol": "xTSLA", "address": "0x...", "decimals": 18 },
  "amount_in": "100.0",
  "amount_out": "0.52341",
  "user_operation": {
    "sender": "0x<EOA>",
    "nonce": "0x...",
    "factory": null,
    "factoryData": null,
    "callData": "0xabc5345e...",
    "callGasLimit": "0x...",
    "verificationGasLimit": "0x...",
    "preVerificationGas": "0x...",
    "maxFeePerGas": "0x...",
    "maxPriorityFeePerGas": "0x...",
    "paymaster": "0xA8B267C68715FA1Dca055993149f30217B572Cf0",
    "paymasterData": "0x...",
    "paymasterVerificationGasLimit": "0x...",
    "paymasterPostOpGasLimit": "0x0",
    "signature": "0x"
  },
  "eip7702_auth": {
    "chain_id": 1,
    "address": "0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d",
    "nonce": 42
  },
  "entrypoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  "bundler_url": "https://api.pimlico.io/v2/1/rpc?apikey=...",
  "paymaster_mode": "pimlico",
  "gas_estimate_usdc": "0.4200",
  "expires_at": "2026-03-24T12:05:00+00:00"
}
```

**Error responses:**
- `400` — token resolution failed, zero amount, insufficient liquidity
- `403` — guardrails blocked the trade
- `502` — Uniswap quote failed
- `503` — `PIMLICO_API_KEY` not configured, or both paymaster relays unreachable

## Contract Addresses

| Contract | Address |
|----------|---------|
| AmbireAccount7702 | `0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d` |
| AmbirePaymaster | `0xA8B267C68715FA1Dca055993149f30217B572Cf0` |
| AmbireFactory | `0x26cE6745A633030A6faC5e64e41D21fb6246dc2d` |
| ERC-4337 EntryPoint | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| USDC (Ethereum mainnet) | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |

## Function Selectors

| Function | Selector |
|----------|----------|
| `executeBySender((address,uint256,bytes)[])` | `0xabc5345e` |
| `EntryPoint.getNonce(address,uint192)` | `0x35567e1a` |

## Gas Defaults

These conservative upper bounds are used when bundler estimation fails or is unavailable. Sized for `approve` (~50k) + Uniswap V3 `exactInputSingle` (~200k) + `executeBySender` overhead (~20k).

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `callGasLimit` | 300,000 | approve + swap + executeBySender overhead |
| `verificationGasLimit` | 150,000 | validateUserOp + ecrecover + storage reads |
| `paymasterVerGasLimit` | 42,000 | validatePaymasterUserOp in AmbirePaymaster |
| `paymasterPostOpGasLimit` | 0 | AmbirePaymaster has no postOp logic |
| `preVerificationGas` | 50,000 | Bundle overhead (calldata encoding, intrinsic) |

## EIP-1559 Fee Strategy

- `maxPriorityFeePerGas`: fixed 1.5 gwei
- `maxFeePerGas`: `2 * nextBaseFee + maxPriorityFee` (fetched from `eth_feeHistory`, last element of `baseFeePerGas` array)
- Fallback on RPC failure: 20 gwei max, 1.5 gwei priority

## USDC Gas Estimation

The informational estimate in `gas_estimate_usdc` uses:

```
total_gas = callGasLimit + verificationGasLimit + preVerificationGas + paymasterVerGasLimit
gas_cost_eth = total_gas * maxFeePerGas / 1e18
gas_cost_usdc = gas_cost_eth * usdc_per_eth  (hardcoded 3500.0 USD/ETH)
```

The ETH/USD rate is a static placeholder. Production should wire this to `services/prices.py`.

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `PIMLICO_API_KEY` | Pimlico bundler + paymaster API key | Yes — gasless returns 503 if unset |
| `PIMLICO_POLICY_ID` | Pimlico sponsorship policy ID for `pm_getPaymasterData` | Yes for Pimlico paymaster; falls back to Ambire relayer if unset |
| `ETH_RPC_URL` | Ethereum mainnet JSON-RPC endpoint | Yes — nonce fetches, fee history, eth_call |
| Ambire relayer URL | `https://relayer.ambire.com` (hardcoded) | Fallback when Pimlico paymaster unavailable |

## Quote Lifecycle

Quotes are held in an in-memory dict (`_quotes`) with a 5-minute TTL (`QUOTE_TTL_SECONDS = 300`). A `trade_id` is written to Firestore at `users/{uid}/trades/{trade_id}` at quote time (status: `quoted`). On `POST /trade/confirm` the frontend supplies a `tx_hash`; the backend updates the Firestore record to `pending` and evicts the quote from memory. On `GET /trade/status/{id}` the backend polls `eth_getTransactionReceipt` and transitions to `confirmed` or `failed`.

## Current Limitations

- **Bundler submission not wired in frontend.** The backend returns a complete UserOp + bundler URL, but the frontend does not yet call `eth_sendUserOperation`. The frontend must: sign the EIP-7702 authorization, sign the UserOp hash, and POST to `bundler_url`.
- **No EIP-7702 authorization signing in frontend.** The `eip7702_auth` object is returned but the frontend has no code to sign it or include it in the submission.
- **No bundler gas estimation for first delegation.** When EIP-7702 delegation is active for the first time, the 7702 gas overhead (`ACTIVATOR_GAS_USED = 29300`) is not added to `preVerificationGas`.
- **Static USDC/ETH rate.** `estimate_gas_cost_usdc` uses a hardcoded 3500 USD/ETH. Should source from `services/prices.py`.
- **Pool fee tier hardcoded.** `exactInputSingle` always uses the 0.3% fee tier (3000). Multi-hop routing or alternate fee tiers are not supported.
- **No `quote-gasless` confirm endpoint.** `POST /trade/confirm` validates the quote ID but does not separately handle the gasless flow — the `user_op_hash` is not recorded, so there is no way to look up a UserOp by hash after submission.
- **Quote expiry in-memory only.** Quotes do not survive a process restart. On Cloud Run with multiple instances, a `confirm` call may land on a different instance than the `quote` call and fail with 404.

## Related

- `specs/project-spec.md` — full project specification
- `backend/services/uniswap.py` — swap calldata encoding, `SELECTOR_APPROVE`, `SELECTOR_EXACT_INPUT_SINGLE`
- `backend/services/guardrails.py` — `validate_trade()` called before UserOp construction
- `sources/kohaku-commons-main/kohaku-commons-main/src/libs/accountOp/accountOp.ts` — AccountOp type, `gasFeePayment`, broadcast modes
- `sources/kohaku-commons-main/kohaku-commons-main/src/libs/userOperation/userOperation.ts` — `getSigForCalculations()` (source of the dummy sig bytes)
- `agents/ambire-7702.md` — Ambire 7702 agent definition
- `agents/trade-execution.md` — 6-step trade pipeline agent
