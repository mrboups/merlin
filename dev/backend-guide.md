# Merlin Backend Guide

The backend is a FastAPI Python application deployed to Google Cloud Run. It handles AI chat, trade routing, auth ceremonies, price feeds, social sentiment, and Firestore persistence.

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.12 | Runtime |
| FastAPI | latest | API framework, async endpoints, SSE |
| Uvicorn | latest | ASGI server |
| py-webauthn | 2.1.0 | WebAuthn registration + authentication |
| python-jose | latest | JWT creation and verification (HS256) |
| google-cloud-firestore | latest | Async Firestore client |
| openai | latest | GPT-4o-mini, function calling, streaming |
| httpx | latest | Async HTTP client (price oracles, Grok) |
| pydantic | v2 | Request/response model validation |

---

## Project Structure

```
backend/
  main.py                    FastAPI app factory, middleware, router registration
  requirements.txt           Python dependencies

  auth/
    webauthn.py              Registration options/verify, auth options/verify
    session.py               JWT creation (create_token) and verification (decode_token)
    models.py                Pydantic models: RegistrationRequest, AuthRequest, UserOut
    dependencies.py          get_current_user — FastAPI dependency injected per-route

  db/
    firestore.py             AsyncClient singleton, get_db() factory
    users.py                 get_user, create_user, update_user, add_credential, get_credentials
    conversations.py         get_conversation, create_conversation, append_message, list_conversations
    trades.py                create_trade, get_trade, list_trades, update_trade_status
    signals.py               upsert_signal, get_signal, list_signals
    challenges.py            store_challenge, get_challenge, delete_challenge (5-min TTL)

  services/
    chat.py                  OpenAI streaming chat with function calling
    xstock.py                xStock token registry + fuzzy matching
    guardrails.py            Pre-trade safety check engine
    uniswap.py               Uniswap V3 Quoter + SwapRouter (raw ABI encoding)
    eip7702.py               EIP-7702 delegation + UserOp helpers
    prices.py                Price oracle (CoinMarketCap + Backed Finance)
    balances.py              On-chain ETH + ERC-20 balance fetching
    social.py                Grok API sentiment analysis
    provider.py              Raw JSON-RPC client

  routers/
    auth.py                  6 auth endpoints
    chat.py                  8 chat endpoints + 1 market endpoint
    portfolio.py             4 portfolio endpoints
    trade.py                 4 trade endpoints
    personas.py              5 persona endpoints
    social.py                1 social endpoint
```

---

## main.py

```python
app = FastAPI(title="Merlin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # From CORS_ORIGINS env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,      prefix="/auth")
app.include_router(chat_router,      prefix="/chat")
app.include_router(portfolio_router, prefix="/portfolio")
app.include_router(trade_router,     prefix="/trade")
app.include_router(personas_router,  prefix="/personas")
app.include_router(social_router,    prefix="/social")

@app.get("/health")
async def health():
    return {"status": "ok"}
```

`CORS_ORIGINS` defaults to `["http://localhost:3000", "http://localhost:3001"]` if not set. In production, set to the Firebase Hosting URL (`https://merlin-app.web.app`).

---

## Auth System

### WebAuthn (`auth/webauthn.py`)

Uses `py-webauthn` 2.1.0. Implements the full WebAuthn ceremony:

**Registration:**
1. `generate_registration_options(rp_id, rp_name, user_id, user_name)` → options JSON
2. Store challenge in Firestore (`challenges/`) with 5-minute TTL
3. `verify_registration_response(credential, expected_challenge, expected_rp_id, expected_origin)` → verified credential
4. Store credential public key + credential ID against user in Firestore

**Authentication:**
1. `generate_authentication_options(rp_id, allow_credentials=[...])` → options JSON
2. Store challenge in Firestore with 5-minute TTL
3. `verify_authentication_response(credential, expected_challenge, credential_public_key, sign_count)` → verified assertion
4. Update sign count in Firestore

### JWT Sessions (`auth/session.py`)

```python
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

def create_token(address: str) -> str:
    payload = {
        "sub": address,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
```

