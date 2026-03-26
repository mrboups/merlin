# Merlin Developer Documentation

Developer documentation for the Merlin platform. These docs cover architecture, implementation details, and how to extend the system.

Merlin is a privacy-preserving non-custodial wallet for Ethereum. Users trade tokenized stocks (xStocks) and crypto through conversational AI agents. Every transaction can be public, shielded (Railgun), or compliant (Privacy Pools).

## Table of Contents

### System Design
- [Architecture Overview](architecture.md) — Module map, data flow diagrams, key design decisions

### Frontend
- [Frontend Guide](frontend-guide.md) — Pages, components, state management, auth flow, design system

### Backend
- [Backend Guide](backend-guide.md) — Project structure, routers, services, Firestore schema, patterns

### Feature Pipelines
- [Auth Flow](architecture.md#auth-flow) — Passkey registration, WebAuthn ceremonies, seed encryption, session management
- [Chat Pipeline](architecture.md#chat-flow) — SSE streaming, Claude tool use, intent parsing, confirmation loop
- [Trading Pipeline](architecture.md#trade-flow) — Quote → simulate → policy → execute → confirm → persist
- [Privacy System](architecture.md#privacy-flow) — Railgun shielding, private swaps, Privacy Pools compliance mode

### Reference
- [API Reference](backend-guide.md#api-endpoints) — All HTTP endpoints, request/response shapes
- [Deployment Guide](backend-guide.md#deployment) — GCP Cloud Run (backend) + Firebase Hosting (frontend)

## Quick Start

```bash
# Frontend
cd frontend
pnpm install
pnpm dev          # Turbopack dev server on :3000

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# SDK
pnpm install
pnpm dev          # tsup watch mode
```

## Environment Variables

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

Key variables:

| Variable | Used By | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | Frontend | FastAPI backend URL |
| `NEXT_PUBLIC_WEBAUTHN_RP_ID` | Frontend | WebAuthn relying party ID |
| `NEXT_PUBLIC_CHAIN_ID` | Frontend | EVM chain (1 = mainnet, 11155111 = Sepolia) |
| `ANTHROPIC_API_KEY` | Backend | Claude Haiku for chat + intent parsing |
| `GROK_API_KEY` | Backend | Grok for social sentiment analysis |
| `ETH_RPC_URL` | Backend | Ethereum mainnet JSON-RPC endpoint |
| `SEPOLIA_RPC_URL` | Backend | Sepolia testnet JSON-RPC endpoint |
| `JWT_SECRET` | Backend | HS256 signing key for session tokens |
| `GCP_PROJECT_ID` | Deploy | Firebase + Cloud Run project |

## Repository Layout

```
merlin/
  frontend/       Next.js 15 PWA
  backend/        FastAPI Python API
  src/            TypeScript SDK (wallet, provider, privacy, transaction)
  agents/         Agent definition files
  specs/          Project specification
  sources/        Upstream reference codebases
  dev/            This documentation
  infra/          Terraform IaC
```
