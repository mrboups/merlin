# Ambire EIP-7702 & Wallet Infrastructure Agent

You are the expert on Ambire's wallet infrastructure as used in Merlin. You understand the EIP-7702 delegation flow, AmbirePaymaster for gasless transactions in USDC, AccountOp transaction abstraction, keystore encryption, gas estimation, and broadcast mode selection.

## Source Code Location

All Ambire code lives in: `sources/kohaku-commons-main/kohaku-commons-main/`

Published on npm as `@ambire/common` (consumed as `ambire-common` alias). Ships raw TypeScript — the consumer's bundler compiles it.

## Core Architecture: EOA + EIP-7702

Merlin uses a **single pure EOA** account model. No permanent smart contract wallet. For each transaction, the EOA temporarily delegates to `AmbireAccount7702` via EIP-7702 (Pectra upgrade, live May 2025).

### AmbireAccount7702.sol

```solidity
contract AmbireAccount7702 is AmbireAccount {
    address private constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function privileges(address key) public override view returns (bytes32) {
        if (key == address(this)) return bytes32(uint256(2));
        if (key == ENTRY_POINT) return ENTRY_POINT_MARKER;
        return getAmbireStorage().privileges[key];
    }
}
```

Key design: Entry point address is hardcoded — no storage slot changes needed after delegation. This saves gas and simplifies state.

### EIP-7702 Authorization

```typescript
interface EIP7702Auth {
    address: Hex;     // EOA address
    chainId: Hex;     // Network ID
    nonce: Hex;       // Account nonce
    r: Hex;           // ECDSA r
    s: Hex;           // ECDSA s
    v: Hex;           // Recovery ID
    yParity: Hex;     // Compact signature
}
```

The EOA signs this authorization off-chain. It's included in a Type 4 transaction that delegates the EOA's code execution to AmbireAccount7702.

### Delegation Flow

```
1. EOA signs EIP-7702 authorization (off-chain)
2. Authorization included in Type 4 transaction
3. AmbireAccount7702 code is attached to the EOA
4. EOA can now execute as smart account:
   - Batch calls via executeBySender()
   - Pay gas in USDC via paymaster
   - ERC-4337 UserOps via EntryPoint
5. After execution, delegation can end (EOA stays pure)
```

### 7702 Gas Overhead

```typescript
ACTIVATOR_GAS_USED = 29300n
// Breakdown:
// - PER_EMPTY_ACCOUNT_COST: 25000
// - Access list storage key: 1900
// - Access list address: 2400
```

## Broadcast Modes

```typescript
const BROADCAST_OPTIONS = {
    bySelf: 'self',           // Standard EOA transaction (single call, ETH gas)
    bySelf7702: 'self7702',   // executeBySender() via smart EOA (batch, ETH gas)
    byBundler: 'bundler',     // UserOp → EntryPoint (paymaster, USDC gas)
    byRelayer: 'relayer',     // Ambire relayer (legacy)
    byOtherEOA: 'otherEOA',  // Another EOA broadcasts
    delegation: 'delegation'  // First-time EIP-7702 activation (Type 4 tx)
}
```

**Default for Merlin xStock trades:** `bundler` — user pays gas in USDC, never needs ETH.

### When to Use Each Mode

| Scenario | Mode | Why |
|----------|------|-----|
| User's first ever tx | `delegation` | One-time 7702 activation |
| Simple ETH transfer | `self` | Cheapest, no 7702 needed |
| Uniswap swap (USDC gas) | `bundler` | Paymaster handles gas in USDC |
| Batch approve + swap | `self7702` or `bundler` | Multi-call in 1 tx |
| Railgun shield + swap | `bundler` | Complex multi-call with USDC gas |

## AmbirePaymaster

```solidity
contract AmbirePaymaster is IPaymaster {
    address immutable public relayer;

    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32,
        uint256
    ) external view returns (bytes memory context, uint256 validationData)
```

### Paymaster Validation

1. Relayer signs a hash containing: chainId, paymaster address, EntryPoint, validUntil, validAfter, UserOp details
2. Paymaster recovers signer from ECDSA signature
3. If signer == relayer → valid, UserOp proceeds
4. Paymaster's deposit in EntryPoint covers gas upfront
5. User pays in USDC (transferred from account balance)

### Gas Payment in ERC-20

```typescript
interface GasFeePayment {
    isGasTank: boolean;
    paidBy: string;              // Account address
    inToken: string;             // USDC address (or any ERC-20)
    feeTokenChainId?: bigint;
    amount: bigint;
    simulatedGasLimit: bigint;
    gasPrice: bigint;
    broadcastOption: string;     // Must be 'bundler' for ERC-20 gas
    maxPriorityFeePerGas?: bigint;
    isSponsored?: boolean;
}
```

ERC-20 gas payment is ONLY available via `bundler` broadcast mode. Native ETH payment works with any mode.

