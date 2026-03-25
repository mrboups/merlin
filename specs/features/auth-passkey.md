# Passkey Authentication

## Status: Live

## Overview

Merlin uses WebAuthn passkeys as the sole authentication mechanism for new accounts — no email, no password, no third-party auth provider. A passkey credential authenticates the user and derives the key material used to encrypt their BIP-39 seed phrase, which is stored encrypted in IndexedDB and never transmitted unencrypted. Sessions are managed server-side via 24-hour JWT tokens and client-side via a `WalletManager` that holds the decrypted seed in memory with a 15-minute auto-lock.

## Architecture

### Data Flow

```
[Browser] WebAuthn credential creation (platform authenticator)
    → challenge fetched from backend (Firestore-backed, 5-min TTL)
    → credential attested and verified by py-webauthn (backend)
    → JWT issued (24h), user record created in Firestore

[Browser] BIP-39 24-word mnemonic generated via @scure/bip39
    → encryption key derived: HKDF-SHA256(credentialId, salt)
    → seed encrypted: Scrypt(key) → AES-128-CTR + keccak256 MAC
    → encrypted blob stored in IndexedDB

[Browser] WalletManager.unlock(passkey assertion)
    → re-derives encryption key from credentialId
    → decrypts seed blob from IndexedDB
    → holds decrypted seed in memory
    → auto-locks after 15 minutes of inactivity

[Browser] BIP-44 key derivation on demand
    → @scure/bip32: m/44'/60'/0'/0/{index}
    → EOA private key used by Kohaku TxSigner
```

### Modules Involved

| Module | Role |
|--------|------|
| `backend/auth/` | WebAuthn registration and authentication, JWT sessions |
| `backend/db/` | User and credential persistence (Firestore), challenge lifecycle |
| `backend/routers/auth.py` | HTTP API surface (6 endpoints) |
| `frontend/lib/auth.ts` | AuthProvider, WalletManager, passkey initiation |
| `frontend/lib/crypto.ts` | Seed generation, Scrypt+AES encryption, HKDF key derivation, BIP-44 |
| `frontend/components/` | Auth gate, route protection, auth context provider |

## Implementation Details

### WebAuthn Registration (backend: py-webauthn 2.1.0)

Registration is a two-step challenge/response flow:

1. `POST /auth/register/begin` — backend generates a random challenge, stores it in Firestore with a 5-minute TTL, returns `PublicKeyCredentialCreationOptions`.
2. `POST /auth/register/complete` — browser submits the attestation response; py-webauthn verifies attestation, extracts the public key and credential ID, writes a `StoredCredential` record under the user's Firestore document, deletes the challenge on first read (single-use), and issues a JWT.

Registration enforces:
- `authenticatorAttachment: platform` — device-bound passkeys only
- `userVerification: required` — biometric/PIN required on every use
- `residentKey: required` — discoverable credentials (no username needed at login)
- Supported algorithms: ES256 (alg -7, P-256) and RS256 (alg -257)
- RP ID: `merlin.app`, origin: `https://merlin.app`

Multiple passkeys per account are supported. Each additional passkey registration goes through the same begin/complete flow with the existing user's ID. The stored credential schema tracks `credentialId` (base64url), raw public key bytes, sign counter (anti-replay), transports, device type, `createdAt`, and `lastUsedAt`.

### WebAuthn Authentication (backend: py-webauthn 2.1.0)

1. `POST /auth/login/begin` — backend generates a fresh challenge, stores it in Firestore (5-min TTL). No username required (resident key / passkey flow).
2. `POST /auth/login/complete` — browser submits the assertion; py-webauthn verifies signature using the stored public key, validates that the sign counter is strictly greater than the stored value (replay protection), updates `lastUsedAt` and the stored counter, deletes the challenge, and issues a new JWT.

### Seed Generation

On new account creation (after successful registration), the browser generates a 24-word BIP-39 mnemonic using `@scure/bip39` with the English wordlist (`generateMnemonic(wordlist, 256)`). The mnemonic is never sent to the server.

### Seed Encryption

The encryption key is derived from the passkey credential ID using HKDF-SHA256:

```
encryptionKey = HKDF-SHA256(
    ikm  = credentialId (raw bytes),
    salt = random 32-byte salt (stored alongside ciphertext),
    info = "merlin-seed-encryption"
)
```

The derived key feeds Ambire keystore's Scrypt+AES-128-CTR pattern:

```
derivedKey (64 bytes) = Scrypt(
    password = encryptionKey,
    salt     = storedSalt,
    N = 131072, r = 8, p = 1, dkLen = 64
)

ciphertext = AES-128-CTR(
    key = derivedKey[0:16],
    iv  = derivedKey[16:32],
    plaintext = mnemonic (UTF-8)
)

mac = keccak256(derivedKey[32:64] || ciphertext)
```

