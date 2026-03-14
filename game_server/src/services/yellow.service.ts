import {
  createGetLedgerBalancesMessage,
  createCreateChannelMessage,
  createResizeChannelMessage,
  createCloseChannelMessage,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createAuthVerifyMessageFromChallenge,
  createEIP712AuthMessageSigner,
  createGetAssetsMessage,
  parseAnyRPCResponse,
  RPCMethod,
  createECDSAMessageSigner,
  generateRequestId,
  getRequestId,
  StateIntent,
  AuthRequestParams,
  NitroliteClient,
  WalletStateSigner,
} from "@erc7824/nitrolite";
import { Decimal } from "decimal.js";
import { env } from "../config/env.js";
import {
  type Address,
  http,
  createWalletClient,
  createPublicClient,
  erc20Abi,
  getAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { custodyAbi } from "@erc7824/nitrolite/dist/abis/generated";

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
let authReady = false;
let sessionSigner: ReturnType<typeof createECDSAMessageSigner> | null = null;
let sessionKey: `0x${string}` | null = null;

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

async function ensurePlatformEOA(
  publicClient: ReturnType<typeof createPublicClient>,
  address: Address,
): Promise<void> {
  const code = await publicClient.getBytecode({ address });
  if (code && code !== "0x") {
    throw new Error(
      "YELLOW_PRIVATE_KEY must be a plain EOA. Contract / smart wallets are not supported by Yellow.",
    );
  }
}

/**
 * Ask the clearnode to prepare a channel and co-sign the initial state.
 * Returns params that can be fed directly into NitroliteClient.createChannel().
 */
async function requestServerPreparedChannelParams(): Promise<{
  channel: Parameters<NitroliteClient["createChannel"]>[0]["channel"];
  unsignedInitialState: Parameters<
    NitroliteClient["createChannel"]
  >[0]["unsignedInitialState"];
  serverSignature: Hex;
}> {
  ensureEnabled();
  await ensureAuthenticated();
  const signer = createECDSAMessageSigner(
    PLATFORM_PRIVATE_KEY as `0x${string}`,
  );

  const signerToUse = sessionSigner ?? signer;

  const rpc = await createCreateChannelMessage(
    signerToUse,
    {
      chain_id: CHAIN_ID,
      token: ASSET_ADDRESS as Address,
    },
    generateRequestId(),
    Date.now(),
  );

  const res = await sendRPC(rpc);
  if (!res || res.method !== RPCMethod.CreateChannel) {
    console.error(
      "[Yellow] Unexpected clearnode response to create_channel",
      res,
    );
    if (res?.method === RPCMethod.Error) {
      // If the token isn't supported, fetch the list of assets to help the caller.
      const errMsg = (res as any)?.params?.error ?? "unknown error";
      if (/token not supported/i.test(errMsg)) {
        try {
          const assets = await fetchSupportedAssets();
          console.error("[Yellow] Supported assets from clearnode:", assets);
        } catch (assetErr) {
          console.error("[Yellow] Failed to fetch supported assets", assetErr);
        }
      }
      throw new Error(`Clearnode error: ${errMsg}`);
    }
    throw new Error(
      "Unexpected response from Yellow clearnode while preparing channel",
    );
  }

  const params = res.params as {
    channelId: Hex;
    state: {
      intent: number;
      version: number;
      stateData: Hex;
      allocations: { destination: Address; token: Address; amount: bigint }[];
    };
    serverSignature: Hex;
    channel: {
      participants: Address[];
      adjudicator: Address;
      challenge: number;
      nonce: number;
    };
  };

  if (
    !params?.channel ||
    !params?.state ||
    !params?.serverSignature ||
    !Array.isArray(params.channel.participants)
  ) {
    throw new Error("Clearsigned channel response missing required fields");
  }

  // Sanity: participants must be unique and must include the platform wallet.
  const platform = getPlatformAddress().toLowerCase();
  const lowered = params.channel.participants.map((p) => p.toLowerCase());
  const unique = new Set(lowered);
  if (unique.size !== lowered.length) {
    throw new Error("Clearsigned channel has duplicate participants");
  }
  if (!lowered.includes(platform)) {
    throw new Error("Platform wallet not present in clearnode channel");
  }

  return {
    channel: {
      participants: params.channel.participants,
      adjudicator: params.channel.adjudicator as Address,
      challenge: BigInt(params.channel.challenge),
      nonce: BigInt(params.channel.nonce),
    },
    unsignedInitialState: {
      intent: params.state.intent as StateIntent,
      version: BigInt(params.state.version),
      data: params.state.stateData as Hex,
      allocations: params.state.allocations.map((a) => ({
        destination: a.destination as Address,
        token: a.token as Address,
        amount: BigInt(a.amount),
      })),
    },
    serverSignature: params.serverSignature as Hex,
  };
}

async function fetchSupportedAssets(): Promise<any[]> {
  const req = await createGetAssetsMessage(
    undefined as any,
    CHAIN_ID,
    generateRequestId(),
    Date.now(),
  );
  const res = await sendRPC(req);
  if (!res || res.method !== RPCMethod.GetAssets) return [];
  return (res as any)?.params?.assets ?? [];
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
      // Reject connect promise and flush any pending requests.
      pending.forEach((p) => p.reject(err));
      pending.clear();
      authReady = false;
      reject(err);
    };
    socket.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      try {
        const res = parseAnyRPCResponse(raw);
        const reqId =
          (res as any).requestId ?? getRequestId(res as any) ?? undefined;
        if (reqId !== undefined && pending.has(reqId)) {
          pending.get(reqId)!.resolve(res);
          pending.delete(reqId);
        }
      } catch (err) {
        console.error("[Yellow] Failed to parse response", {
          err,
          raw: raw?.slice(0, 500),
        });
      }
    };
    socket.onclose = () => {
      pending.forEach((p) =>
        p.reject(new Error("Yellow clearnode WebSocket closed")),
      );
      pending.clear();
      authReady = false;
      ws = null;
    };
  });
}

