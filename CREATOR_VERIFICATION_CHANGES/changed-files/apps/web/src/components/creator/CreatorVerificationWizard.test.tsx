import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real provider pulls in wallet SDKs that do not load under jsdom; only the context is needed.
vi.mock("@/providers/StellarWalletProvider", async () => {
  const react = await import("react");
  return { WalletContext: react.createContext(undefined) };
});

import { WalletContext } from "@/providers/StellarWalletProvider";
import { CreatorVerificationWizard } from "./CreatorVerificationWizard";

const ADDRESS = "GCREATORADDRESS";

function statusResponse(summary: Record<string, unknown>, steps: Array<{ step: string; status: string }>, owner = false) {
  return {
    ok: true,
    json: async () => ({ owner, verification: { creator: ADDRESS, summary, steps } }),
  };
}

const UNVERIFIED_STEPS = [
  { step: "email", status: "not_started" },
  { step: "phone", status: "not_started" },
  { step: "government_id", status: "not_started" },
];

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("CreatorVerificationWizard", () => {
  it("explains the optional flow and asks the creator to prove wallet ownership first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(statusResponse({ status: "unverified", verifiedCount: 0, totalCount: 3, badges: [] }, UNVERIFIED_STEPS)),
    );
    await act(async () => {
      render(<CreatorVerificationWizard address={ADDRESS} />);
    });

    expect(screen.getByRole("heading", { name: "Creator identity verification" })).toBeTruthy();
    expect(screen.getByText(/Optional\. Verify your email, phone and government ID/)).toBeTruthy();
    const progress = screen.getByRole("list", { name: "Verification progress" });
    expect(progress.textContent).toContain("1. Email");
    expect(progress.textContent).toContain("2. Phone");
    expect(progress.textContent).toContain("3. Government ID");
    expect(screen.getAllByText("Not started")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Wallet support is unavailable"));
  });

  it("refuses to sign when the connected wallet is not the creator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(statusResponse({ status: "unverified", verifiedCount: 0, totalCount: 3, badges: [] }, UNVERIFIED_STEPS)),
    );
    const signMessage = vi.fn();
    const wallet = { address: "GSOMEONEELSE", isConnected: true, signMessage, openModal: vi.fn() };
    await act(async () => {
      render(
        <WalletContext.Provider value={wallet as never}>
          <CreatorVerificationWizard address={ADDRESS} />
        </WalletContext.Provider>,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign with wallet" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("does not match this creator address"));
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("signs the challenge and shows the per-step forms once a session is open", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse({ status: "unverified", verifiedCount: 0, totalCount: 3, badges: [] }, UNVERIFIED_STEPS))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nonce: "n-1", message: "Fundable creator identity verification" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "session-token", expiresAt: Date.now() + 60_000 }) })
      .mockResolvedValueOnce(
        statusResponse(
          { status: "partial", verifiedCount: 1, totalCount: 3, badges: ["email"], emailVerified: true },
          [
            { step: "email", status: "verified" },
            { step: "phone", status: "not_started" },
            { step: "government_id", status: "not_started" },
          ],
          true,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const signMessage = vi.fn().mockResolvedValue({ signedMessage: "c2lnbmF0dXJl", signerAddress: ADDRESS });
    const wallet = { address: ADDRESS, isConnected: true, signMessage, openModal: vi.fn() };

    await act(async () => {
      render(
        <WalletContext.Provider value={wallet as never}>
          <CreatorVerificationWizard address={ADDRESS} />
        </WalletContext.Provider>,
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign with wallet" }));
    });

    await waitFor(() => expect(screen.getByRole("heading", { name: /Verify your email address/ })).toBeTruthy());
    expect(signMessage).toHaveBeenCalledWith("Fundable creator identity verification");
    expect(fetchMock.mock.calls[2][1].body).toContain('"signature":"c2lnbmF0dXJl"');
    expect(fetchMock.mock.calls[3][1].headers.authorization).toBe("Bearer session-token");
    expect(screen.getByRole("heading", { name: /Verify your phone number/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Verify your government ID/ })).toBeTruthy();
    expect(screen.getByTestId("creator-verification-badge").textContent).toContain("1 of 3 identity checks");
    expect(screen.getByRole("button", { name: /withdraw and erase/ })).toBeTruthy();
  });
});
