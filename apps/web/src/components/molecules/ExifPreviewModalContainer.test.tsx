import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExifPreviewModalContainer } from "./ExifPreviewModalContainer";

describe("ExifPreviewModalContainer", () => {
  it("renders an upload trigger button", () => {
    render(<ExifPreviewModalContainer onFileConfirmed={() => {}} />);
    expect(screen.getByRole("button", { name: /upload proof file/i })).toBeTruthy();
  });

  it("does not show the modal before a file is selected", () => {
    render(<ExifPreviewModalContainer onFileConfirmed={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the modal and calls onFileConfirmed after selecting a file and confirming", async () => {
    const onFileConfirmed = vi.fn();
    render(<ExifPreviewModalContainer onFileConfirmed={onFileConfirmed} />);

    const file = new File(["dummy content"], "proof.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/upload proof file/i) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    // Modal should open immediately (loading or resolved state)
    expect(await screen.findByRole("dialog")).toBeTruthy();

    // Wait for extraction to settle (status leaves 'loading') before clicking
    const confirmBtn = await screen.findByRole("button", { name: /confirm & submit/i });
    await waitFor(() => expect(confirmBtn.hasAttribute("disabled")).toBe(false));

    fireEvent.click(confirmBtn);

    expect(onFileConfirmed).toHaveBeenCalledWith(file);
  });

  it("closes the modal and does not call onFileConfirmed when cancelled", async () => {
    const onFileConfirmed = vi.fn();
    render(<ExifPreviewModalContainer onFileConfirmed={onFileConfirmed} />);

    const file = new File(["dummy content"], "proof.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/upload proof file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const cancelBtn = await screen.findByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(onFileConfirmed).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
