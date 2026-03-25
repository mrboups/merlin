# Privacy System

## Overview
Merlin integrates privacy at the protocol level via Railgun (full privacy) and Privacy Pools (compliant privacy). Every transaction can be public, shielded, or compliant. This is planned for Phase 6.

## Three Transaction Modes
| Mode | Technology | Privacy | Compliance |
|------|-----------|---------|------------|
| Public | Standard Ethereum tx | None | Full transparency |
| Shielded | Railgun ZK proofs | Full | Anonymous |
| Compliant | Privacy Pools | Selective | Provably clean |

## Railgun Integration (via Kohaku SDK)
- Shield: deposit tokens into Railgun pool (prepareShield)
- Private transfer: move tokens within shielded pool
- Unshield: withdraw from pool to public address
- ZK-SNARK proof generation for all private operations
- Merkle tree indexing for UTXO tracking

## Key Derivation (Railgun-specific)
| Key Type | BIP-44 Path |
|----------|-------------|
| ETH keys | m/44'/60'/0'/0/{index} |
| Railgun spending key | m/44'/1984'/0'/0'/{index} |
| Railgun viewing key | m/420'/1984'/0'/0'/{index} |

## Private Trade Flow
```
1. User: "buy $10 of Tesla privately"
2. Chat parser detects privacy_mode: "shielded"
3. Standard flow: resolve -> guardrails -> quote
4. Shield USDC into Railgun pool
5. Wait for shield confirmation
6. Execute private swap (within shielded pool or unshield->swap->re-shield)
7. Confirm + persist
```

## Privacy Pools
- Selective disclosure using Association Set Providers (ASPs)
- Proves funds are NOT from sanctioned sources
- Compatible with regulatory requirements
- Planned integration via @kohaku-eth/privacy-pools

## Post-Quantum (Future)
- ZKNOX ERC-4337 hybrid signatures
- ECDSA + FALCON/ML-DSA dual signing
- Quantum-resistant account security
- Via @kohaku-eth/pq-account

## SDK Architecture
```
src/
  modules/
    wallet/      — Multi-chain wallet manager, BIP-44 derivation
    provider/    — RPC provider abstraction
    privacy/     — Railgun + Privacy Pools integration
    transaction/ — Routes public vs shielded transactions
```

## Current Status
- Phase 6 (not yet started)
- SDK module structure defined
- Kohaku source code available in sources/kohaku-master/
- Ambire commons available in sources/kohaku-commons-main/

## Key Files
| File | Purpose |
|------|---------|
| src/modules/privacy/ | Privacy module (types, service, index) |
| sources/kohaku-master/ | Kohaku SDK source (Railgun, Privacy Pools) |
| sources/kohaku-commons-main/ | Ambire wallet commons (7702, keystore) |
