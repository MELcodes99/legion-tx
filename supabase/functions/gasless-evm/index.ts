import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import { ethers } from 'npm:ethers@6.13.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const CHAIN_CONFIG = {
  base: { rpcUrl: 'https://mainnet.base.org', fallbackRpcs: ['https://base-rpc.publicnode.com', 'https://1rpc.io/base'], chainId: 8453, gasFee: 0.40,
    tokens: { 'native': { name: 'ETH', decimals: 18 }, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': { name: 'USDC', decimals: 6 }, '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2': { name: 'USDT', decimals: 6 } } as Record<string, { name: string; decimals: number }> },
  ethereum: { rpcUrl: 'https://cloudflare-eth.com', fallbackRpcs: ['https://ethereum-rpc.publicnode.com', 'https://1rpc.io/eth'], chainId: 1, gasFee: 0.40,
    tokens: { 'native': { name: 'ETH', decimals: 18 }, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { name: 'USDC', decimals: 6 }, '0xdAC17F958D2ee523a2206206994597C13D831ec7': { name: 'USDT', decimals: 6 } } as Record<string, { name: string; decimals: number }> },
};

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
];

const GASLESS_CONTRACT_ABI = [
  'function gaslessTransfer(address sender, address receiver, address tokenToSend, uint256 amount, address feeToken, uint256 feeAmount) external',
  'function gaslessTransferSameToken(address sender, address receiver, address token, uint256 amount, uint256 feeAmount) external',
  'function checkApproval(address token, address owner) external view returns (uint256)',
  'function backendWallet() external view returns (address)',
];

const GASLESS_CONTRACT_ADDRESSES: Record<string, string | null> = { ethereum: null, base: null };

const PERMIT_SUPPORTED_TOKENS: Record<string, { name: string; version: string }> = {
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { name: 'USD Coin', version: '2' },
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': { name: 'USD Coin', version: '2' },
};

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const PERMIT2_ABI = [
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function permitTransferFrom(tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, tuple(address to, uint256 requestedAmount) transferDetails, address owner, bytes signature)',
];

