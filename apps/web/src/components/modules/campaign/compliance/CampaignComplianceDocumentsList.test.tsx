import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { CampaignComplianceDocumentsList } from "./CampaignComplianceDocumentsList";
import { ComplianceDocument } from "@/types/campaign-compliance";

describe("CampaignComplianceDocumentsList Component", () => {
  const mockDocuments: ComplianceDocument[] = [
    {
      id: "doc-1",
      campaignId: "c1",
      name: "Certificate of Incorporation",
      fileName: "corp_registration.pdf",
      fileUrl: "https://example.com/corp_registration.pdf",
      fileSize: 1024 * 1024 * 2, // 2MB
      mimeType: "application/pdf",
      documentType: "business_registration",
      uploadedAt: 1718447400000,
      uploadedBy: "G_CREATOR_1",
      verified: true,
      verifiedAt: 1718533800000,
      verifiedBy: "G_ADMIN_VERIFIER",
    },
    {
      id: "doc-2",
      campaignId: "c1",
      name: "501(c)(3) Non-Profit Determination",
      fileName: "non_profit_exempt.pdf",
      fileUrl: "https://example.com/non_profit_exempt.pdf",
      fileSize: 1024 * 500,
      mimeType: "application/pdf",
      documentType: "non_profit_status",
      uploadedAt: 1718620200000,
      uploadedBy: "G_CREATOR_1",
      verified: false,
    },
  ];

  it("renders empty state when there are no documents", () => {
    render(<CampaignComplianceDocumentsList campaignId="c1" initialDocuments={[]} />);
    expect(screen.getByText("No compliance documents uploaded yet")).toBeDefined();
  });

  it("renders compliance documents heading and items with name and upload date", () => {
    render(<CampaignComplianceDocumentsList campaignId="c1" initialDocuments={mockDocuments} />);

    expect(screen.getByText("Compliance & Legal Due Diligence")).toBeDefined();
    expect(screen.getByText("Certificate of Incorporation")).toBeDefined();
    expect(screen.getByText("501(c)(3) Non-Profit Determination")).toBeDefined();
    expect(screen.getByText("corp_registration.pdf")).toBeDefined();
    expect(screen.getByText("non_profit_exempt.pdf")).toBeDefined();
  });

  it("displays verification status badge for each document", () => {
    render(<CampaignComplianceDocumentsList campaignId="c1" initialDocuments={mockDocuments} />);

    expect(screen.getByText("Verified")).toBeDefined();
    expect(screen.getByText("Pending Review")).toBeDefined();
  });

  it("shows platform admin verification toggle button when isAdmin is true", () => {
    render(
      <CampaignComplianceDocumentsList
        campaignId="c1"
        initialDocuments={mockDocuments}
        isAdmin={true}
      />
    );

    expect(screen.getByText("Mark Verified")).toBeDefined();
    expect(screen.getByText("Revoke")).toBeDefined();
  });
});
