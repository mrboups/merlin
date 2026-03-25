# Privacy

## Three Transaction Modes
Merlin supports three levels of privacy for every transaction:

### Public
Standard Ethereum transaction. Visible on-chain to anyone. This is the default mode.

### Shielded (Railgun)
Fully private transaction using zero-knowledge proofs. Hides the sender, receiver, and amount. Uses the Railgun protocol on Ethereum mainnet.

To trade privately: "Buy $50 of Tesla **privately**"

### Compliant (Privacy Pools)
Private transaction that is provably compliant. Your funds are hidden, but you can prove they don't come from sanctioned sources. Uses Privacy Pools with selective disclosure.

## How Privacy Works
Merlin uses the Railgun protocol (via the Kohaku SDK) to enable on-chain privacy:
1. **Shield**: Your tokens are deposited into a shielded pool
2. **Private operation**: Trades happen within the shielded pool using zero-knowledge proofs
3. **Unshield**: When you want funds back in your public wallet, they exit the pool

The zero-knowledge proofs ensure that no one can link your shielded transactions to your public address.

## Non-Custodial Privacy
- Your privacy keys are derived from your seed phrase
- No one (not even Merlin) can see your shielded transactions
- You always control your funds

## Current Status
Privacy features are currently in development. The public transaction mode is fully operational.
