# Privacy System (Railgun + Privacy Pools)

## Status: Planned (Phase 6)

---

## Overview

Merlin supports three transaction modes — public, shielded (Railgun), and compliant (Privacy Pools) — selectable per trade with no change to the public account model. Railgun provides full, unconditional privacy using UTXO-based zk-SNARKs: tokens enter an on-chain pool as encrypted commitments and can only be redeemed by proving ownership of the spending key. Privacy Pools is a newer, WIP alternative that adds optional selective disclosure via an Association Set Provider (ASP), allowing users to prove membership in a compliant set without revealing their transaction graph, which is the protocol of choice when regulatory transparency is required.

---

## Architecture

### Data Flow: Shielded Transaction

```
User selects "private" mode
        |
        v
WalletManager (BIP-32 seed in memory)
        |
        |-- Spending key: m/44'/1984'/0'/0'/{index}  (signs proofs)
        |-- Viewing key:  m/420'/1984'/0'/0'/{index}  (scans notes)
        |
        v
Merlin Host (implements @kohaku-eth/plugins Host interface)
  host.keystore.deriveAt(path)  ->  Hex private key
  host.storage.get/set(key)     ->  plaintext note/merkle cache
  host.provider                 ->  EthereumProvider (getLogs, waitForTransaction, ...)
  host.network.fetch(...)       ->  relayer/broadcaster HTTP calls
        |
        v
PrivacyService (src/modules/privacy/privacy.service.ts)
  registerProtocol(PrivacyProtocol.RAILGUN, chainId, RailgunProvider, config)
  getProvider(protocol, chainId)  ->  lazily init + return IPrivacyProvider
        |
        v
IPrivacyProvider implementation (to be built in Phase 6)
  Wraps createRailgunPlugin(host, params)  [from @kohaku-eth/railgun]
  Wraps createPPv1Plugin(host, params)     [from @kohaku-eth/privacy-pools]
        |
        v
Kohaku PluginInstance<RailgunAddress, ...>
  instanceId()           ->  0zk{masterPubKey}{viewingPubKey}{chainId}{version}
  balance([asset])       ->  AssetAmount[]  (sum across merkle trees)
  prepareShield(asset)   ->  PublicOperation  (RailgunSmartWallet.shield() calldata)
  prepareTransfer(asset) ->  PrivateOperation (ZK proof, transact() calldata)
  prepareUnshield(asset) ->  PrivateOperation (ZK proof, recipient output)
        |
        v
TransactionService routes result:
  PublicOperation  -> signed by WalletManager EOA, broadcast as normal tx
  PrivateOperation -> broadcast via Railgun relayer (no on-chain sender linkage)
```

### Privacy Mode Selection (per trade)

```
TransactionMode = 'public' | 'shielded' | 'compliant'

public    -> EOA signs + submits directly (or via EIP-7702 bundler with USDC gas)
shielded  -> Railgun: full privacy, no relayer knows sender
compliant -> Privacy Pools: optional ASP membership proof, selective disclosure
```

---

## Implementation Details

### Three Transaction Modes

| Mode | Protocol | Privacy Guarantee | Compliance | Status |
|------|----------|-------------------|------------|--------|
| `public` | None (EOA direct) | None | Full on-chain transparency | Live |
| `shielded` | Railgun | Full: sender, receiver, amount hidden | None — no disclosure | Phase 6 |
| `compliant` | Privacy Pools | Sender/amount hidden; can prove ASP membership | Optional PPOI disclosure | Phase 6 (WIP) |

### Railgun Integration (`@kohaku-eth/railgun`)

**Package status:** Production-ready.

**Plugin interface** (from `packages/plugins/src/base.ts`):

