import { ethers } from "ethers";
import { custodyAbi } from "@erc7824/nitrolite/dist/abis/generated";
import {
  createAuthRequestMessage,
  createAuthVerifyMessageFromChallenge,
  createCreateChannelMessage,
  createResizeChannelMessage,
  createCloseChannelMessage,
  createECDSAMessageSigner,
  parseAnyRPCResponse,
  generateRequestId,
  RPCMethod,
  EIP712AuthTypes,
} from "@erc7824/nitrolite";
import { getPackedState } from "@erc7824/nitrolite/dist/utils/state";
import { getChannelId } from "@erc7824/nitrolite/dist/utils/channel";

type LedgerChannelOperation = {
  channelId: string;
  state: {
    intent: number;
    version: number;
    stateData: string;
    allocations: { destination: string; token: string; amount: bigint }[];
  };
  serverSignature: string;
  channel?: {
    participants: string[];
    adjudicator: string;
    challenge: number;
    nonce: number;
  };
  participants?: string[];
};
import type { YellowStatus } from "./useYellowStatus";

export const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
];

type WalletLike = {
  getEthereumProvider: () => Promise<unknown>;
  address?: string;
};

function assertStatus(status?: YellowStatus | null) {
  if (!status?.assetAddress || !status?.custodyAddress || !status?.chainId) {
    throw new Error("Yellow config missing; refresh status.");
  }
}

async function getWeb3Provider(wallet: WalletLike) {
  const provider = await wallet.getEthereumProvider();
  return new ethers.BrowserProvider(provider as any);
}

async function ensureChain(provider: ethers.BrowserProvider, chainId: number) {
  const chainIdHex = `0x${chainId.toString(16)}`;
  await provider.send("wallet_switchEthereumChain", [{ chainId: chainIdHex }]);
}

function getClearnodeUrl() {
  return (
    import.meta.env.VITE_YELLOW_URL || "wss://clearnet-sandbox.yellow.com/ws"
  );
}

function getAppId() {
  return import.meta.env.VITE_YELLOW_APP_ID || "kartfall_v1";
}

async function openSocket(url: string): Promise<WebSocket> {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.onopen = () => resolve(socket);
    socket.onerror = (err) => reject(err);
  });
}

function getRequestIdFromMessage(message: string): number | undefined {
  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed?.req)) return parsed.req[0];
    return parsed?.id;
  } catch {
    return undefined;
  }
}

async function sendRPC(
  socket: WebSocket,
  message: string,
  timeoutMs = 10_000,
) {
  const reqId = getRequestIdFromMessage(message);

  return await new Promise<any>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const onMessage = (event: MessageEvent) => {
      const raw = typeof event.data === "string" ? event.data : "";
      try {
        const parsed = parseAnyRPCResponse(raw);
        if (reqId !== undefined && parsed.requestId !== reqId) return;
        cleanup();
        resolve(parsed);
      } catch {
        // Ignore non-RPC messages and keep waiting for the response we want.
      }
    };

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
    };

    socket.addEventListener("message", onMessage);
    socket.send(message);

    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Nitrolite RPC timeout"));
      }, timeoutMs);
    }
  });
}

async function createEip712Signer(
  wallet: WalletLike,
  authParams: {
    address: string;
    session_key: string;
    scope: string;
    expires_at: bigint;
    allowances: Array<{ asset: string; amount: string }>;
  },
) {
  const provider = await wallet.getEthereumProvider();
  const web3Provider = new ethers.BrowserProvider(provider as any);
  const signer = await web3Provider.getSigner();
  const domain = { name: getAppId() };

  return async (payload: any) => {
    const params = payload?.[2];
    const challenge = params?.challenge;
    if (!challenge || typeof challenge !== "string") {
      throw new Error("Missing challenge for auth_verify");
    }

    const message = {
      challenge,
      scope: authParams.scope,
      wallet: authParams.address,
      session_key: authParams.session_key,
      expires_at: authParams.expires_at,
      allowances: authParams.allowances,
    };

    return await signer.signTypedData(
      domain,
      EIP712AuthTypes as any,
      message as any,
    );
  };
}

