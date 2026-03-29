import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import {
    PAYMENT_STREAM_CONTRACT_ID,
    DISTRIBUTOR_CONTRACT_ID,
    STELLAR_RPC_URL,
    STELLAR_HORIZON_URL,
    NETWORK_PASSPHRASE,
} from '@/lib/constants';
import { throwIfAborted } from '@/utils/retry';
import { StellarService, type Stream as ServiceStream, type AccountInfo } from '@/services';
import { PaymentStreamClient } from '../../../../packages/sdk/src/PaymentStreamClient';
import { DistributorClient } from '../../../../packages/sdk/src/DistributorClient';
import { Stream, StreamStatus } from '../types';

type WalletSigner = (xdr: string) => Promise<string>;

const stellarService = new StellarService({
    network: {
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: STELLAR_RPC_URL,
        horizonUrl: STELLAR_HORIZON_URL,
    },
    contracts: {
        paymentStream: PAYMENT_STREAM_CONTRACT_ID,
        distributor: DISTRIBUTOR_CONTRACT_ID,
    },
});

function toStreamStatus(status: string): StreamStatus {
    if (status === 'Paused') return StreamStatus.Paused;
    if (status === 'Canceled') return StreamStatus.Canceled;
    if (status === 'Completed') return StreamStatus.Completed;
    return StreamStatus.Active;
}

function mapServiceStream(stream: ServiceStream): Stream {
    return {
        id: Number(stream.id),
        sender: stream.sender,
        recipient: stream.recipient,
        token: stream.token,
        total_amount: stream.totalAmount,
        withdrawn_amount: stream.withdrawnAmount,
        start_time: Number(stream.startTime),
        end_time: Number(stream.endTime),
        status: toStreamStatus(stream.status),
    };
}

function ensureSafeNumber(value: bigint): number {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Returned stream id exceeds JavaScript safe integer range');
    }
    return Number(value);
}

async function signAndSendTx(
    tx: AssembledTransaction<unknown>,
    signTransaction?: WalletSigner
): Promise<void> {
    if (!signTransaction) {
        throw new Error('Wallet signer is required for contract write operations');
    }

    await tx.signAndSend({
        signTransaction: async (xdr: string) => ({
            signedTxXdr: await signTransaction(xdr),
        }),
    });
}

function createPaymentStreamClient(publicKey: string): PaymentStreamClient {
    return new PaymentStreamClient({
        contractId: PAYMENT_STREAM_CONTRACT_ID,
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: STELLAR_RPC_URL,
        publicKey,
    });
}

function createDistributorClient(publicKey: string): DistributorClient {
    return new DistributorClient({
        contractId: DISTRIBUTOR_CONTRACT_ID,
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: STELLAR_RPC_URL,
        publicKey,
    });
}

export async function fetchStream(streamId: number, signal?: AbortSignal): Promise<Stream | null> {
    throwIfAborted(signal);
    const stream = await stellarService.getStream(BigInt(streamId));
    throwIfAborted(signal);
    return stream ? mapServiceStream(stream) : null;
}

export async function fetchUserStreams(address: string, signal?: AbortSignal): Promise<Stream[]> {
    throwIfAborted(signal);
    const streams = await stellarService.getStreams(address);
    throwIfAborted(signal);
    return streams.map(mapServiceStream);
}

export async function createStream(params: {
    sender: string;
    recipient: string;
    token: string;
    amount: bigint;
    startTime: number;
    endTime: number;
    signTransaction?: WalletSigner;
}): Promise<number> {
    const client = createPaymentStreamClient(params.sender);
    const tx = await client.createStream({
        sender: params.sender,
        recipient: params.recipient,
        token: params.token,
        total_amount: params.amount,
        initial_amount: 0n,
        start_time: BigInt(params.startTime),
        end_time: BigInt(params.endTime),
    });

    await signAndSendTx(tx as AssembledTransaction<unknown>, params.signTransaction);

    const streamId = tx.result;
    if (typeof streamId !== 'bigint') {
        throw new Error('Contract did not return a stream id');
    }
    return ensureSafeNumber(streamId);
}

export async function withdraw(params: {
    streamId: number;
    amount: bigint;
    sender?: string;
    signTransaction?: WalletSigner;
}): Promise<void> {
    let sender = params.sender;
    if (!sender) {
        const stream = await stellarService.getStream(BigInt(params.streamId));
        sender = stream?.recipient;
    }

    if (!sender) {
        throw new Error('Unable to resolve sender address for withdrawal');
    }

    const client = createPaymentStreamClient(sender);
    const tx = await client.withdraw(BigInt(params.streamId), params.amount);
    await signAndSendTx(tx as AssembledTransaction<unknown>, params.signTransaction);
}

export async function distribute(params: {
    sender: string;
    token: string;
    recipients: string[];
    amounts: bigint[] | bigint;
    signTransaction?: WalletSigner;
}): Promise<void> {
    const client = createDistributorClient(params.sender);

    if (typeof params.amounts === 'bigint') {
        const tx = await client.distributeEqual({
            sender: params.sender,
            token: params.token,
            total_amount: params.amounts,
            recipients: params.recipients,
        });
        await signAndSendTx(tx as AssembledTransaction<unknown>, params.signTransaction);
        return;
    }

    if (params.amounts.length !== params.recipients.length) {
        throw new Error('Recipients and amounts length mismatch');
    }

    const tx = await client.distributeWeighted({
        sender: params.sender,
        token: params.token,
        recipients: params.recipients,
        amounts: params.amounts,
    });
    await signAndSendTx(tx as AssembledTransaction<unknown>, params.signTransaction);
}

export async function fetchAccountInfo(address: string, signal?: AbortSignal): Promise<AccountInfo | null> {
    throwIfAborted(signal);
    try {
        return await stellarService.getAccount(address, signal);
    } catch {
        return null;
    }
}
export async function pauseStream(params: { id: string; signTransaction: (xdr: string) => Promise<string> }) {
    const client = new PaymentStreamClient({
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: STELLAR_RPC_URL,
        contractId: PAYMENT_STREAM_CONTRACT_ID,
    });

    const tx = await client.pauseStream(BigInt(params.id));

    await signAndSendTx(tx as AssembledTransaction<unknown>, params.signTransaction);
}

export async function resumeStream(params: { id: string; signTransaction: (xdr: string) => Promise<string> }) {
    const client = new PaymentStreamClient({
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: STELLAR_RPC_URL,
        contractId: PAYMENT_STREAM_CONTRACT_ID,
    });

    const tx = await client.resumeStream(BigInt(params.id));

    await signAndSendTx(tx as AssembledTransaction<unknown>, params.signTransaction);
}

export async function cancelStream(params: { id: string; signTransaction: (xdr: string) => Promise<string> }) {
    const client = new PaymentStreamClient({
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: STELLAR_RPC_URL,
        contractId: PAYMENT_STREAM_CONTRACT_ID,
    });

    const tx = await client.cancelStream(BigInt(params.id));

    await signAndSendTx(tx as AssembledTransaction<unknown>, params.signTransaction);
}
