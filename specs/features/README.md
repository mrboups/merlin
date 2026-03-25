# Feature Specifications

Detailed specifications for each major feature of the Merlin platform.

## Status Legend

| Status | Meaning |
|--------|---------|
| **Live** | Deployed and functional in production |
| **In Progress** | Partially implemented, active development |
| **Planned** | Designed but not yet implemented |

## Feature Index

| Feature | Status | Spec |
|---------|--------|------|
| [Passkey Authentication](auth-passkey.md) | Live | WebAuthn passkeys, seed encryption, session management |
| [AI Chat Pipeline](ai-chat-pipeline.md) | Live | OpenAI function calling, SSE streaming, intent parsing |
| [Trading Engine](trading-engine.md) | Live (quoting) / In Progress (execution) | Uniswap V3 quotes, swap building, 6-step pipeline |
| [xStock Resolver](xstock-resolver.md) | Live | 61+ token registry, fuzzy matching, price oracle |
| [Privacy System](privacy-railgun.md) | Planned | Railgun ZK proofs, Privacy Pools, three transaction modes |
| [Persona Engine](persona-engine.md) | Live (built-in) / Planned (custom) | 4 built-in trading strategies, custom persona creation |
| [Social Intelligence](social-intelligence.md) | Live | Grok sentiment analysis, X/Twitter signals |
| [EIP-7702 Gasless](eip7702-gasless.md) | Live (UserOp) / In Progress (bundler) | AmbirePaymaster, USDC gas, ERC-4337 |
| [Portfolio & Balances](portfolio-balances.md) | Live | On-chain balances, price tracking, PnL |
| [Deployment & Infra](deployment-infra.md) | Live | GCP, Firebase Hosting, Cloud Run, Firestore |

## Architecture Overview

```
User → Chat UI → OpenAI (function calling) → Intent Parser
                                                  ↓
                                          xStock Resolver → Guardrails → Trading Engine
                                                                              ↓
                                          Persona Engine ←──────── Quote + Confirmation
                                                                              ↓
                                          Privacy (Railgun) ←── Wallet Signs → Broadcast
                                                                              ↓
                                          EIP-7702 (gasless) ←── Bundler → On-chain
                                                                              ↓
                                          Portfolio ← Trade Persisted → Social Signals
```

## Related

- [Project Spec](../project-spec.md) — high-level project specification
- [Tech Stack](../tech-stack.md) — full technology stack details
- [Development Plan](../development-plan.md) — phase-by-phase progress
- [Project Description](../project-description.md) — product narrative
