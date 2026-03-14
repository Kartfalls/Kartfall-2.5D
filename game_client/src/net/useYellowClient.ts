import { useState, useEffect, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { Client, StateSigner, TransactionSigner } from "@yellow-org/sdk";
import { EthereumMsgSigner } from "@yellow-org/sdk/dist/signers";
import { ethers } from "ethers";

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

export function useYellowClient() {
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

            // Request network switch just in case (Ethereum Sepolia)
            const chainIdHex = `0x${DEFAULT_CHAIN_ID.toString(16)}`;
            try {
                await withTimeout(
                    web3Provider.send("wallet_switchEthereumChain", [{ chainId: chainIdHex }]),
                    "Chain switch",
                    12000
                );
            } catch (switchError: any) {
                // If the chain is not added to wallet
                if (switchError.code === 4902) {
                    await withTimeout(
                        web3Provider.send("wallet_addEthereumChain", [
                            {
                                chainId: chainIdHex,
                                chainName: "Ethereum Sepolia",
                                rpcUrls: ["https://rpc.sepolia.org"],
                                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                                blockExplorerUrls: ["https://sepolia.etherscan.io"],
                            },
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
            const clearNodeUrl = import.meta.env.VITE_YELLOW_URL || DEFAULT_URL;

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
    defaultAsset: import.meta.env.VITE_YELLOW_ASSET || DEFAULT_ASSET,
        defaultChainId: BigInt(import.meta.env.VITE_YELLOW_CHAIN_ID || DEFAULT_CHAIN_ID)
    };
}
