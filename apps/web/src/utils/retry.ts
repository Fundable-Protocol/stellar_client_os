export interface RetryOptions {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    signal?: AbortSignal;
}

export class RetryableError extends Error {
    constructor(
        message: string,
        public readonly status?: number
    ) {
        super(message);
        this.name = "RetryableError";
    }
}

export function createAbortError(message: string = "The operation was aborted"): Error {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

export function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException) {
        return error.name === "AbortError";
    }
    return error instanceof Error && error.name === "AbortError";
}

export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw createAbortError();
    }
}

export async function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    throwIfAborted(signal);
    if (!signal) {
        return promise;
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(createAbortError());
        signal.addEventListener("abort", onAbort, { once: true });

        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            }
        );
    });
}

export function isRetryable(error: unknown): boolean {
    if (isAbortError(error)) return false;
    if (error instanceof RetryableError) return true;
    if (error instanceof TypeError) return true; // network error
    if (error instanceof Error) {
        const status = (error as Error & { status?: number }).status;
        if (status && status >= 400 && status < 500) return false; // 4xx — not retryable
        if (status && status >= 500) return true; // 5xx — retryable
    }
    return true; // unknown errors are retried
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);

        const onAbort = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            reject(createAbortError());
        };

        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    { maxRetries = 3, baseDelay = 1000, maxDelay = 10_000, signal }: RetryOptions = {}
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        throwIfAborted(signal);
        try {
            return await fn();
        } catch (error) {
            if (isAbortError(error)) throw error;
            lastError = error;
            if (!isRetryable(error) || attempt === maxRetries) throw error;
            const delay = Math.min(baseDelay * 2 ** attempt + Math.random() * 1000, maxDelay);
            await sleep(delay, signal);
        }
    }

    throw lastError;
}