`JWT_SECRET` must be set as an environment variable. In production, it is loaded from Google Secret Manager.

### Auth Dependency (`auth/dependencies.py`)

```python
async def get_current_user(
    authorization: str = Header(...),
    db: AsyncClient = Depends(get_db),
) -> UserDocument:
    token = authorization.removeprefix("Bearer ")
    payload = decode_token(token)           # Raises 401 if invalid/expired
    address = payload["sub"]
    user = await users.get_user(db, address)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

Inject with `user: UserDocument = Depends(get_current_user)` on any protected endpoint.

---

## API Endpoints

### Auth Router (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register-options` | None | Generate WebAuthn registration options |
| POST | `/auth/register-verify` | None | Verify registration + issue JWT |
| POST | `/auth/auth-options` | None | Generate WebAuthn authentication options |
| POST | `/auth/auth-verify` | None | Verify authentication + issue JWT |
| POST | `/auth/logout` | JWT | Invalidate session (client-side JWT drop) |
| GET | `/auth/me` | JWT | Return current user profile |

**POST `/auth/register-options`**
```json
Request:  { "address": "0x...", "display_name": "My Device" }
Response: { "challenge": "...", "rp": { "id": "merlin.app", "name": "Merlin" }, "user": {...}, "pubKeyCredParams": [...] }
```

**POST `/auth/register-verify`**
```json
Request:  { "address": "0x...", "credential": { "id": "...", "response": {...}, "type": "public-key" } }
Response: { "token": "eyJ...", "user": { "address": "0x...", "display_name": "..." } }
```

**POST `/auth/auth-options`**
```json
Request:  { "address": "0x..." }
Response: { "challenge": "...", "allowCredentials": [{ "id": "...", "type": "public-key" }], "timeout": 60000 }
```

**POST `/auth/auth-verify`**
```json
Request:  { "address": "0x...", "assertion": { "id": "...", "response": {...} } }
Response: { "token": "eyJ...", "user": { "address": "0x...", "display_name": "..." } }
```

### Chat Router (`/chat`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/chat/message` | JWT | SSE streaming chat response |
| GET | `/chat/conversations` | JWT | List conversations |
| POST | `/chat/conversations` | JWT | Create new conversation |
| GET | `/chat/conversations/{id}` | JWT | Get conversation with messages |
| DELETE | `/chat/conversations/{id}` | JWT | Delete conversation |
| POST | `/chat/conversations/{id}/messages` | JWT | Append message to conversation |
| GET | `/chat/conversations/{id}/messages` | JWT | Get messages for conversation |
| POST | `/chat/clear` | JWT | Clear all conversations for user |
| GET | `/chat/market/{symbol}` | JWT | Get market data for a symbol |

**POST `/chat/message`** — SSE stream
```json
Request: {
  "conversation_id": "conv_abc123",
  "message": "Buy $100 of Apple stock"
}
```

SSE event types emitted:
```
event: delta
data: {"content": "Sure, let me check the current"}

event: delta
data: {"content": " price of AAPL for you..."}

event: trade_confirmation
data: {
  "asset": "AAPL",
  "token_address": "0x...",
  "side": "buy",
  "amount_usd": 100,
  "quote": {
    "amount_in": "1000000",
    "amount_out": "540000000000000000",
    "price_impact": 0.003,
    "route": ["USDC", "ETH", "AAPL"]
  },
  "gas_estimate": { "units": 185000, "cost_usdc": "2.14" },
  "privacy_mode": "public"
}

event: done
data: {}
```

### Portfolio Router (`/portfolio`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/portfolio/balances` | JWT | ETH + ERC-20 balances |
| GET | `/portfolio/summary` | JWT | Total value in USD, asset allocation |
| GET | `/portfolio/tokens` | JWT | List of held tokens with prices |
| GET | `/portfolio/history` | JWT | Portfolio value over time (Firestore) |

