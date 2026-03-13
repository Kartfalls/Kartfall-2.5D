import {
  createAppSessionMessage,
  createSubmitAppStateMessage,
  createCloseAppSessionMessage,
  createGetLedgerBalancesMessage,
  parseAnyRPCResponse,
  createECDSAMessageSigner,
  generateRequestId,
  getRequestId,
  generateChannelNonce,
  getChannelId,
  StateIntent,
  RPCAppStateIntent,
  RPCProtocolVersion,
  RPCAppSessionAllocation,
  NitroliteClient,
  WalletStateSigner,
} from "@erc7824/nitrolite";
import { getPackedState } from "@erc7824/nitrolite/dist/utils/state.js";
import { signRawECDSAMessage } from "@erc7824/nitrolite/dist/utils/sign.js";
import { Decimal } from "decimal.js";
import { env } from "../config/env.js";
import type { PlayerPayout } from "./financial.js";
import {
  type Address,
  http,
  createWalletClient,
  createPublicClient,
  erc20Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CLEARNODE_URL = env.YELLOW_CLEARNODE_URL;
const PLATFORM_PRIVATE_KEY = env.YELLOW_PRIVATE_KEY;
export const DEFAULT_ASSET = env.YELLOW_ASSET;
export const ASSET_DECIMALS = env.YELLOW_ASSET_DECIMALS;
const YELLOW_ENABLED = env.YELLOW_ENABLED;
const ASSET_ADDRESS = env.YELLOW_ASSET_ADDRESS;
const CUSTODY_ADDRESS = env.YELLOW_CUSTODY_ADDRESS;
const ADJUDICATOR_ADDRESS = env.YELLOW_ADJUDICATOR_ADDRESS;
const CHAIN_ID = env.YELLOW_CHAIN_ID ? Number(env.YELLOW_CHAIN_ID) : sepolia.id;
const RPC_URL = env.YELLOW_RPC_URL;
const AUTO_FUND = env.YELLOW_AUTOFUND;
const AUTO_FUND_AMOUNT = new Decimal(env.YELLOW_AUTOFUND_AMOUNT || "0");

// ---------------------------------------------------------------------------
// WebSocket RPC client
// ---------------------------------------------------------------------------

type Pending = {
  resolve: (v: any) => void;
  reject: (e: any) => void;
};

let ws: WebSocket | null = null;
const pending = new Map<number, Pending>();
let nitroClient: NitroliteClient | null = null;
let viemPublicClient: ReturnType<typeof createPublicClient> | null = null;
const CHANNEL_CHALLENGE = 86_400n; // 1 day

function ensureEnabled() {
  if (!YELLOW_ENABLED) {
    throw new Error("Yellow is disabled (YELLOW_ENABLED=false)");
  }
  if (!PLATFORM_PRIVATE_KEY) {
    throw new Error("YELLOW_PRIVATE_KEY is required for Nitrolite");
  }
  if (!ASSET_ADDRESS || !CUSTODY_ADDRESS || !ADJUDICATOR_ADDRESS || !RPC_URL) {
    throw new Error(
      "YELLOW_ASSET_ADDRESS, YELLOW_CUSTODY_ADDRESS, YELLOW_ADJUDICATOR_ADDRESS, and YELLOW_RPC_URL are required",
    );
  }
}

async function ensureSocket(): Promise<WebSocket> {
  ensureEnabled();
  if (ws && ws.readyState === ws.OPEN) return ws;

  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(CLEARNODE_URL);
    socket.onopen = () => {
      ws = socket;
      resolve(socket);
    };
    socket.onerror = (err) => {
      reject(err);
    };
    socket.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      try {
        const res = parseAnyRPCResponse(raw);
        const reqId = getRequestId(res as any);
        if (reqId !== undefined && pending.has(reqId)) {
          pending.get(reqId)!.resolve(res);
          pending.delete(reqId);
        }
      } catch (err) {
        console.error("[Yellow] Failed to parse response", err);
      }
    };
    socket.onclose = () => {
      ws = null;
    };
  });
}

async function sendRPC(message: string): Promise<any> {
  const socket = await ensureSocket();
  const reqId = (() => {
    try {
      const parsed = JSON.parse(message);
      return parsed?.id as number | undefined;
    } catch {
      return undefined;
    }
  })();

  return await new Promise((resolve, reject) => {
    if (reqId !== undefined) {
      pending.set(reqId, { resolve, reject });
    }
    socket.send(message);
    if (reqId === undefined) {
      resolve(null);
    }
    setTimeout(() => {
      if (reqId !== undefined && pending.has(reqId)) {
        pending.delete(reqId);
        reject(new Error("Nitrolite RPC timeout"));
      }
    }, 10_000);
  });
}

