# Backend Wallet Setup Guide

## Critical: Proper Private Key Format

The `BACKEND_WALLET_PRIVATE_KEY` secret **MUST** be formatted as a JSON array of 64 numbers.

### ✅ CORRECT Format Example:
```
[174,47,154,16,73,192,181,104,53,245,105,45,244,142,157,163,54,224,122,27,245,87,123,45,67,89,123,45,78,90,12,34,56,78,90,123,45,67,89,12,34,56,78,90,123,45,67,89,12,34,56,78,90,123,45,67,89,12,34,56,78,90,123,45]
```

### ❌ WRONG Formats:
- Base58 string: `5JKb7n...` ❌
- Comma-separated without brackets: `174,47,154...` ❌
- String with brackets: `"[174,47,154...]"` ❌

## How to Generate and Format Your Backend Wallet

### Step 1: Generate a New Wallet
Run the included script:
```bash
node scripts/generateWallet.js
```

This will output:
```
Public Key: ABC123...XYZ
Private Key (Base58): 5JKb7n...
Private Key (Array for Supabase): [174,47,154,16,...]
```

### Step 2: Copy the Private Key Array
Copy **ONLY** the array portion from the output:
```
[174,47,154,16,73,192,181,104,...]
```

### Step 3: Update the Secret
1. In Lovable, when prompted for `BACKEND_WALLET_PRIVATE_KEY`
2. Paste the **complete JSON array** (including the square brackets)
3. Click Save

## Verification

After setting the secret, the edge function logs should show:
```
✅ Backend wallet loaded: [PUBLIC_KEY]
```

If you see this error:
```
❌ Error parsing backend wallet: SyntaxError
```

Your private key format is incorrect. Follow the steps above carefully.

## Fund Your Backend Wallet

Once configured, send SOL to your backend wallet address to cover gas fees:
- Minimum: 0.1 SOL
- Recommended: 0.5 SOL

You can check your backend wallet address by calling the edge function:
```javascript
fetch('YOUR_SUPABASE_URL/functions/v1/gasless-transfer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'get_backend_wallet' })
})
```

## Security Notes

⚠️ **NEVER** share your private key or commit it to version control
⚠️ Keep your backend wallet funded but not with excessive amounts
⚠️ Monitor your backend wallet balance regularly