**GET `/portfolio/balances`**
```json
Response: {
  "address": "0x...",
  "eth": { "balance": "1.234", "value_usd": "3210.45" },
  "tokens": [
    { "symbol": "USDC", "address": "0x...", "balance": "500.00", "value_usd": "500.00" },
    { "symbol": "AAPL", "address": "0x...", "balance": "0.540", "value_usd": "97.20" }
  ],
  "total_usd": "3807.65"
}
```

### Trade Router (`/trade`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/trade/quote` | JWT | Get Uniswap V3 quote |
| POST | `/trade/simulate` | JWT | Simulate swap (eth_call) |
| POST | `/trade/execute` | JWT | Broadcast signed transaction |
| GET | `/trade/history` | JWT | Trade history for user |

**POST `/trade/quote`**
```json
Request: {
  "token_in": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "token_out": "0x...",
  "amount_in": "100000000",
  "fee": 3000
}
Response: {
  "amount_out": "540000000000000000",
  "price_impact": 0.003,
  "route": ["0xUSDC", "0xWETH", "0xAAPL"],
  "gas_estimate": 185000
}
```

**POST `/trade/execute`**
```json
Request:  { "signed_tx": "0x02f8..." }
Response: { "tx_hash": "0x...", "status": "pending" }
```

### Personas Router (`/personas`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/personas` | JWT | List built-in + user personas |
| POST | `/personas` | JWT | Create custom persona |
| GET | `/personas/{id}` | JWT | Get persona config |
| PUT | `/personas/{id}` | JWT | Update persona |
| DELETE | `/personas/{id}` | JWT | Delete persona |

### Social Router (`/social`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/social/signals` | JWT | Sentiment signals for watched tokens |

**GET `/social/signals`**
```json
Response: {
  "signals": [
    {
      "symbol": "AAPL",
      "sentiment_score": 0.72,
      "outlook": "bullish",
      "summary": "Strong earnings expectations ahead of Q1 report",
      "source_count": 847,
      "updated_at": "2026-03-24T10:00:00Z"
    }
  ]
}
```

---

## Services

### `services/chat.py` — OpenAI Chat

Manages the streaming chat loop with function calling.

**Function definitions passed to OpenAI:**

```python
FUNCTIONS = [
    {
        "name": "execute_trade",
        "description": "Execute a buy or sell order for a token or xStock",
        "parameters": {
            "type": "object",
            "properties": {
                "asset": { "type": "string", "description": "Token symbol or company name" },
                "side": { "type": "string", "enum": ["buy", "sell"] },
                "amount": { "type": "number", "description": "Amount in USD or token units" },
                "currency": { "type": "string", "enum": ["usd", "token"], "default": "usd" },
                "privacy_mode": { "type": "string", "enum": ["public", "shielded", "compliant"], "default": "public" }
            },
            "required": ["asset", "side", "amount"]
        }
    },
    {
        "name": "get_portfolio",
        "description": "Get the user's current portfolio balances and values",
        "parameters": { "type": "object", "properties": {} }
    },
    {
        "name": "get_price",
        "description": "Get the current price of a token or xStock",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": { "type": "string", "description": "Token symbol" }
            },
            "required": ["symbol"]
        }
    }
]
```

When OpenAI returns a function call, `chat.py` resolves the intent, runs guardrails, gets a Uniswap quote, then emits a `trade_confirmation` SSE event. The actual transaction is not built server-side — the client builds and signs it after user confirmation.

### `services/xstock.py` — xStock Token Registry

61+ xStock tokens maintained as a static registry:

```python
XSTOCK_TOKENS = {
    "AAPL": {
        "address": "0x...",
        "name": "Apple Inc.",
        "decimals": 18,
        "backed_id": "..."
    },
    "TSLA": { ... },
    "MSFT": { ... },
    # ... 58 more
}

def resolve_token(query: str) -> XStockToken | None:
    # 1. Exact symbol match
    # 2. Exact name match (case-insensitive)
    # 3. Fuzzy match using difflib.SequenceMatcher
    # Returns None if best match score < 0.6
```

### `services/guardrails.py` — Pre-Trade Safety

8 checks run before any trade is quoted or executed:

