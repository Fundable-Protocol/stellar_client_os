/**
 * Tests for ManageDelegateModal delegate address validation
 * **Issue #420: Validate delegate public key address format**
 * **Feature: payment-stream-ui, Validation: delegate-public-key**
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ManageDelegateModal } from "./ManageDelegateModal";
import { useStreamDelegation } from "@/hooks/use-stream-delegation";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/hooks/use-stream-delegation", () => ({
  useStreamDelegation: vi.fn(() => ({
    setDelegate: {
      isPending: false,
      mutateAsync: vi.fn(),
    },
    revokeDelegate: {
      isPending: false,
      mutateAsync: vi.fn(),
    },
  })),
}));

// Mock StrKey so tests are deterministic and avoid pulling the full Stellar
// SDK into a jsdom test environment.  vi.hoisted ensures the variable is
// available when the vi.mock factory runs (mock calls are hoisted).
const { mockIsValidEd25519PublicKey } = vi.hoisted(() => ({
  mockIsValidEd25519PublicKey: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", () => ({
  StrKey: {
    isValidEd25519PublicKey: mockIsValidEd25519PublicKey,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  streamId: "1",
  currentDelegate: undefined,
};

function renderModal(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<ManageDelegateModal {...props} />);
}

function mockDelegationHooks(overrides: {
  setDelegate?: { isPending?: boolean; mutateAsync?: ReturnType<typeof vi.fn> };
  revokeDelegate?: { isPending?: boolean; mutateAsync?: ReturnType<typeof vi.fn> };
}) {
  vi.mocked(useStreamDelegation).mockReturnValue({
    setDelegate: {
      isPending: overrides.setDelegate?.isPending ?? false,
      mutateAsync: overrides.setDelegate?.mutateAsync ?? vi.fn(),
    },
    revokeDelegate: {
      isPending: overrides.revokeDelegate?.isPending ?? false,
      mutateAsync: overrides.revokeDelegate?.mutateAsync ?? vi.fn(),
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ManageDelegateModal – delegate address validation", () => {
  // ---- success path -----------------------------------------------------

  it("calls setDelegate when a valid Stellar public key is submitted", async () => {
    const mutateAsync = vi.fn();
    mockDelegationHooks({ setDelegate: { mutateAsync } });
    mockIsValidEd25519PublicKey.mockReturnValue(true);

    renderModal();

    const input = screen.getByLabelText("Delegate Address");
    fireEvent.change(input, {
      target: {
        value:
          "GA7QNFM3EUT2YKQ5N6K6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /set delegate/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        streamId: "1",
        delegateAddress:
          "GA7QNFM3EUT2YKQ5N6K6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6",
      });
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  // ---- failure paths ----------------------------------------------------

  it.each([
    { label: "empty string", value: "" },
    { label: "EVM-style address", value: "0x742d35Cc6634C0532925a3b844Bc4a1b8fF4c1b8" },
    { label: "garbage input", value: "GARBAGE!!!" },
    { label: "too-short string", value: "G1234" },
  ])(
    "shows a validation error and does NOT call setDelegate for $label",
    async ({ value }) => {
      const mutateAsync = vi.fn();
      mockDelegationHooks({ setDelegate: { mutateAsync } });
      mockIsValidEd25519PublicKey.mockReturnValue(false);

      renderModal();

      const input = screen.getByLabelText("Delegate Address");
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: /set delegate/i }));

      // Wait for error to appear
      const errorEl = await screen.findByText(
        /Please enter a valid Stellar public key/,
      );
      expect(errorEl).not.toBeNull();

      // Use role="alert" to verify accessibility
      expect(errorEl.getAttribute("role")).toBe("alert");

      // Verify mutation was NOT called
      expect(mutateAsync).not.toHaveBeenCalled();
    },
  );

  // ---- edge cases -------------------------------------------------------

  it("clears the validation error when the user starts typing again", async () => {
    mockIsValidEd25519PublicKey.mockReturnValue(false);
    renderModal();

    // Trigger validation error
    fireEvent.click(screen.getByRole("button", { name: /set delegate/i }));
    await screen.findByText(/Please enter a valid Stellar public key/);

    // Start typing — error should clear
    fireEvent.change(screen.getByLabelText("Delegate Address"), {
      target: { value: "G" },
    });

    await waitFor(() => {
      expect(
        screen.queryByText(/Please enter a valid Stellar public key/),
      ).toBeNull();
    });
  });

  it("disables the input and buttons while a mutation is pending", () => {
    mockDelegationHooks({ setDelegate: { isPending: true } });
    renderModal();

    expect(screen.getByLabelText("Delegate Address")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /setting/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /cancel/i })).toHaveProperty("disabled", true);
  });

  it("supports removing an existing delegate", async () => {
    const revokeMutateAsync = vi.fn();
    mockDelegationHooks({ revokeDelegate: { mutateAsync: revokeMutateAsync } });
    renderModal({
      currentDelegate:
        "GA7QNFM3EUT2YKQ5N6K6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6",
    });

    fireEvent.click(screen.getByRole("button", { name: /remove delegate/i }));

    await waitFor(() => {
      expect(revokeMutateAsync).toHaveBeenCalledWith("1");
    });
  });

  it("returns null when isOpen is false", () => {
    const { container } = renderModal({ isOpen: false });
    expect(container.innerHTML).toBe("");
  });

  it("displays the current delegate when one exists", () => {
    renderModal({
      currentDelegate:
        "GA7QNFM3EUT2YKQ5N6K6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6L6",
    });

    const el = screen.getByText(/GA7QNF\.\.\.L6L6/);
    expect(el).not.toBeNull();
  });

  it("displays 'No delegate set' when no currentDelegate is provided", () => {
    renderModal();

    const el = screen.getByText("No delegate set");
    expect(el).not.toBeNull();
  });
});
