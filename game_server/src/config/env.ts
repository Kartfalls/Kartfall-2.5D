/**
 * Centralised environment configuration.
 *
 * Import `env` anywhere to get typed, validated access to every env var used
 * across the server.  Required variables are checked at import-time so the
 * process fails fast on missing config instead of at some random runtime point.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

// ---------------------------------------------------------------------------
// Env object (evaluated once at module load)
// ---------------------------------------------------------------------------

export const env = {
  /** "development" | "production" etc. */
  NODE_ENV: optional("NODE_ENV", "development"),

  // ── Privy ────────────────────────────────────────────────────────────────
  /** Privy application ID */
  PRIVY_APP_ID: required("PRIVY_APP_ID"),

  /** Privy application secret (server-side) */
  PRIVY_APP_SECRET: required("PRIVY_APP_SECRET"),

  /**
   * Privy verification key (PEM / JWK) for token verification.
   * Optional at startup — validated lazily inside verifyPrivyToken().
   */
  PRIVY_VERIFICATION_KEY: optional("PRIVY_VERIFICATION_KEY", ""),

  // ── Yellow Network ───────────────────────────────────────────────────────
  /** WebSocket endpoint of the Yellow clearnode */
  YELLOW_CLEARNODE_URL: optional(
    "YELLOW_CLEARNODE_URL",
    "wss://clearnet.yellow.com/ws",
  ),
  /** Toggle Yellow integration on/off */
  YELLOW_ENABLED: optional("YELLOW_ENABLED", "true") === "true",

  /**
   * Platform's hex-encoded private key (0x-prefixed) for signing.
   * Optional at startup — validated lazily inside getYellowClient().
   */
  YELLOW_PRIVATE_KEY: optional("YELLOW_PRIVATE_KEY", "") as `0x${string}` | "",

  /** Token symbol used for payouts (e.g. "usdc") */
  YELLOW_ASSET: optional("YELLOW_ASSET", "usdc"),
  /** ERC20 token address of the payout asset (e.g. Sepolia USDC) */
  YELLOW_ASSET_ADDRESS: optional("YELLOW_ASSET_ADDRESS", ""),

  /** Decimal places of the payout asset (USDC = 6) */
  YELLOW_ASSET_DECIMALS: Number(optional("YELLOW_ASSET_DECIMALS", "6")),

  /** Chain ID for on-chain operations (e.g. 80002 = Polygon Amoy) */
  YELLOW_CHAIN_ID: process.env.YELLOW_CHAIN_ID
    ? BigInt(process.env.YELLOW_CHAIN_ID)
    : undefined,

  /** JSON-RPC URL for the target chain (e.g. Alchemy / Infura) */
  YELLOW_RPC_URL: optional("YELLOW_RPC_URL", ""),

  /** Custody contract address (Nitrolite) */
  YELLOW_CUSTODY_ADDRESS: optional("YELLOW_CUSTODY_ADDRESS", ""),

  /** Adjudicator contract address (Nitrolite) */
  YELLOW_ADJUDICATOR_ADDRESS: optional("YELLOW_ADJUDICATOR_ADDRESS", ""),

  /** Auto-approve + deposit platform funds on demand (development convenience) */
  YELLOW_AUTOFUND: optional("YELLOW_AUTOFUND", "false") === "true",
  /** Amount (token units, not wei) to auto-approve/deposit when enabled */
  YELLOW_AUTOFUND_AMOUNT: optional("YELLOW_AUTOFUND_AMOUNT", "0"),

  // ── Yellow Treasury ──────────────────────────────────────────────────────
  /** Treasury wallet address for rake deposits */
  YELLOW_TREASURY_ADDRESS: optional("YELLOW_TREASURY_ADDRESS", ""),

  /** Registered application ID on Yellow Network for state channels */
  YELLOW_APP_ID: optional("YELLOW_APP_ID", "kartfall_v1"),

  /** Yellow API key (preferred for clearnode auth when available) */
  YELLOW_API_KEY: optional("YELLOW_API_KEY", ""),

  // ── Game Config ──────────────────────────────────────────────────────────
  /** Stake amount in asset-native units (USDC 6 decimals: 1000000 = 1 USDC) */
  STAKE_AMOUNT_WEI: Number(optional("STAKE_AMOUNT_WEI", "1000000")),

  /** Match duration in seconds */
  MATCH_DURATION_SEC: Number(optional("MATCH_DURATION_SEC", "180")),

  /** Max players (non-spectators) per room */
  MAX_PLAYERS: Number(optional("MAX_PLAYERS", "4")),

  /** Max spectators per room */
  MAX_SPECTATORS: Number(optional("MAX_SPECTATORS", "4")),

  /** Minimum number of players required to start a match */
  MIN_PLAYERS_TO_START: Number(optional("MIN_PLAYERS_TO_START", "2")),

  /** Countdown duration in seconds before match starts */
  /** Countdown duration in seconds before match starts */
  COUNTDOWN_DURATION_SEC: Number(optional("COUNTDOWN_DURATION_SEC", "30")),

  // ── Supabase ─────────────────────────────────────────────────────────────
  /** Supabase project URL */
  SUPABASE_URL: optional("SUPABASE_URL", ""),

  /** Supabase service-role key (server-side only, bypasses RLS) */
  SUPABASE_SERVICE_KEY: optional("SUPABASE_SERVICE_KEY", ""),
} as const;

export type Env = typeof env;
