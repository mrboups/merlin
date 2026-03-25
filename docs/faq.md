# FAQ

## General

### What is Merlin?
Merlin is an AI-powered non-custodial wallet for trading tokenized stocks and crypto on Ethereum. You trade by chatting — just type what you want.

### What are xStocks?
xStocks are tokenized tracker certificates that track the price of real-world stocks 1:1. They are ERC-20 tokens on Ethereum issued by Backed Finance / xStocks.fi. They are NOT actual shares — they are on-chain tokens that mirror stock prices.

### Is Merlin custodial?
No. Merlin is fully non-custodial. Your private keys are generated and stored on your device. The backend never sees your private key. You sign all transactions yourself.

### What blockchain does Merlin use?
Ethereum only. Mainnet for production, Sepolia for testing.

## Account & Security

### How do I log in?
With your device's biometrics (Face ID, fingerprint, Windows Hello) via a passkey. No email or password needed.

### What if I lose my device?
If your passkeys sync across devices (e.g., via iCloud Keychain or Google Password Manager), you can log in on another device. If not, you'll need your 24-word seed phrase to recover your wallet.

### How do I back up my wallet?
Go to Settings and tap Export Seed Phrase. Write down the 24 words and store them safely offline. This is your master backup.

### Can I use Merlin on multiple devices?
Yes, if your passkeys sync (via iCloud, Google, etc.). Otherwise, you can import your seed phrase on a new device.

## Trading

### What can I trade?
- 80+ tokenized stocks (Tesla, Apple, NVIDIA, Google, etc.)
- ETFs (S&P 500, Nasdaq 100, Gold, Silver)
- Crypto (ETH, USDC, USDT)

### Are there trading limits?
- Minimum: $1
- Maximum per trade: $10,000
- Daily limit: $50,000
- Rate limit: 10 trades per minute

### How much are gas fees?
Gas fees vary with Ethereum network congestion. With gasless mode (EIP-7702), you can pay gas in USDC instead of ETH.

### Can US residents use Merlin?
US residents cannot trade xStocks (tokenized stocks) due to regulatory restrictions. Crypto trading (ETH, USDC) is not restricted.

### How long do trades take?
Trades are confirmed on Ethereum within 12-30 seconds (1-2 blocks).

## Troubleshooting

### My trade failed
- Check that you have enough balance (including gas fees)
- The token may have low liquidity
- Try again — Ethereum can be congested

### Prices seem wrong
Prices update every 60 seconds. If the market is moving fast, the displayed price may be slightly stale.

### I can't log in
- Make sure your device supports biometrics (Face ID, fingerprint, Windows Hello)
- Try a different browser if biometrics aren't available
- Clear browser data and re-authenticate if passkey issues persist

### The app seems slow
- Check your internet connection
- Ethereum RPC calls can be slow during congestion
- Refresh the page