| Check | Condition | Error Code |
|-------|-----------|------------|
| Amount minimum | amount_usd >= 10 | AMOUNT_TOO_SMALL |
| Amount maximum | amount_usd <= 10_000 | AMOUNT_TOO_LARGE |
| Token allowlist | token in XSTOCK_TOKENS or APPROVED_CRYPTO | TOKEN_NOT_ALLOWED |
| Slippage | price_impact < 0.05 (5%) | SLIPPAGE_TOO_HIGH |
| Duplicate trade | no identical trade in last 30 seconds | DUPLICATE_TRADE |
| US person (xStocks) | not (is_us_person and is_xstock) | US_PERSON_RESTRICTED |
| Balance check | user_balance >= required_amount | INSUFFICIENT_BALANCE |
| Gas estimate | gas_cost_usd < amount_usd * 0.10 | GAS_TOO_HIGH |

All 8 checks are run in sequence. Returns `{ "allowed": True }` or `{ "allowed": False, "reason": "...", "code": "..." }`.

### `services/uniswap.py` — Uniswap V3 Integration

Interacts with Uniswap V3 contracts without using `web3py`. All ABI encoding is manual hex.

**Contracts used:**
- `QuoterV2` at `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` (mainnet)
- `SwapRouter02` at `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` (mainnet)

**Quoting:**
```python
async def get_quote(
    token_in: str,
    token_out: str,
    amount_in: int,
    fee: int = 3000,
) -> QuoteResult:
    # ABI-encode quoteExactInputSingle params
    calldata = encode_quote_calldata(token_in, token_out, amount_in, fee)
    result = await provider.eth_call(QUOTER_V2_ADDRESS, calldata)
    amount_out = decode_uint256(result[:32])
    price_impact = calculate_price_impact(amount_in, amount_out, token_in, token_out)
    return QuoteResult(amount_out=amount_out, price_impact=price_impact)
```

**Swap calldata building** (returned to client for signing):
```python
async def build_swap_calldata(params: SwapParams) -> str:
    # Returns hex-encoded calldata for exactInputSingle
    # Client uses this to build + sign the transaction
    return encode_swap_calldata(params)
```

### `services/prices.py` — Price Oracle

Fetches prices from two sources with a 60-second in-memory cache:

- **Crypto prices**: CoinMarketCap API (ETH, USDC, USDT, BTC, etc.)
- **xStock prices**: Backed Finance API (tokenized stock prices in USD)

```python
_price_cache: dict[str, tuple[float, datetime]] = {}
CACHE_TTL = 60  # seconds

async def get_price(symbol: str) -> float:
    if symbol in _price_cache:
        price, cached_at = _price_cache[symbol]
        if (datetime.utcnow() - cached_at).seconds < CACHE_TTL:
            return price
    # Fetch from appropriate source
    price = await _fetch_price(symbol)
    _price_cache[symbol] = (price, datetime.utcnow())
    return price
```

### `services/balances.py` — On-Chain Balances

Fetches balances via `provider.py` (raw JSON-RPC, no web3py):

```python
async def get_eth_balance(address: str) -> int:
    result = await provider.eth_getBalance(address, "latest")
    return int(result, 16)

async def get_erc20_balance(token_address: str, wallet_address: str) -> int:
    # ABI-encodes balanceOf(address) selector + padded address
    calldata = "0x70a08231" + wallet_address[2:].zfill(64)
    result = await provider.eth_call(token_address, calldata)
    return int(result, 16)
```

### `services/social.py` — Grok Sentiment

Queries Grok (`grok-3-mini`) for sentiment analysis on watched tokens:

```python
async def analyze_sentiment(symbol: str) -> SentimentResult:
    prompt = f"Analyze current social media sentiment for {symbol}. Return JSON with: sentiment_score (0-1), outlook (bullish/bearish/neutral), summary (1 sentence), source_count (estimated posts analyzed)."
    response = await grok_client.chat.completions.create(
        model="grok-3-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    return SentimentResult(**json.loads(response.choices[0].message.content))
```

