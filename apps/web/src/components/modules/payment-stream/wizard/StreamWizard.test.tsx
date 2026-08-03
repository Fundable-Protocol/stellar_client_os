import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StreamWizard from "./StreamWizard";

const VALID_ADDRESS =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWizard(props: Partial<ComponentProps<typeof StreamWizard>> = {}) {
  const onComplete = vi.fn();
  render(<StreamWizard onComplete={onComplete} {...props} />);
  return { onComplete };
}

function continueButton() {
  return screen.getByRole("button", { name: /continue/i });
}

describe("StreamWizard", () => {
  it("renders the first step with a navigable stepper", () => {
    renderWizard();

    expect(screen.getByText(/step 1 of 4/i)).toBeDefined();
    expect(screen.getByLabelText("Campaign Name")).toBeDefined();
    expect(
      screen.getByRole("button", { name: /step 1: campaign/i })
    ).toBeDefined();
  });

  it("disables the back button on the first step", () => {
    renderWizard();

    const back = screen.getByRole("button", { name: /back/i }) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
  });

  it("blocks navigation and surfaces an error when the campaign name is missing", () => {
    renderWizard();

    fireEvent.click(continueButton());

    expect(screen.getByRole("alert").textContent).toContain(
      "Campaign name is required"
    );
    expect(screen.getByText(/step 1 of 4/i)).toBeDefined();
  });

  it("advances to the funding step once the campaign details are valid", () => {
    renderWizard();

    fireEvent.change(screen.getByLabelText("Campaign Name"), {
      target: { value: "Q3 Contributor Grants" },
    });
    fireEvent.click(continueButton());

    expect(screen.getByText(/step 2 of 4/i)).toBeDefined();
    expect(screen.getByLabelText("Recipient Address")).toBeDefined();
  });

  it("validates the recipient address and amount before leaving the funding step", () => {
    renderWizard();

    fireEvent.change(screen.getByLabelText("Campaign Name"), {
      target: { value: "Q3 Contributor Grants" },
    });
    fireEvent.click(continueButton());

    fireEvent.change(screen.getByLabelText("Recipient Address"), {
      target: { value: "not-a-stellar-address" },
    });
    fireEvent.click(continueButton());

    expect(screen.getByText(/step 2 of 4/i)).toBeDefined();
    expect(
      screen.getAllByRole("alert").some((node) => /address/i.test(node.textContent ?? ""))
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Recipient Address"), {
      target: { value: VALID_ADDRESS },
    });
    fireEvent.change(screen.getByLabelText("Total Amount"), {
      target: { value: "1000" },
    });
    fireEvent.click(continueButton());

    expect(screen.getByText(/step 3 of 4/i)).toBeDefined();
  });

  it("lets a creator step back to revise an earlier answer", () => {
    renderWizard();

    fireEvent.change(screen.getByLabelText("Campaign Name"), {
      target: { value: "Q3 Contributor Grants" },
    });
    fireEvent.click(continueButton());
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByText(/step 1 of 4/i)).toBeDefined();
    expect(
      (screen.getByLabelText("Campaign Name") as HTMLInputElement).value
    ).toBe("Q3 Contributor Grants");
  });

  it("shows a submitting state and blocks further interaction", () => {
    renderWizard({ isSubmitting: true });

    const submitting = screen.getByRole("button", { name: /creating stream/i });
    expect((submitting as HTMLButtonElement).disabled).toBe(true);
  });
});