The encrypted blob `{ salt, iv, ciphertext, mac }` is serialized as JSON and stored in IndexedDB under the key `merlin_encrypted_seed`. The mac is verified on every decrypt to detect tampering or key mismatch before attempting decryption.

### BIP-44 Key Derivation

Once the seed is decrypted into memory by `WalletManager`, EOA keys are derived on demand:

```
hdNode = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic))
child  = hdNode.derive("m/44'/60'/0'/0/{index}")
privateKey = child.privateKey   // 32-byte Uint8Array
address    = computeAddress(privateKey)
```

Default account uses index 0. Additional accounts increment the index. Derived private keys are passed to Kohaku's TxSigner and are never stored anywhere — they live only in memory for the duration of a signing operation.

### WalletManager (frontend/lib/auth.ts)

`WalletManager` is a singleton that owns the in-memory lifecycle of the decrypted seed:

- `unlock(assertion)` — decrypts the IndexedDB blob using the re-derived key from the asserted credentialId, holds the mnemonic in a `Uint8Array` buffer, resets the auto-lock timer.
- `lock()` — zero-fills the mnemonic buffer (`buffer.fill(0)`), clears the reference, cancels the auto-lock timer.
- `isUnlocked()` — returns true if the buffer is populated.
- `deriveAccount(index)` — derives and returns an `{ address, privateKey }` pair without exposing the mnemonic.
- Auto-lock fires after 15 minutes of inactivity. The timer resets on any `deriveAccount` call. The timeout value is configurable via the `WALLET_AUTO_LOCK_SECONDS` constant in `frontend/lib/auth.ts`.

Re-authentication is required (fresh passkey assertion → `unlock()`) before: sending transactions, exporting the seed phrase, and adding new passkeys.

### Session Management

- Backend issues JWTs signed with a server secret (python-jose, HS256, 24-hour expiry).
- The JWT is stored in an `httpOnly` cookie to prevent XSS access.
- `get_current_user` FastAPI dependency (`backend/auth/dependencies.py`) validates the JWT and resolves the user on every protected route.
- `POST /auth/logout` clears the cookie and invalidates the session server-side.
- The `PATCH /auth/address` endpoint lets the frontend register the derived EOA address against the authenticated user record after first unlock.

## Code Map

| File | Purpose |
|------|---------|
| `backend/auth/webauthn.py` | py-webauthn registration and authentication verification; challenge generation; credential validation logic |
| `backend/auth/session.py` | JWT creation and verification via python-jose; 24-hour token lifecycle |
| `backend/auth/models.py` | Pydantic request/response models for all auth endpoints (RegistrationBeginRequest, AuthenticationCompleteRequest, etc.) |
| `backend/auth/dependencies.py` | `get_current_user` FastAPI dependency; validates JWT from cookie and resolves the authenticated user |
| `backend/db/users.py` | User CRUD operations in Firestore; credential sub-collection read/write; stored credential schema |
| `backend/db/challenges.py` | WebAuthn challenge store backed by Firestore; single-use semantics; 5-minute TTL enforcement |
| `backend/routers/auth.py` | FastAPI router mounting all 6 auth endpoints with dependency injection |
| `frontend/lib/auth.ts` | `AuthProvider` React context, `WalletManager` singleton (unlock/lock/auto-lock/deriveAccount), passkey registration and assertion flows using `@simplewebauthn/browser` |
| `frontend/lib/crypto.ts` | BIP-39 mnemonic generation (`@scure/bip39`), HKDF key derivation, Scrypt+AES-128-CTR encryption/decryption, keccak256 MAC, BIP-44 derivation via `@scure/bip32` |
| `frontend/components/auth-gate.tsx` | UI component that conditionally renders children only when the wallet is unlocked; displays passkey prompt otherwise |
| `frontend/components/auth-guard.tsx` | Next.js route-level protection; redirects unauthenticated users to onboarding |
| `frontend/components/providers/auth-provider.tsx` | Mounts `AuthProvider` context at the app root; connects to `WalletManager` lifecycle events |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register/begin` | Generate a WebAuthn challenge and return `PublicKeyCredentialCreationOptions`. Stores challenge in Firestore with 5-min TTL. |
| `POST` | `/auth/register/complete` | Verify attestation via py-webauthn, store credential, create user record, issue JWT cookie. |
| `POST` | `/auth/login/begin` | Generate a WebAuthn challenge and return `PublicKeyCredentialRequestOptions` for resident-key (passwordless) flow. |
| `POST` | `/auth/login/complete` | Verify assertion via py-webauthn, validate sign counter, update credential, issue JWT cookie. |
| `POST` | `/auth/logout` | Clear JWT cookie and invalidate the server-side session. |
| `PATCH` | `/auth/address` | Store the derived EOA address against the authenticated user record. Called after first `WalletManager.unlock()`. |

## Firestore Schema

### `users` collection

```
users/{userId}
  id:          string         // UUID, matches WebAuthn user.id
  createdAt:   timestamp
  address:     string | null  // EOA address, set after first unlock

  credentials/{credentialId}  // sub-collection, one doc per registered passkey
    credentialId:  string      // base64url encoded
    publicKey:     bytes       // raw COSE public key bytes
    counter:       number      // sign count for replay protection
    transports:    string[]    // ["internal", "hybrid", ...]
    deviceType:    string      // "singleDevice" | "multiDevice"
    createdAt:     timestamp
    lastUsedAt:    timestamp
