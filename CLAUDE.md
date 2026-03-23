# CLAUDE.md

## Project Overview

Merlin is a privacy-preserving multi-chain wallet SDK for the Ethereum ecosystem and beyond. It provides a unified interface that combines multi-chain wallet management (inspired by Tether's WDK) with privacy protocol integration (inspired by Ethereum's Kohaku project). The SDK enables developers to build wallet applications where privacy is a first-class transaction mode -- shield, unshield, and privately transfer tokens using Railgun or Privacy Pools protocols, all through a single coherent API.

## Workspace Environment
- **Repository**: https://github.com/mrboups/merlin
- **Domain**: SDK / library (no hosted services)
- **Specs**: See `specs/` folder (to be populated as architecture matures)
- **Reference Sources**: See `sources/` for upstream reference implementations:
  - `sources/kohaku-master/` -- Ethereum Kohaku: privacy-first Ethereum tooling (Railgun, Privacy Pools, post-quantum 4337 accounts)
  - `sources/wdk-main/` -- Tether WDK: multi-chain wallet development kit with modular wallet/protocol management

## Tech Stack
- Language: TypeScript (strict mode)
- Runtime: Node.js >= 22
- Build: tsup (ESM output)
- Test: vitest
- Lint: eslint + typescript-eslint
- Key dependencies: ethers v6, viem v2, @noble/hashes, @noble/ciphers, @scure/base, ethereum-cryptography

## Architecture

Merlin follows a modular architecture with four core modules coordinated by a top-level `Merlin` orchestrator class. Each module is self-contained with its own types, service, tests, and public API index.

The `Merlin` class provides convenience methods that delegate to the underlying services, but each service can also be used independently for advanced use cases.

### Modules
- `wallet`: Multi-chain wallet manager -- registers wallet implementations per blockchain, derives accounts by BIP-44 index or path, manages seed lifecycle
- `provider`: RPC provider abstraction -- manages chain configurations, creates JSON-RPC providers with fallback support, abstracts over ethers/viem/raw RPC
- `privacy`: Privacy protocol integration -- registers and manages privacy providers (Railgun, Privacy Pools), handles shield/unshield/private-transfer operations
- `transaction`: Transaction orchestrator -- routes transaction requests to wallet (public) or privacy (shielded) modules based on requested mode

### Data Flow
```
User -> Merlin (orchestrator)
         |-> WalletService  (account derivation, public tx signing)
         |-> ProviderService (RPC connections, chain configs)
         |-> PrivacyService  (shield/unshield/private transfer)
         |-> TransactionService (routes public vs shielded)
```

## Development Rules
- All code must be production-ready. No mocks, no placeholders, no dummy data.
- Every module must be self-contained with a clean public API (index file).
- Shared code goes in `lib/` or `types/`, never duplicated across modules.
- Environment variables go in `.env` (never committed) and are documented in `.env.example`.
- Every new module must include types and at minimum a smoke test.

## Commands
- `pnpm dev`: Start tsup in watch mode
- `pnpm build`: Production build (ESM + DTS)
- `pnpm test`: Run vitest test suite
- `pnpm test:watch`: Run vitest in watch mode
- `pnpm lint`: Lint source code with eslint
- `pnpm lint:fix`: Auto-fix lint issues
- `pnpm typecheck`: Run TypeScript type checking (no emit)
- `pnpm clean`: Remove dist directory

## Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `ETH_RPC_URL` | Ethereum mainnet RPC endpoint | For mainnet operations |
| `SEPOLIA_RPC_URL` | Sepolia testnet RPC endpoint | For testnet development |
| `DEBUG` | Enable verbose logging ("true" / "false") | No |

## Project Structure
```
merlin/
  CLAUDE.md
  package.json
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  eslint.config.mjs
  .env.example
  .gitignore
  src/
    index.ts                          # Main SDK entry point, re-exports all modules
    merlin.ts                         # Merlin orchestrator class
    config/
      index.ts                        # MerlinConfig type
    lib/
      logger.ts                       # Structured JSON logger
    types/
      index.ts                        # Shared type re-exports
      common.ts                       # Hex, MerlinError, SeedInput, etc.
      wallet.ts                       # IWalletAccount, IWalletManager, FeeRates
      privacy.ts                      # IPrivacyProvider, ShieldParams, etc.
      provider.ts                     # IProvider, ChainRpcConfig, etc.
    modules/
      wallet/
        index.ts                      # Public API
        wallet.service.ts             # WalletService implementation
        wallet.types.ts               # Module-scoped type re-exports
        wallet.test.ts                # Tests (9 tests)
      provider/
        index.ts                      # Public API
        provider.service.ts           # ProviderService + JsonRpcProvider
        provider.types.ts             # Module-scoped type re-exports
        provider.test.ts              # Tests (5 tests)
      privacy/
        index.ts                      # Public API
        privacy.service.ts            # PrivacyService implementation
        privacy.types.ts              # Module-scoped type re-exports
        privacy.test.ts               # Tests (3 tests)
      transaction/
        index.ts                      # Public API
        transaction.service.ts        # TransactionService (public/shielded router)
        transaction.types.ts          # TransactionMode, TransactionRequest
        transaction.test.ts           # Tests (1 test)
  sources/                            # Reference implementations (read-only)
    kohaku-master/                    # Ethereum Kohaku privacy tooling
    wdk-main/                         # Tether WDK wallet management
    humanoid_tennis.mp4               # Reference material
  specs/                              # Architecture specifications (to be added)
```
