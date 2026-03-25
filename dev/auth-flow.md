# Authentication Flow

## Overview
Merlin uses WebAuthn passkeys for passwordless authentication. No email, no social login — just biometrics (Face ID, fingerprint, Windows Hello). The passkey protects an encrypted BIP-39 seed phrase stored locally.

## Registration Flow
```
1. User taps "Create Account"
2. Frontend: POST /api/v1/auth/register/begin {display_name}
3. Backend: generates WebAuthn registration options (RP ID, challenge, user ID)
4. Backend: stores challenge in Firestore (5-min TTL, one-time use)
5. Frontend: navigator.credentials.create() — browser shows biometric prompt
6. User authenticates with biometrics
7. Frontend: POST /api/v1/auth/register/complete {credential attestation}
8. Backend: py-webauthn verifies attestation
9. Backend: creates user in Firestore, stores credential (public key, sign count)
10. Backend: returns JWT (24h expiry) + user_id
11. Frontend: generates BIP-39 mnemonic (24 words) via @scure/bip39
12. Frontend: derives encryption key from credential ID via HKDF-SHA256
13. Frontend: encrypts seed with Scrypt (N=131072, r=8, p=1) + AES-128-CTR + keccak256 MAC
14. Frontend: stores encrypted blob in IndexedDB
15. Frontend: derives ETH address from seed (BIP-44: m/44'/60'/0'/0/0) via @scure/bip32
16. Frontend: PATCH /api/v1/auth/address {address} — stores derived address
```

## Login Flow
```
1. User taps "Login"
2. Frontend: POST /api/v1/auth/login/begin {}
3. Backend: generates authentication options (discoverable credentials)
4. Backend: stores challenge in Firestore (5-min TTL)
5. Frontend: navigator.credentials.get() — browser shows biometric prompt
6. User authenticates
7. Frontend: POST /api/v1/auth/login/complete {credential assertion}
8. Backend: py-webauthn verifies assertion, updates sign count
9. Backend: returns JWT (24h expiry) + user info
10. Frontend: derives encryption key from credential ID via HKDF-SHA256
11. Frontend: decrypts seed from IndexedDB
12. Frontend: WalletManager unlocked — wallet ready
```

## Session Management
- JWT tokens: 24h expiry, stateless (no server-side sessions)
- WalletManager: in-memory decrypted seed with 15-min auto-lock
- Auto-lock: timer resets on activity, wallet re-locks requiring re-authentication
- Re-auth: sensitive operations (export seed, execute trade) require unlocked wallet

## Seed Import/Export
- Import: validate BIP-39 mnemonic → encrypt with current passkey-derived key → store in IndexedDB → re-derive address
- Export: decrypt seed from IndexedDB using in-memory key → display to user (sensitive)

## Security Model
- Private keys never leave the browser
- Backend stores only public key material (WebAuthn credential public key)
- Seed encrypted at rest with passkey-derived secret
- Challenge store: one-time use, 5-min TTL, Firestore-backed
- No session cookies — JWT in Authorization header

## Key Files
| File | Purpose |
|------|---------|
| frontend/lib/auth.ts | AuthContext, login/signup/logout, seed import/export |
| frontend/components/providers/auth-provider.tsx | AuthProvider implementation |
| frontend/components/auth-gate.tsx | Blocks UI until authenticated |
| frontend/components/auth-guard.tsx | Route protection |
| backend/auth/webauthn.py | py-webauthn ceremonies |
| backend/auth/session.py | JWT creation/verification |
| backend/auth/models.py | Pydantic models |
| backend/auth/dependencies.py | get_current_user dependency |
| backend/routers/auth.py | 6 auth endpoints |
| backend/db/users.py | User CRUD |
| backend/db/challenges.py | Challenge storage |
