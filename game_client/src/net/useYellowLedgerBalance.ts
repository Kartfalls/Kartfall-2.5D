import { useCallback, useEffect, useState } from "react";
import {
  createAuthRequestMessage,
  createAuthVerifyMessageFromChallenge,
  createGetLedgerBalancesMessage,
  createECDSAMessageSigner,
  parseAnyRPCResponse,
  RPCMethod,
  EIP712AuthTypes,
  generateRequestId,
} from "@erc7824/nitrolite";
import { ethers } from "ethers";

type WalletLike = {
  address?: string;
  getEthereumProvider: () => Promise<unknown>;
};

type LedgerBalance = {
  asset: string;
  amount: string;
};

type HexAddress = `0x${string}`;
type AuthRequestParams = Parameters<typeof createAuthRequestMessage>[0];

function toHexAddress(value: string, label: string): HexAddress {
  const normalized = value?.trim();
  if (!normalized || !normalized.startsWith("0x")) {
    throw new Error(`Invalid ${label}: expected 0x-prefixed address`);
  }
  return normalized as HexAddress;
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
  authParams: Pick<
    AuthRequestParams,
    "address" | "session_key" | "scope" | "expires_at" | "allowances"
  >,
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

async function fetchLedgerBalances(
  wallet: WalletLike,
  walletAddress: string,
): Promise<LedgerBalance[]> {
  const socket = await openSocket(getClearnodeUrl());
  try {
    const walletAddressHex = toHexAddress(walletAddress, "wallet address");
    const sessionWallet = ethers.Wallet.createRandom();
    const sessionKeyHex = toHexAddress(sessionWallet.address, "session key");
    const sessionSigner = createECDSAMessageSigner(
      sessionWallet.privateKey as `0x${string}`,
    );

    const expiresAtSec = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
    const authParams: AuthRequestParams = {
      address: walletAddressHex,
      session_key: sessionKeyHex,
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
      address: walletAddressHex,
      session_key: sessionKeyHex,
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

    const balanceReq = await createGetLedgerBalancesMessage(
      sessionSigner,
      walletAddressHex,
      generateRequestId(),
      Date.now(),
    );
    const balancesRes = await sendRPC(socket, balanceReq);
    if (!balancesRes || balancesRes.method !== RPCMethod.GetLedgerBalances) {
      throw new Error(
        `Balance fetch failed: ${balancesRes?.method ?? "unknown"}`,
      );
    }

    return (balancesRes as any)?.params?.ledgerBalances ?? [];
  } finally {
    socket.close();
  }
}

export function useYellowLedgerBalance(
  wallet: WalletLike | null,
  walletAddress?: string | null,
  asset?: string | null,
  assetDecimals?: number | null,
) {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet || !walletAddress) {
      setBalance(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const balances = await fetchLedgerBalances(wallet, walletAddress);
      const target = (asset || "").toLowerCase();
      const entry = balances.find((b) =>
        target ? b.asset.toLowerCase() === target : true,
      );
      const amount = entry?.amount ?? "0";
      if (assetDecimals !== null && assetDecimals !== undefined) {
        try {
          const formatted = ethers.formatUnits(
            amount as any,
            assetDecimals,
          );
          setBalance(formatted);
          return formatted;
        } catch {
          // fallback to raw amount
        }
      }
      setBalance(amount);
      return amount;
    } catch (err: any) {
      setError(err?.message ?? "Failed to fetch ledger balance");
      return null;
    } finally {
      setLoading(false);
    }
  }, [wallet, walletAddress, asset, assetDecimals]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, loading, error, refresh };
}