```typescript
// All features enabled for Railgun
type RGInstance = PluginInstance<
    RailgunAddress,    // "0zk{...}"
    {
        assetAmounts: {
            input: AssetAmount,
            internal: AssetAmount,
            output: AssetAmount,
        },
        privateOp: RGPrivateOperation,  // PrivateOperation & { bar: 'hi' }
        features: {
            prepareShield: true,
            prepareShieldMulti: true,
            prepareTransfer: true,
            prepareTransferMulti: true,
            prepareUnshield: true,
            prepareUnshieldMulti: true,
        }
    }
>;
```

**Factory:**

```typescript
const createRailgunPlugin: CreatePluginFn<RGInstance, RGPluginParameters> =
    (host: Host, params: RGPluginParameters) => RGInstance;
```

**Host requirements (Merlin must provide):**

```typescript
// Merlin constructs a Host satisfying @kohaku-eth/plugins Host interface:
const host: Host = {
    keystore: {
        deriveAt(path: string): Hex {
            // delegate to WalletManager BIP-32 derivation
            // path restricted to m/44'/1984'/... and m/420'/1984'/...
        }
    },
    storage: {
        // plaintext — backed by IndexedDB or localStorage
        // used for note cache, merkle tree snapshots, last-synced block
        set(key: string, value: string): void { ... },
        get(key: string): string | null { ... },
    },
    provider: {
        // wraps the Merlin ProviderService EthereumProvider
        getChainId(): Promise<bigint>,
        getLogs(params: Filter): Promise<TxLog[]>,
        getBlockNumber(): Promise<bigint>,
        waitForTransaction(txHash: string): Promise<void>,
        getBalance(address: string): Promise<bigint>,
        getCode(address: string): Promise<string>,
        getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null>,
        request(req: Pick<RpcRequest, 'method' | 'params'>): Promise<unknown>,
    },
    network: {
        fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
        // used by Railgun for relayer/broadcaster HTTP calls
    },
};
```

### Key Derivation Paths

| Key | BIP-32 Path | Purpose |
|-----|-------------|---------|
| ETH account | `m/44'/60'/0'/0/{index}` | Public signing, funding shield tx |
| Railgun spending | `m/44'/1984'/0'/0'/{index}` | Signs ZK proofs, creates nullifiers |
| Railgun viewing | `m/420'/1984'/0'/0'/{index}` | Scans chain for received notes |

**Derivation is deterministic** — same seed always produces the same Railgun keys. The spending key signs circuit inputs; the viewing key is shared with the indexer to scan for incoming notes without spending authority.

### Shield Operation (Public -> Private)

1. Call `plugin.prepareShield({ asset: { __type: 'erc20', contract: tokenAddress }, amount })`
2. Kohaku returns a `PublicOperation` containing `RailgunSmartWallet.shield()` calldata
3. Merlin signs and submits the transaction from the EOA (or via EIP-7702 bundler)
4. On confirmation, the token is locked in the Railgun smart wallet contract
5. An encrypted `ShieldNote` is created: `Note = { value, token, owner: viewingPubKey }`
6. The note is stored in the local notebook (sparse merkle tree, one per asset)
7. For ETH: wrap to WETH first, then shield via RelayAdapt

**Railgun contract addresses:**

| Network | Chain ID | RailgunSmartWallet |
|---------|----------|-------------------|
| Mainnet | 1 | `0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9` |
| Sepolia | 11155111 | TBD — verify from Kohaku source before use |

### Unshield Operation (Private -> Public)

1. Call `plugin.prepareUnshield({ asset, amount }, toAddress)`
2. Kohaku selects unspent UTXOs (notes) from the local notebook
3. Generates a zk-SNARK proof: spends selected notes, produces nullifiers, specifies recipient output
4. Returns a `PrivateOperation` containing encoded `transact()` calldata and the proof
5. Broadcast via Railgun relayer — the relayer submits on-chain; sender address is not linked
6. On confirmation, the tokens arrive at `toAddress` as a public ERC-20 balance
7. For ETH: WETH unshielded via RelayAdapt, unwrapped to ETH at recipient

### Private Transfer (Private -> Private, Within the Pool)

