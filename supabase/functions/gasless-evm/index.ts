import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.79.0';
import { ethers } from 'npm:ethers@6.13.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const RATE_LIMIT_WINDOW_MINUTES = 60;
const MAX_REQUESTS_PER_WINDOW = 1000;

const CHAIN_CONFIG = {
  base: {
    rpcUrl: 'https://mainnet.base.org',
    fallbackRpcs: ['https://base-rpc.publicnode.com', 'https://1rpc.io/base'],
    chainId: 8453,
    gasFee: 0.4,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  ethereum: {
    rpcUrl: 'https://cloudflare-eth.com',
    fallbackRpcs: ['https://ethereum-rpc.publicnode.com', 'https://1rpc.io/eth'],
    chainId: 1,
    gasFee: 0.4,
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
} as const;

const GAS_TOKEN_MAP = {
  USDC_BASE: { mint: CHAIN_CONFIG.base.usdc, symbol: 'USDC', chain: 'base' },
  USDC_ETH: { mint: CHAIN_CONFIG.ethereum.usdc, symbol: 'USDC', chain: 'ethereum' },
} as const;

const ERC20_ABI = [
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function nonces(address owner) view returns (uint256)',
];

const TRANSFER_TYPES = {
  Transfer: [
    { name: 'sender', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'fee', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

function getTokenConfig(key?: string | null) {
  if (!key) return null;
  return GAS_TOKEN_MAP[key as keyof typeof GAS_TOKEN_MAP] ?? null;
}

function getEIP712Domain(chainId: number) {
  return { name: 'Legion Transfer', version: '1', chainId };
}

async function logTransaction(data: {
  sender_address: string;
  receiver_address: string;
  amount: number;
  token_sent: string;
  gas_token: string;
  chain: string;
  status: 'pending' | 'success' | 'failed';
  tx_hash?: string;
  gas_fee_usd?: number;
}) {
  try {
    const { error } = await supabaseAdmin.from('transactions').insert(data);
    if (error) console.error('Failed to log transaction:', error);
    if (data.status === 'success') {
      await supabaseAdmin.rpc('insert_chain_transaction', {
        p_chain: data.chain,
        p_sender: data.sender_address,
        p_receiver: data.receiver_address,
        p_amount: data.amount,
        p_token_sent: data.token_sent,
        p_gas_token: data.gas_token,
        p_status: data.status,
        p_tx_hash: data.tx_hash || '',
        p_gas_fee_usd: data.gas_fee_usd || 0,
      });
      await supabaseAdmin.rpc('record_transaction_stats', {
        p_wallet_address: data.sender_address,
        p_network: data.chain,
        p_volume: data.amount,
        p_fee: data.gas_fee_usd || 0,
      });
      await supabaseAdmin.rpc('update_chain_rankings');
    }
  } catch (error) {
    console.error('Error logging transaction:', error);
  }
}

async function updateDailyReport() {
  try {
    await supabaseAdmin.rpc('generate_daily_report');
  } catch (error) {
    console.error('Error updating daily report:', error);
  }
}

async function enforceRateLimit(walletAddress: string) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const { data, error } = await supabaseAdmin
    .from('transfer_rate_limits')
    .select('*')
    .eq('wallet_address', walletAddress)
    .gte('window_start', windowStart.toISOString())
    .order('window_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw new Error('Failed to validate transfer rate limits');

  if (data) {
    if (data.request_count >= MAX_REQUESTS_PER_WINDOW) {
      throw new Error(`Maximum ${MAX_REQUESTS_PER_WINDOW} transfers per hour reached`);
    }
    await supabaseAdmin
      .from('transfer_rate_limits')
      .update({ request_count: data.request_count + 1, updated_at: now.toISOString() })
      .eq('id', data.id);
  } else {
    await supabaseAdmin.from('transfer_rate_limits').insert({
      wallet_address: walletAddress,
      request_count: 1,
      window_start: now.toISOString(),
    });
  }
}

async function createProviderWithFallback(chain: 'base' | 'ethereum') {
  const config = CHAIN_CONFIG[chain];
  const allRpcs = [config.rpcUrl, ...config.fallbackRpcs];
  for (const rpcUrl of allRpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      await provider.getBlockNumber();
      return provider;
    } catch (_error) {}
  }
  throw new Error(`All RPC endpoints failed for ${chain}`);
}

function parseBackendWallet(secretValue: string) {
  const trimmed = secretValue.trim();
  if (trimmed.startsWith('[')) {
    const bytes = new Uint8Array(JSON.parse(trimmed));
    return '0x' + Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body as { action?: string };

    const evmBackendWalletPrivateKey = Deno.env.get('EVM_BACKEND_WALLET_PRIVATE_KEY');
    if (!evmBackendWalletPrivateKey) return json({ error: 'EVM backend wallet not configured' }, 500);

    let evmBackendWallet: ethers.Wallet;
    try {
      evmBackendWallet = new ethers.Wallet(parseBackendWallet(evmBackendWalletPrivateKey));
    } catch (error) {
      console.error('Error parsing EVM backend wallet:', error);
      return json({ error: 'Invalid EVM backend wallet configuration' }, 500);
    }

    if (action === 'build_atomic_tx') {
      const {
        chain,
        senderPublicKey,
        recipientPublicKey,
        amount,
        amountUSD,
        tokenAmount,
        mint,
        gasToken,
      } = body as {
        chain?: 'base' | 'ethereum';
        senderPublicKey?: string;
        recipientPublicKey?: string;
        amount?: number;
        amountUSD?: number;
        tokenAmount?: number;
        mint?: string;
        gasToken?: string;
      };

      if (!chain || !senderPublicKey || !recipientPublicKey || !mint) {
        return json({ error: 'Missing required fields' }, 400);
      }

      const chainConfig = CHAIN_CONFIG[chain];
      const gasTokenConfig = getTokenConfig(gasToken);
      if (!gasTokenConfig || gasTokenConfig.chain !== chain || gasTokenConfig.symbol !== 'USDC') {
        return json({ error: `Use ${chain === 'base' ? 'USDC_BASE' : 'USDC_ETH'} to pay gas on ${chain}` }, 400);
      }
      if (mint.toLowerCase() !== chainConfig.usdc.toLowerCase()) {
        return json({ error: `Only USDC is currently supported for fully gasless transfers on ${chain}` }, 400);
      }

      const effectiveAmountUSD = amountUSD ?? amount ?? 0;
      const effectiveTokenAmount = tokenAmount ?? amount ?? 0;
      if (effectiveAmountUSD < 2 || effectiveTokenAmount <= 0) {
        return json({ error: 'Minimum transfer amount is $2' }, 400);
      }

      await enforceRateLimit(senderPublicKey);

      const provider = await createProviderWithFallback(chain);
      const tokenContract = new ethers.Contract(chainConfig.usdc, ERC20_ABI, provider);
      const transferAmount = BigInt(Math.round(effectiveTokenAmount * 1e6));
      const feeAmount = BigInt(Math.round(chainConfig.gasFee * 1e6));
      const totalNeeded = transferAmount + feeAmount;
      const userBalance = await tokenContract.balanceOf(senderPublicKey);
      const permitNonce = await tokenContract.nonces(senderPublicKey);

      if (userBalance < totalNeeded) {
        return json({ error: 'Insufficient USDC balance' }, 400);
      }

      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      return json({
        success: true,
        backendWallet: evmBackendWallet.address,
        chainId: chainConfig.chainId,
        transferAmount: transferAmount.toString(),
        feeAmount: feeAmount.toString(),
        feeAmountUSD: chainConfig.gasFee,
        tokenContract: chainConfig.usdc,
        feeTokenContract: chainConfig.usdc,
        isNativeFee: false,
        supportsPermit: true,
        supportsNativePermit: true,
        usePermit2: false,
        permitNonce: Number(permitNonce),
        permitDomain: {
          name: 'USD Coin',
          version: '2',
          chainId: chainConfig.chainId,
          verifyingContract: chainConfig.usdc,
        },
        permit2Address: null,
        needsApproval: false,
        currentAllowance: '0',
        requiredAllowance: totalNeeded.toString(),
        feeTokenNeedsApproval: false,
        feeTokenAllowance: '0',
        operationId: `${senderPublicKey}-${Date.now()}`,
        deadline,
        nonce,
        domain: getEIP712Domain(chainConfig.chainId),
        message: {
          sender: senderPublicKey,
          recipient: recipientPublicKey,
          amount: transferAmount.toString(),
          fee: feeAmount.toString(),
          token: chainConfig.usdc,
          nonce,
          deadline,
        },
      });
    }

    if (action === 'execute_evm_transfer') {
      const {
        chain,
        senderAddress,
        recipientAddress,
        transferAmount,
        feeAmount,
        tokenContract,
        feeToken,
        signature,
        nonce,
        deadline,
        permitSignature,
        permitDeadline,
        permitValue,
      } = body as {
        chain?: 'base' | 'ethereum';
        senderAddress?: string;
        recipientAddress?: string;
        transferAmount?: string;
        feeAmount?: string;
        tokenContract?: string;
        feeToken?: string;
        signature?: string;
        nonce?: number;
        deadline?: number;
        permitSignature?: string;
        permitDeadline?: number;
        permitValue?: string;
      };

      if (!chain || !senderAddress || !recipientAddress || !transferAmount || !feeAmount || !tokenContract || !signature || !nonce || !deadline) {
        return json({ error: 'Missing execution payload' }, 400);
      }

      const chainConfig = CHAIN_CONFIG[chain];
      if (tokenContract.toLowerCase() !== chainConfig.usdc.toLowerCase() || (feeToken && feeToken.toLowerCase() !== chainConfig.usdc.toLowerCase())) {
        return json({ error: `Only USDC is currently supported for fully gasless transfers on ${chain}` }, 400);
      }
      if (Math.floor(Date.now() / 1000) > deadline) return json({ error: 'Signature expired' }, 400);

      const provider = await createProviderWithFallback(chain);
      const backendSigner = evmBackendWallet.connect(provider);
      const domain = getEIP712Domain(chainConfig.chainId);
      const message = {
        sender: senderAddress,
        recipient: recipientAddress,
        amount: BigInt(transferAmount),
        fee: BigInt(feeAmount),
        token: tokenContract,
        nonce: BigInt(nonce),
        deadline: BigInt(deadline),
      };
      const recoveredAddress = ethers.verifyTypedData(domain, TRANSFER_TYPES, message, signature);
      if (recoveredAddress.toLowerCase() !== senderAddress.toLowerCase()) {
        return json({ error: 'Invalid signature' }, 400);
      }

      const tokenWithProvider = new ethers.Contract(chainConfig.usdc, ERC20_ABI, provider);
      const tokenWithSigner = new ethers.Contract(chainConfig.usdc, ERC20_ABI, backendSigner);
      const totalNeeded = BigInt(transferAmount) + BigInt(feeAmount);
      let currentAllowance = await tokenWithProvider.allowance(senderAddress, evmBackendWallet.address);

      if (currentAllowance < totalNeeded) {
        if (!permitSignature || !permitDeadline || !permitValue) {
          return json({ error: 'Permit signature missing' }, 400);
        }
        const sig = ethers.Signature.from(permitSignature);
        const permitTx = await tokenWithSigner.permit(
          senderAddress,
          evmBackendWallet.address,
          permitValue,
          permitDeadline,
          sig.v,
          sig.r,
          sig.s,
        );
        await permitTx.wait();
        currentAllowance = await tokenWithProvider.allowance(senderAddress, evmBackendWallet.address);
      }

      if (currentAllowance < totalNeeded) {
        return json({ error: 'Insufficient allowance after permit' }, 400);
      }

      const tx1 = await tokenWithSigner.transferFrom(senderAddress, recipientAddress, transferAmount);
      await tx1.wait();
      const tx2 = await tokenWithSigner.transferFrom(senderAddress, evmBackendWallet.address, feeAmount);
      await tx2.wait();

      const amountReadable = Number(BigInt(transferAmount)) / 1e6;
      await logTransaction({
        sender_address: senderAddress,
        receiver_address: recipientAddress,
        amount: amountReadable,
        token_sent: 'USDC',
        gas_token: 'USDC',
        chain,
        status: 'success',
        tx_hash: tx1.hash,
        gas_fee_usd: chainConfig.gasFee,
      });
      await updateDailyReport();

      const explorerUrl = chain === 'base'
        ? `https://basescan.org/tx/${tx1.hash}`
        : `https://etherscan.io/tx/${tx1.hash}`;

      return json({
        success: true,
        txHash: tx1.hash,
        explorerUrl,
        message: 'Gasless USDC transfer completed successfully',
      });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Edge function error:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
