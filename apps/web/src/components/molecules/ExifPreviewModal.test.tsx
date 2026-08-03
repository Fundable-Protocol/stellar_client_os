import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExifPreviewModal } from "./ExifPreviewModal";
import type { ExifSummary } from "@/lib/exif";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sampleData: ExifSummary = {
  gps: { latitude: 6.5244, longitude: 3.3792 },
  timestamp: "2026-01-15T10:30:00.000Z",
  device: { make: "Apple", model: "iPhone 15" },
};

const emptyData: ExifSummary = {
  gps: null,
  timestamp: null,
  device: { make: null, model: null },
};

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe("ExifPreviewModal – loading state", () => {
  it("renders the dialog with a status region while loading", () => {
    render(
      <ExifPreviewModal
        open
        status="loading"
        data={null}
        error={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("disables the Confirm & Submit button while loading", () => {
    render(
      <ExifPreviewModal
        open
        status="loading"
        data={null}
        error={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const confirmBtn = screen.getByRole("button", { name: /confirm & submit/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Success state
// ---------------------------------------------------------------------------
describe("ExifPreviewModal – success state", () => {
  it("renders extracted GPS coordinates", () => {
    render(
      <ExifPreviewModal
        open
        status="success"
        data={sampleData}
        error={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(/6.52440, 3.37920/)).toBeTruthy();
  });

  it("renders device make and model", () => {
    render(
      <ExifPreviewModal
        open
        status="success"
        data={sampleData}
        error={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Apple iPhone 15")).toBeTruthy();
  });

  it("renders 'Not available' for missing GPS, timestamp, and device fields", () => {
    render(
      <ExifPreviewModal
        open
        status="success"
        data={emptyData}
        error={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getAllByText("Not available").length).toBe(3);
  });

  it("calls onConfirm when 'Confirm & Submit' is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ExifPreviewModal
        open
        status="success"
        data={sampleData}
        error={null}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm & submit/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when 'Cancel' is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ExifPreviewModal
        open
        status="success"
        data={sampleData}
        error={null}
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
describe("ExifPreviewModal – error state", () => {
  it("renders the provided error message", () => {
    render(
      <ExifPreviewModal
        open
        status="error"
        data={null}
        error="Could not read file metadata."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Could not read file metadata.")).toBeTruthy();
  });

  it("still allows the user to confirm and submit despite the error", () => {
    const onConfirm = vi.fn();
    render(
      <ExifPreviewModal
        open
        status="error"
        data={null}
        error="Could not read file metadata."
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    const confirmBtn = screen.getByRole("button", { name: /confirm & submit/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------
describe("ExifPreviewModal – accessibility", () => {
  it("does not render when closed", () => {
    render(
      <ExifPreviewModal
        open={false}
        status="idle"
        data={null}
        error={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders an accessible dialog title", () => {
    render(
      <ExifPreviewModal
        open
        status="success"
        data={sampleData}
        error={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Review file metadata")).toBeTruthy();
  });
});
