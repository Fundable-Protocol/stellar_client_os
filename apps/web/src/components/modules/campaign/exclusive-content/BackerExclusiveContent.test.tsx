import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BackerExclusiveContent } from "./BackerExclusiveContent";
import { backersService } from "@/services/campaign-backers.service";
import { exclusiveContentService } from "@/services/campaign-exclusive-content.service";

const CAMPAIGN = "camp-exc-ui";
const CREATOR = "GCREATOR...AAAA";
const VERIFIED_BACKER = "GBACKER...BBBB";
const NON_BACKER = "GPUBLIC...CCCC";

function seedCampaign() {
  backersService.reset();
  exclusiveContentService.reset();
  backersService.registerCampaignCreator(CAMPAIGN, CREATOR);
  backersService.recordContribution({
    campaignId: CAMPAIGN,
    backerAddress: VERIFIED_BACKER,
    amount: "1250",
    token: "XLM",
    displayName: "Verified Supporter",
  });

  exclusiveContentService.publishPost({
    campaignId: CAMPAIGN,
    creatorAddress: CREATOR,
    title: "Ranger GPS Telemetry & Field Notes",
    teaser: "Preview of the ranger patrol telemetry and sapling survival metrics.",
    postType: "RICH_TEXT",
    richTextContent:
      "### Confidential Field Report\n\nSecret patrol coordinates: **Sector 7 North**.",
    attachments: [
      {
        fileName: "patrol-telemetry.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 204800,
        downloadUrl: "https://example.com/patrol-telemetry.pdf",
      },
    ],
  });
}

describe("BackerExclusiveContent", () => {
  beforeEach(seedCampaign);

  it("shows non-backers a blurred teaser with a pledge CTA and hides full content (AC1, AC3)", () => {
    render(
      <BackerExclusiveContent
        campaignId={CAMPAIGN}
        creatorAddress={CREATOR}
        viewerAddress={NON_BACKER}
        seedDemoData={false}
      />,
    );

    expect(screen.getByTestId("exclusive-gate-status").textContent).toContain(
      "Backers Only · Pledge Required",
    );
    expect(screen.getByText("Ranger GPS Telemetry & Field Notes")).toBeTruthy();

    // Blurred teaser is rendered with blur-sm class
    const blurredTeaser = screen.getByTestId("exclusive-blurred-teaser");
    expect(blurredTeaser.className).toContain("blur-sm");
    expect(blurredTeaser.textContent).toContain(
      "Preview of the ranger patrol telemetry and sapling survival metrics.",
    );

    // Secret rich-text body and download link are NOT rendered for non-backers
    expect(screen.queryByTestId("exclusive-rich-text-body")).toBeNull();
    expect(screen.queryByText(/Sector 7 North/)).toBeNull();
    expect(screen.queryByRole("link", { name: /download patrol-telemetry\.pdf/i })).toBeNull();

    // Pledge CTA is displayed and links to the campaign donate page
    const pledgeCta = screen.getByTestId("exclusive-pledge-cta");
    expect(pledgeCta.textContent).toContain("Pledge to Unlock");
    expect(pledgeCta.getAttribute("href")).toBe(`/campaigns/${CAMPAIGN}/donate`);
  });

  it("unlocks full rich-text content and file downloads for verified backers (AC1, AC2)", () => {
    render(
      <BackerExclusiveContent
        campaignId={CAMPAIGN}
        creatorAddress={CREATOR}
        viewerAddress={VERIFIED_BACKER}
        seedDemoData={false}
      />,
    );

    expect(screen.getByTestId("exclusive-gate-status").textContent).toContain(
      "Verified Backer · 1,250 XLM Pledged",
    );
    expect(screen.queryByTestId("exclusive-blurred-teaser")).toBeNull();
    expect(screen.getByTestId("exclusive-rich-text-body").textContent).toContain(
      "Sector 7 North",
    );

    const downloadLink = screen.getByRole("link", {
      name: /download patrol-telemetry\.pdf/i,
    });
    expect(downloadLink.getAttribute("href")).toBe(
      "https://example.com/patrol-telemetry.pdf",
    );
  });

  it("allows the campaign creator to publish rich-text posts and upload files (AC2)", () => {
    render(
      <BackerExclusiveContent
        campaignId={CAMPAIGN}
        creatorAddress={CREATOR}
        viewerAddress={CREATOR}
        seedDemoData={false}
      />,
    );

    expect(screen.getByTestId("exclusive-gate-status").textContent).toContain(
      "Creator Access · Unlocked",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /publish exclusive content/i }),
    );

    fireEvent.change(screen.getByLabelText("Exclusive post title"), {
      target: { value: "Q4 Biodiversity Audio & Notes" },
    });
    fireEvent.change(screen.getByLabelText("Rich-text post content"), {
      target: { value: "### Acoustic Survey\n\nRecorded **14 macaw pairs** at dawn." },
    });

    // Attach a file via the file input
    const fileInput = screen.getByLabelText("Upload exclusive files");
    const sampleFile = new File(["geojson-content"], "macaw-sites.geojson", {
      type: "application/geo+json",
    });
    fireEvent.change(fileInput, { target: { files: [sampleFile] } });

    expect(screen.getByText("macaw-sites.geojson")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /publish to backers/i }));

    expect(screen.getByText("Q4 Biodiversity Audio & Notes")).toBeTruthy();
    expect(screen.getByText(/14 macaw pairs/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /download macaw-sites\.geojson/i }),
    ).toBeTruthy();
  });

  it("lets the creator preview the non-backer blurred teaser gate and fires onPledgeClick", () => {
    const onPledgeClick = vi.fn();
    render(
      <BackerExclusiveContent
        campaignId={CAMPAIGN}
        creatorAddress={CREATOR}
        viewerAddress={CREATOR}
        onPledgeClick={onPledgeClick}
        seedDemoData={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /preview non-backer gate/i }),
    );

    expect(screen.getByTestId("exclusive-blurred-teaser")).toBeTruthy();
    fireEvent.click(screen.getByTestId("exclusive-pledge-cta"));
    expect(onPledgeClick).toHaveBeenCalledTimes(1);
  });
});
