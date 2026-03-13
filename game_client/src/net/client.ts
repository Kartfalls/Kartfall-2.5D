/**
 * Colyseus Client singleton.
 * Uses VITE_SERVER_URL env var, falls back to localhost.
 */
import { Client } from "@colyseus/sdk";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";

export const colyseusClient = new Client(SERVER_URL);
