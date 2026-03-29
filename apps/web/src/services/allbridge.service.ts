// Allbridge Core SDK Service — Bridge Stellar USDC to Polygon USDC
// Wraps @allbridge/bridge-core-sdk for browser integration

import {
    AllbridgeCoreSdk,
    ChainSymbol,
    Messenger,
    type NodeRpcUrls,
    type TokenWithChainDetails,
} from "@allbridge/bridge-core-sdk";
import { env } from "@/lib/env";

// RawSorobanTransaction is the XDR string type used for Stellar/Soroban
type RawSorobanTransaction = string;

export interface AllbridgeConfig {
    sorobanRpcUrl: string;
    horizonUrl: string;
    polygonRpcUrl: string;
}

export interface BridgeQuote {
    sendAmount: string;
    receiveAmount: string;
    bridgeFee: string;
    gasFeeNative?: { int: string; float: string };
    gasFeeStablecoin?: { int: string; float: string };
    estimatedTimeMinutes: number;
}

export interface BridgeTransactionResult {
    txHash: string;
    status: string;
}

// Singleton config — set once at app initialization
const DEFAULT_CONFIG: AllbridgeConfig = {
    sorobanRpcUrl: env.NEXT_PUBLIC_STELLAR_RPC_URL,
    horizonUrl: env.NEXT_PUBLIC_STELLAR_HORIZON_URL,
    polygonRpcUrl:
        env.NEXT_PUBLIC_POLYGON_RPC_URL || "https://polygon-rpc.com",
};

let _sdk: AllbridgeCoreSdk | null = null;
let _tokenCachePromise: Promise<{
    source: TokenWithChainDetails;
    destination: TokenWithChainDetails;
}> | null = null;

/**
 * Get or create the Allbridge SDK singleton instance.
 */
function getSdk(config?: Partial<AllbridgeConfig>): AllbridgeCoreSdk {
    if (!_sdk) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        const nodeRpcUrls: NodeRpcUrls = {
            [ChainSymbol.SRB]: cfg.sorobanRpcUrl,
            [ChainSymbol.STLR]: cfg.horizonUrl,
            [ChainSymbol.POL]: cfg.polygonRpcUrl,
        };
        _sdk = new AllbridgeCoreSdk(nodeRpcUrls);
    }
    return _sdk;
}

/**
 * Get the USDC token pair (Stellar/Soroban source → Polygon destination).
 * Caches the result for subsequent calls.
 */
async function getTokenPair(): Promise<{
    source: TokenWithChainDetails;
    destination: TokenWithChainDetails;
}> {
    if (!_tokenCachePromise) {
        _tokenCachePromise = (async () => {
            const sdk = getSdk();
            const chains = await sdk.chainDetailsMap();

            const stellarChain = chains[ChainSymbol.SRB];
            const polygonChain = chains[ChainSymbol.POL];

            if (!stellarChain) {
                throw new Error("Stellar/Soroban chain not found in Allbridge");
            }
            if (!polygonChain) {
                throw new Error("Polygon chain not found in Allbridge");
            }

            const sourceToken = stellarChain.tokens.find(
                (t) => t.symbol === "USDC"
            );
            const destToken = polygonChain.tokens.find(
                (t) => t.symbol === "USDC"
            );

            if (!sourceToken) {
                throw new Error("USDC not supported on Stellar in Allbridge");
            }
            if (!destToken) {
                throw new Error("USDC not supported on Polygon in Allbridge");
            }

            return { source: sourceToken, destination: destToken };
        })();
    }
    return _tokenCachePromise;
}