// ---------------------------------------------------------------------------
// On-chain client (Viem + NitroliteClient)
// ---------------------------------------------------------------------------

function decimalToWei(amount: Decimal): bigint {
  return BigInt(
    amount
      .mul(new Decimal(10).pow(ASSET_DECIMALS))
      .toFixed(0, Decimal.ROUND_FLOOR),
  );
}

async function getNitroClient(): Promise<NitroliteClient> {
  ensureEnabled();
  if (nitroClient) return nitroClient;

  const account = privateKeyToAccount(PLATFORM_PRIVATE_KEY as `0x${string}`);
  const chain = (
    CHAIN_ID === sepolia.id ? sepolia : { ...sepolia, id: CHAIN_ID }
  ) as typeof sepolia;

  const publicClient = getPublicClient(chain);

  const walletClient = createWalletClient({
    account,
    transport: http(RPC_URL!),
    chain,
  });

  nitroClient = new NitroliteClient({
    publicClient: publicClient as any,
    walletClient: walletClient as any,
    stateSigner: new WalletStateSigner(walletClient),
    addresses: {
      custody: CUSTODY_ADDRESS as Address,
      adjudicator: ADJUDICATOR_ADDRESS as Address,
    },
    chainId: chain.id,
    // Challenge duration for channels; 1 day default
    challengeDuration: 86_400n,
  });

  return nitroClient;
}