async function withAuthSession<T>(
  wallet: WalletLike,
  walletAddress: string,
  fn: (socket: WebSocket, sessionSigner: (payload: any) => Promise<string>) => Promise<T>,
) {
  const socket = await openSocket(getClearnodeUrl());
  try {
    const sessionWallet = ethers.Wallet.createRandom();
    const sessionSigner = createECDSAMessageSigner(
      sessionWallet.privateKey as `0x${string}`,
    );
    const expiresAtSec = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
    const authParams = {
      address: walletAddress,
      session_key: sessionWallet.address,
      application: getAppId(),
      allowances: [],
      expires_at: expiresAtSec,
      scope: "*",
    };

    const authReq = await createAuthRequestMessage(
      authParams,
      generateRequestId(),
      Date.now(),
    );
    const challenge = await sendRPC(socket, authReq);
    if (
      !challenge ||
      (challenge.method !== RPCMethod.AuthChallenge &&
        challenge.method !== RPCMethod.AuthRequest)
    ) {
      throw new Error(
        `Auth request failed: ${challenge?.method ?? "unknown"}`,
      );
    }

    const challengeMessage = (challenge as any)?.params?.challengeMessage;
    if (!challengeMessage) {
      throw new Error("Missing auth challenge message");
    }

    const eip712Signer = await createEip712Signer(wallet, {
      address: walletAddress,
      session_key: sessionWallet.address,
      scope: authParams.scope,
      expires_at: authParams.expires_at,
      allowances: authParams.allowances,
    });

    const verifyMsg = await createAuthVerifyMessageFromChallenge(
      eip712Signer as any,
      challengeMessage,
      generateRequestId(),
      Date.now(),
    );
    const verified = await sendRPC(socket, verifyMsg);
    if (!verified || verified.method !== RPCMethod.AuthVerify) {
      throw new Error(
        `Auth verify failed: ${verified?.method ?? "unknown"}`,
      );
    }
    if (!(verified as any)?.params?.success) {
      throw new Error(
        `Auth verify rejected: ${(verified as any)?.params?.error ?? "unknown"}`,
      );
    }

    return await fn(socket, sessionSigner as any);
  } finally {
    socket.close();
  }
}

function buildSignedState(
  channelId: string,
  state: {
    intent: number;
    version: number;
    data: string;
    allocations: { destination: string; token: string; amount: bigint }[];
  },
  sigs: string[],
) {
  return {
    intent: state.intent,
    version: BigInt(state.version),
    data: state.data,
    allocations: state.allocations,
    sigs,
  };
}

