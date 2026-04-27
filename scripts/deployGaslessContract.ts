/**
 * Deploys GaslessTransfer.sol to Base and/or Ethereum mainnet.
 *
 * USAGE (run locally — NOT inside an edge function):
 *   1. Install deps:
 *        npm i ethers@6 solc@0.8.24 @openzeppelin/contracts@5
 *   2. Export env vars:
 *        export DEPLOYER_PRIVATE_KEY=0x...               # EOA that pays for the deploy
 *        export BACKEND_WALLET_ADDRESS=0x89AF...9bb1     # constructor arg (the relayer EOA)
 *        export DEPLOY_CHAINS=base,ethereum              # or just "base"
 *   3. Run:
 *        npx tsx scripts/deployGaslessContract.ts
 *        # or: node --import tsx scripts/deployGaslessContract.ts
 *
 * After it prints the addresses, add them as Lovable Cloud secrets:
 *   GASLESS_CONTRACT_BASE
 *   GASLESS_CONTRACT_ETHEREUM
 */

import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore — solc has no first-class types
import solc from 'solc';

const RPC: Record<string, string> = {
  base: 'https://base-rpc.publicnode.com',
  ethereum: 'https://ethereum-rpc.publicnode.com',
};

function findOpenZeppelin(name: string): string | null {
  // Try several common locations
  const candidates = [
    path.resolve(process.cwd(), 'node_modules', name),
    path.resolve(__dirname, '..', 'node_modules', name),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function readImport(importPath: string): { contents: string } | { error: string } {
  // OpenZeppelin import? Resolve from node_modules.
  if (importPath.startsWith('@openzeppelin/')) {
    const ozRoot = findOpenZeppelin('@openzeppelin/contracts');
    if (!ozRoot) return { error: '@openzeppelin/contracts not installed. Run: npm i @openzeppelin/contracts@5' };
    const sub = importPath.replace('@openzeppelin/contracts/', '');
    const full = path.join(ozRoot, sub);
    if (!fs.existsSync(full)) return { error: `not found: ${full}` };
    return { contents: fs.readFileSync(full, 'utf8') };
  }
  // Relative import within our own contracts dir
  const projectFile = path.resolve(process.cwd(), 'src/contracts', importPath);
  if (fs.existsSync(projectFile)) return { contents: fs.readFileSync(projectFile, 'utf8') };
  return { error: `cannot resolve import: ${importPath}` };
}

function compile(): { abi: any; bytecode: string } {
  const sourcePath = path.resolve(process.cwd(), 'src/contracts/GaslessTransfer.sol');
  const source = fs.readFileSync(sourcePath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: { 'GaslessTransfer.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
    },
  };

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: readImport }),
  );

  if (output.errors) {
    const fatal = output.errors.filter((e: any) => e.severity === 'error');
    if (fatal.length) {
      console.error(JSON.stringify(fatal, null, 2));
      throw new Error('Solidity compilation failed');
    }
    // print warnings
    for (const e of output.errors) console.warn(e.formattedMessage);
  }

  const contract = output.contracts['GaslessTransfer.sol']['GaslessTransfer'];
  return {
    abi: contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object,
  };
}

async function deployTo(chain: string, abi: any, bytecode: string, deployerKey: string, backendWallet: string) {
  const rpc = RPC[chain];
  if (!rpc) throw new Error(`No RPC configured for chain: ${chain}`);

  console.log(`\n=== Deploying to ${chain} (${rpc}) ===`);
  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(deployerKey, provider);
  const balance = await provider.getBalance(signer.address);
  console.log(`Deployer: ${signer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error(`Deployer has no ETH on ${chain}. Fund ${signer.address} first.`);
  }

  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  console.log(`Submitting deploy tx (constructor arg: ${backendWallet})...`);
  const contract = await factory.deploy(backendWallet);
  const txHash = contract.deploymentTransaction()?.hash;
  console.log(`Deploy tx: ${txHash}`);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`✅ ${chain.toUpperCase()} GaslessTransfer deployed at: ${address}`);
  console.log(`   Add this as the secret: GASLESS_CONTRACT_${chain.toUpperCase()}`);
  return address;
}

async function main() {
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const backendWallet = process.env.BACKEND_WALLET_ADDRESS;
  const chains = (process.env.DEPLOY_CHAINS || 'base').split(',').map((c) => c.trim().toLowerCase());

  if (!deployerKey) throw new Error('DEPLOYER_PRIVATE_KEY env var required');
  if (!backendWallet || !ethers.isAddress(backendWallet)) {
    throw new Error('BACKEND_WALLET_ADDRESS env var must be a valid 0x address');
  }

  console.log('Compiling GaslessTransfer.sol...');
  const { abi, bytecode } = compile();
  console.log(`Bytecode size: ${(bytecode.length - 2) / 2} bytes`);

  // Persist ABI for reference
  const outPath = path.resolve(process.cwd(), 'scripts/GaslessTransfer.abi.json');
  fs.writeFileSync(outPath, JSON.stringify(abi, null, 2));
  console.log(`ABI written to ${outPath}`);

  const results: Record<string, string> = {};
  for (const chain of chains) {
    results[chain] = await deployTo(chain, abi, bytecode, deployerKey, backendWallet);
  }

  console.log('\n=== Summary ===');
  for (const [chain, addr] of Object.entries(results)) {
    console.log(`${chain}: ${addr}  →  set secret GASLESS_CONTRACT_${chain.toUpperCase()}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
