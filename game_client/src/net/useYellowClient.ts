import { useState, useEffect, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { Client, StateSigner, TransactionSigner } from "@yellow-org/sdk";
import { EthereumMsgSigner } from "@yellow-org/sdk/dist/signers";
import { ethers } from "ethers";
import type { NetworkConfig } from "../config/networks";

// A custom TransactionSigner wrapper because Yellow expects viem-like objects
class EthersTransactionSigner implements TransactionSigner {
    constructor(private signer: ethers.JsonRpcSigner) { }

    getAddress() {
        return this.signer.address as `0x${string}`;
    }

    async sendTransaction(tx: any) {
        const response = await this.signer.sendTransaction(tx);
        return response.hash as `0x${string}`;
    }

    async signMessage(message: { raw: `0x${string}` }) {
        const signature = await this.signer.signMessage(ethers.getBytes(message.raw));
        return signature as `0x${string}`;
    }
}

// Fallbacks if env vars are missing
const DEFAULT_URL = "wss://clearnet-sandbox.yellow.com/ws";
const DEFAULT_CHAIN_ID = 11155111; // Ethereum Sepolia
const DEFAULT_ASSET = "ytest.usd"; // Sandbox asset symbol

/** Known chain metadata keyed by chain ID, used for wallet_addEthereumChain. */
const CHAIN_META: Record<number, { chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] }> = {
  1:     { chainName: "Ethereum",         rpcUrls: ["https://eth.llamarpc.com"],           nativeCurrency: { name: "Ether",   symbol: "ETH",   decimals: 18 }, blockExplorerUrls: ["https://etherscan.io"] },
  11155111: { chainName: "Ethereum Sepolia", rpcUrls: ["https://rpc.sepolia.org"],             nativeCurrency: { name: "Ether",   symbol: "ETH",   decimals: 18 }, blockExplorerUrls: ["https://sepolia.etherscan.io"] },
  137:   { chainName: "Polygon",           rpcUrls: ["https://polygon-rpc.com"],            nativeCurrency: { name: "POL",     symbol: "POL",   decimals: 18 }, blockExplorerUrls: ["https://polygonscan.com"] },
  42161: { chainName: "Arbitrum One",     rpcUrls: ["https://arb1.arbitrum.io/rpc"],        nativeCurrency: { name: "Ether",   symbol: "ETH",   decimals: 18 }, blockExplorerUrls: ["https://arbiscan.io"] },
  10:    { chainName: "Optimism",          rpcUrls: ["https://mainnet.optimism.io"],         nativeCurrency: { name: "Ether",   symbol: "ETH",   decimals: 18 }, blockExplorerUrls: ["https://optimistic.etherscan.io"] },
  8453:  { chainName: "Base",             rpcUrls: ["https://mainnet.base.org"],            nativeCurrency: { name: "Ether",   symbol: "ETH",   decimals: 18 }, blockExplorerUrls: ["https://basescan.org"] },
};

export function useYellowClient(networkConfig: NetworkConfig | null = null) {
    const { wallets } = useWallets();
    const [yellowClient, setYellowClient] = useState<Client | null>(null);
    const [isInitializing, setIsInitializing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const initClient = useCallback(async () => {
        // Need at least one connected Privy wallet
        if (!wallets || wallets.length === 0) {
            setError("No wallet connected");
            return;
        }

        setIsInitializing(true);
        setError(null);

        try {
            const withTimeout = async <T,>(promise: Promise<T>, label: string, timeoutMs = 8000) => {
                return await Promise.race([
                    promise,
                    new Promise<T>((_, reject) =>
                        setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
                    ),
                ]);
            };
            // 1. Get the EIP-1193 provider from the active Privy wallet
            const activeWallet = wallets[0];
            const provider = await withTimeout(
                activeWallet.getEthereumProvider(),
                "Wallet provider",
                8000
            );

            // 2. Wrap it with ethers.js Web3Provider
            const web3Provider = new ethers.BrowserProvider(provider as any);

            // Switch to the configured chain (network-specific or env fallback)
            const targetChainId = networkConfig?.chainId ?? Number(import.meta.env.VITE_YELLOW_CHAIN_ID || DEFAULT_CHAIN_ID);
            const chainIdHex = `0x${targetChainId.toString(16)}`;
            try {
                await withTimeout(
                    web3Provider.send("wallet_switchEthereumChain", [{ chainId: chainIdHex }]),
                    "Chain switch",
                    12000
                );
            } catch (switchError: any) {
                // Chain not in wallet yet — add it using our metadata map
                if (switchError.code === 4902) {
                    const meta = CHAIN_META[targetChainId] ?? CHAIN_META[DEFAULT_CHAIN_ID];
                    await withTimeout(
                        web3Provider.send("wallet_addEthereumChain", [
                            { chainId: chainIdHex, ...meta },
                        ]),
                        "Add chain",
                        12000
                    );
                } else {
                    throw switchError;
                }
            }

            const signer = await withTimeout(
                web3Provider.getSigner(),
                "Wallet signer",
                8000
            );

            // 3. Create Yellow SDK Signers
            // @ts-ignore - duck typing EthereumMsgSigner for viem compatibility
            const stateSigner: StateSigner = new EthereumMsgSigner(signer);
            const txSigner: TransactionSigner = new EthersTransactionSigner(signer);

            // 4. Instantiate Yellow Client
            const clearNodeUrl = networkConfig?.yellowUrl ?? import.meta.env.VITE_YELLOW_URL ?? DEFAULT_URL;

            const client = await withTimeout(
                Client.create(clearNodeUrl, stateSigner, txSigner),
                "Clearnode connect"
            );

            // Verify connection via ping (with timeout)
            await withTimeout(client.ping(), "Clearnode ping");

            setYellowClient(client);

        } catch (err: any) {
            console.error("Failed to initialize Yellow Client:", err);
            setError(err.message || "Failed to init Yellow Client");
            setYellowClient(null);
        } finally {
            setIsInitializing(false);
        }
    }, [wallets]);

    // Clean-up on unmount
    useEffect(() => {
        return () => {
            if (yellowClient) {
                yellowClient.close().catch(console.error);
            }
        };
    }, [yellowClient]);

    return {
        yellowClient,
        initClient,
        isInitializing,
        error,
    defaultAsset: networkConfig?.yellowAsset ?? import.meta.env.VITE_YELLOW_ASSET ?? DEFAULT_ASSET,
        defaultChainId: BigInt(networkConfig?.chainId ?? import.meta.env.VITE_YELLOW_CHAIN_ID ?? DEFAULT_CHAIN_ID)
    };
}
