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
  DEFAULT_ASSET as YELLOW_ASSET,
} from "./services/yellow.service.js";
import { getUser, getWalletAddress } from "./services/auth.service.js";
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
    app.put(
      "/api/profile/name",
      requireAuth as any,
      async (req: any, res) => {
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
      },
    );

    // ── Yellow status: clearnode + player balance (auth required) ───────────
    app.get("/api/yellow/status", requireAuth as any, async (req: any, res) => {
      try {
        const { userId } = req.auth;

        let walletAddress = "";
        try {
          const user = await getUser(userId);
          walletAddress = getWalletAddress(user) ?? "";
        } catch {
          walletAddress = "";
        }

        const [nodeOk, playerBalance, platformBalance, walletL1] =
          await Promise.all([
            pingYellowNode().catch(() => false),
            walletAddress
              ? getYellowBalance(walletAddress).catch(() => "0")
              : Promise.resolve("0"),
            getPlatformChannelBalance().catch(() => "0"),
            walletAddress
              ? getWalletL1Balance(walletAddress).catch(() => "0")
              : Promise.resolve("0"),
          ]);

        const platformConfigured =
          !!env.YELLOW_PRIVATE_KEY &&
          !!env.YELLOW_ASSET_ADDRESS &&
          !!env.YELLOW_CUSTODY_ADDRESS &&
          !!env.YELLOW_ADJUDICATOR_ADDRESS &&
          !!env.YELLOW_RPC_URL;

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
          asset: YELLOW_ASSET,
          assetAddress: env.YELLOW_ASSET_ADDRESS,
          custodyAddress: env.YELLOW_CUSTODY_ADDRESS,
          adjudicatorAddress: env.YELLOW_ADJUDICATOR_ADDRESS,
          chainId: env.YELLOW_CHAIN_ID ? Number(env.YELLOW_CHAIN_ID) : null,
          walletAddress,
          platformWallet: getPlatformAddress(),
        });
      } catch (err) {
        console.error("[API] /api/yellow/status error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

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