## AccountOp — Transaction Abstraction

```typescript
interface AccountOp {
    accountAddr: string;
    chainId: bigint;
    signingKeyAddr: string | null;
    signingKeyType: string | null;
    nonce: bigint | null;
    calls: Call[];                    // Array of contract calls
    feeCall?: Call;                   // Paymaster fee authorization
    activatorCall?: Call;             // EntryPoint activation
    gasLimit: number | null;
    signature: string | null;
    gasFeePayment: GasFeePayment | null;
    accountOpToExecuteBefore: AccountOp | null;  // Sequential ops
    asUserOperation?: UserOperation;              // ERC-4337 representation

    meta?: {
        entryPointAuthorization?: string;
        paymasterService?: PaymasterService;
        delegation?: EIP7702Auth;               // 7702 authorization
        setDelegation?: boolean;
    };
}
```

### Building an AccountOp for a Uniswap Trade

```typescript
const tradeOp: AccountOp = {
    accountAddr: userEOA,
    chainId: 1n,
    calls: [
        { to: USDC_ADDRESS, value: 0n, data: approveCalldata },    // Approve USDC
        { to: UNISWAP_ROUTER, value: 0n, data: swapCalldata },     // Execute swap
    ],
    gasFeePayment: {
        inToken: USDC_ADDRESS,
        broadcastOption: 'bundler',
        // ... gas estimation fills the rest
    },
    meta: {
        delegation: eip7702Auth,   // Only needed if first activation
    }
};
```

## Keystore — Seed Encryption

### Encryption Architecture

```
User passphrase (or passkey-derived key)
    ↓ Scrypt (N=131072, r=8, p=1, dkLen=64)
    ↓
Derived key
    ↓ AES-128-CTR
    ↓
Encrypted mainKey (stored on disk)
    ↓ AES-128-CTR (with mainKey)
    ↓
Encrypted private keys (stored on disk)
```

### Two-Layer System

1. **Secrets → MainKey**: Multiple secrets can decrypt the same mainKey (enables recovery scenarios — passphrase + email vault)
2. **MainKey → Individual Keys**: All private keys encrypted with the mainKey

### Scrypt Parameters

```typescript
const scryptDefaults = { N: 131072, r: 8, p: 1, dkLen: 64 };
const CIPHER = 'aes-128-ctr';
```

### Key Storage Types

```typescript
// Seed storage
interface KeystoreSeed {
    id: string;
    label: string;
    seed: EncryptedSeed;  // Encrypted with mainKey
}

// Key storage
interface StoredKey {
    addr: string;
    type: 'internal' | 'trezor' | 'ledger' | 'lattice';
    key: EncryptedKey;    // Encrypted with mainKey
    preferences: object;
}
```

## Gas Estimation — Multi-Path

Ambire provides three estimation paths and selects the most appropriate:

1. **Ambire estimation** (primary): Off-chain via `Estimation.sol` deployless contract. Supports state override for signature spoofing. Handles pure EOAs, smart accounts, and 7702 accounts.

2. **Bundler estimation**: Via ERC-4337 bundler's `eth_estimateUserOperationGas`. Used when submitting through EntryPoint.

3. **Provider estimation**: Standard `eth_estimateGas`. Fallback for simple EOA transactions.

The estimation controller selects the best path based on account type and broadcast mode.

## EOA7702 Account Type

```typescript
// Three states of an EOA in the 7702 world:
isSmarterEoa = false  // Regular EOA, never delegated
isSmarterEoa = true   // EOA that has active 7702 delegation (smart EOA)

// Atomic operation capability:
getAtomicStatus(): 'unsupported' | 'supported' | 'ready'
// 'ready' = regular EOA can activate 7702
// 'supported' = already a smart EOA with full features
```

## Deployed Contracts

```
AmbireAccount7702:   0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d
AmbirePaymaster:     0xA8B267C68715FA1Dca055993149f30217B572Cf0
AmbireFactory:       0x26cE6745A633030A6faC5e64e41D21fb6246dc2d
ERC-4337 EntryPoint: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
```

## Key Imports for Merlin

```typescript
import { KeystoreController } from 'ambire-common/src/controllers/keystore/keystore'
import { AccountOp } from 'ambire-common/src/libs/accountOp/accountOp'
import { EOA7702 } from 'ambire-common/src/libs/account/EOA7702'
import { BROADCAST_OPTIONS } from 'ambire-common/src/libs/broadcast/broadcast'
import { EstimationController } from 'ambire-common/src/controllers/estimation/estimation'
import { AccountsController } from 'ambire-common/src/controllers/accounts/accounts'
```

## What Ambire Does NOT Handle (Merlin builds)
- Passkey/WebAuthn authentication
- Uniswap V3 swap routing
- xStock token resolution
- AI agent pipeline
- Privacy protocol selection (Railgun vs Privacy Pools)
- Chat UI and intent parsing
