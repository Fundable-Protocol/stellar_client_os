import { Stream, StreamStatus } from '../types';
import { throwIfAborted } from '@/utils/retry';

export async function fetchStream(streamId: number, signal?: AbortSignal): Promise<Stream | null> {
    throwIfAborted(signal);

    // Construct the simulation transaction to call get_stream(streamId)
    // This is pseudo-code for the exact XDR building using stellar-sdk
    // In a real app we'd use 'soroban-client' or generated bindings.

    // Mock implementation for the assignment
    console.log(`Fetching stream ${streamId}`);

    // FIXME: Replace with actual RPC call
    // const contract = new Contract(PAYMENT_STREAM_CONTRACT_ID);
    // const tx = ...
    // const res = await server.simulateTransaction(tx);

    // Returning mock data for demonstration
    const stream = {
        id: streamId,
        sender: 'G...',
        recipient: 'G...',
        token: 'C...',
        total_amount: BigInt(1000),
        withdrawn_amount: BigInt(0),
        start_time: Date.now(),
        end_time: Date.now() + 100000,
        status: StreamStatus.Active,
    };

    throwIfAborted(signal);
    return stream;
}

export async function fetchUserStreams(address: string, signal?: AbortSignal): Promise<Stream[]> {
    throwIfAborted(signal);

    // In a real implementation without an indexer, we would iterate known stream IDs
    // or query a backend.

    const streams: Stream[] = [];
    // Mock fetching 5 streams
    for (let i = 1; i <= 5; i++) {
        throwIfAborted(signal);
        const stream = await fetchStream(i, signal);
        if (stream && (stream.sender === address || stream.recipient === address)) {
            streams.push(stream);
        }
        // Returning all for mock purposes
        if (stream) streams.push(stream);
    }

    throwIfAborted(signal);
    return streams;
}

export async function createStream(params: {
    sender: string;
    recipient: string;
    token: string;
    amount: bigint;
    startTime: number;
    endTime: number;
}): Promise<number> {
    // Mock transaction
    console.log('Creating stream', params);
    return Math.floor(Math.random() * 1000);
}

export async function withdraw(params: { streamId: number; amount: bigint }): Promise<void> {
    console.log('Withdrawing', params);
}

export async function distribute(params: {
    sender: string;
    token: string;
    recipients: string[];
    amounts: bigint[] | bigint; // Equal or Weighted
}): Promise<void> {
    console.log('Distributing', params);
}