function getPublicClient(chain = sepolia) {
  if (viemPublicClient) return viemPublicClient;
  viemPublicClient = createPublicClient({
    transport: http(RPC_URL!),
    chain,
  });
  return viemPublicClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toAllocation(
  participant: Address,
  amountWei: bigint,
  asset: string,
): RPCAppSessionAllocation {
  const amountStr = new Decimal(amountWei.toString())
    .div(new Decimal(10).pow(ASSET_DECIMALS))
    .toFixed();
  return {
    participant,
    asset,
    amount: amountStr,
  } as any;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getPlatformAddress(): Address {
  const account = privateKeyToAccount(PLATFORM_PRIVATE_KEY as `0x${string}`);
  return account.address as Address;
}

export async function pingNode(): Promise<boolean> {
  try {
    const signer = createECDSAMessageSigner(
      PLATFORM_PRIVATE_KEY as `0x${string}`,
    );
    const req = await createGetLedgerBalancesMessage(
      signer,
      undefined,
      generateRequestId(),
    );
    await sendRPC(req);
    return true;
  } catch (err) {
    console.warn("[Yellow] ping failed (continuing)", err);
    return false;
  }
}

export async function getPlayerAssetBalance(
  walletAddress: string,
  asset: string = DEFAULT_ASSET,
): Promise<string> {
  try {
    const signer = createECDSAMessageSigner(
      PLATFORM_PRIVATE_KEY as `0x${string}`,
    );
    const req = await createGetLedgerBalancesMessage(
      signer,
      walletAddress as Address,
      generateRequestId(),
    );
    const res = await sendRPC(req);
    const result = (res?.result as any[]) || [];
    const entry = result.find(
      (b: any) => (b.asset ?? b.token)?.toLowerCase() === asset.toLowerCase(),
    );
    return entry?.balance ?? entry?.amount ?? "0";
  } catch (err) {
    console.error("[Yellow] balance error", err);
    return "0";
  }
}

export async function getPlatformChannelBalance(): Promise<string> {
  const ledgerBalance = await getPlayerAssetBalance(getPlatformAddress());
  if (ledgerBalance !== "0") return ledgerBalance;

  // Fallback to on-chain custody balance if clearnet hasn't indexed yet
  try {
    const client = await getNitroClient();
    const raw = await client.getAccountBalance(ASSET_ADDRESS as Address);
    return new Decimal(raw.toString())
      .div(new Decimal(10).pow(ASSET_DECIMALS))
      .toFixed(2);
  } catch (err) {
    console.warn("[Yellow] Fallback channel balance failed", err);
    return ledgerBalance;
  }
}

async function buildHomeChannelParams(
  depositWei: bigint,
): Promise<{
  channelParams: Parameters<NitroliteClient["createChannel"]>[0];
  channelId: Hex;
}> {
  const platform = getPlatformAddress();
  const channel = {
    participants: [platform as Address, platform as Address],
    adjudicator: ADJUDICATOR_ADDRESS as Address,
    challenge: CHANNEL_CHALLENGE,
    nonce: generateChannelNonce(platform),
  };

  const unsignedInitialState = {
    intent: StateIntent.INITIALIZE,
    version: 0n,
    data: "0x",
    allocations: [
      {
        destination: platform as Address,
        token: ASSET_ADDRESS as Address,
        amount: 0n,
      },
      {
        destination: platform as Address,
        token: ASSET_ADDRESS as Address,
        amount: depositWei,
      },
    ],
  };

  const channelId = getChannelId(channel as any, BigInt(CHAIN_ID));
  const packed = getPackedState(channelId, unsignedInitialState as any);
  const serverSignature = await signRawECDSAMessage(
    packed as Hex,
    PLATFORM_PRIVATE_KEY as `0x${string}`,
  );

  return {
    channelParams: {
      channel,
      unsignedInitialState: unsignedInitialState as any,
      serverSignature,
    },
    channelId,
  };
}

/** Create the platform's home channel directly on-chain (custody). */
export async function createHomeChannel(
  depositAmount: Decimal = new Decimal(0),
): Promise<string> {
  ensureEnabled();
  const client = await getNitroClient();
  const depositWei = decimalToWei(depositAmount);
  const { channelParams, channelId } = await buildHomeChannelParams(depositWei);

  if (depositWei > 0n) {
    const { txHash } = await client.depositAndCreateChannel(
      ASSET_ADDRESS as Address,
      depositWei,
      channelParams as any,
    );
    console.log(
      `[Yellow] Home channel deposit+create tx: ${txHash} (channel ${channelId})`,
    );
  } else {
    const { txHash } = await client.createChannel(channelParams as any);
    console.log(
      `[Yellow] Home channel create tx: ${txHash} (channel ${channelId})`,
    );
  }

  return channelId;
}

// L1 ERC20 balance (not channel)
export async function getWalletL1Balance(
  walletAddress: string,
  assetAddress: string = ASSET_ADDRESS,
): Promise<string> {
  try {
    const client = getPublicClient(
      CHAIN_ID === sepolia.id ? sepolia : { ...sepolia, id: CHAIN_ID },
    );
    const [rawBalance, decimals] = await Promise.all([
      client.readContract({
        address: assetAddress as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress as Address],
      }),
      client.readContract({
        address: assetAddress as Address,
        abi: erc20Abi,
        functionName: "decimals",
        args: [],
      }),
    ]);
    const balance = new Decimal(rawBalance.toString()).div(
      new Decimal(10).pow(Number(decimals)),
    );
    return balance.toFixed(2);
  } catch (err) {
    console.warn("[Yellow] L1 balance fetch failed", err);
    return "0";
  }
}

export interface MatchChannelConfig {
  applicationId: string;
  playerWallets: string[];
  roomCode: string;
  gameMode: string;
  matchId: string;
}

export interface MatchChannelResult {
  appSessionId: string;
  participants: Address[];
}

export async function createMatchChannel(
  config: MatchChannelConfig,
): Promise<MatchChannelResult> {
  ensureEnabled();
  const signer = createECDSAMessageSigner(
    PLATFORM_PRIVATE_KEY as `0x${string}`,
  );
  const participants = [...(config.playerWallets || [])].map(
    (w) => w as Address,
  );
  const weights = participants.map(() => 1);

  const requestId = generateRequestId();
  const message = await createAppSessionMessage(
    signer,
    {
      definition: {
        application: config.applicationId,
        participants,
        weights,
        quorum: 1,
        nonce: Date.now(),
        protocol: RPCProtocolVersion.NitroRPC_0_4,
        challenge: 86_400, // 1 day in seconds, adjust as needed
      },
      allocations: [],
      session_data: JSON.stringify({
        roomCode: config.roomCode,
        gameMode: config.gameMode,
        matchId: config.matchId,
        createdAt: Date.now(),
      }),
    },
    requestId,
    Date.now(),
  );

  const res = await sendRPC(message);
  const appSessionId = res?.result?.app_session_id ?? res?.result?.appSessionId;
  return {
    appSessionId,
    participants,
  };
}

export async function depositPlayerStake(
  appSessionId: string,
  playerWallet: string,
  amount: Decimal,
  version: bigint,
  asset: string = DEFAULT_ASSET,
): Promise<void> {
  ensureEnabled();
  const signer = createECDSAMessageSigner(
    PLATFORM_PRIVATE_KEY as `0x${string}`,
  );
  const allocations = [
    {
      participant: playerWallet as Address,
      asset,
      amount: amount.toFixed(),
    },
  ];

  const req = await createSubmitAppStateMessage(
    signer,
    {
      app_session_id: appSessionId as any,
      intent: RPCAppStateIntent.Deposit,
      version: Number(version),
      allocations,
      session_data: JSON.stringify({
        event: "stake_deposit",
        player: playerWallet,
      }),
      protocol: RPCProtocolVersion.NitroRPC_0_4,
    } as any,
    generateRequestId(),
    Date.now(),
  );

  await sendRPC(req);
}

export async function updateMatchState(
  appSessionId: string,
  gameData: Record<string, unknown>,
  allocations: { participant: string; asset: string; amount: Decimal }[],
  version: bigint,
): Promise<void> {
  ensureEnabled();
  const signer = createECDSAMessageSigner(
    PLATFORM_PRIVATE_KEY as `0x${string}`,
  );

  const rpcAllocations = allocations.map((a) => ({
    participant: a.participant as Address,
    asset: a.asset,
    amount: a.amount.toFixed(),
  }));

  const req = await createSubmitAppStateMessage(
    signer,
    {
      app_session_id: appSessionId as any,
      intent: RPCAppStateIntent.Operate,
      version: Number(version),
      allocations: rpcAllocations,
      session_data: JSON.stringify(gameData),
      protocol: RPCProtocolVersion.NitroRPC_0_4,
    } as any,
    generateRequestId(),
    Date.now(),
  );

  await sendRPC(req);
}

export async function finalizeMatchChannel(
  appSessionId: string,
  payoutAllocations: { participant: string; asset: string; amount: Decimal }[],
  matchResults: Record<string, unknown>,
  version: bigint,
): Promise<void> {
  ensureEnabled();
  const signer = createECDSAMessageSigner(
    PLATFORM_PRIVATE_KEY as `0x${string}`,
  );

  const rpcAllocations = payoutAllocations.map((a) => ({
    participant: a.participant as Address,
    asset: a.asset,
    amount: a.amount.toFixed(),
  }));

  const submit = await createSubmitAppStateMessage(
    signer,
    {
      app_session_id: appSessionId as any,
      intent: RPCAppStateIntent.Operate,
      version: Number(version),
      allocations: rpcAllocations,
      session_data: JSON.stringify({ event: "match_end", ...matchResults }),
      protocol: RPCProtocolVersion.NitroRPC_0_4,
    } as any,
    generateRequestId(),
    Date.now(),
  );
  await sendRPC(submit);

  const close = await createCloseAppSessionMessage(
    signer,
    {
      app_session_id: appSessionId as any,
      allocations: rpcAllocations,
      session_data: JSON.stringify({ event: "channel_closed" }),
    },
    generateRequestId(),
    Date.now(),
  );
  await sendRPC(close);
}

// Off-chain payouts (legacy) — no-op for Nitrolite baseline
export interface PayoutResult {
  walletAddress: string;
  amountToken: string;
  success: boolean;
  error?: string;
}

export async function distributePayoutsOffChain(
  payouts: PlayerPayout[],
  asset: string = DEFAULT_ASSET,
  decimals: number = ASSET_DECIMALS,
): Promise<PayoutResult[]> {
  console.warn(
    "[Yellow] distributePayoutsOffChain not implemented in Nitrolite mode",
  );
  return payouts.map((p) => ({
    walletAddress: p.walletAddress,
    amountToken: "0",
    success: false,
  }));
}

export async function transferOffChain(): Promise<void> {
  console.warn("[Yellow] transferOffChain not implemented in Nitrolite mode");
}

export function isBlockchainConfigured(): boolean {
  return !!(RPC_URL && ASSET_ADDRESS && CUSTODY_ADDRESS && ADJUDICATOR_ADDRESS);
}

export async function depositToChannel(
  amount: Decimal,
  assetAddress: string = ASSET_ADDRESS,
): Promise<string> {
  const client = await getNitroClient();
  const tx = await client.deposit(
    assetAddress as Address,
    decimalToWei(amount),
  );
  return tx;
}

export async function withdrawFromChannel(
  amount: Decimal,
  assetAddress: string = ASSET_ADDRESS,
): Promise<string> {
  const client = await getNitroClient();
  const tx = await client.withdrawal(
    assetAddress as Address,
    decimalToWei(amount),
  );
  return tx;
}

export async function approveToken(
  amount: Decimal,
  assetAddress: string = ASSET_ADDRESS,
): Promise<string> {
  const client = await getNitroClient();
  const tx = await client.approveTokens(
    assetAddress as Address,
    decimalToWei(amount),
  );
  return tx;
}

export async function closeChannel(finalState: any): Promise<string> {
  const client = await getNitroClient();
  const tx = await client.closeChannel({ finalState });
  return tx;
}

export async function setHomeBlockchain(): Promise<void> {
  console.warn("setHomeBlockchain not required in Nitrolite — skipping");
}

// Convenience: auto-approve and deposit a configured amount (dev aid)
export async function ensurePlatformLiquidity(): Promise<void> {
  if (!AUTO_FUND || AUTO_FUND_AMOUNT.lte(0)) return;
  try {
    await approveToken(AUTO_FUND_AMOUNT, ASSET_ADDRESS);
    await depositToChannel(AUTO_FUND_AMOUNT, ASSET_ADDRESS);
  } catch (err) {
    console.error("[Yellow] Auto-fund failed:", err);
  }
}