export const allbridgeService = {
    /**
     * Initialize the SDK (call early to pre-warm token cache)
     */
    async initialize(config?: Partial<AllbridgeConfig>): Promise<void> {
        getSdk(config);
        await getTokenPair();
    },

    /**
     * Get the USDC token pair for Stellar → Polygon bridge
     */
    getTokenPair,

    /**
     * Calculate how much USDC the user receives on Polygon after bridge fees.
     * @param sendAmount Amount of USDC to send from Stellar (as string, e.g. "100")
     */
    async getAmountAfterBridgeFees(sendAmount: string): Promise<string> {
        const sdk = getSdk();
        const { source, destination } = await getTokenPair();
        const received = await sdk.getAmountToBeReceived(
            sendAmount,
            source,
            destination
        );
        return received.toString();
    },

    /**
     * Calculate how much USDC the user must send from Stellar to receive a
     * specific amount on Polygon (inverse of getAmountAfterBridgeFees).
     * @param receiveAmount Desired amount on Polygon (e.g. Cashwyre's depositAmount)
     */
    async getAmountToSendForReceive(receiveAmount: string): Promise<string> {
        const sdk = getSdk();
        const { source, destination } = await getTokenPair();
        const toSend = await sdk.getAmountToSend(
            receiveAmount,
            source,
            destination
        );
        return toSend.toString();
    },

    /**
     * Get a full bridge quote including fees and estimated time.
     * Given a desired receive amount (Cashwyre's depositAmount), calculates:
     * - How much the user needs to send from Stellar
     * - Bridge fee (difference)
     * - Gas fee options
     * - Estimated transfer time
     */
    async getBridgeQuote(receiveAmount: string): Promise<BridgeQuote> {
        const sdk = getSdk();
        const { source, destination } = await getTokenPair();

        // Calculate the send amount needed for the desired receive amount
        const sendAmountRaw = await sdk.getAmountToSend(
            receiveAmount,
            source,
            destination
        );
        const sendAmount = sendAmountRaw.toString();

        // Calculate the bridge fee
        const sendNum = parseFloat(sendAmount);
        const receiveNum = parseFloat(receiveAmount);
        const bridgeFee = (sendNum - receiveNum).toFixed(6);

        // Get gas fee options
        let gasFeeNative: { int: string; float: string } | undefined;
        let gasFeeStablecoin: { int: string; float: string } | undefined;

        try {
            const gasFees = await sdk.getGasFeeOptions(
                source,
                destination,
                Messenger.ALLBRIDGE
            );
            if (gasFees.native) {
                gasFeeNative = gasFees.native;
            }
            if (gasFees.stablecoin) {
                gasFeeStablecoin = gasFees.stablecoin;
            }
        } catch {
            // Silently fail gas fee options - will fallback to defaults
        }

        // Get estimated time
        let estimatedTimeMinutes = 5; // Default fallback
        try {
            const timeMs = await sdk.getAverageTransferTime(
                source,
                destination,
                Messenger.ALLBRIDGE
            );
            if (timeMs) {
                estimatedTimeMinutes = Math.ceil(timeMs / 60000);
            }
        } catch {
            // Use default
        }

        return {
            sendAmount,
            receiveAmount,
            bridgeFee,
            gasFeeNative,
            gasFeeStablecoin,
            estimatedTimeMinutes,
        };
    },

    /**
     * Build a raw bridge transaction to send Stellar USDC to a Polygon address.
     * Returns the XDR string that needs to be signed by the user's wallet.
     *
     * @param amount Amount of USDC to send from Stellar
     * @param fromAddress User's Stellar address
     * @param toAddress Cashwyre's Polygon deposit address (EVM address)
     */
    async buildBridgeTransaction(params: {
        amount: string;
        fromAddress: string;
        toAddress: string;
    }): Promise<RawSorobanTransaction> {
        const sdk = getSdk();
        const { source, destination } = await getTokenPair();

        const sendParams = {
            amount: params.amount,
            fromAccountAddress: params.fromAddress,
            toAccountAddress: params.toAddress,
            sourceToken: source,
            destinationToken: destination,
            messenger: Messenger.ALLBRIDGE,
        };

        const rawTx = (await sdk.bridge.rawTxBuilder.send(
            sendParams
        )) as RawSorobanTransaction;

        return rawTx;
    },

    /**
     * Check if a Soroban bump (restore) transaction is needed and handle it.
     * Some Soroban contract state may need to be restored before the bridge tx.
     *
     * @param rawTx The raw bridge transaction XDR
     * @param account User's Stellar address
     * @param signFn Function to sign transactions (from StellarWalletsKit)
     * @returns true if a bump was needed and executed (rebuild the send tx)
     */
    async handleBumpIfNeeded(
        rawTx: RawSorobanTransaction,
        account: string,
        signFn: (xdr: string) => Promise<string>
    ): Promise<boolean> {
        const sdk = getSdk();

        try {
            const bumpXdr =
                await sdk.utils.srb.simulateAndCheckRestoreTxRequiredSoroban(
                    rawTx,
                    account
                );

            if (bumpXdr) {
                // Sign and submit the bump transaction
                const signedBump = await signFn(bumpXdr as unknown as string);
                const bumpResult =
                    await sdk.utils.srb.sendTransactionSoroban(signedBump);

                if (bumpResult.status !== "PENDING") {
                    throw new Error(
                        `Bump transaction failed with status: ${bumpResult.status}`
                    );
                }

                // Caller should rebuild the send transaction after bump
                return true;
            }
        } catch (e) {
            // If simulation fails for other reasons, rethrow
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("Bump transaction failed")) {
                throw e;
            }
        }

        return false;
    },

    /**
     * Submit a signed bridge transaction to the Soroban network.
     * @param signedXdr The signed XDR string
     * @returns Transaction hash
     */
    async submitTransaction(signedXdr: string): Promise<string> {
        const sdk = getSdk();
        const txResult = await sdk.utils.srb.sendTransactionSoroban(signedXdr);

        if (txResult.status !== "PENDING") {
            throw new Error(
                `Bridge transaction failed with status: ${txResult.status}`
            );
        }

        return txResult.hash;
    },

    /**
     * Get the current transfer status for a bridge transaction.
     * @param txHash The Stellar/Soroban transaction hash
     */
    async getTransferStatus(txHash: string) {
        const sdk = getSdk();
        return sdk.getTransferStatus(ChainSymbol.SRB, txHash);
    },

    /**
     * Reset the SDK and token cache (useful if config changes)
     */
    reset() {
        _sdk = null;
        _tokenCachePromise = null;
    },
};
