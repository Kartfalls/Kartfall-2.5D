import {
  PrivyClient,
  verifyAccessToken,
  isEmbeddedWalletLinkedAccount,
} from "@privy-io/node";
import type {
  User,
  LinkedAccount,
  LinkedAccountEmbeddedWallet,
} from "@privy-io/node";
import { env } from "../config/env.js";

// ---------------------------------------------------------------------------
// Singleton Privy client (for user/wallet management)
// ---------------------------------------------------------------------------

let _privy: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (_privy) return _privy;

  _privy = new PrivyClient({
    appId: env.PRIVY_APP_ID,
    appSecret: env.PRIVY_APP_SECRET,
  });

  return _privy;
}

// ---------------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------------

export interface AuthResult {
  /** Privy DID  (e.g. "did:privy:abc123") */
  userId: string;
  /** Session ID from the access token */
  sessionId: string;
}

/**
 * Verifies a Privy access token (JWT) sent by the frontend.
 *
 * @param accessToken  The `Authorization: Bearer <token>` value
 * @returns            Parsed userId + sessionId
 * @throws             If the token is invalid or expired
 */
export async function verifyPrivyToken(
  accessToken: string,
): Promise<AuthResult> {
  if (!env.PRIVY_VERIFICATION_KEY) {
    throw new Error(
      "PRIVY_VERIFICATION_KEY is not set — add it to .env.development (Privy dashboard → App Settings → Verification key)",
    );
  }

  // Wrap the key in PEM headers if it's just base64
  let verificationKey = env.PRIVY_VERIFICATION_KEY;
  if (!verificationKey.includes("-----BEGIN")) {
    verificationKey = `-----BEGIN PUBLIC KEY-----\n${verificationKey}\n-----END PUBLIC KEY-----`;
  }

  try {
    const payload = await verifyAccessToken({
      access_token: accessToken,
      app_id: env.PRIVY_APP_ID,
      verification_key: verificationKey,
    });

    return {
      userId: payload.user_id,
      sessionId: payload.session_id,
    };
  } catch (err) {
    // Log the underlying error for debugging — the SDK wraps jose errors
    // in a generic "Failed to verify authentication token" message
    console.error(
      "[Auth] Token verification failed:",
      err instanceof Error ? err.message : err,
    );
    console.error(
      "[Auth] Debug — appId:",
      env.PRIVY_APP_ID,
      "| keyPrefix:",
      env.PRIVY_VERIFICATION_KEY.slice(0, 20) + "…",
      "| tokenPrefix:",
      accessToken.slice(0, 30) + "…",
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// User + wallet helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the full Privy user object.
 */
export async function getUser(userId: string): Promise<User> {
  const privy = getPrivyClient();
  return privy.users()._get(userId);
}

/**
 * Extracts the first Ethereum embedded wallet from a user's linked accounts.
 *
 * WHY EMBEDDED (NOT SMART/CONTRACT) WALLETS:
 * Yellow state channels require ECDSA `personal_sign` signatures generated
 * from a private key.  Privy's embedded wallets are **MPC wallets** that can
 * produce standard ECDSA sigs — they behave like EOAs and are fully compatible
 * with Yellow's clearnode.
 *
 * Smart / contract wallets (ERC-4337, Safe, etc.) verify signatures on-chain
 * via ERC-1271.  Yellow's clearnode validates sigs off-chain using `ecrecover`,
 * so contract wallets are **NOT compatible** with Yellow state channels.
 */
export function getEmbeddedWalletAddress(user: User): string | null {
  const embedded = user.linked_accounts.find(
    (a: LinkedAccount) =>
      isEmbeddedWalletLinkedAccount(a) && a.chain_type === "ethereum",
  ) as LinkedAccountEmbeddedWallet | undefined;

  return embedded?.address ?? null;
}

/**
 * Returns the first usable Ethereum wallet address (embedded preferred,
 * falls back to external EOA wallet).
 */
export function getWalletAddress(user: User): string | null {
  // Prefer embedded
  const embedded = getEmbeddedWalletAddress(user);
  if (embedded) return embedded;

  // Fall back to external EOA wallet (not smart_wallet)
  const external = user.linked_accounts.find(
    (a: LinkedAccount) =>
      a.type === "wallet" &&
      "chain_type" in a &&
      (a as { chain_type: string }).chain_type === "ethereum",
  ) as { address: string } | undefined;

  return external?.address ?? null;
}

/**
 * Returns all usable Ethereum wallet addresses for a user (embedded + external).
 */
export function getUserWalletAddresses(user: User): string[] {
  const addresses: string[] = [];
  const embedded = getEmbeddedWalletAddress(user);
  if (embedded) addresses.push(embedded);

  const externals = user.linked_accounts.filter(
    (a: LinkedAccount) =>
      a.type === "wallet" &&
      "chain_type" in a &&
      (a as { chain_type: string }).chain_type === "ethereum",
  ) as { address: string }[];

  externals.forEach((w) => {
    if (w?.address) addresses.push(w.address);
  });

  return Array.from(new Set(addresses.map((a) => a.toLowerCase())));
}

export function isUserWalletAddress(user: User, address: string): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();
  return getUserWalletAddresses(user).includes(normalized);
}

/**
 * Full auth flow: verify token → fetch user → resolve wallet address.
 *
 * Call this from `onAuth` in your Colyseus Room.
 */
export async function authenticatePlayer(accessToken: string): Promise<{
  userId: string;
  walletAddress: string;
}> {
  const { userId } = await verifyPrivyToken(accessToken);
  const user = await getUser(userId);
  const walletAddress = getWalletAddress(user);

  if (!walletAddress) {
    throw new Error(
      "No Ethereum wallet linked to this Privy account. " +
        "A wallet is required to play.",
    );
  }

  return { userId, walletAddress };
}