```

### `challenges` collection

```
challenges/{challengeId}
  challenge:   string     // base64url encoded random bytes
  userId:      string | null  // null for login (pre-user-resolution)
  type:        string     // "registration" | "authentication"
  createdAt:   timestamp
  expiresAt:   timestamp  // createdAt + 5 minutes; enforced in queries
```

Challenges are deleted from Firestore on first successful use (single-use semantics). A background cleanup job or Firestore TTL policy removes expired unclaimed challenges.

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `WEBAUTHN_RP_ID` | Relying Party ID (`merlin.app` in production, `localhost` in dev) | Yes |
| `WEBAUTHN_RP_NAME` | Relying Party display name (`Merlin`) | Yes |
| `WEBAUTHN_ORIGIN` | Expected origin (`https://merlin.app`) | Yes |
| `JWT_SECRET` | HMAC-SHA256 signing secret for python-jose | Yes |
| `JWT_ALGORITHM` | Algorithm (`HS256`) | Yes |
| `FIREBASE_PROJECT_ID` | Firestore project for credential and challenge storage | Yes |

### Constants (frontend/lib/auth.ts)

| Constant | Value | Description |
|----------|-------|-------------|
| `WALLET_AUTO_LOCK_SECONDS` | `900` (15 minutes) | Inactivity timeout before WalletManager locks |
| `CHALLENGE_TTL_SECONDS` | `300` (5 minutes) | Challenge validity window (mirrors backend) |

### Constants (backend)

| Constant | Value | Location |
|----------|-------|----------|
| JWT expiry | 24 hours | `backend/auth/session.py` |
| Challenge TTL | 5 minutes | `backend/db/challenges.py` |
| Scrypt N | 131072 | `frontend/lib/crypto.ts` |
| Scrypt r | 8 | `frontend/lib/crypto.ts` |
| Scrypt p | 1 | `frontend/lib/crypto.ts` |
| dkLen | 64 bytes | `frontend/lib/crypto.ts` |

## Current Limitations

- **Seed phrase import (Path 2) is not implemented.** Users cannot onboard with an existing BIP-39 mnemonic. The flow is defined in the agent spec but has no backend or frontend implementation yet.
- **Wallet connection (Path 3) is not implemented.** WalletConnect and injected provider detection (`window.ethereum`) are not wired up. No external wallet can be connected.
- **Railgun key derivation is not wired.** After BIP-44 derivation, no Railgun spending/viewing keys are derived. Privacy features are blocked behind this gap.
- **Multiple passkey management UI is not implemented.** The backend supports multiple credentials per user, but there is no UI to list, add, or revoke passkeys.
- **Seed export / backup UI is not implemented.** The re-auth gate and display screen for exporting the 24-word mnemonic are not built.
- **Sign counter enforcement is in place but not alerting.** Counter decrements reject authentication correctly but do not surface a user-visible warning or trigger credential revocation.
- **Challenge cleanup.** Expired challenges are not automatically purged. A Firestore TTL policy or Cloud Scheduler job needs to be configured for the `challenges` collection.
- **Device recovery flow is not implemented.** If a user loses all devices, the seed phrase import path (not yet built) is the only recovery mechanism. The unrecoverable scenario (no seed backup, all devices lost) has no in-app guidance.

## Related

- `specs/project-spec.md` — overall architecture, tech stack decisions, Kohaku infrastructure
- `specs/development-plan.md` — implementation phases and milestone tracking
- `agents/passkey-auth.md` — passkey auth agent spec: WebAuthn patterns, encryption flow, session rules, recovery matrix
- `agents/ambire-7702.md` — Ambire keystore encryption reference (Scrypt+AES pattern origin)
- `agents/kohaku-expert.md` — Railgun key derivation that follows BIP-44 derivation
