import { Room, Client, ServerError, CloseCode } from "colyseus";
import { RoomState } from "./schema/RoomState.js";
import { PlayerSchema } from "./schema/PlayerSchema.js";
import { GAME, ErrorCode } from "../config/constants.js";
import { env } from "../config/env.js";
import { generateRoomCode } from "../utils/spawnPoints.js";
import { authenticatePlayer } from "../services/auth.service.js";
import {
  getOrCreateProfile,
  recordMatchStats,
} from "../services/profile.service.js";

// ── Systems ──
import { MovementSystem } from "./systems/MovementSystem.js";
import { CombatSystem } from "./systems/CombatSystem.js";
import { ItemSystem } from "./systems/ItemSystem.js";
import { RespawnSystem } from "./systems/RespawnSystem.js";

// ── Managers ──
import { MatchManager } from "./managers/MatchManager.js";
import { StakeManager } from "./managers/StakeManager.js";
import { BetManager } from "./managers/BetManager.js";

// ── Types ──
import type { InputMessage } from "../types/input.js";

/* ------------------------------------------------------------------ */

const INPUT_THROTTLE_MS = 45; // slightly under 50ms (20 Hz)
const READY_DEBOUNCE_MS = 500;

export class KartfallRoom extends Room {
  // ── State & systems ──
  declare state: RoomState;

  private movementSystem!: MovementSystem;
  private combatSystem!: CombatSystem;
  private itemSystem!: ItemSystem;
  private respawnSystem!: RespawnSystem;

  private matchManager!: MatchManager;
  private stakeManager!: StakeManager;
  private betManager!: BetManager;

  private nextColorIndex = 0;

  /* ================================================================
   * LIFECYCLE HOOKS
   * ================================================================ */

  onCreate(options: any): void {
    const state = new RoomState();
    this.setState(state);

    // ── Room metadata ──
    state.roomCode = generateRoomCode();
    state.gameMode = options?.gameMode === "staked" ? "staked" : "free";

    if (options?.maxPlayers) state.maxPlayers = options.maxPlayers;
    if (options?.maxSpectators) state.maxSpectators = options.maxSpectators;

    // Expose roomCode in metadata so clients can discover via getAvailableRooms()
    this.setMetadata({ roomCode: state.roomCode, gameMode: state.gameMode });

    // ── Systems ──
    this.movementSystem = new MovementSystem();

    this.combatSystem = new CombatSystem(
      this as unknown as Room,
      state,
      (killerId, victimId, weapon) => {
        // onKill callback — resolve live bet markets
        this.betManager.resolveKillEvent(killerId, victimId);

        // Record kill event to Yellow state channel
        const killer = state.players.get(killerId);
        const victim = state.players.get(victimId);
        this.stakeManager.recordGameEvent({
          event: "kill",
          killerId,
          killerName: killer?.name ?? "",
          killerWallet: killer?.walletAddress ?? "",
          victimId,
          victimName: victim?.name ?? "",
          victimWallet: victim?.walletAddress ?? "",
          weapon,
          timestamp: Date.now(),
        });
      },
    );

    this.itemSystem = new ItemSystem(this as unknown as Room, state);

    this.respawnSystem = new RespawnSystem(this as unknown as Room, state);

    // ── Managers ──
    this.matchManager = new MatchManager(
      this as unknown as Room,
      state,
      () => this.handleMatchStart(),
      () => this.handleMatchEnd(),
    );

    const stakeAmountUsdc = options?.stakeAmount
      ? Number(options.stakeAmount)
      : 0;
    this.stakeManager = new StakeManager(state, stakeAmountUsdc);

    this.betManager = new BetManager(this as unknown as Room, state);

    // ── Init crates ──
    this.itemSystem.initCrates();

    // ── Simulation interval (20 Hz) ──
    this.setSimulationInterval(
      (deltaTime) => this.update(deltaTime),
      1000 / GAME.TICK_RATE,
    );

    // ── Register message handlers ──
    this.registerMessages();

    console.log(
      `[KartfallRoom] Created room ${state.roomCode} (${this.roomId})`,
    );
  }

  /* ------------------------------------------------------------------ */

