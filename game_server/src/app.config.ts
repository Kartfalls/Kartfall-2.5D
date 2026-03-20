import {
  defineServer,
  defineRoom,
  matchMaker,
  monitor,
  playground,
  createRouter,
  createEndpoint,
} from "colyseus";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/**
 * Import your Room files
 */
import { KartfallRoom } from "./rooms/KartfallRoom.js";
import { verifyPrivyToken } from "./services/auth.service.js";
import {
  getProfile,
  getOrCreateProfile,
  updateDisplayName,
} from "./services/profile.service.js";
import {
  pingNode as pingYellowNode,
  getPlayerAssetBalance as getYellowBalance,
  getPlatformChannelBalance,
  getPlatformAddress,
  getWalletL1Balance,
  getWalletCustodyBalance,
  DEFAULT_ASSET as YELLOW_ASSET,
  payoutWinner,
} from "./services/yellow.service.js";
import {
  getUser,
  getWalletAddress,
  isUserWalletAddress,
} from "./services/auth.service.js";
import {
  clearPlayerChannelBalance,
  getChannelBalance,
  getChannelBalancesForWallet,
  getHistoryForWallet,
  getMatchChannel,
  getMatchChannelsByIds,
  upsertChannelBalances,
} from "./services/matchChannel.service.js";
import { env } from "./config/env.js";

