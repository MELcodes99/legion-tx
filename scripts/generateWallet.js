// Script to generate a backend wallet keypair
// Run with: node scripts/generateWallet.js

const { Keypair } = require('@solana/web3.js');

const keypair = Keypair.generate();

console.log('\n=== Backend Wallet Generated ===\n');
console.log('Public Key:', keypair.publicKey.toBase58());
console.log('\nPrivate Key (save as BACKEND_WALLET_PRIVATE_KEY secret):');
console.log(JSON.stringify(Array.from(keypair.secretKey)));
console.log('\n=== Important ===');
console.log('1. Save the private key in Lovable Cloud secrets as BACKEND_WALLET_PRIVATE_KEY');
console.log('2. Fund this wallet with SOL to cover gas fees');
console.log('3. Keep the private key secure and never commit it to version control');
console.log(`\nView wallet on Solscan: https://solscan.io/account/${keypair.publicKey.toBase58()}`);
console.log('\n=== Quick Fund Instructions ===');
console.log('For Devnet: solana airdrop 2', keypair.publicKey.toBase58(), '--url devnet');
console.log('For Mainnet: Transfer SOL from an exchange to the public key above');
