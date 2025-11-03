# Blockchain Explorer Configuration

The accounts page now supports direct links to blockchain explorers for crypto wallet accounts.

## Environment Variables

Add these to your `frontend/.env.local` file:

```bash
# EVM chains (Ethereum, Polygon, Arbitrum, etc.)
NEXT_PUBLIC_EVM_EXPLORER=https://etherscan.io

# Solana
NEXT_PUBLIC_SOLANA_EXPLORER=https://solscan.io

# Bitcoin
NEXT_PUBLIC_BITCOIN_EXPLORER=https://blockchair.com/bitcoin
```

## Alternative Explorers

### EVM Chains

- Ethereum: `https://etherscan.io`
- Polygon: `https://polygonscan.com`
- Arbitrum: `https://arbiscan.io`
- Base: `https://basescan.org`
- Optimism: `https://optimistic.etherscan.io`

### Solana

- Solscan: `https://solscan.io`
- Solana Explorer: `https://explorer.solana.com`

### Bitcoin

- Blockchair: `https://blockchair.com/bitcoin`
- Mempool: `https://mempool.space`
- Blockchain.com: `https://blockchain.com/explorer`

## How It Works

When you have a CryptoWallet account:

1. The system detects the network type (EVM/Solana/Bitcoin)
2. Uses the appropriate explorer URL from environment variables
3. Constructs a link: `{EXPLORER_URL}/address/{WALLET_ADDRESS}`
4. Displays an external link icon next to the account

Click the icon to view your wallet's portfolio on the blockchain explorer!
