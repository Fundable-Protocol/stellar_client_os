import React from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { installJsdomLayout } from "@/test-utils/jsdom-layout";
import { CampaignSearch } from "./CampaignSearch";

let restoreLayout: () => void;

beforeAll(() => {
  restoreLayout = installJsdomLayout(1200, 600);
});

afterAll(() => {
  restoreLayout();
});

describe("CampaignSearch", () => {
  it("renders the discovery results as an accessible virtualized list", () => {
    render(<CampaignSearch />);

    const list = screen.getByRole("list", { name: "Campaign results" });
    expect(list).toBeTruthy();
    // The scrollable region must be reachable with the keyboard.
    expect(list.getAttribute("tabindex")).toBe("0");

    expect(screen.getByText("Amazon Rainforest Reforestation Initiative")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  it("re-renders the virtualized window when filters change", () => {
    render(<CampaignSearch />);

    fireEvent.click(screen.getByRole("button", { name: "Paused" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Sub-Saharan Acacia Agroforestry Expansion")).toBeTruthy();
    expect(screen.queryByText("Amazon Rainforest Reforestation Initiative")).toBeNull();
  });
});
