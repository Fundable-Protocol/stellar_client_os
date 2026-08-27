"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type MutationStatus = "idle" | "pending" | "success" | "error";

interface GuardOptions {
    cooldownMs?: number;
}

interface UseTransactionGuardReturn {
    isSubmitting: boolean;
    isCoolingDown: boolean;
    isGuardActive: boolean;
    runWithGuard: <T>(fn: () => Promise<T>, options?: GuardOptions) => Promise<T | undefined>;
}

/**
 * Prevents duplicate async submissions by blocking re-entry while work is in flight
 * and for a short cooldown period after a successful submission.
 *
 * Optionally accepts an external `mutationStatus` (e.g. derived from ledger/bridge
 * polling) so the guard's lifecycle is tied to when the mutation actually settles,
 * not just to when the wrapped `fn` promise resolves. This matters when `fn` only
 * submits/kicks off work (e.g. starts polling) and resolves long before the real
 * outcome (ledger inclusion, payout confirmation) is known.
 *
 * - `mutationStatus === "pending"`: guard stays locked, even past any cooldown.
 *   Note: if `mutationStatus` is already "pending" on the very first call, `runWithGuard`
 *   is a no-op — `fn` is not invoked and the guard remains locked — since the guard has
 *   no way to distinguish "already tracking a pending mutation" from "not yet started".
 * - `mutationStatus === "success"`: guard applies the cooldown, then unlocks.
 * - `mutationStatus === "error"`: guard unlocks immediately (explicit failure, no cooldown).
 * - `mutationStatus` omitted: behavior is unchanged from the original fn-resolution-based guard. */
export function useTransactionGuard(
    defaultCooldownMs = 2000,
    mutationStatus?: MutationStatus
): UseTransactionGuardReturn {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCoolingDown, setIsCoolingDown] = useState(false);
    const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lockRef = useRef(false);
    const prevStatusRef = useRef<MutationStatus | undefined>(mutationStatus);
    const cooldownOverrideRef = useRef<number | undefined>(undefined);

    const isMutationTracked = mutationStatus !== undefined;
    const isMutationPending = mutationStatus === "pending";

    const isGuardActive = isSubmitting || isCoolingDown || lockRef.current || isMutationPending;

    useEffect(() => {
        return () => {
            if (cooldownRef.current) {
                clearTimeout(cooldownRef.current);
            }
        };
    }, []);

    // React to external mutation status transitions so the guard stays locked
    // for the full real-world lifecycle of the mutation, not just for as long
    // as the wrapped fn's own promise takes to resolve.
    useEffect(() => {
        const prevStatus = prevStatusRef.current;
        prevStatusRef.current = mutationStatus;

        if (!isMutationTracked || prevStatus === mutationStatus) {
            return;
        }

        if (mutationStatus === "error") {
            if (cooldownRef.current) {
                clearTimeout(cooldownRef.current);
                cooldownRef.current = null;
            }
            setIsCoolingDown(false);
            return;
        }

        if (mutationStatus === "success") {
            const cooldownMs = cooldownOverrideRef.current ?? defaultCooldownMs;
            if (cooldownMs > 0) {
                setIsCoolingDown(true);
                cooldownRef.current = setTimeout(() => {
                    setIsCoolingDown(false);
                    cooldownRef.current = null;
                }, cooldownMs);
            }
        }
    }, [mutationStatus, isMutationTracked, defaultCooldownMs]);

    const runWithGuard = useCallback(
        async <T,>(fn: () => Promise<T>, options?: GuardOptions): Promise<T | undefined> => {
            if (isGuardActive) {
                return undefined;
            }
            lockRef.current = true;
            setIsSubmitting(true);
            cooldownOverrideRef.current = options?.cooldownMs;
            try {
                const result = await fn();
                // Only apply the fn-resolution-based cooldown when no external
                // mutation status is supplied. When a status is tracked, the
                // lifecycle is driven by the effect above instead, since fn
                // resolving early (e.g. after submit, before ledger inclusion)
                // must not be treated as "done".
                if (!isMutationTracked) {
                    const cooldownMs = options?.cooldownMs ?? defaultCooldownMs;
                    if (cooldownMs > 0) {
                        setIsCoolingDown(true);
                        cooldownRef.current = setTimeout(() => {
                            setIsCoolingDown(false);
                            cooldownRef.current = null;
                        }, cooldownMs);
                    }
                }
                return result;
            } finally {
                lockRef.current = false;
                setIsSubmitting(false);
            }
        },
        [defaultCooldownMs, isGuardActive, isMutationTracked]
    );

    return {
        isSubmitting,
        isCoolingDown,
        isGuardActive,
        runWithGuard,
    };
}