Results are cached in Firestore `signals/` collection and refreshed every 15 minutes via a background task.

### `services/provider.py` — JSON-RPC Client

Raw JSON-RPC client wrapping `httpx.AsyncClient`:

```python
async def eth_call(to: str, data: str, block: str = "latest") -> str:
    return await _rpc_call("eth_call", [{"to": to, "data": data}, block])

async def eth_getBalance(address: str, block: str = "latest") -> str:
    return await _rpc_call("eth_getBalance", [address, block])

async def eth_sendRawTransaction(signed_tx: str) -> str:
    return await _rpc_call("eth_sendRawTransaction", [signed_tx])

async def eth_getTransactionReceipt(tx_hash: str) -> dict | None:
    return await _rpc_call("eth_getTransactionReceipt", [tx_hash])
```

Uses `ETH_RPC_URL` for mainnet, `SEPOLIA_RPC_URL` for testnet. Selected via `CHAIN_ID` env var.

### `services/eip7702.py` — EIP-7702 Delegation

Constructs EIP-7702 type-4 transactions for smart EOA delegation:

```python
async def build_delegation_tx(
    eoa_address: str,
    delegate_address: str,      # Ambire EntryPoint or custom logic contract
    chain_id: int,
) -> dict:
    # Returns unsigned type-4 transaction
    # Client signs with EOA key → submits via eth_sendRawTransaction
    ...

async def build_userop(
    sender: str,
    calldata: str,
    paymaster: str,             # AmbirePaymaster address
    paymaster_data: str,        # Encoded USDC gas payment
) -> dict:
    # Returns EIP-4337 UserOperation for bundler submission
    ...
```

---

## Firestore Schema

### `users/{address}`

```
{
  id: string,                   // Ethereum address (0x...)
  display_name: string,
  address: string,              // Duplicate for query convenience
  created_at: timestamp,
  updated_at: timestamp,
  credentials: [                // WebAuthn credentials
    {
      credential_id: string,    // Base64url-encoded credential ID
      public_key: bytes,        // COSE-encoded public key
      sign_count: number,
      device_name: string,
      created_at: timestamp,
      last_used: timestamp,
    }
  ],
  watched_tokens: string[],     // Token symbols user wants sentiment for
  settings: {
    default_privacy_mode: "public" | "shielded" | "compliant",
    slippage_tolerance: number, // 0.005 = 0.5%
  }
}
```

### `conversations/{id}`

```
{
  id: string,
  user_id: string,              // Ethereum address
  title: string,                // First message truncated to 50 chars
  created_at: timestamp,
  updated_at: timestamp,
  messages: [
    {
      id: string,
      role: "user" | "assistant" | "system",
      content: string,
      created_at: timestamp,
      metadata: {               // Optional, present on assistant messages with trades
        trade_confirmation?: {...},
        function_call?: {...},
      }
    }
  ]
}
```

### `trades/{id}`

```
{
  id: string,
  user_id: string,              // Ethereum address
  conversation_id: string,
  created_at: timestamp,
  updated_at: timestamp,

  side: "buy" | "sell",
  asset: string,                // e.g. "AAPL"
  token_address: string,
  amount_usd: number,
  amount_token: string,         // Raw token units (bigint as string)

  token_in: string,             // ERC-20 address
  token_out: string,
  amount_in: string,
  amount_out: string,

  privacy_mode: "public" | "shielded" | "compliant",
  tx_hash: string | null,
  status: "pending" | "confirmed" | "failed",
  block_number: number | null,
  gas_used: number | null,
  error: string | null,
}
```

### `signals/{symbol}`

```
{
  symbol: string,               // e.g. "AAPL"
  sentiment_score: number,      // 0.0 (bearish) to 1.0 (bullish)
  outlook: "bullish" | "bearish" | "neutral",
  summary: string,
  source_count: number,
  updated_at: timestamp,
}
```

### `challenges/{id}`

```
{
  id: string,
  challenge: string,            // Base64url-encoded WebAuthn challenge
  address: string,              // Ethereum address (for auth challenges only)
  created_at: timestamp,
  expires_at: timestamp,        // created_at + 5 minutes
}
```