async function sendRPC(message: string): Promise<any> {
  const socket = await ensureSocket();
  const reqId = (() => {
    try {
      const parsed = JSON.parse(message);
      if (Array.isArray(parsed?.req)) {
        return parsed.req[0] as number;
      }
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
  await ensurePlatformEOA(publicClient, account.address as Address);

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

function getRPCSigner() {
  return (
    sessionSigner ??
    createECDSAMessageSigner(PLATFORM_PRIVATE_KEY as `0x${string}`)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Authenticate once per process with the clearnode. Required for create_channel. */
async function ensureAuthenticated(): Promise<void> {
  if (authReady) return;
  const account = privateKeyToAccount(PLATFORM_PRIVATE_KEY as `0x${string}`);
  const platform = account.address as Address;
  const appCredential =
    env.YELLOW_API_KEY?.trim() || env.YELLOW_APP_ID?.trim() || "kartfall_v1";
  const expiresAtSec = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60); // 24h in seconds

  // Create an ephemeral session key (per process) for signed RPCs.
  if (!sessionKey) {
    const { randomBytes } = await import("crypto");
    sessionKey = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
    sessionSigner = createECDSAMessageSigner(sessionKey);
  }
  const sessionAccount = privateKeyToAccount(sessionKey as `0x${string}`);

  const authParams: AuthRequestParams = {
    address: platform as Address,
    session_key: sessionAccount.address as Address,
    application: appCredential,
    allowances: [],
    expires_at: expiresAtSec,
    scope: "*",
  };

  const authReq = await createAuthRequestMessage(
    authParams,
    generateRequestId(),
    Date.now(),
  );

  const challenge = await sendRPC(authReq);
  const challengeMethod = challenge?.method;
  console.log("[Yellow] auth response", {
    method: challengeMethod,
    raw: challenge,
  });
  if (
    !challenge ||
    (challengeMethod !== RPCMethod.AuthRequest &&
      challengeMethod !== RPCMethod.AuthChallenge)
  ) {
    if (challengeMethod === RPCMethod.Error) {
      throw new Error(
        `Clearnode auth_request failed: ${(challenge as any)?.params?.error ?? "unknown"}`,
      );
    }
    throw new Error(
      `Unexpected response from clearnode during auth_request: ${challengeMethod ?? "none"}`,
    );
  }

  const challengeMessage = (challenge as any)?.params?.challengeMessage;
  if (!challengeMessage || typeof challengeMessage !== "string") {
    throw new Error("Clearnode auth challenge is missing challengeMessage");
  }

  const eip712Signer = createEIP712AuthMessageSigner(
    createWalletClient({
      account,
      transport: http(RPC_URL!),
      chain: (CHAIN_ID === sepolia.id
        ? sepolia
        : { ...sepolia, id: CHAIN_ID }) as any,
    }) as any,
    authParams as any,
    { name: appCredential },
  );

  const verifyMsg =
    challengeMethod === RPCMethod.AuthChallenge
      ? await createAuthVerifyMessageFromChallenge(
          eip712Signer,
          challengeMessage,
          generateRequestId(),
          Date.now(),
        )
      : await createAuthVerifyMessage(
          eip712Signer,
          {
            params: {
              challengeMessage,
            },
          } as any,
          generateRequestId(),
          Date.now(),
        );
  const verified = await sendRPC(verifyMsg);
  console.log("[Yellow] auth verify response", verified);
  if (
    !verified ||
    verified.method !== RPCMethod.AuthVerify ||
    !(verified as any)?.params?.success
  ) {
    throw new Error(
      `Clearnode auth_verify failed: ${(verified as any)?.params?.error ?? "unknown"}`,
    );
  }
  authReady = true;
}

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
    await ensureAuthenticated();
    const signer = getRPCSigner();
    const req = await createGetLedgerBalancesMessage(
      signer,
      walletAddress as Address,
      generateRequestId(),
    );
    const res = await sendRPC(req);
    if (!res || res.method !== RPCMethod.GetLedgerBalances) {
      if (res?.method === RPCMethod.Error) {
        throw new Error(
          `Clearnode error: ${(res as any)?.params?.error ?? "unknown"}`,
        );
      }
      throw new Error(
        `Unexpected response from clearnode during get_ledger_balances: ${res?.method ?? "none"}`,
      );
    }
    const balances =
      (res as any)?.params?.ledgerBalances ??
      (res as any)?.params?.ledger_balances ??
      [];
    const requestedAsset = asset.toLowerCase();
    const configuredAssetAddress = ASSET_ADDRESS.toLowerCase();

    const entry = balances.find((balanceEntry: any) => {
      const candidates = [
        balanceEntry?.asset,
        balanceEntry?.token,
        balanceEntry?.symbol,
        balanceEntry?.assetSymbol,
        balanceEntry?.asset_address,
        balanceEntry?.token_address,
        balanceEntry?.assetAddress,
        balanceEntry?.tokenAddress,
        balanceEntry?.address,
      ]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase());

      if (candidates.includes(requestedAsset)) return true;

      if (
        configuredAssetAddress &&
        candidates.includes(configuredAssetAddress)
      ) {
        return true;
      }

      return false;
    });

    const rawBalance =
      entry?.balance ??
      entry?.amount ??
      entry?.available ??
      entry?.value ??
      "0";
    return String(rawBalance);
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

/** Create the platform's home channel directly on-chain (custody). */
export async function createHomeChannel(
  depositAmount: Decimal = new Decimal(0),
): Promise<string> {
  ensureEnabled();
  const client = await getNitroClient();
  const prepared = await requestServerPreparedChannelParams();
  let channelId: Hex | undefined;
  try {
    const res = await client.createChannel(prepared as any);
    channelId = res.channelId;
    console.log(
      `[Yellow] Home channel create tx: ${res.txHash} (channel ${channelId})`,
    );
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const existing = msg.match(/0x[0-9a-fA-F]{64}/)?.[0] as Hex | undefined;
    if (msg.toLowerCase().includes("open channel with broker already exists")) {
      channelId = existing;
      console.warn(
        `[Yellow] Home channel already exists${existing ? ` (${existing})` : ""} — skipping creation.`,
      );
    } else {
      throw err;
    }
  }

  if (depositAmount.gt(0)) {
    try {
      const depositTx = await depositToChannel(
        depositAmount,
        ASSET_ADDRESS as Address,
      );
      console.log(`[Yellow] Post-create deposit tx: ${depositTx}`);
    } catch (err) {
      console.warn("[Yellow] Deposit after channel creation failed:", err);
    }
  }

  return channelId ?? "existing_channel";
}

// L1 ERC20 balance (not channel)
export async function getWalletL1Balance(
  walletAddress: string,
  assetAddress: string = ASSET_ADDRESS,
): Promise<string> {
  try {
    const normalizedAsset = getAddress(assetAddress as Address);
    const client = getPublicClient(
      CHAIN_ID === sepolia.id ? sepolia : { ...sepolia, id: CHAIN_ID },
    );
    const [rawBalance, decimals] = await Promise.all([
      client.readContract({
        address: normalizedAsset,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress as Address],
      }),
      client.readContract({
        address: normalizedAsset,
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

// Custody balance (on-chain escrow, not wallet balance)
export async function getWalletCustodyBalance(
  walletAddress: string,
  assetAddress: string = ASSET_ADDRESS,
): Promise<string> {
  try {
    const normalizedAsset = getAddress(assetAddress as Address);
    const client = getPublicClient(
      CHAIN_ID === sepolia.id ? sepolia : { ...sepolia, id: CHAIN_ID },
    );
    const balances = await client.readContract({
      address: CUSTODY_ADDRESS as Address,
      abi: custodyAbi as any,
      functionName: "getAccountsBalances",
      args: [[walletAddress as Address], [normalizedAsset]],
    });
    const raw =
      Array.isArray(balances) && Array.isArray(balances[0])
        ? (balances[0][0] as bigint)
        : 0n;
    const balance = new Decimal(raw.toString()).div(
      new Decimal(10).pow(ASSET_DECIMALS),
    );
    return balance.toFixed(2);
  } catch (err) {
    console.warn("[Yellow] Custody balance fetch failed", err);
    return "0";
  }
}

export interface MatchChannelConfig {
  matchId: string;
  participants: string[];
  stakeAmount: bigint;
  mode: string;
}

export interface MatchChannelResult {
  channelId: Hex;
  participants: Address[];
  chainId: number;
  assetAddress: Address;
  version: bigint;
}

export async function createMatchChannel(
  config: MatchChannelConfig,
): Promise<MatchChannelResult> {
  ensureEnabled();
  await ensureAuthenticated();
  const normalized = [...(config.participants || [])]
    .filter(Boolean)
    .map((w) => getAddress(w as Address));

  const participants = Array.from(
    new Set(normalized.map((w) => w.toLowerCase())),
  ).map((w) => getAddress(w as Address));

  try {
    const prepared = await requestServerPreparedChannelParams();
    const client = await getNitroClient();
    const result = await client.createChannel(prepared as any);

    return {
      channelId: result.channelId,
      participants,
      chainId: CHAIN_ID,
      assetAddress: ASSET_ADDRESS as Address,
      version: prepared.unsignedInitialState.version,
    };
  } catch (err: any) {
    const message = String(err?.message ?? err);
    const existing = message.match(/0x[0-9a-fA-F]{64}/)?.[0] as
      | Hex
      | undefined;
    if (existing) {
      console.warn(
        `[Yellow] Reusing existing channel for match: ${existing}`,
      );
      return {
        channelId: existing,
        participants,
        chainId: CHAIN_ID,
        assetAddress: ASSET_ADDRESS as Address,
        version: 0n,
      };
    }
    throw err;
  }

  // unreachable
}

export async function submitMatchPayouts(
  channelId: string,
  allocations: { destination: string; amount: bigint }[],
): Promise<{ version: bigint }> {
  ensureEnabled();
  await ensureAuthenticated();
  const signer = getRPCSigner();

  let lastVersion = 0n;

  for (const allocation of allocations) {
    if (!allocation.amount || allocation.amount <= 0n) continue;
    const req = await createResizeChannelMessage(
      signer,
      {
        channel_id: channelId as any,
        allocate_amount: allocation.amount,
        funds_destination: allocation.destination as Address,
      } as any,
      generateRequestId(),
      Date.now(),
    );
    const res = await sendRPC(req);
    if (!res || res.method !== RPCMethod.ResizeChannel) {
      const errMsg = (res as any)?.params?.error ?? "unknown";
      throw new Error(`Resize channel failed: ${errMsg}`);
    }
    const versionRaw = (res as any)?.params?.state?.version;
    if (versionRaw !== undefined) {
      lastVersion = BigInt(versionRaw);
    }
  }

  return { version: lastVersion };
}

export async function withdrawFromChannel(
  channelId: string,
  walletAddress: string,
): Promise<{ txHash: string }> {
  ensureEnabled();
  await ensureAuthenticated();
  const signer = getRPCSigner();

  const closeReq = await createCloseChannelMessage(
    signer,
    channelId as any,
    walletAddress as Address,
    generateRequestId(),
    Date.now(),
  );
  const closeRes = await sendRPC(closeReq);
  if (!closeRes || closeRes.method !== RPCMethod.CloseChannel) {
    const errMsg = (closeRes as any)?.params?.error ?? "unknown";
    throw new Error(`Close channel failed: ${errMsg}`);
  }

  const closeParams = (closeRes as any)?.params;
  const finalState = {
    channelId: closeParams.channelId as Hex,
    intent: closeParams.state.intent as StateIntent,
    version: BigInt(closeParams.state.version),
    data: closeParams.state.stateData as Hex,
    allocations: closeParams.state.allocations.map((a: any) => ({
      destination: a.destination as Address,
      token: a.token as Address,
      amount: BigInt(a.amount),
    })),
    serverSignature: closeParams.serverSignature as Hex,
  };

  const client = await getNitroClient();
  const txHash = await client.closeChannel({
    stateData: finalState.data,
    finalState,
  } as any);

  return { txHash };
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

export async function withdrawFromCustody(
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
