# Trading Pipeline

## Overview
Merlin's trading engine builds unsigned Uniswap V3 swap transactions. The backend is non-custodial — it returns unsigned calldata for the frontend to sign and submit.

## 6-Step Pipeline
```
1. QUOTE     — Uniswap V3 QuoterV2 on-chain quote (exactInputSingle)
2. SIMULATE  — eth_call dry-run of the swap
3. POLICY    — 8 guardrail safety checks
4. EXECUTE   — Frontend signs with private key, broadcasts tx
5. CONFIRM   — Wait for on-chain receipt, verify success
6. PERSIST   — Save trade record to Firestore
```

## Standard Trade Flow (ETH gas)
```
POST /api/v1/trade/quote
  -> Resolve asset -> check guardrails -> Uniswap V3 quote
  -> Build unsigned swap tx (approve + exactInputSingle)
  -> Store quote (5-min TTL) -> Return to frontend

Frontend:
  -> User confirms -> sign tx -> broadcast -> poll receipt
  -> POST /api/v1/trade/confirm {quote_id, tx_hash}
```

## Gasless Trade Flow (USDC gas via EIP-7702)
```
POST /api/v1/trade/quote-gasless
  -> Same quote + guardrails
  -> Build batch calls [approve, swap]
  -> Encode executeBySender() for AmbireAccount7702
  -> Assemble PackedUserOperation (ERC-4337 v0.7)
  -> Fetch paymaster signature from Ambire relay
  -> Return unsigned UserOp

Frontend:
  -> Sign EIP-7702 authorization (first time only)
  -> Sign UserOp hash
  -> Submit eth_sendUserOperation to bundler
```

## Guardrail Checks (8 mandatory)
1. Side validation — must be "buy" or "sell"
2. Asset validation — must be known xStock or supported crypto
3. Amount validation — min $1, max $10,000
4. US person block — xStocks blocked for US persons
5. Sanctioned country block — 10 blocked countries
6. Daily limit — max $50,000 daily notional
7. Duplicate detection — no identical trade within 60 seconds
8. Rate limit — max 10 trades per minute

## Contract Addresses (Ethereum Mainnet)
| Contract | Address |
|----------|---------|
| SwapRouter02 | 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 |
| QuoterV2 | 0x61fFE014bA17989E743c5F6cB21bF9697530B21e |
| WETH | 0xC02aaA39b223FE8D0A0e5695F863489fa5693b42 |
| USDC | 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 |
| USDT | 0xdAC17F958D2ee523a2206206994597C13D831ec7 |
| AmbireAccount7702 | 0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d |
| AmbirePaymaster | 0xA8B267C68715FA1Dca055993149f30217B572Cf0 |
| EntryPoint (4337) | 0x0000000071727De22E5E9d8BAf0edAc6f37da032 |

## Key Files
| File | Purpose |
|------|---------|
| backend/services/uniswap.py | Uniswap V3 quoting, swap building, raw ABI encoding |
| backend/services/eip7702.py | EIP-7702 delegation, UserOp construction, paymaster |
| backend/services/guardrails.py | 8 trade safety checks |
| backend/routers/trade.py | 4 trade endpoints |
| backend/db/trades.py | Trade persistence |