1. Call `plugin.prepareTransfer({ asset, amount }, recipientRailgunAddress)`
2. Kohaku selects UTXOs, generates ZK proof with recipient's `viewingPubKey` as output owner
3. Returns a `PrivateOperation` — broadcast via relayer
4. Recipient's indexer scans for new notes using their viewing key

**Multi-asset variants:** `prepareShieldMulti`, `prepareTransferMulti`, `prepareUnshieldMulti` — same flow, batched into a single proof/transaction.

### ZK-SNARK Proof Generation

- Circuits: Circomlibjs (bundled within `@kohaku-eth/railgun`)
- Hashing: Poseidon (ZK-friendly field hash) for note commitments and nullifiers; Keccak256 for on-chain binding
- Proof system: Groth16 (compact proof, fast on-chain verification)
- Proof is generated client-side in the browser/app — the proving key is loaded from the package
- Generation is async and CPU-intensive; expect 2–8 seconds per proof on a modern device
- The relayer receives the proof + encoded calldata but never sees plaintext note values

### Merkle Tree Indexing

- One sparse merkle tree per asset, one notebook per account
- Merkle roots are stored on-chain in the Railgun contract; local tree is reconstructed from logs
- Indexing uses `host.provider.getLogs()` to scan `Shield`, `Transact`, and `Nullifier` events
- Block-level snapshots are persisted via `host.storage` so syncing resumes from last processed block
- Balance = sum of all uncommitted notes in the local tree that have not been nullified
- **Sync must complete before calling `balance()`, `prepareTransfer()`, or `prepareUnshield()`** — the indexer must be current with the chain or operations will use stale state

### Privacy Pools Integration (`@kohaku-eth/privacy-pools`)

**Package status:** WIP — interfaces are stable but treat as pre-production.

**Factory:**

```typescript
// src: packages/privacy-pools/src/v1/factory.ts
const createPPv1Plugin: CreatePluginFn<PPv1Instance, PPv1PluginParameters> =
    (host: Host, params: PPv1PluginParameters) => PPv1Instance;

// PPv1PluginParameters:
interface PPv1PluginParameters {
    entrypoint: IEntrypoint;       // { address, deploymentBlock }
    accountIndex?: number;          // BIP-32 account index (default: 0)
    broadcasterUrl: string | Record<string, string>;  // relayer URL(s)
    ipfsUrl?: string;               // IPFS gateway for ASP trees
    aspServiceFactory?: () => IAspService;
    initialState?: Record<string, RootState>;
}
```

**Key derivation** (from `packages/privacy-pools/src/account/keys.ts`):

```
m/28784'/1'/{accountIndex}'/{secretType}'/{depositIndex}'/{secretIndex}'

secretType: 0 = nullifier, 1 = salt
secretIndex: 0 = deposit secret, 1+ = withdrawal secrets

Derivation produces:
  nullifier = Poseidon(chainId, entrypointAddress, nullifierSecret)
  salt      = Poseidon(chainId, entrypointAddress, saltSecret)
  precommitment = Poseidon(nullifier, salt)
  nullifierHash = Poseidon(nullifier)
```

**Enabled features:**

```typescript
type PPv1Instance = PluginInstance<
    PPv1Address,   // Ethereum address (0x...)
    {
        features: {
            prepareShield: true,    // deposit
            prepareUnshield: true,  // withdrawal (via relayer)
            // No prepareTransfer — Privacy Pools v1 does not support pool-internal transfers
        },
        extras: {
            notes(assets, includeSpent?): Promise<INote[]>,
            ragequit(labels): Promise<PPv1PublicOperation>,  // emergency exit
            sync(): Promise<void>,
        }
    }
>;
```

**ASP-based selective disclosure:**

- The ASP (Association Set Provider) publishes Merkle trees of compliant deposit commitments
- On withdrawal, the user can optionally include a PPOI (Privacy Pools Optimistic Inclusion) proof
- The PPOI proof shows membership in the ASP-approved set without revealing which deposit is being withdrawn
- `aspServiceFactory` defaults to `IPFSAspService` — fetches ASP trees from IPFS
- `0xBow` is the default ASP implementation (`data/0xbowAsp.service.ts`)

