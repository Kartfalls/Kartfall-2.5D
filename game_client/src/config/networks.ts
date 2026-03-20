/**
 * Dual network configuration — testnet and mainnet, both always available.
 */

export type NetworkMode = "testnet" | "mainnet";

export interface NetworkConfig {
  mode: NetworkMode;
  label: string;
  serverUrl: string;
  httpUrl: string;
  yellowUrl: string;
  yellowAsset: string;
  chainId: number;
  isMainnet: boolean;
}

export function getNetworkConfig(mode: NetworkMode): NetworkConfig {
  if (mode === "mainnet") {
    const serverUrl =
      import.meta.env.VITE_SERVER_URL_MAINNET || "ws://localhost:2568";
    return {
      mode: "mainnet",
      label: "Mainnet",
      serverUrl,
      httpUrl: serverUrl.replace(/^ws(s?):/, "http$1:"),
      yellowUrl:
        import.meta.env.VITE_YELLOW_URL_MAINNET ||
        "wss://clearnet.yellow.com/ws",
      yellowAsset: import.meta.env.VITE_YELLOW_ASSET_MAINNET || "usdc",
      chainId: Number(import.meta.env.VITE_YELLOW_CHAIN_ID_MAINNET || 1),
      isMainnet: true,
    };
  }

  const serverUrl =
    import.meta.env.VITE_SERVER_URL_TESTNET || "ws://localhost:2567";
  return {
    mode: "testnet",
    label: "Testnet",
    serverUrl,
    httpUrl: serverUrl.replace(/^ws(s?):/, "http$1:"),
    yellowUrl:
      import.meta.env.VITE_YELLOW_URL_TESTNET ||
      "wss://clearnet-sandbox.yellow.com/ws",
    yellowAsset: import.meta.env.VITE_YELLOW_ASSET_TESTNET || "ytest.usd",
    chainId: Number(import.meta.env.VITE_YELLOW_CHAIN_ID_TESTNET || 11155111),
    isMainnet: false,
  };
}
