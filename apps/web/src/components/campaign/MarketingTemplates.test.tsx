import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MarketingTemplates } from "./MarketingTemplates";
import { MARKETING_TEMPLATE_SECTIONS } from "./marketing-templates.data";

describe("MarketingTemplates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders the toolkit heading", () => {
    render(<MarketingTemplates />);
    expect(
      screen.getByText("Campaign Creator Toolkit: Marketing Templates"),
    ).toBeTruthy();
  });

  it("renders email templates section", () => {
    render(<MarketingTemplates />);
    expect(screen.getByText("Email Templates")).toBeTruthy();
  });

  it("renders social media graphics section", () => {
    render(<MarketingTemplates />);
    expect(screen.getByText("Social Media Graphics")).toBeTruthy();
  });

  it("renders fundraising pitch decks section", () => {
    render(<MarketingTemplates />);
    expect(screen.getByText("Fundraising Pitch Decks")).toBeTruthy();
  });

  it("renders every template from the data module", () => {
    render(<MarketingTemplates />);
    for (const section of MARKETING_TEMPLATE_SECTIONS) {
      for (const template of section.templates) {
        expect(screen.getByText(template.title)).toBeTruthy();
        expect(screen.getByText(template.filename)).toBeTruthy();
      }
    }
  });

  it("copies a template's full content to the clipboard", async () => {
    render(<MarketingTemplates />);

    fireEvent.click(screen.getByLabelText("Copy Campaign Launch Email"));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Subject: Introducing {{campaignTitle}}"),
    );
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("downloads a template as a file", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:marketing-template");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<MarketingTemplates />);
    fireEvent.click(screen.getByLabelText("Download Twitter / X Graphic"));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:marketing-template");

    clickSpy.mockRestore();
    vi.restoreAllMocks();
  });
});