**Ragequit** — emergency exit bypassing the relayer. Produces a `PPv1PublicOperation` with raw `ragequit()` calldata that the user submits directly. Only unapproved (non-ASP-included) deposits can be ragequitted.

**Privacy Pools contract addresses:**

| Network | Chain ID | Entrypoint | Deployment Block |
|---------|----------|-----------|-----------------|
| Mainnet | 1 | `0x6818809EefCe719E480a7526D76bD3e561526b46` | 22153713 |
| Sepolia | 11155111 | `0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB` | 8461453 |

### Post-Quantum Future (`@kohaku-eth/pq-account`)

**Package status:** Production-ready on Sepolia.

When post-quantum mode is active, every transaction (including privacy operations) is signed with a hybrid signature: both an ECDSA (pre-quantum) sig and a lattice-based (post-quantum) sig must be valid. Encoded as `abi.encode(preQuantumSig, postQuantumSig)`. This is an ERC-4337 smart account deployed per user — not compatible with the current pure-EOA model.

Supported schemes: ECDSA secp256k1 (K1), P-256 (R1), FALCON, ML-DSA, ML-DSA ETH.

Sepolia verifier contracts:
- MLDSA: `0x10c978aacef41c74e35fc30a4e203bf8d9a9e548`
- MLDSAETH: `0x710f295f1715c2b08bccdb1d9841b4f833f6dde4`
- FALCON: `0x0724bb7c9e52f3be199964a2d70ff83a103ed99c`
- ETHFALCON: `0x146f0d9087001995ca63b648e865f6dbbb2d2915`
- Hybrid Verifier: `0xD22492F0b9dd284a9EC0fFef3C1675deA9f01d85`

Post-quantum signing is planned for Phase 7+ after the EOA/7702 model is fully stable.

### Private Trade Flow (Shield -> Swap -> Shield)

The shielded xStock trade route — implemented in Phase 6D:

```
1. User: "buy $10 of Tesla privately"
2. Chat Intent Parser -> { asset: 'xTSLA', amount: $10, mode: 'shielded' }
3. Guardrails check
4. Trade Executor (shielded path):
   a. Shield USDC:
      plugin.prepareShield({ asset: USDC, amount })
      → EOA submits PublicOperation to RailgunSmartWallet
      → Wait for shield confirmation (indexer sync)
   b. Private swap option A (unshield → swap → re-shield):
      plugin.prepareUnshield({ asset: USDC, amount }, swapIntermediaryAddress)
      → Uniswap V3 swap: USDC → xTSLA
      plugin.prepareShield({ asset: xTSLA, amount })
   c. Private swap option B (direct unshield to user):
      plugin.prepareUnshield({ asset: USDC, amount }, userEOA)
      → Public Uniswap swap
      plugin.prepareShield({ asset: xTSLA, amount })
5. Confirm + persist
```

Option A preserves stronger privacy (swap router does not see the EOA) but requires two separate proof generations. Option B is simpler to implement and is the Phase 6 default.

---

## Code Map

