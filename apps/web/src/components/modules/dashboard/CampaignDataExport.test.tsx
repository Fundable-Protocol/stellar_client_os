import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CampaignDataExport from "./CampaignDataExport";

const TEST_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const mockUseWallet = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/providers/StellarWalletProvider", () => ({
  useWallet: () => mockUseWallet(),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockCampaigns(campaigns: Array<{ id: string; status: string }>) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("creator-stats")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { campaigns } }),
      });
    }
    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(["data"])),
      headers: new Headers({
        "Content-Disposition": 'attachment; filename="campaign-backers.csv"',
      }),
    });
  });
}

describe("CampaignDataExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({ address: TEST_ADDRESS });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      value: vi.fn(() => "blob:campaign-export"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("lists the creator campaigns and downloads the backer CSV", async () => {
    mockCampaigns([
      { id: "1", status: "Active" },
      { id: "2", status: "Successful" },
    ]);

    renderWithQuery(<CampaignDataExport />);

    const csvButton = screen.getByTestId("campaign-export-csv") as HTMLButtonElement;
    await waitFor(() => expect(csvButton.disabled).toBe(false));
    expect(screen.getByTestId("campaign-export-select")).toBeTruthy();
    expect(screen.getByText("Campaign #1 · Active")).toBeTruthy();

    fireEvent.click(csvButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/campaigns/1/export?report=backers&format=csv",
      ),
    );
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });

  it("requests a PDF analytics report", async () => {
    mockCampaigns([{ id: "1", status: "Active" }]);

    renderWithQuery(<CampaignDataExport />);

    const pdfButton = screen.getByTestId("campaign-export-pdf") as HTMLButtonElement;
    await waitFor(() => expect(pdfButton.disabled).toBe(false));
    fireEvent.click(pdfButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/campaigns/1/export?report=analytics&format=pdf",
      ),
    );
  });

  it("disables exports when the creator has no campaigns", async () => {
    mockCampaigns([]);

    renderWithQuery(<CampaignDataExport />);

    await waitFor(() =>
      expect(screen.getByText("Create a campaign to unlock data exports.")).toBeTruthy(),
    );
    expect((screen.getByTestId("campaign-export-csv") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId("campaign-export-pdf") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("asks an unconnected creator to connect a wallet", () => {
    mockUseWallet.mockReturnValue({ address: null });

    renderWithQuery(<CampaignDataExport />);

    expect(
      screen.getByText("Connect your Stellar wallet to export your campaign data."),
    ).toBeTruthy();
    expect((screen.getByTestId("campaign-export-csv") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
