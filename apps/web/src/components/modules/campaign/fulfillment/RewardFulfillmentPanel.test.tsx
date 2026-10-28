import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RewardFulfillmentPanel } from "./RewardFulfillmentPanel";
import { rewardFulfillmentService } from "@/services/reward-fulfillment.service";
import * as rewardFulfillmentServiceModule from "@/services/reward-fulfillment.service";

const CAMPAIGN = "camp-test-fulfill";

function seed() {
  rewardFulfillmentService.reset();
  rewardFulfillmentService.saveFulfillments(CAMPAIGN, [
    {
      backerAddress: "GB44...R771",
      recipientName: "Jane Doe",
      rewardTier: "Tree Kit",
      addressLine1: "123 Forest Way",
      city: "Portland",
      state: "OR",
      postalCode: "97201",
      country: "United States",
      shippingStatus: "pending",
    },
    {
      backerAddress: "GD99...Z100",
      recipientName: "Alex Morgan",
      rewardTier: "Apparel Pack",
      addressLine1: "456 Pine Ave",
      city: "Seattle",
      state: "WA",
      postalCode: "98101",
      country: "United States",
      shippingStatus: "shipped",
      trackingNumber: "TRK-998877",
    },
  ]);
}

describe("RewardFulfillmentPanel Component", () => {
  beforeEach(seed);

  it("renders panel header, stats metrics, and action buttons", () => {
    render(<RewardFulfillmentPanel campaignId={CAMPAIGN} />);

    expect(screen.getByText("Reward Fulfillment & Shipping")).toBeTruthy();
    expect(screen.getByText("Download CSV Template")).toBeTruthy();
    expect(screen.getByText("Bulk Import CSV")).toBeTruthy();
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("Alex Morgan")).toBeTruthy();
  });

  it("triggers CSV template download when Download CSV Template is clicked", () => {
    const downloadSpy = vi.spyOn(rewardFulfillmentServiceModule, "downloadFulfillmentCSVTemplate").mockImplementation(() => {});
    render(<RewardFulfillmentPanel campaignId={CAMPAIGN} />);

    const downloadBtn = screen.getByText("Download CSV Template");
    fireEvent.click(downloadBtn);

    expect(downloadSpy).toHaveBeenCalled();
    downloadSpy.mockRestore();
  });

  it("opens import drawer and flags CSV errors before saving", async () => {
    render(<RewardFulfillmentPanel campaignId={CAMPAIGN} />);

    const importBtn = screen.getByText("Bulk Import CSV");
    fireEvent.click(importBtn);

    expect(screen.getByText("Bulk Import Shipping Addresses from CSV")).toBeTruthy();

    const textarea = screen.getByPlaceholderText(/Backer Address,Recipient Name/i);
    const invalidCSV = [
      "Backer Address,Recipient Name,Address Line 1,City,Postal Code,Country",
      "GB44...R771,Valid Recipient,100 Valid St,Portland,97201,US",
      "GD99...Z100,,200 Invalid Rd,,98101,US",
    ].join("\n");

    fireEvent.change(textarea, { target: { value: invalidCSV } });

    await waitFor(() => {
      expect(screen.getByText(/Validation Flagged/i)).toBeTruthy();
      expect(screen.getByText(/Save Only Valid Rows/i)).toBeTruthy();
    });
  });

  it("allows editing a backer shipping address row inline and saves changes", async () => {
    render(<RewardFulfillmentPanel campaignId={CAMPAIGN} />);

    expect(screen.getByText("Jane Doe")).toBeTruthy();
    const editBtn = screen.getByLabelText("Edit shipping address for Jane Doe");
    fireEvent.click(editBtn);

    const recipientInput = screen.getByDisplayValue("Jane Doe");
    fireEvent.change(recipientInput, { target: { value: "Jane Updated Doe" } });

    const saveBtn = screen.getByTitle("Save changes");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Jane Updated Doe")).toBeTruthy();
      expect(screen.getByText(/Address updated successfully/i)).toBeTruthy();
    });

    const records = rewardFulfillmentService.getFulfillments(CAMPAIGN);
    expect(records.find((r) => r.recipientName === "Jane Updated Doe")).toBeDefined();
  });

  it("blocks saving edits if required fields are cleared", async () => {
    render(<RewardFulfillmentPanel campaignId={CAMPAIGN} />);

    const editBtn = screen.getByLabelText("Edit shipping address for Jane Doe");
    fireEvent.click(editBtn);

    const recipientInput = screen.getByDisplayValue("Jane Doe");
    fireEvent.change(recipientInput, { target: { value: "" } });

    const saveBtn = screen.getByTitle("Save changes");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Recipient name is required/i)).toBeTruthy();
    });
  });

  it("filters backer rows by search query", () => {
    render(<RewardFulfillmentPanel campaignId={CAMPAIGN} />);

    const searchInput = screen.getByPlaceholderText(/Search by backer, recipient/i);
    fireEvent.change(searchInput, { target: { value: "Alex" } });

    expect(screen.queryByText("Jane Doe")).toBeNull();
    expect(screen.getByText("Alex Morgan")).toBeTruthy();
  });
});