// ---------------------------------------------------------------------------
// Auth middleware for REST routes
// ---------------------------------------------------------------------------
async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!bearer) {
    res.status(401).json({ error: "Missing access token" });
    return;
  }
  if (!env.PRIVY_VERIFICATION_KEY) {
    // Dev mode: skip verification, parse claims manually
    try {
      const payload = JSON.parse(
        Buffer.from(bearer.split(".")[1], "base64url").toString(),
      );
      const userId = payload.sub ?? payload.user_id ?? "";
      if (!userId) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }
      (req as any).auth = { userId };
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
    return;
  }
  try {
    const auth = await verifyPrivyToken(bearer);
    if (!auth.userId) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    (req as any).auth = auth;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function resolveWalletAddress(req: any): Promise<string> {
  const { userId } = req.auth ?? {};
  if (!userId) return "";

  let walletAddress = "";
  try {
    const user = await getUser(userId);
    const requested =
      typeof req.query?.walletAddress === "string"
        ? req.query.walletAddress
        : typeof req.query?.wallet === "string"
          ? req.query.wallet
          : typeof req.body?.walletAddress === "string"
            ? req.body.walletAddress
            : typeof req.body?.wallet === "string"
              ? req.body.wallet
              : "";
    if (requested) {
      if (!isUserWalletAddress(user, requested)) return "";
      walletAddress = requested;
    } else {
      walletAddress = getWalletAddress(user) ?? "";
    }
  } catch {
    walletAddress = "";
  }

  return walletAddress;
}

const networkLabel = env.YELLOW_MAINNET ? "MAINNET" : "TESTNET";
const chainId = env.YELLOW_CHAIN_ID ? Number(env.YELLOW_CHAIN_ID) : 11155111;
console.log(`[Server] Starting on network=${networkLabel} | chainId=${chainId} | asset=${env.YELLOW_ASSET ?? "?"} | clearnode=${env.YELLOW_CLEARNODE_URL ?? "?"}`);

const server = defineServer({
  /**
   * Define your room handlers:
   */
  rooms: {
    kartfall_room: defineRoom(KartfallRoom),
  },

  /**
   * Experimental: Define API routes. Built-in integration with the "playground" and SDK.
   *
   * Usage from SDK:
   *   client.http.get("/api/hello").then((response) => {})
   *
   */
  routes: createRouter({
    api_hello: createEndpoint("/api/hello", { method: "GET" }, async (ctx) => {
      return { message: "Hello World" };
    }),
  }),

  /**
   * Bind your custom express routes here:
   * Read more: https://expressjs.com/en/starter/basic-routing.html
   */
  express: (app) => {
    app.use(express.json());

    // Allow cross-origin requests from the Vite dev server and any deployed client.
    app.use((req, res, next) => {
      const origin = req.headers.origin || "*";
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });

    app.get("/hi", (req, res) => {
      res.send("It's time to kick ass and chew bubblegum!");
    });

    /**
     * Room listing endpoint — used by clients to find rooms by custom roomCode.
     * Returns: [{ roomId, metadata }]
     */
    app.get("/api/rooms", async (req, res) => {
      try {
        const rooms = await matchMaker.query({ name: "kartfall_room" });
        res.json(
          rooms.map((r: any) => ({
            roomId: r.roomId,
            metadata: r.metadata ?? {},
          })),
        );
      } catch (err) {
        console.error("[API] /api/rooms error:", err);
        res.json([]);
      }
    });

    // ── Profile: get own profile (creates one if new) ──────────────────────
    app.get("/api/profile", requireAuth as any, async (req: any, res) => {
      try {
        const { userId } = req.auth;
        let profile = await getProfile(userId);
        if (!profile) {
          profile = await getOrCreateProfile(userId, "", "");
        }
        res.json(profile);
      } catch (err) {
        console.error("[API] GET /api/profile error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // ── Profile: update display name ────────────────────────────────────────
    app.put("/api/profile/name", requireAuth as any, async (req: any, res) => {
      try {
        const { userId } = req.auth;
        const name = (req.body?.name ?? "").toString().trim().slice(0, 24);
        if (!name) {
          res.status(400).json({ error: "Name cannot be empty" });
          return;
        }
        const profile = await updateDisplayName(userId, name);
        res.json(profile);
      } catch (err) {
        console.error("[API] PUT /api/profile/name error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // ── Yellow status: clearnode + player balance (auth required) ───────────
    app.get("/api/yellow/status", requireAuth as any, async (req: any, res) => {
      try {
        const { userId } = req.auth;

        let walletAddress = "";
        try {
          const user = await getUser(userId);
          const requestedWallet =
            typeof req.query?.walletAddress === "string"
              ? req.query.walletAddress
              : "";
          if (requestedWallet) {
            if (!isUserWalletAddress(user, requestedWallet)) {
              res
                .status(400)
                .json({ error: "Wallet address not linked to user" });
              return;
            }
            walletAddress = requestedWallet;
          } else {
            walletAddress = getWalletAddress(user) ?? "";
          }
        } catch {
          walletAddress = "";
        }

        // Pick testnet or mainnet config based on ?network= query param
        const isMainnet = req.query?.network === "mainnet";
        const netAsset        = isMainnet ? env.YELLOW_ASSET_MAINNET        : YELLOW_ASSET;
        const netAssetAddr    = isMainnet ? env.YELLOW_ASSET_ADDRESS_MAINNET : env.YELLOW_ASSET_ADDRESS;
        const netCustody      = isMainnet ? env.YELLOW_CUSTODY_ADDRESS_MAINNET : env.YELLOW_CUSTODY_ADDRESS;
        const netAdjudicator  = isMainnet ? env.YELLOW_ADJUDICATOR_ADDRESS_MAINNET : env.YELLOW_ADJUDICATOR_ADDRESS;
        const netChainId      = isMainnet
          ? (env.YELLOW_CHAIN_ID_MAINNET ? Number(env.YELLOW_CHAIN_ID_MAINNET) : 1)
          : (env.YELLOW_CHAIN_ID ? Number(env.YELLOW_CHAIN_ID) : 11155111);

        console.log(`[API] /api/yellow/status network=${isMainnet ? "mainnet" : "testnet"} chainId=${netChainId} wallet=${walletAddress}`);

        const [
          nodeOk,
          playerBalance,
          platformBalance,
          walletL1,
          custodyBalance,
        ] = await Promise.all([
          pingYellowNode().catch(() => false),
          walletAddress
            ? getYellowBalance(walletAddress).catch(() => "0")
            : Promise.resolve("0"),
          getPlatformChannelBalance().catch(() => "0"),
          walletAddress
            ? getWalletL1Balance(walletAddress).catch(() => "0")
            : Promise.resolve("0"),
          walletAddress
            ? getWalletCustodyBalance(walletAddress).catch(() => "0")
            : Promise.resolve("0"),
        ]);

        const platformConfigured =
          !!env.YELLOW_PRIVATE_KEY &&
          !!netAssetAddr &&
          !!netCustody &&
          !!netAdjudicator;

        const stakingAvailable =
          platformConfigured && env.YELLOW_ENABLED === true;

        res.json({
          stakingAvailable,
          clearnodeReachable: nodeOk,
          platformConfigured,
          missingConfig: !platformConfigured,
          playerBalance,
          platformBalance,
          walletL1Balance: walletL1,
          custodyBalance,
          asset: netAsset,
          assetAddress: netAssetAddr,
          custodyAddress: netCustody,
          adjudicatorAddress: netAdjudicator,
          chainId: netChainId,
          walletAddress,
          platformWallet: getPlatformAddress(),
        });
      } catch (err) {
        console.error("[API] /api/yellow/status error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // ── Yellow sandbox faucet: request test funds for caller wallet ─────────
    app.post(
      "/api/yellow/faucet",
      requireAuth as any,
      async (req: any, res) => {
        try {
          const { userId } = req.auth;

          let walletAddress = "";
          try {
            const user = await getUser(userId);
            const requestedWallet =
              typeof req.body?.walletAddress === "string"
                ? req.body.walletAddress
                : "";
            if (requestedWallet) {
              if (!isUserWalletAddress(user, requestedWallet)) {
                res
                  .status(400)
                  .json({ error: "Wallet address not linked to user" });
                return;
              }
              walletAddress = requestedWallet;
            } else {
              walletAddress = getWalletAddress(user) ?? "";
            }
          } catch {
            walletAddress = "";
          }

          if (!walletAddress) {
            res
              .status(400)
              .json({ error: "No wallet found for authenticated user" });
            return;
          }

          if (env.YELLOW_MAINNET) {
            res.status(403).json({ error: "Faucet is not available on mainnet." });
            return;
          }

          const defaultSandboxFaucet =
            "https://clearnet-sandbox.yellow.com/faucet/requestTokens";
          const faucetUrl =
            process.env.YELLOW_FAUCET_URL?.trim() || defaultSandboxFaucet;
          const clearnodeUrl = env.YELLOW_CLEARNODE_URL.toLowerCase();
          const sandboxMode =
            clearnodeUrl.includes("sandbox") ||
            faucetUrl.includes("clearnet-sandbox.yellow.com");

          if (!sandboxMode) {
            res.status(400).json({
              error:
                "Faucet is only available in sandbox mode. Configure YELLOW_FAUCET_URL explicitly if needed.",
            });
            return;
          }

          const faucetResp = await fetch(faucetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userAddress: walletAddress }),
          });

          const bodyText = await faucetResp.text();
          if (!faucetResp.ok) {
            res.status(faucetResp.status).json({
              error:
                bodyText ||
                `Faucet request failed with status ${faucetResp.status}`,
            });
            return;
          }

          res.json({
            ok: true,
            walletAddress,
            response: bodyText || "accepted",
          });
        } catch (err) {
          console.error("[API] /api/yellow/faucet error:", err);
          res
            .status(500)
            .json({ error: "Failed to request Yellow faucet funds" });
        }
      },
    );

    // ── Match balance (wallet + unredeemed) ──────────────────────────────
    app.get(
      "/api/match/balance",
      requireAuth as any,
      async (req: any, res) => {
        try {
          const walletAddress = await resolveWalletAddress(req);
          if (!walletAddress) {
            res.status(400).json({ error: "No wallet found for user" });
            return;
          }

          const matchId =
            typeof req.query?.matchId === "string" ? req.query.matchId : "";

          let unredeemed = 0n;
          let channelId = "";
          if (matchId) {
            const channel = await getMatchChannel(matchId);
            if (channel?.channel_id) {
              channelId = channel.channel_id;
              unredeemed = await getChannelBalance(channelId, walletAddress);
            }
          } else {
            const balances = await getChannelBalancesForWallet(walletAddress);
            unredeemed = balances.reduce(
              (sum, entry) => sum + entry.unredeemedAmount,
              0n,
            );
          }

          const walletBalance = await getWalletL1Balance(
            walletAddress,
            env.YELLOW_ASSET_ADDRESS,
          );

          res.json({
            matchId: matchId || null,
            channelId: channelId || null,
            walletAddress,
            walletBalance,
            unredeemed: unredeemed.toString(),
            asset: YELLOW_ASSET,
            assetAddress: env.YELLOW_ASSET_ADDRESS,
            custodyAddress: env.YELLOW_CUSTODY_ADDRESS,
            assetDecimals: env.YELLOW_ASSET_DECIMALS,
            chainId: env.YELLOW_CHAIN_ID ? Number(env.YELLOW_CHAIN_ID) : null,
          });
        } catch (err) {
          console.error("[API] /api/match/balance error:", err);
          res.status(500).json({ error: "Failed to load match balance" });
        }
      },
    );

    // ── Match withdraw (close channel + redeem) ───────────────────────────
    app.post(
      "/api/match/withdraw",
      requireAuth as any,
      async (req: any, res) => {
        try {
          const matchId =
            typeof req.body?.matchId === "string" ? req.body.matchId : "";
          if (!matchId) {
            res.status(400).json({ error: "matchId is required" });
            return;
          }

          const walletAddress = await resolveWalletAddress(req);
          if (!walletAddress) {
            res.status(400).json({ error: "No wallet found for user" });
            return;
          }

          const channel = await getMatchChannel(matchId);
          if (!channel?.channel_id) {
            res.status(404).json({ error: "Match channel not found" });
            return;
          }

          const channelId = channel.channel_id as string;

          // Block withdrawal if payouts haven't been processed yet.
          if (channel.status === "open" && env.YELLOW_ENABLED) {
            res.status(409).json({
              error:
                "Payouts are still being processed. Please try again in a few seconds.",
            });
            return;
          }

          const withdrawAmount = await getChannelBalance(channelId, walletAddress);

          if (env.YELLOW_ENABLED && withdrawAmount > 0n) {
            // Clear THIS player's balance FIRST — acts as the idempotency guard.
            // If a concurrent request races in, it will see 0 and skip the payout.
            await clearPlayerChannelBalance(channelId, walletAddress);

            console.log(`[API] withdraw: paying out ${withdrawAmount.toString()} to ${walletAddress}`);
            try {
              await payoutWinner(walletAddress, withdrawAmount);
            } catch (payErr) {
              // Payout failed on-chain — restore the balance so the player can retry.
              console.error(`[API] withdraw: payoutWinner failed for ${walletAddress}, restoring balance`, payErr);
              await upsertChannelBalances([{
                channelId,
                wallet: walletAddress,
                unredeemedAmount: withdrawAmount,
                lastUpdated: Date.now(),
              }]);
              throw payErr;
            }
          } else if (!env.YELLOW_ENABLED) {
            // Yellow disabled (dev mode) — just clear the record.
            await clearPlayerChannelBalance(channelId, walletAddress);
          }

          res.json({
            ok: true,
            matchId,
            channelId,
            walletAddress,
            withdrawAmount: withdrawAmount.toString(),
            asset: YELLOW_ASSET,
            assetAddress: env.YELLOW_ASSET_ADDRESS,
            custodyAddress: env.YELLOW_CUSTODY_ADDRESS,
            assetDecimals: env.YELLOW_ASSET_DECIMALS,
            chainId: env.YELLOW_CHAIN_ID ? Number(env.YELLOW_CHAIN_ID) : null,
          });
        } catch (err) {
          console.error("[API] /api/match/withdraw error:", err);
          res.status(500).json({ error: "Failed to withdraw from match" });
        }
      },
    );

    // ── Match history (per wallet) ────────────────────────────────────────
    app.get(
      "/api/match/history",
      requireAuth as any,
      async (req: any, res) => {
        try {
          const walletAddress = await resolveWalletAddress(req);
          if (!walletAddress) {
            res.status(400).json({ error: "No wallet found for user" });
            return;
          }

          const historyRows = await getHistoryForWallet(walletAddress);
          const matchIds = Array.from(
            new Set(historyRows.map((row) => row.match_id).filter(Boolean)),
          ) as string[];
          const channels = await getMatchChannelsByIds(matchIds);
          const channelsByMatch = new Map(
            channels.map((c: any) => [c.match_id, c]),
          );

          const balances = await getChannelBalancesForWallet(walletAddress);
          const balanceByChannel = new Map(
            balances.map((b) => [b.channelId, b.unredeemedAmount]),
          );

          const walletBalance = await getWalletL1Balance(
            walletAddress,
            env.YELLOW_ASSET_ADDRESS,
          );

          const history = historyRows.map((row: any) => {
            const channel = channelsByMatch.get(row.match_id);
            const unredeemed = balanceByChannel.get(row.channel_id) ?? 0n;
            return {
              matchId: row.match_id,
              channelId: row.channel_id,
              mode: channel?.mode ?? "unknown",
              date: channel?.created_at ?? row.created_at,
              stakeAmount: channel?.stake_amount ?? "0",
              participants: channel?.participants ?? [],
              payouts: row.payouts ?? {},
              betBreakdown: row.bet_breakdown ?? {},
              stakeBreakdown: row.stake_breakdown ?? {},
              resultSummary: row.result_summary ?? {},
              unredeemed: unredeemed.toString(),
            };
          });

          res.json({
            walletAddress,
            walletBalance,
            asset: YELLOW_ASSET,
            assetAddress: env.YELLOW_ASSET_ADDRESS,
            assetDecimals: env.YELLOW_ASSET_DECIMALS,
            chainId: env.YELLOW_CHAIN_ID ? Number(env.YELLOW_CHAIN_ID) : null,
            history,
          });
        } catch (err) {
          console.error("[API] /api/match/history error:", err);
          res.status(500).json({ error: "Failed to load match history" });
        }
      },
    );

    /**
     * Use @colyseus/monitor
     * It is recommended to protect this route with a password
     * Read more: https://docs.colyseus.io/tools/monitoring/#restrict-access-to-the-panel-using-a-password
     */
    app.use("/monitor", monitor());

    /**
     * Use @colyseus/playground
     * (It is not recommended to expose this route in a production environment)
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/", playground());
    }
  },
});

export default server;