  async onAuth(client: Client, options: any): Promise<boolean> {
    const accessToken = (options.accessToken ?? options.token) as
      | string
      | undefined;
    const authEnabled = !!env.PRIVY_VERIFICATION_KEY;

    if (authEnabled && accessToken) {
      // Verify the Privy JWT and attach wallet/userId
      try {
        const { userId, walletAddress } = await authenticatePlayer(accessToken);
        options._walletAddress = walletAddress;
        options._privyUserId = userId;
      } catch (err) {
        console.error(
          `[KartfallRoom] Auth failed:`,
          err instanceof Error ? err.message : err,
        );
        // Don't block join — just admit as guest without a verified wallet
        options._walletAddress = "";
        options._privyUserId = "";
      }
    } else {
      // No token or dev mode — admit as guest
      if (authEnabled) {
        console.log(`[KartfallRoom] No token provided — admitting as guest`);
      }
      options._walletAddress = options.walletAddress ?? "";
      options._privyUserId = "";

      if (!authEnabled && accessToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(accessToken.split(".")[1], "base64url").toString(),
          );
          options._privyUserId = payload.sub ?? payload.user_id ?? "";
        } catch {
          options._privyUserId = "";
        }
      }
    }

    // ── Capacity checks ──
    if (options.is_spectator) {
      const currentSpectators = this.countSpectators();
      if (currentSpectators >= this.state.maxSpectators) {
        throw new ServerError(
          ErrorCode.SPECTATORS_FULL,
          "Max spectators reached",
        );
      }
    } else {
      if (this.state.playerCount >= this.state.maxPlayers) {
        throw new ServerError(ErrorCode.ROOM_FULL, "Max players reached");
      }
      // Don't allow new players after lobby
      if (this.state.phase !== "lobby") {
        throw new ServerError(ErrorCode.ROOM_FULL, "Game already in progress");
      }
    }

    return true;
  }

  /* ------------------------------------------------------------------ */

  async onJoin(client: Client, options: any): Promise<void> {
    const player = new PlayerSchema();
    player.name = options.name ?? `Player${this.nextColorIndex + 1}`;
    player.walletAddress = options._walletAddress ?? "";
    player.privyUserId = options._privyUserId ?? "";
    player.isSpectator = !!options.is_spectator;

    // Load or create persistent profile
    if (player.privyUserId) {
      try {
        const profile = await getOrCreateProfile(
          player.privyUserId,
          player.walletAddress,
          player.name,
        );
        // Use saved display name if available
        if (profile.displayName) player.name = profile.displayName;
      } catch (err) {
        console.error("[KartfallRoom] getOrCreateProfile failed:", err);
      }
    }

    if (!player.isSpectator) {
      // Assign color index (0-3) in join order
      player.colorIndex = this.nextColorIndex;
      this.nextColorIndex = (this.nextColorIndex + 1) % 4;

      // Set host if first player
      if (!this.state.hostPlayerId) {
        this.state.hostPlayerId = client.sessionId;
      }

      this.state.playerCount += 1;
    }

    this.state.players.set(client.sessionId, player);

    console.log(
      `[KartfallRoom] ${player.isSpectator ? "Spectator" : "Player"} ${client.sessionId} joined (${player.name})`,
    );
  }

  /* ------------------------------------------------------------------ */

  async onLeave(client: Client, code?: number): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const phase = this.state.phase;
    const consented = code === CloseCode.CONSENTED;

    // ── Allow reconnection for unexpected disconnects ──
    if (!consented) {
      try {
        await this.allowReconnection(client, 30);
        // Client reconnected — state is intact
        console.log(`[KartfallRoom] ${client.sessionId} reconnected`);
        return;
      } catch {
        // Reconnection timed out — remove player
        console.log(
          `[KartfallRoom] ${client.sessionId} reconnection timed out`,
        );
      }
    }

    // ── Clean removal ──
    if (!player.isSpectator) {
      // Refund stake in lobby or countdown (only in staked mode)
      if (
        (phase === "lobby" || phase === "countdown") &&
        this.state.gameMode === "staked"
      ) {
        if (player.walletAddress) {
          try {
            await this.stakeManager.refundStake(player.walletAddress);
            // Client already left; don't try to send them a message
          } catch (err) {
            console.error(
              `[KartfallRoom] Stake refund failed for ${client.sessionId}:`,
              err,
            );
          }
        }
      }

      this.state.playerCount = Math.max(0, this.state.playerCount - 1);

      // If we're in countdown and a player leaves, cancel
      if (phase === "countdown") {
        this.matchManager.cancelCountdown();
      }

      // Reassign host if the host left
      if (this.state.hostPlayerId === client.sessionId) {
        this.reassignHost(client.sessionId);
      }
    }

    // Clean up input state
    this.movementSystem.setInput(client.sessionId, {
      forward: false,
      backward: false,
      left: false,
      right: false,
    });

    this.state.players.delete(client.sessionId);

    // Check if match should end due to too few players
    if (phase === "playing") {
      const activePlayers = this.countActivePlayers();
      if (activePlayers <= 1) {
        this.matchManager.tick(0); // trigger end check
      }
    }

    console.log(
      `[KartfallRoom] ${client.sessionId} left (consented: ${consented})`,
    );
  }

  /* ------------------------------------------------------------------ */

  onDispose(): void {
    console.log(
      `[KartfallRoom] Room ${this.state.roomCode} (${this.roomId}) disposing`,
    );
  }

  /* ================================================================
   * GAME LOOP
   * ================================================================ */

  update(deltaTime: number): void {
    if (this.state.phase !== "playing") {
      // Only tick match manager outside playing phase (for countdown timer)
      if (this.state.phase === "countdown") {
        this.matchManager.tick(deltaTime);
      }
      return;
    }

    // Fixed order: movement → combat → items → respawn → match timer
    this.movementSystem.tick(this.state.players, deltaTime);
    this.combatSystem.tick(deltaTime);
    this.itemSystem.tick(deltaTime);
    this.respawnSystem.tick(deltaTime);
    this.matchManager.tick(deltaTime);
  }

  /* ================================================================
   * MESSAGE HANDLERS
   * ================================================================ */

  private registerMessages(): void {
    // ── Input (movement) ──
    this.onMessage("input", (client: Client, message: InputMessage) => {
      if (this.state.phase !== "playing") return;

      const player = this.state.players.get(client.sessionId);
      if (!player || player.isSpectator || !player.isAlive) return;

      // Rate-limit input
      const now = Date.now();
      if (now - player.lastInputTime < INPUT_THROTTLE_MS) return;
      player.lastInputTime = now;

      this.movementSystem.setInput(client.sessionId, {
        forward: !!message.forward,
        backward: !!message.backward,
        left: !!message.left,
        right: !!message.right,
      });
    });

    // ── Attack ──
    this.onMessage("attack", (client: Client, message: { angle: number }) => {
      if (this.state.phase !== "playing") return;

      const player = this.state.players.get(client.sessionId);
      if (!player || player.isSpectator || !player.isAlive) return;
      if (player.weaponType === "none") return;

      this.combatSystem.handleAttack(client.sessionId, message.angle);
    });

    // ── Stop attack (bullet stream) ──
    this.onMessage("stop_attack", (client: Client) => {
      if (this.state.phase !== "playing") return;

      const player = this.state.players.get(client.sessionId);
      if (!player || player.isSpectator) return;

      this.combatSystem.handleStopAttack(client.sessionId);
    });

    // ── Pickup crate ──
    this.onMessage(
      "pickup_crate",
      (client: Client, message: { crateId: string }) => {
        if (this.state.phase !== "playing") return;

        const player = this.state.players.get(client.sessionId);
        if (!player || player.isSpectator || !player.isAlive) return;

        this.itemSystem.handlePickup(client.sessionId, message.crateId);
      },
    );

    // ── Ready ──
    this.onMessage("ready", (client: Client) => {
      if (this.state.phase !== "lobby" && this.state.phase !== "countdown")
        return;

      const player = this.state.players.get(client.sessionId);
      if (!player || player.isSpectator) return;

      // Debounce
      const now = Date.now();
      if (now - player.lastReadyToggle < READY_DEBOUNCE_MS) return;
      player.lastReadyToggle = now;

      player.isReady = true;
      this.matchManager.checkReadyState();
    });

    // ── Unready ──
    this.onMessage("unready", (client: Client) => {
      if (this.state.phase !== "lobby" && this.state.phase !== "countdown")
        return;

      const player = this.state.players.get(client.sessionId);
      if (!player || player.isSpectator) return;

      // Debounce
      const now = Date.now();
      if (now - player.lastReadyToggle < READY_DEBOUNCE_MS) return;
      player.lastReadyToggle = now;

      player.isReady = false;

      if (this.state.phase === "countdown") {
        this.matchManager.cancelCountdown();
      }
    });

    // ── Place bet (spectators) ──
    this.onMessage(
      "place_bet",
      async (
        client: Client,
        message: {
          marketType: string;
          targetPlayerId: string;
          amount: number;
        },
      ) => {
        if (this.state.phase !== "playing") return;

        const player = this.state.players.get(client.sessionId);
        if (!player || !player.isSpectator) return;

        const amountWei = BigInt(message.amount);
        const result = await this.betManager.placeBet(
          client.sessionId,
          player.walletAddress,
          message.marketType,
          message.targetPlayerId,
          amountWei,
        );

        if (!result.success) {
          client.send("error", {
            code: ErrorCode.BET_INVALID,
            message: result.error ?? "Invalid bet",
          });
        }
      },
    );

    // ── Chat ──
    this.onMessage("chat", (client: Client, message: { text: string }) => {
      if (!message.text || typeof message.text !== "string") return;
      const text = message.text.slice(0, 200); // limit length

      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      this.broadcast("chat", {
        senderId: client.sessionId,
        senderName: player.name,
        text,
      });
    });
  }

  /* ================================================================
   * MATCH CALLBACKS
   * ================================================================ */

  private async handleMatchStart(): Promise<void> {
    // Create Yellow state channel for this match (ALL modes — free + staked)
    try {
      await this.stakeManager.createChannel(this.roomId);
    } catch (err) {
      console.error(`[KartfallRoom] Channel creation failed:`, err);
      // Don't block the match
    }

    // Deposit stakes for staked games
    if (this.state.gameMode === "staked") {
      const players = this.getPlayersWithWallets();
      for (const [sessionId, player] of players) {
        try {
          await this.stakeManager.collectStake(player.walletAddress);
          const client = this.clients.find((c) => c.sessionId === sessionId);
          if (client) {
            client.send("stake_confirmed", {
              amount: this.state.stakeAmountMicro,
            });
          }
        } catch (err) {
          console.error(
            `[KartfallRoom] Stake deposit failed for ${sessionId}:`,
            err,
          );
        }
      }
    }

    // Start the kill prediction market for spectators
    this.betManager.startNextKillMarket();
    console.log(
      `[KartfallRoom] Match started in room ${this.state.roomCode} (channel: ${this.state.channelId || "none"})`,
    );
  }

  private async handleMatchEnd(): Promise<void> {
    console.log(`[KartfallRoom] Match ended in room ${this.state.roomCode}`);

    // Find winner (highest score) and most deaths player
    let winnerId = "";
    let mostDeathsId = "";
    let maxScore = -Infinity;
    let maxDeaths = -1;

    this.state.players.forEach((player, sessionId) => {
      if (player.isSpectator) return;
      if (player.score > maxScore) {
        maxScore = player.score;
        winnerId = sessionId;
      }
      if (player.deaths > maxDeaths) {
        maxDeaths = player.deaths;
        mostDeathsId = sessionId;
      }
    });

    const statsPromises: Promise<any>[] = [];
    this.state.players.forEach((player, sessionId) => {
      if (player.isSpectator || !player.privyUserId) return;
      const won = sessionId === winnerId;
      statsPromises.push(
        recordMatchStats(player.privyUserId, {
          kills: player.kills,
          deaths: player.deaths,
          won,
        }, this.state.roomCode).catch((err) =>
          console.error(
            `[KartfallRoom] Failed to persist match stats for ${sessionId}:`,
            err,
          ),
        ),
      );
    });
    await Promise.all(statsPromises);

    // Distribute stake payouts
    try {
      await this.stakeManager.distributePayouts();
    } catch (err) {
      console.error(`[KartfallRoom] Payout distribution failed:`, err);
    }

    // Resolve static bet markets
    try {
      await this.betManager.resolveMatchEnd(winnerId, mostDeathsId);
    } catch (err) {
      console.error(`[KartfallRoom] Bet resolution failed:`, err);
    }
  }

  /* ================================================================
   * HELPERS
   * ================================================================ */

  private countSpectators(): number {
    let count = 0;
    this.state.players.forEach((player) => {
      if (player.isSpectator) count++;
    });
    return count;
  }

  private countActivePlayers(): number {
    let count = 0;
    this.state.players.forEach((player) => {
      if (!player.isSpectator) count++;
    });
    return count;
  }

  private reassignHost(leavingSessionId: string): void {
    this.state.hostPlayerId = "";
    this.state.players.forEach((player, sessionId) => {
      if (
        sessionId !== leavingSessionId &&
        !player.isSpectator &&
        !this.state.hostPlayerId
      ) {
        this.state.hostPlayerId = sessionId;
      }
    });
  }

  private getPlayersWithWallets(): Array<[string, any]> {
    const result: Array<[string, any]> = [];
    this.state.players.forEach((player, sessionId) => {
      if (!player.isSpectator && player.walletAddress) {
        result.push([sessionId, player]);
      }
    });
    return result;
  }
}
