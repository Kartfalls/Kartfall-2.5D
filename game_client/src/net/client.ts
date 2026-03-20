import { Client } from "@colyseus/sdk";

/**
 * Create a Colyseus client for a specific server URL.
 * Each network mode gets its own client instance.
 */
export function createColyseusClient(serverUrl: string): Client {
  return new Client(serverUrl);
}

/**
 * Legacy fallback singleton for reconnection flow.
 * Uses VITE_SERVER_URL_TESTNET → VITE_SERVER_URL → localhost.
 */
const DEFAULT_SERVER_URL =
  import.meta.env.VITE_SERVER_URL_TESTNET ||
  import.meta.env.VITE_SERVER_URL ||
  "ws://localhost:2567";

export const colyseusClient = new Client(DEFAULT_SERVER_URL);