Firestore TTL policy should be configured to auto-delete documents where `expires_at` is in the past. If not configured, `challenges.py` checks expiry on read and returns `None` for expired challenges.

---

## Key Patterns

### Async Throughout

Every function that touches I/O (Firestore, RPC, OpenAI, Grok, httpx) is `async`. FastAPI handles the event loop. Do not use synchronous Firestore or HTTP clients.

```python
# Correct
async def get_user(db: AsyncClient, address: str) -> UserDocument | None:
    doc = await db.collection("users").document(address).get()
    return doc.to_dict() if doc.exists else None

# Wrong — blocks the event loop
def get_user(db: Client, address: str) -> dict | None:
    doc = db.collection("users").document(address).get()
    return doc.to_dict()
```

### No web3py

All Ethereum contract interaction uses raw JSON-RPC via `services/provider.py`. ABI encoding is done manually in each service. This avoids the web3py dependency and keeps encoding explicit and auditable.

```python
# Correct: manual ABI encoding
selector = "0x70a08231"  # balanceOf(address)
padded_addr = wallet_address[2:].zfill(64)
calldata = selector + padded_addr

# Wrong: web3py
contract = w3.eth.contract(address=token, abi=ERC20_ABI)
balance = contract.functions.balanceOf(wallet).call()
```

### SSE Streaming

Chat responses use FastAPI `StreamingResponse` with `text/event-stream`:

```python
async def stream_chat(request: ChatRequest, user: UserDocument = Depends(get_current_user)):
    async def generate():
        async for chunk in chat_service.stream(request, user):
            yield f"event: {chunk.event}\ndata: {json.dumps(chunk.data)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

### In-Memory Caching

Price data and Uniswap quotes are cached in module-level dicts. Acceptable because:
- Data has natural staleness tolerance (60s prices, 5m quotes)
- Cloud Run instances handle steady-state traffic; cache warmup is fast
- No cross-instance coordination needed — stale-by-60s is fine for price display

For data that must be consistent (user state, trade records), always read from Firestore.

---

## Environment Variables

```
# Ethereum RPC
ETH_RPC_URL=https://mainnet.infura.io/v3/...
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/...
CHAIN_ID=1

# Auth
JWT_SECRET=<random 64-byte hex>
WEBAUTHN_RP_ID=merlin.app
WEBAUTHN_RP_NAME=Merlin
WEBAUTHN_ORIGIN=https://merlin-app.web.app

# AI
OPENAI_API_KEY=sk-...
GROK_API_KEY=xai-...

# Price Oracles
COINMARKETCAP_API_KEY=...

# CORS
CORS_ORIGINS=https://merlin-app.web.app

# GCP (loaded automatically on Cloud Run via service account)
GCP_PROJECT_ID=merlin-wallet-prod
```

In production, sensitive values (`JWT_SECRET`, `OPENAI_API_KEY`, `GROK_API_KEY`, `ETH_RPC_URL`) are loaded from Google Secret Manager via the Cloud Run service account. Local development uses `.env`.

---

## Deployment

### Cloud Run

The backend runs as a container on Cloud Run in `europe-west1`.

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

```bash
# Build and push image
docker build -t europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest .
docker push europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest

# Deploy to Cloud Run (verify gcloud project and account first — see CLAUDE.md)
gcloud run deploy merlin-api \
  --image europe-west1-docker.pkg.dev/merlin-wallet-prod/merlin-docker/merlin-api:latest \
  --region europe-west1 \
  --project merlin-wallet-prod \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets "JWT_SECRET=JWT_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,GROK_API_KEY=GROK_API_KEY:latest,ETH_RPC_URL=ETH_RPC_URL:latest,SEPOLIA_RPC_URL=SEPOLIA_RPC_URL:latest"
```

### Local Development

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example .env   # Fill in real values
uvicorn main:app --reload --port 8000
```

Swagger UI available at `http://localhost:8000/docs` during development.