| Path | Purpose |
|------|---------|
| `src/modules/privacy/privacy.service.ts` | `PrivacyService` — protocol registry, lazy init, facade methods |
| `src/modules/privacy/privacy.types.ts` | Re-exports all privacy types from `src/types/privacy.ts` |
| `src/types/privacy.ts` | `IPrivacyProvider`, `ShieldParams`, `UnshieldParams`, `PrivateTransferParams`, `ShieldedBalance`, `PrivacyProtocol` enum |
| `src/modules/privacy/index.ts` | Public module API |
| `src/modules/transaction/transaction.service.ts` | Routes `mode: 'shielded'` txs to `PrivacyService` |
| `sources/kohaku-master/kohaku-master/packages/plugins/src/base.ts` | `PluginInstance<TAccountId, C>`, `TxFeatureMap`, `CreatePluginFn` |
| `sources/kohaku-master/kohaku-master/packages/plugins/src/host/index.ts` | `Host`, `Keystore`, `Storage`, `SecretStorage`, `Network` interfaces |
| `sources/kohaku-master/kohaku-master/packages/plugins/src/shared.ts` | `AssetAmount`, `AssetId`, `PrivateOperation`, `PublicOperation` |
| `sources/kohaku-master/kohaku-master/packages/plugins/examples/railgun.ts` | `RGInstance` type, `createRailgunPlugin` example |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/v1/factory.ts` | `createPPv1Plugin`, `createPPv1Broadcaster` |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/v1/interfaces.ts` | `PPv1Instance`, `PPv1PluginParameters`, `PPv1AssetAmount` |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/plugin/base.ts` | `PrivacyPoolsV1Protocol` — full implementation |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/plugin/interfaces/protocol-params.interface.ts` | `IStateManager`, `INote`, `PPv1PrivateOperation`, `PPv1PublicOperation` |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/account/keys.ts` | `SecretManager`, Privacy Pools BIP-32 key derivation |
| `sources/kohaku-master/kohaku-master/packages/privacy-pools/src/config.ts` | `PrivacyPoolsV1_0xBow` contract addresses (mainnet + Sepolia) |

---

## API Endpoints

None yet — planned. The Merlin backend does not participate in privacy operations directly. All ZK proofs are generated client-side. The backend's role is limited to:

- Persisting trade intent + outcome in Firestore (no private data)
- Providing the RPC URL for the frontend's `EthereumProvider`
- Enforcing guardrails before the privacy operation is initiated

Possible future endpoint: `POST /trade/shield-status` — poll for indexer sync state.

---

## Firestore Schema

None yet — planned. Privacy state (notes, merkle trees, nullifiers, last-synced block) is stored **client-side only**, never sent to the backend. This is a hard privacy requirement.

Trade records for shielded trades will be stored in Firestore with only the following fields:

```
trades/{userId}/{tradeId}:
  mode: 'shielded' | 'compliant'
  asset: string              // token symbol only
  side: 'buy' | 'sell'
  amountUsd: number          // approximate, from intent
  status: 'pending' | 'confirmed' | 'failed'
  timestamp: Timestamp
  // NO tx hash, NO addresses, NO amounts in base units
```

The on-chain transaction hash must NOT be stored in Firestore for shielded trades — it can be used to deanonymize the user by correlating the shield tx with the account.

---

## Configuration

### Railgun

```typescript
// Phase 6: Merlin will pass this config to the RailgunProvider IPrivacyProvider impl
interface RailgunConfig extends PrivacyModuleConfig {
    protocol: PrivacyProtocol.RAILGUN;
    chainId: 1 | 11155111;
    rpcUrl: string;                   // from ETH_RPC_URL / SEPOLIA_RPC_URL env vars
    railgunContractAddress: string;
    // Indexing range
    deploymentBlock: bigint;
    // Storage prefix for note/merkle cache keys in host.storage
    storagePrefix?: string;
}