async function signState(
  signer: ethers.Signer,
  channelId: string,
  state: {
    intent: number;
    version: number;
    data: string;
    allocations: { destination: string; token: string; amount: bigint }[];
  },
) {
  const packed = getPackedState(channelId as any, {
    intent: state.intent,
    version: BigInt(state.version),
    data: state.data as any,
    allocations: state.allocations as any,
  });
  return await signer.signMessage(ethers.getBytes(packed));
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

function orderSignatures(
  participants: string[] | null | undefined,
  walletAddress: string,
  userSignature: string,
  serverSignature: string,
  channelId: string,
  state: {
    intent: number;
    version: number;
    data: string;
    allocations: { destination: string; token: string; amount: bigint }[];
  },
) {
  let resolvedParticipants = participants;
  if (!resolvedParticipants || resolvedParticipants.length === 0) {
    const packed = getPackedState(channelId as any, {
      intent: state.intent,
      version: BigInt(state.version),
      data: state.data as any,
      allocations: state.allocations as any,
    });
    const packedBytes = ethers.getBytes(packed);
    const serverAddress = ethers.verifyMessage(packedBytes, serverSignature);
    resolvedParticipants = [walletAddress, serverAddress].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
  }

  const normalized = resolvedParticipants.map((p) => normalizeAddress(p));
  const userIndex = normalized.indexOf(normalizeAddress(walletAddress));
  if (userIndex === -1 || resolvedParticipants.length === 1) {
    return [userSignature, serverSignature];
  }
  if (resolvedParticipants.length === 2) {
    return userIndex === 0
      ? [userSignature, serverSignature]
      : [serverSignature, userSignature];
  }

  const sigs = new Array(resolvedParticipants.length).fill("0x");
  sigs[userIndex] = userSignature;
  const otherIndex = sigs.findIndex((sig) => sig === "0x");
  if (otherIndex >= 0) sigs[otherIndex] = serverSignature;
  return sigs;
}

export async function depositToChannel(
  wallet: WalletLike,
  status: YellowStatus,
  amount: number,
) {
  if (!amount || amount <= 0) {
    throw new Error("Deposit amount must be greater than zero.");
  }
  assertStatus(status);

  const web3Provider = await getWeb3Provider(wallet);
  await ensureChain(web3Provider, status.chainId as number);

  const signer = await web3Provider.getSigner();
  const token = new ethers.Contract(status.assetAddress!, ERC20_ABI, signer);
  const decimals = await token.decimals();
  const amountWei = ethers.parseUnits(amount.toString(), decimals);
  const owner = await signer.getAddress();

  const allowance = await token.allowance(owner, status.custodyAddress);
  if (allowance < amountWei) {
    const approveTx = await token.approve(status.custodyAddress, amountWei);
    await approveTx.wait();
  }

  const custody = new ethers.Contract(
    status.custodyAddress!,
    custodyAbi,
    signer,
  );
  const depositTx = await custody.deposit(owner, status.assetAddress, amountWei);
  await depositTx.wait();
}

export async function withdrawToL1(
  wallet: WalletLike,
  status: YellowStatus,
  amount: number,
) {
  if (!amount || amount <= 0) {
    throw new Error("Withdraw amount must be greater than zero.");
  }
  assertStatus(status);

  const web3Provider = await getWeb3Provider(wallet);
  await ensureChain(web3Provider, status.chainId as number);

  const signer = await web3Provider.getSigner();
  const token = new ethers.Contract(status.assetAddress!, ERC20_ABI, signer);
  const decimals = await token.decimals();
  const amountWei = ethers.parseUnits(amount.toString(), decimals);

  const custody = new ethers.Contract(
    status.custodyAddress!,
    custodyAbi,
    signer,
  );
  const withdrawTx = await custody.withdraw(status.assetAddress, amountWei);
  await withdrawTx.wait();
}

export async function settleUnifiedToL1(
  wallet: WalletLike,
  status: YellowStatus,
  amount: number,
) {
  if (!amount || amount <= 0) {
    throw new Error("Settle amount must be greater than zero.");
  }
  assertStatus(status);

  const web3Provider = await getWeb3Provider(wallet);
  await ensureChain(web3Provider, status.chainId as number);
  const signer = await web3Provider.getSigner();
  const walletAddress = await signer.getAddress();

  const token = new ethers.Contract(status.assetAddress!, ERC20_ABI, signer);
  const decimals = await token.decimals();
  const amountWei = ethers.parseUnits(amount.toString(), decimals);

  await withAuthSession(wallet, walletAddress, async (socket, sessionSigner) => {
    let channelOp: LedgerChannelOperation | null = null;

    const createReq = await createCreateChannelMessage(
      sessionSigner as any,
      {
        chain_id: status.chainId,
        token: status.assetAddress,
      },
      generateRequestId(),
      Date.now(),
    );
    const createRes = await sendRPC(socket, createReq);

    if (createRes?.method === RPCMethod.CreateChannel) {
      const params = (createRes as any)?.params;
      channelOp = {
        channelId: params.channelId,
        state: {
          intent: params.state.intent,
          version: params.state.version,
          stateData: params.state.stateData,
          allocations: params.state.allocations,
        },
        serverSignature: params.serverSignature,
        channel: params.channel,
        participants: params.channel?.participants,
      };
    } else if (createRes?.method === RPCMethod.Error) {
      const msg = (createRes as any)?.params?.error ?? "";
      const existing = msg.match(/0x[0-9a-fA-F]{64}/)?.[0];
      if (existing) {
        channelOp = { channelId: existing, state: null as any, serverSignature: "" };
      } else {
        throw new Error(`Clearnode error: ${msg || "unknown"}`);
      }
    } else {
      throw new Error(
        `Unexpected response from clearnode during create_channel: ${createRes?.method ?? "none"}`,
      );
    }

    const custody = new ethers.Contract(
      status.custodyAddress!,
      custodyAbi,
      signer,
    );

    let participants: string[] | null | undefined = channelOp?.participants;
    if (!participants) {
      try {
        const data = await custody.getChannelData(channelOp?.channelId);
        participants = data?.channel?.participants ?? data?.[0]?.participants;
      } catch {
        participants = null;
      }
    }

    if (channelOp?.channel && channelOp?.state) {
      const channelId =
        channelOp.channelId ||
        getChannelId(channelOp.channel as any, status.chainId as number);
      const userSig = await signState(signer, channelId, {
        intent: channelOp.state.intent,
        version: channelOp.state.version,
        data: channelOp.state.stateData,
        allocations: channelOp.state.allocations,
      });
      const signedInitial = buildSignedState(
        channelId,
        {
          intent: channelOp.state.intent,
          version: channelOp.state.version,
          data: channelOp.state.stateData,
          allocations: channelOp.state.allocations,
        },
        orderSignatures(
          channelOp.channel.participants,
          walletAddress,
          userSig,
          channelOp.serverSignature,
          channelId,
          {
            intent: channelOp.state.intent,
            version: channelOp.state.version,
            data: channelOp.state.stateData,
            allocations: channelOp.state.allocations,
          },
        ),
      );

      await (await custody.create(channelOp.channel, signedInitial)).wait();
      channelOp.channelId = channelId;
      participants = channelOp.channel.participants;
    }

    const channelId = channelOp?.channelId;
    if (!channelId) {
      throw new Error("Failed to resolve channel id for settlement");
    }

    const resizeReq = await createResizeChannelMessage(
      sessionSigner as any,
      {
        channel_id: channelId,
        allocate_amount: amountWei,
        funds_destination: walletAddress,
      } as any,
      generateRequestId(),
      Date.now(),
    );
    const resizeRes = await sendRPC(socket, resizeReq);
    if (!resizeRes || resizeRes.method !== RPCMethod.ResizeChannel) {
      const errMsg = (resizeRes as any)?.params?.error ?? "unknown";
      throw new Error(`Resize channel failed: ${errMsg}`);
    }

    const resizeParams = (resizeRes as any)?.params;
    const resizeUserSig = await signState(signer, channelId, {
      intent: resizeParams.state.intent,
      version: resizeParams.state.version,
      data: resizeParams.state.stateData,
      allocations: resizeParams.state.allocations,
    });
    const resizeState = buildSignedState(
      channelId,
      {
        intent: resizeParams.state.intent,
        version: resizeParams.state.version,
        data: resizeParams.state.stateData,
        allocations: resizeParams.state.allocations,
      },
      orderSignatures(
        participants,
        walletAddress,
        resizeUserSig,
        resizeParams.serverSignature,
        channelId,
        {
          intent: resizeParams.state.intent,
          version: resizeParams.state.version,
          data: resizeParams.state.stateData,
          allocations: resizeParams.state.allocations,
        },
      ),
    );
    await (await custody.resize(channelId, resizeState, [])).wait();

    const closeReq = await createCloseChannelMessage(
      sessionSigner as any,
      channelId as any,
      walletAddress,
      generateRequestId(),
      Date.now(),
    );
    const closeRes = await sendRPC(socket, closeReq);
    if (!closeRes || closeRes.method !== RPCMethod.CloseChannel) {
      const errMsg = (closeRes as any)?.params?.error ?? "unknown";
      throw new Error(`Close channel failed: ${errMsg}`);
    }

    const closeParams = (closeRes as any)?.params;
    const closeUserSig = await signState(signer, channelId, {
      intent: closeParams.state.intent,
      version: closeParams.state.version,
      data: closeParams.state.stateData,
      allocations: closeParams.state.allocations,
    });
    const closeState = buildSignedState(
      channelId,
      {
        intent: closeParams.state.intent,
        version: closeParams.state.version,
        data: closeParams.state.stateData,
        allocations: closeParams.state.allocations,
      },
      orderSignatures(
        participants,
        walletAddress,
        closeUserSig,
        closeParams.serverSignature,
        channelId,
        {
          intent: closeParams.state.intent,
          version: closeParams.state.version,
          data: closeParams.state.stateData,
          allocations: closeParams.state.allocations,
        },
      ),
    );
    await (await custody.close(channelId, closeState)).wait();

    await (await custody.withdraw(status.assetAddress, amountWei)).wait();
  });
}
