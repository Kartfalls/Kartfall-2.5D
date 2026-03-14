import { ethers } from "ethers";
import { custodyAbi } from "@erc7824/nitrolite/dist/abis/generated";

type WalletLike = {
  getEthereumProvider: () => Promise<unknown>;
  address?: string;
};

async function getWeb3Provider(wallet: WalletLike) {
  const provider = await wallet.getEthereumProvider();
  return new ethers.BrowserProvider(provider as any);
}

async function ensureChain(provider: ethers.BrowserProvider, chainId: number) {
  const chainIdHex = `0x${chainId.toString(16)}`;
  await provider.send("wallet_switchEthereumChain", [{ chainId: chainIdHex }]);
}

export async function withdrawFromCustody(
  wallet: WalletLike,
  params: {
    custodyAddress: string;
    assetAddress: string;
    chainId: number;
    amountWei: string | bigint;
  },
) {
  const web3Provider = await getWeb3Provider(wallet);
  await ensureChain(web3Provider, params.chainId);
  const signer = await web3Provider.getSigner();
  const custody = new ethers.Contract(
    params.custodyAddress,
    custodyAbi,
    signer,
  );
  const amount = typeof params.amountWei === "bigint"
    ? params.amountWei
    : BigInt(params.amountWei);
  const withdrawTx = await custody.withdraw(params.assetAddress, amount);
  await withdrawTx.wait();
  return withdrawTx.hash as string;
}