const RAILGUN_CONTRACTS = {
    1:         '0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9',  // mainnet
    11155111:  'TBD',                                           // Sepolia — verify from Kohaku source
} as const;
```

### Privacy Pools

```typescript
// from sources/kohaku-master/.../packages/privacy-pools/src/config.ts
const PRIVACY_POOLS_ENTRYPOINTS = {
    1: {
        entrypointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        deploymentBlock: 22153713n,
    },
    11155111: {
        entrypointAddress: '0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB',
        deploymentBlock: 8461453n,
    },
} as const;
```

### Relayer / Broadcaster

Railgun and Privacy Pools both use relayers to submit `PrivateOperation` transactions on-chain without linking the originating EOA. The relayer URL is a runtime config, not hardcoded. For Railgun, the broadcaster API is specified via `RGBroadcasterParameters.broadcasterUrl`. For Privacy Pools, via `PPv1PluginParameters.broadcasterUrl`.

---

## What Kohaku Provides vs What Merlin Must Build

### Kohaku Provides
- `createRailgunPlugin(host, params)` — full Railgun account with all six operations
- `createPPv1Plugin(host, params)` — Privacy Pools account (shield + unshield + ragequit + notes)
- ZK-SNARK proof generation (Circomlibjs, Groth16, client-side)
- Merkle tree reconstruction and note scanning
- Note encryption/decryption using viewing key
- Nullifier tracking (prevents double-spend)
- Relayer/broadcaster client (`PrivacyPoolsBroadcaster`, Railgun broadcaster)
- ASP integration (`IPFSAspService`, `0xBow` implementation)
- All BIP-32 path derivation logic (Railgun + Privacy Pools paths)
- `EthereumProvider` abstraction (Ethers v6, Viem v2, Colibri, Helios backends)
- `SecretStorage` interface definition (encrypted-at-rest storage API)

### Merlin Must Build
- Concrete `Host` implementation wiring `WalletManager` to `host.keystore.deriveAt()`
- `IPrivacyProvider` implementations for Railgun and Privacy Pools wrapping the Kohaku plugins
- `SecretStorage` implementation backed by IndexedDB (interface exists in Kohaku; no implementation provided)
- Plaintext `Storage` implementation for note/merkle cache (backed by IndexedDB or localStorage)
- `EthereumProvider` adapter connecting Merlin's `ProviderService` to the Kohaku interface
- Path restriction enforcement in `deriveAt()` — only allow Railgun-valid paths
- `TransactionService` routing: detect `mode: 'shielded'` and dispatch to `PrivacyService`
- Shield transaction submission from the EOA (including ERC-20 approval if required)
- Sync scheduling — when to trigger `plugin.balance()` / `stateManager.sync()`
- Frontend privacy mode toggle, shielded balance display, operation status tracking
- Firestore persistence (trade intent only — no private on-chain data)
- Gas estimation for shield transactions (public tx, standard estimation applies)

---

## Current Limitations

- Not yet implemented — full integration is planned for Phase 6
- Phase 6 depends on Phase 4 (EIP-7702 + AmbirePaymaster) being complete, because shielded trades use the bundler broadcast mode for USDC gas payment on shield/unshield public transactions
- Railgun Sepolia contract address is not yet confirmed from the Kohaku source — must be verified before Sepolia testing begins
- Privacy Pools is WIP in Kohaku — treat as pre-production; do not expose to users until the Kohaku team marks it production-ready
- Post-quantum signing (`@kohaku-eth/pq-account`) requires a permanent ERC-4337 smart account, which conflicts with the current pure-EOA model — deferred to Phase 7+
- `prepareTransfer` (pool-internal transfer) is not available in Privacy Pools v1 — only Railgun supports this
- `SecretStorage` has no Kohaku implementation — Merlin must implement encrypted IndexedDB storage before private keys for viewing/spending can be cached safely
- Hardware wallet support for Railgun is noted as a TODO in the Kohaku source (`host/index.ts` line 73)
- Proof generation is single-threaded; a Web Worker should be used in the browser to avoid blocking the UI (not provided by Kohaku)

---

## Related

- `specs/features/auth-passkey.md` — passkey auth and seed derivation (prerequisite: spending/viewing keys come from the same BIP-39 seed)
- `specs/tech-stack.md` — full stack overview, privacy layer table, private trade flow diagram
- `specs/development-plan.md` — Phase 6 task breakdown (6A–6F)
- `sources/kohaku-master/kohaku-master/packages/plugins/` — plugin base interfaces
- `sources/kohaku-master/kohaku-master/packages/privacy-pools/` — Privacy Pools full source
- `src/modules/privacy/` — Merlin privacy module (service, types, index)
- `src/modules/transaction/` — TransactionService (routes public vs shielded)
