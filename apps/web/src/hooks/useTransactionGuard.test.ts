import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTransactionGuard, type MutationStatus } from "./useTransactionGuard";

describe("useTransactionGuard", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // --- Failure-case tests: prove the bug and prove the fix ---

    it("stays locked past the cooldown window while the mutation is still pending (regression test for #456)", async () => {
        const { result, rerender } = renderHook(
            ({ status }: { status: MutationStatus }) => useTransactionGuard(2000, status),
            { initialProps: { status: "idle" as MutationStatus } }
        );

        expect(result.current.isGuardActive).toBe(false);

        const guardedFn = vi.fn().mockResolvedValue("submitted");

        // Simulate fn resolving quickly (e.g. "submit" succeeds) while the
        // real mutation (e.g. ledger inclusion) is still pending externally.
        await act(async () => {
            await result.current.runWithGuard(guardedFn);
        });

        expect(guardedFn).toHaveBeenCalledTimes(1);

        // The caller's mutation-status hook now reports "pending" as tracking begins.
        rerender({ status: "pending" });
        expect(result.current.isGuardActive).toBe(true);

        // Advance well past the 2000ms cooldown that used to unlock the guard
        // unconditionally.
        await act(async () => {
            vi.advanceTimersByTime(5000);
        });

        // Without the fix, this would be false here — the guard would have
        // unlocked purely on the timer, even though the mutation never settled.
        expect(result.current.isGuardActive).toBe(true);

        rerender({ status: "pending" });
        expect(result.current.isGuardActive).toBe(true);
    });

    it("unlocks (after cooldown) once the tracked mutation transitions to success", async () => {
        const { result, rerender } = renderHook(
            ({ status }: { status: MutationStatus }) => useTransactionGuard(2000, status),
            { initialProps: { status: "idle" as MutationStatus } }
        );

        await act(async () => {
            await result.current.runWithGuard(async () => "submitted");
        });

        rerender({ status: "pending" });
        expect(result.current.isGuardActive).toBe(true);

        rerender({ status: "success" });
        expect(result.current.isGuardActive).toBe(true); // still cooling down

        await act(async () => {
            vi.advanceTimersByTime(2000);
        });
        expect(result.current.isGuardActive).toBe(false);
    });

    it("unlocks immediately, with no cooldown wait, when the mutation explicitly fails", async () => {
        const { result, rerender } = renderHook(
            ({ status }: { status: MutationStatus }) => useTransactionGuard(2000, status),
            { initialProps: { status: "idle" as MutationStatus } }
        );

        await act(async () => {
            await result.current.runWithGuard(async () => "submitted");
        });

        rerender({ status: "pending" });
        expect(result.current.isGuardActive).toBe(true);

        rerender({ status: "error" });

        // No timer advance at all — should already be unlocked.
        expect(result.current.isGuardActive).toBe(false);
    });

    it("respects a per-call cooldownMs override when the tracked mutation succeeds", async () => {
        const { result, rerender } = renderHook(
            ({ status }: { status: MutationStatus }) => useTransactionGuard(2000, status),
            { initialProps: { status: "idle" as MutationStatus } }
        );

        await act(async () => {
            await result.current.runWithGuard(async () => "submitted", { cooldownMs: 500 });
        });

        rerender({ status: "pending" });
        expect(result.current.isGuardActive).toBe(true);

        rerender({ status: "success" });
        expect(result.current.isGuardActive).toBe(true); // still cooling down

        // Advance past the 500ms override but well short of the 2000ms default —
        // without the fix, this would still be locked (defaultCooldownMs used instead).
        await act(async () => {
            vi.advanceTimersByTime(500);
        });
        expect(result.current.isGuardActive).toBe(false);
    });

    // --- Backward-compatibility / happy-path tests ---

    it("behaves exactly as before when no mutationStatus is passed: locks during fn, cooldown after, then unlocks", async () => {
        const { result } = renderHook(() => useTransactionGuard(2000));

        expect(result.current.isGuardActive).toBe(false);

        const guardedFn = vi.fn().mockResolvedValue("done");
        await act(async () => {
            await result.current.runWithGuard(guardedFn);
        });

        expect(guardedFn).toHaveBeenCalledTimes(1);
        expect(result.current.isGuardActive).toBe(true); // in cooldown

        await act(async () => {
            vi.advanceTimersByTime(2000);
        });
        expect(result.current.isGuardActive).toBe(false);
    });

    it("blocks re-entrant calls while already guarded", async () => {
        const { result } = renderHook(() => useTransactionGuard(0));

        let resolveFn: (v: string) => void;
        const slowFn = () =>
            new Promise<string>((resolve) => {
                resolveFn = resolve;
            });

        let firstCallPromise: Promise<string | undefined>;
        act(() => {
            firstCallPromise = result.current.runWithGuard(slowFn);
        });

        expect(result.current.isGuardActive).toBe(true);

        const secondCall = await act(async () => result.current.runWithGuard(slowFn));
        expect(secondCall).toBeUndefined(); // blocked re-entry

        await act(async () => {
            resolveFn!("first-result");
            await firstCallPromise;
        });

        expect(result.current.isGuardActive).toBe(false);
    });
});