const TRANSFER_TYPES = {
  Transfer: [
    { name: 'sender', type: 'address' }, { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' }, { name: 'fee', type: 'uint256' },
    { name: 'token', type: 'address' }, { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

function getTokenConfig(tokenKey: string) {
  const tokens: Record<string, { mint: string; symbol: string; decimals: number; chain: string; isNative: boolean }> = {
    'USDC_BASE': { mint: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6, chain: 'base', isNative: false },
    'USDT_BASE': { mint: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT', decimals: 6, chain: 'base', isNative: false },
    'BASE_ETH': { mint: 'native', symbol: 'ETH', decimals: 18, chain: 'base', isNative: true },
    'USDC_ETH': { mint: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6, chain: 'ethereum', isNative: false },
    'USDT_ETH': { mint: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6, chain: 'ethereum', isNative: false },
    'ETH': { mint: 'native', symbol: 'ETH', decimals: 18, chain: 'ethereum', isNative: true },
  };
  return tokens[tokenKey];
}

function getPermitConfig(tokenAddress: string) { return PERMIT_SUPPORTED_TOKENS[tokenAddress] || null; }

const priceCache: Record<string, { price: number; timestamp: number }> = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000;

async function fetchTokenPrice(tokenId: string): Promise<number> {
  const cached = priceCache[tokenId];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) return cached.price;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`);
    if (!r.ok) { if (r.status === 429 && cached) return cached.price; throw new Error(`CoinGecko ${r.status}`); }
    const d = await r.json(); const p = d[tokenId]?.usd;
    if (!p) { if (cached) return cached.price; throw new Error(`No price for ${tokenId}`); }
    priceCache[tokenId] = { price: p, timestamp: Date.now() }; return p;
  } catch (e) { if (cached) return cached.price; throw e; }
}

async function logTransaction(data: any) {
  try {
    await supabaseAdmin.from('transactions').insert(data);
    if (data.status === 'success') {
      await supabaseAdmin.rpc('insert_chain_transaction', { p_chain: data.chain, p_sender: data.sender_address, p_receiver: data.receiver_address, p_amount: data.amount, p_token_sent: data.token_sent, p_gas_token: data.gas_token, p_status: data.status, p_tx_hash: data.tx_hash || '', p_gas_fee_usd: data.gas_fee_usd || 0 });
      await supabaseAdmin.rpc('record_transaction_stats', { p_wallet_address: data.sender_address, p_network: data.chain, p_volume: data.amount, p_fee: data.gas_fee_usd || 0 });
      await supabaseAdmin.rpc('update_chain_rankings');
    }
  } catch (err) { console.error('Log error:', err); }
}

async function createProviderWithFallback(chain: 'base' | 'ethereum') {
  const cfg = CHAIN_CONFIG[chain];
  for (const rpc of [cfg.rpcUrl, ...cfg.fallbackRpcs]) {
    try { const p = new ethers.JsonRpcProvider(rpc); await p.getBlockNumber(); return p; } catch {}
  }
  return new ethers.JsonRpcProvider(cfg.rpcUrl);
}

async function fetchErc20Balance(chain: 'base' | 'ethereum', tokenAddress: string, wallet: string): Promise<bigint> {
  const cfg = CHAIN_CONFIG[chain];
  for (const rpc of [cfg.rpcUrl, ...cfg.fallbackRpcs]) {
    try {
      const p = new ethers.JsonRpcProvider(rpc);
      return await new ethers.Contract(tokenAddress, ERC20_ABI, p).balanceOf(wallet);
    } catch {}
  }
  throw new Error('Failed to fetch balance from all RPCs');
}

const RATE_LIMIT_WINDOW_MINUTES = 60;
const MAX_REQUESTS_PER_WINDOW = 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, chain } = body;
    console.log('Gasless-evm request:', { action, chain });

    const evmKey = Deno.env.get('EVM_BACKEND_WALLET_PRIVATE_KEY');
    if (!evmKey) return new Response(JSON.stringify({ error: 'EVM backend wallet not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let evmBackendWallet: any;
    try {
      const trimmed = evmKey.trim();
      let hex: string;
      if (trimmed.startsWith('[')) {
        const bytes = new Uint8Array(JSON.parse(trimmed));
        hex = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      } else hex = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
      evmBackendWallet = new ethers.Wallet(hex);
      console.log('EVM wallet:', evmBackendWallet.address);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid EVM wallet config' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get_backend_wallet') {
      return new Response(JSON.stringify({ evmAddress: evmBackendWallet.address, message: 'EVM wallet retrieved' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'build_atomic_tx') {
      const { senderPublicKey, recipientPublicKey, amountUSD, amount, tokenAmount: clientTokenAmount, mint, decimals, gasToken, tokenSymbol } = body;
      const effectiveAmountUSD = amountUSD ?? amount ?? 0;
      const effectiveTokenAmount = clientTokenAmount ?? amount ?? 0;

      if (!senderPublicKey || !recipientPublicKey || effectiveAmountUSD <= 0 || !mint || decimals == null)
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      // Rate limiting
      const now = new Date();
      const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
      const { data: rl } = await supabaseAdmin.from('transfer_rate_limits').select('*').eq('wallet_address', senderPublicKey).gte('window_start', windowStart.toISOString()).order('window_start', { ascending: false }).limit(1).maybeSingle();
      if (rl && rl.request_count >= MAX_REQUESTS_PER_WINDOW)
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (rl) await supabaseAdmin.from('transfer_rate_limits').update({ request_count: rl.request_count + 1, updated_at: now.toISOString() }).eq('id', rl.id);
      else await supabaseAdmin.from('transfer_rate_limits').insert({ wallet_address: senderPublicKey, request_count: 1, window_start: now.toISOString() });

      if (effectiveAmountUSD < 2)
        return new Response(JSON.stringify({ error: 'Minimum transfer amount is $2' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const isNativeTransfer = mint === 'native';
      if (isNativeTransfer) return new Response(JSON.stringify({ error: 'Native ETH gasless transfers require user to pay gas', requiresUserGas: true, backendWallet: evmBackendWallet.address }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
      const isNativeGas = gasTokenConfig?.isNative || false;
      if (isNativeGas) return new Response(JSON.stringify({ error: 'Native ETH cannot be used for fee payment in gasless transfers', requiresUserGas: true, backendWallet: evmBackendWallet.address }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      try {
        const chainConfig = CHAIN_CONFIG[chain as 'base' | 'ethereum'];
        const feeAmountUSD = chainConfig.gasFee;

        let feeTokenSymbol = 'usd-coin', feeTokenDecimals = 6, feeTokenAddress = mint;
        if (gasTokenConfig) {
          feeTokenAddress = gasTokenConfig.mint;
          feeTokenSymbol = gasTokenConfig.symbol === 'USDT' ? 'tether' : 'usd-coin';
        } else {
          const tokenInfo = chainConfig.tokens[mint];
          if (tokenInfo?.name === 'USDT') feeTokenSymbol = 'tether';
        }

        const feeTokenPrice = await fetchTokenPrice(feeTokenSymbol);
        const feeAmountSmallest = BigInt(Math.round((feeAmountUSD / feeTokenPrice) * Math.pow(10, feeTokenDecimals)));
        const transferAmountSmallest = BigInt(Math.round(effectiveTokenAmount * Math.pow(10, decimals)));

        const provider = await createProviderWithFallback(chain as 'base' | 'ethereum');
        const tokenContract = new ethers.Contract(mint, ERC20_ABI, provider);

        let userBalance: bigint;
        try { userBalance = await fetchErc20Balance(chain as 'base' | 'ethereum', mint, senderPublicKey); }
        catch { return new Response(JSON.stringify({ error: 'Failed to verify balance' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

        const userAllowance = await tokenContract.allowance(senderPublicKey, evmBackendWallet.address);
        const useSameToken = feeTokenAddress.toLowerCase() === mint.toLowerCase();
        const totalNeeded = useSameToken ? transferAmountSmallest + feeAmountSmallest : transferAmountSmallest;

        if (userBalance < totalNeeded) return new Response(JSON.stringify({ error: 'Insufficient balance' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        if (!useSameToken) {
          let ftBal: bigint;
          try { ftBal = await fetchErc20Balance(chain as 'base' | 'ethereum', feeTokenAddress, senderPublicKey); }
          catch { return new Response(JSON.stringify({ error: 'Failed to verify fee token balance' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
          if (ftBal < feeAmountSmallest) return new Response(JSON.stringify({ error: 'Insufficient fee token balance' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const permitConfig = getPermitConfig(mint);
        const supportsNativePermit = permitConfig !== null;
        let permitNonce = 0;
        if (supportsNativePermit) try { permitNonce = Number(await tokenContract.nonces(senderPublicKey)); } catch {}

        let permit2Nonce = BigInt(0), supportsPermit2 = false, permit2ApprovalNeeded = false;
        if (!supportsNativePermit) {
          try {
            const p2Allow = await tokenContract.allowance(senderPublicKey, PERMIT2_ADDRESS);
            if (p2Allow >= totalNeeded) {
              const p2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, provider);
              const [, , n] = await p2.allowance(senderPublicKey, mint, evmBackendWallet.address);
              permit2Nonce = BigInt(n); supportsPermit2 = true;
            } else permit2ApprovalNeeded = true;
          } catch {}
        }

        const canUsePermit2 = !supportsNativePermit && supportsPermit2 && feeTokenAddress === mint;
        const supportsPermit = supportsNativePermit || canUsePermit2;
        const usePermit2 = canUsePermit2;
        const needsApproval = !supportsPermit && userAllowance < totalNeeded;

        let feeTokenNeedsApproval = false, feeTokenAllowance = BigInt(0);
        if (!useSameToken) {
          const ftc = new ethers.Contract(feeTokenAddress, ERC20_ABI, provider);
          feeTokenAllowance = await ftc.allowance(senderPublicKey, evmBackendWallet.address);
          const fp = getPermitConfig(feeTokenAddress);
          if (!fp) {
            let ftp2 = false;
            try { ftp2 = (await ftc.allowance(senderPublicKey, PERMIT2_ADDRESS)) >= feeAmountSmallest; } catch {}
            feeTokenNeedsApproval = !ftp2 && feeTokenAllowance < feeAmountSmallest;
          }
        }

        const operationId = `${senderPublicKey}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const nonce = Date.now();

        let permitDomain = null;
        if (supportsNativePermit) permitDomain = { name: permitConfig!.name, version: permitConfig!.version, chainId: chainConfig.chainId, verifyingContract: mint };
        else if (usePermit2) permitDomain = { name: 'Permit2', chainId: chainConfig.chainId, verifyingContract: PERMIT2_ADDRESS };

        if (permit2ApprovalNeeded) {
          return new Response(JSON.stringify({ error: 'Permit2 approval required', permit2ApprovalNeeded: true, permit2Address: PERMIT2_ADDRESS, tokenContract: mint, requiredAmount: totalNeeded.toString() }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({
          success: true, backendWallet: evmBackendWallet.address, chainId: chainConfig.chainId,
          transferAmount: transferAmountSmallest.toString(), feeAmount: feeAmountSmallest.toString(), feeAmountUSD,
          tokenContract: mint, feeTokenContract: feeTokenAddress, isNativeFee: false,
          supportsPermit, supportsNativePermit, usePermit2, permitNonce: supportsNativePermit ? permitNonce : Number(permit2Nonce),
          permitDomain, permit2Address: PERMIT2_ADDRESS,
          needsApproval, currentAllowance: userAllowance.toString(), requiredAllowance: totalNeeded.toString(),
          feeTokenNeedsApproval, feeTokenAllowance: feeTokenAllowance.toString(),
          operationId, deadline, nonce,
          domain: { name: 'Legion Transfer', version: '1', chainId: chainConfig.chainId },
          message: { sender: senderPublicKey, recipient: recipientPublicKey, amount: transferAmountSmallest.toString(), fee: feeAmountSmallest.toString(), token: mint, nonce, deadline },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        console.error('EVM build error:', error);
        return new Response(JSON.stringify({ error: 'Failed to build EVM transaction', details: error instanceof Error ? error.message : 'Unknown' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'execute_evm_transfer') {
      const { senderAddress, recipientAddress, transferAmount, feeAmount, tokenContract, feeToken, signature, nonce, deadline,
        permitSignature, permitDeadline, permitValue, usePermit2, permit2Signature, permit2Nonce, permit2Deadline, permit2Amount } = body;

      if (Math.floor(Date.now() / 1000) > deadline)
        return new Response(JSON.stringify({ error: 'Signature expired' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      try {
        const chainConfig = CHAIN_CONFIG[chain as 'base' | 'ethereum'];
        let provider!: ethers.JsonRpcProvider, backendSigner!: ethers.Wallet;
        for (const rpc of [chainConfig.rpcUrl, ...chainConfig.fallbackRpcs]) {
          try { provider = new ethers.JsonRpcProvider(rpc); await provider.getBlockNumber(); backendSigner = evmBackendWallet.connect(provider); break; } catch {}
        }

        // Verify signature
        const domain = { name: 'Legion Transfer', version: '1', chainId: chainConfig.chainId };
        const message = { sender: senderAddress, recipient: recipientAddress, amount: BigInt(transferAmount), fee: BigInt(feeAmount), token: tokenContract || ethers.ZeroAddress, nonce: BigInt(nonce), deadline: BigInt(deadline) };
        const recovered = ethers.verifyTypedData(domain, TRANSFER_TYPES, message, signature);
        if (recovered.toLowerCase() !== senderAddress.toLowerCase())
          return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        if (!tokenContract) return new Response(JSON.stringify({ error: 'Native ETH gasless transfers not supported' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        let txHash: string;
        const contractAddress = GASLESS_CONTRACT_ADDRESSES[chain as string];

        if (contractAddress) {
          const gc = new ethers.Contract(contractAddress, GASLESS_CONTRACT_ABI, backendSigner);
          const useSame = feeToken === tokenContract || !feeToken || feeToken === 'native';
          const tx = useSame ? await gc.gaslessTransferSameToken(senderAddress, recipientAddress, tokenContract, transferAmount, feeAmount) : await gc.gaslessTransfer(senderAddress, recipientAddress, tokenContract, transferAmount, feeToken, feeAmount);
          txHash = tx.hash;
        } else if (usePermit2 && permit2Signature) {
          const p2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, backendSigner);
          const totalNeeded = BigInt(transferAmount) + BigInt(feeAmount);
          const amt = permit2Amount || totalNeeded.toString();
          const tx1 = await p2.permitTransferFrom({ permitted: { token: tokenContract, amount: amt }, nonce: permit2Nonce, deadline: permit2Deadline }, { to: evmBackendWallet.address, requestedAmount: amt }, senderAddress, permit2Signature);
          const tw = new ethers.Contract(tokenContract, ERC20_ABI, backendSigner);
          await tw.transfer(recipientAddress, transferAmount);
          txHash = tx1.hash;
        } else {
          const tw = new ethers.Contract(tokenContract, ERC20_ABI, backendSigner);
          const tc = new ethers.Contract(tokenContract, ERC20_ABI, provider);
          const totalNeeded = (!feeToken || feeToken === 'native' || feeToken?.toLowerCase() === tokenContract?.toLowerCase()) ? BigInt(transferAmount) + BigInt(feeAmount) : BigInt(transferAmount);
          let currentAllowance = await tc.allowance(senderAddress, evmBackendWallet.address);

          if (permitSignature && currentAllowance < totalNeeded) {
            const sig = ethers.Signature.from(permitSignature);
            const ptx = await tw.permit(senderAddress, evmBackendWallet.address, permitValue || totalNeeded.toString(), permitDeadline, sig.v, sig.r, sig.s);
            await ptx.wait();
            currentAllowance = await tc.allowance(senderAddress, evmBackendWallet.address);
          }

          if (currentAllowance < totalNeeded)
            return new Response(JSON.stringify({ error: 'Insufficient allowance', requiredAllowance: totalNeeded.toString(), currentAllowance: currentAllowance.toString() }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

          const useSame = !feeToken || feeToken === 'native' || feeToken?.toLowerCase() === tokenContract?.toLowerCase();
          const tx1 = await tw.transferFrom(senderAddress, recipientAddress, transferAmount);
          await tx1.wait();
          if (useSame) { const tx2 = await tw.transferFrom(senderAddress, evmBackendWallet.address, feeAmount); await tx2.wait(); }
          else {
            const ftc = new ethers.Contract(feeToken!, ERC20_ABI, backendSigner);
            const tx2 = await ftc.transferFrom(senderAddress, evmBackendWallet.address, feeAmount); await tx2.wait();
          }
          txHash = tx1.hash;
        }

        const explorerUrl = chain === 'base' ? `https://basescan.org/tx/${txHash}` : `https://etherscan.io/tx/${txHash}`;
        const chainTokens = CHAIN_CONFIG[chain as 'base' | 'ethereum'].tokens;
        const tInfo = chainTokens[tokenContract] || { name: 'UNKNOWN', decimals: 6 };
        await logTransaction({ sender_address: senderAddress, receiver_address: recipientAddress, amount: Number(BigInt(transferAmount)) / Math.pow(10, tInfo.decimals), token_sent: tInfo.name, gas_token: tInfo.name, chain, status: 'success', tx_hash: txHash, gas_fee_usd: CHAIN_CONFIG[chain as 'base' | 'ethereum'].gasFee });
        await supabaseAdmin.rpc('generate_daily_report');

        return new Response(JSON.stringify({ success: true, txHash, explorerUrl, message: 'Gasless transfer completed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        console.error('EVM execute error:', error);
        return new Response(JSON.stringify({ error: 'Transfer failed', details: error instanceof Error ? error.message : 'Unknown' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'check_evm_allowance') {
      const { tokenContract: tc, ownerAddress } = body;
      try {
        const cfg = CHAIN_CONFIG[chain as 'base' | 'ethereum'];
        const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
        const allowance = await new ethers.Contract(tc, ERC20_ABI, provider).allowance(ownerAddress, evmBackendWallet.address);
        return new Response(JSON.stringify({ allowance: allowance.toString(), spenderAddress: evmBackendWallet.address, hasUnlimitedApproval: allowance >= BigInt('0xffffffffffffffffffffffffffffffff') }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to check allowance' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'submit_atomic_tx') {
      return new Response(JSON.stringify({ success: true, message: 'EVM transaction recorded' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Gasless-evm error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
