import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Error from "./error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeError(message: string, opts: { stack?: string; digest?: string } = {}): Error & { digest?: string } {
  const err = new globalThis.Error(message) as Error & { digest?: string };
  if (opts.stack !== undefined) err.stack = opts.stack;
  if (opts.digest !== undefined) err.digest = opts.digest;
  return err;
}

// ---------------------------------------------------------------------------
// Generic error (non-env) branch
// ---------------------------------------------------------------------------

describe("Error boundary – generic error", () => {
  it("renders the error message", () => {
    const error = makeError("Something exploded");
    render(<Error error={error} reset={() => {}} />);
    expect(screen.getByText("Something exploded")).toBeTruthy();
  });

  it("renders the 'Something went wrong' heading", () => {
    const error = makeError("oops");
    render(<Error error={error} reset={() => {}} />);
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("renders a 'Try again' button that calls reset", () => {
    const reset = vi.fn();
    const error = makeError("oops");
    render(<Error error={error} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Collapsible stack panel
  // -------------------------------------------------------------------------

  it("does not render stack toggle when error.stack is absent", () => {
    const error = makeError("oops");
    delete error.stack;
    render(<Error error={error} reset={() => {}} />);
    expect(screen.queryByRole("button", { name: /show error details/i })).toBeNull();
  });

  it("renders stack toggle button when error.stack is present", () => {
    const error = makeError("oops");
    error.stack = "Error: oops\n    at fn (file.ts:1:1)";
    render(<Error error={error} reset={() => {}} />);
    expect(screen.getByRole("button", { name: /show error details/i })).toBeTruthy();
  });

  it("stack panel is collapsed by default", () => {
    const stack = "Error: oops\n    at fn (file.ts:1:1)";
    const error = makeError("oops", { stack });
    render(<Error error={error} reset={() => {}} />);
    // The pre element with the stack should not be in the DOM yet
    expect(screen.queryByText(stack)).toBeNull();
  });

  it("expands stack panel on first click and collapses on second", () => {
    const stack = "Error: oops\n    at fn (file.ts:1:1)";
    const error = makeError("oops", { stack });
    render(<Error error={error} reset={() => {}} />);

    const toggle = screen.getByRole("button", { name: /show error details/i });

    // Expand
    fireEvent.click(toggle);
    // Use a function matcher because the text spans a <pre> with whitespace
    expect(screen.getByText((_, el) => el?.tagName === "PRE" && el.textContent === stack)).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    // Collapse
    fireEvent.click(toggle);
    expect(screen.queryByText((_, el) => el?.tagName === "PRE" && el.textContent === stack)).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  // -------------------------------------------------------------------------
  // Copy digest button
  // -------------------------------------------------------------------------

  it("does not render copy button when digest is absent", () => {
    const error = makeError("oops");
    render(<Error error={error} reset={() => {}} />);
    expect(screen.queryByRole("button", { name: /copy error digest/i })).toBeNull();
  });

  it("renders digest value and copy button when digest is present", () => {
    const error = makeError("oops", { digest: "abc-123" });
    render(<Error error={error} reset={() => {}} />);
    expect(screen.getByText("abc-123")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy error digest/i })).toBeTruthy();
  });

  it("shows '✓ Copied' feedback after clicking copy and reverts after timeout", async () => {
    vi.useFakeTimers();
    // Stub clipboard API
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const error = makeError("oops", { digest: "abc-123" });
    render(<Error error={error} reset={() => {}} />);

    const copyBtn = screen.getByRole("button", { name: /copy error digest/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(screen.getByText(/✓ Copied/)).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith("abc-123");

    // Advance the 2-second timeout
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText(/✓ Copied/)).toBeNull();
    expect(screen.getByRole("button", { name: /copy error digest/i })).toBeTruthy();

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Environment variable error branch
// ---------------------------------------------------------------------------

describe("Error boundary – env error", () => {
  it("renders the configuration error heading", () => {
    const error = makeError("Environment variable validation failed: NEXT_PUBLIC_RPC_URL");
    render(<Error error={error} reset={() => {}} />);
    expect(screen.getByText("⚙️ Configuration Error")).toBeTruthy();
  });

  it("renders the error message in a pre block", () => {
    const msg = "Environment variable validation failed: NEXT_PUBLIC_RPC_URL";
    const error = makeError(msg);
    render(<Error error={error} reset={() => {}} />);
    expect(screen.getByText(msg)).toBeTruthy();
  });

  it("renders the how-to-fix instructions", () => {
    const error = makeError("Environment variable validation failed");
    render(<Error error={error} reset={() => {}} />);
    expect(screen.getByText(/how to fix/i)).toBeTruthy();
    expect(screen.getByText(/.env.example/i)).toBeTruthy();
  });

  it("does not render collapsible stack panel for env errors", () => {
    const error = makeError("Environment variable validation failed");
    error.stack = "Error: ...\n    at validate (env.ts:1:1)";
    render(<Error error={error} reset={() => {}} />);
    // The toggle button should NOT appear in the env-error branch
    expect(screen.queryByRole("button", { name: /show error details/i })).toBeNull();
  });
});
