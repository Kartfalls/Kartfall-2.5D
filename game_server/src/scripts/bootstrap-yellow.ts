import { Decimal } from "decimal.js";
import "dotenv/config";
import {
  DEFAULT_ASSET,
  approveToken,
  getPlatformAddress,
  getPlatformChannelBalance,
  getWalletL1Balance,
  isBlockchainConfigured,
  pingNode,
  createHomeChannel,
} from "../services/yellow.service.js";

// Allow running the bootstrap script without Privy envs set.
if (!process.env.PRIVY_APP_ID) process.env.PRIVY_APP_ID = "bootstrap_dummy";
if (!process.env.PRIVY_APP_SECRET)
  process.env.PRIVY_APP_SECRET = "bootstrap_dummy";
if (!process.env.PRIVY_VERIFICATION_KEY)
  process.env.PRIVY_VERIFICATION_KEY = "";

const { env } = await import("../config/env.js");

async function main(): Promise<void> {
  if (!isBlockchainConfigured()) {
    throw new Error(
      "Missing YELLOW_CHAIN_ID or YELLOW_RPC_URL. Configure both before bootstrapping on-chain flow.",
    );
  }

  const nodeReachable = await pingNode();
  if (!nodeReachable) {
    console.warn("Yellow clearnode ping failed — continuing (may be transient).");
  }

  // Amounts expressed in token units (e.g., 5 = 5 USDC)
  const approveAmount = new Decimal(process.env.YELLOW_BOOTSTRAP_APPROVE ?? "0");
  const depositAmount = new Decimal(process.env.YELLOW_BOOTSTRAP_DEPOSIT ?? "0");

  console.log("[Yellow bootstrap] Starting with config:", {
    chainId: env.YELLOW_CHAIN_ID?.toString(),
    asset: DEFAULT_ASSET,
    approveAmount: approveAmount.toString(),
    depositAmount: depositAmount.toString(),
  });

  const platform = getPlatformAddress();
  const l1Before = await getWalletL1Balance(platform, env.YELLOW_ASSET_ADDRESS);
  const channelBefore = await getPlatformChannelBalance();
  console.log("[Yellow bootstrap] Balances before", {
    platform,
    l1: l1Before,
    channel: channelBefore,
  });

  if (approveAmount.gt(0)) {
    const approveTx = await approveToken(
      approveAmount,
      env.YELLOW_ASSET_ADDRESS,
    );
    console.log(`[Yellow bootstrap] Approve tx: ${approveTx}`);
  }

  // Create (or recreate) the platform home channel on-chain.
  // depositAmount > 0 will auto-approve (if needed) and fund the channel.
  await createHomeChannel(depositAmount);

  const l1After = await getWalletL1Balance(platform, env.YELLOW_ASSET_ADDRESS);
  const channelAfter = await getPlatformChannelBalance();
  console.log("[Yellow bootstrap] Balances after", {
    platform,
    l1: l1After,
    channel: channelAfter,
  });

  console.log("[Yellow bootstrap] Completed successfully");
}

main()
  .catch((err) => {
    console.error("[Yellow bootstrap] Failed:", err);
    process.exitCode = 1;
  });
