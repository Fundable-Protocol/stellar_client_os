// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DonorNftBadgeCard, type DonorNftBadge } from "./DonorNftBadgeCard";
import { DonorNftBadgeGrid } from "./DonorNftBadgeGrid";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BADGE: DonorNftBadge = {
  tokenId: "42",
  name: "Early Backer",
  description: "Awarded to early contributors who helped launch the platform.",
  tier: "gold",
  rarity: "rare",
  donorAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  mintedAt: "2025-01-15T10:30:00Z",
  contributionAmount: "1,000.00",
  contributionToken: "USDC",
  explorerUrl: "https://stellar.expert/explorer/testnet/tx/abc",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── DonorNftBadgeCard — rendering ─────────────────────────────────────────────

describe("DonorNftBadgeCard — rendering", () => {
  it("renders the badge name", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    expect(screen.getByText("Early Backer")).toBeTruthy();
  });

  it("renders the description", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    expect(screen.getByText(/early contributors/i)).toBeTruthy();
  });

  it("renders the contribution amount and token", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    expect(screen.getByText("1,000.00")).toBeTruthy();
    expect(screen.getByText("USDC")).toBeTruthy();
  });

  it("renders the rarity label", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    expect(screen.getByText("Rare")).toBeTruthy();
  });

  it("renders a truncated donor address", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    // sliceAddress(address, 4, 5) → GAAA...AWHF
    expect(screen.getByText("GAAA...AWHF")).toBeTruthy();
  });

  it("renders the explorer link with correct href", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    const link = screen.getByRole("link", { name: /view.*stellar explorer/i });
    expect(link.getAttribute("href")).toBe(BADGE.explorerUrl);
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("does not render explorer link when explorerUrl is absent", () => {
    const badge = { ...BADGE, explorerUrl: undefined };
    render(<DonorNftBadgeCard badge={badge} />);
    expect(screen.queryByRole("link", { name: /explorer/i })).toBeNull();
  });

  it("does not render contribution section when amount is absent", () => {
    const badge = { ...BADGE, contributionAmount: undefined };
    render(<DonorNftBadgeCard badge={badge} />);
    expect(screen.queryByText("Contribution:")).toBeNull();
  });

  it("renders the minted date in readable format", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    expect(screen.getByText(/jan 2025/i)).toBeTruthy();
  });

  it("renders all five tiers without throwing", () => {
    const tiers = ["bronze", "silver", "gold", "platinum", "legendary"] as const;
    for (const tier of tiers) {
      const { unmount } = render(
        <DonorNftBadgeCard badge={{ ...BADGE, tier }} />
      );
      expect(screen.getAllByTestId("nft-badge-card").length).toBeGreaterThan(0);
      unmount();
    }
  });
});

// ── DonorNftBadgeCard — accessibility ─────────────────────────────────────────

describe("DonorNftBadgeCard — accessibility", () => {
  it("has role='article' with descriptive aria-label", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    const article = screen.getByRole("article");
    expect(article.getAttribute("aria-label")).toContain("Early Backer");
    expect(article.getAttribute("aria-label")).toContain("Gold");
  });

  it("donor address span has aria-label with full address", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    const span = screen.getByLabelText(/donor address:/i);
    expect(span.getAttribute("title")).toBe(BADGE.donorAddress);
  });

  it("rarity span has aria-label", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    expect(screen.getByLabelText(/rarity: rare/i)).toBeTruthy();
  });

  it("is keyboard-focusable when interactive", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    const card = screen.getByRole("article");
    expect(card.getAttribute("tabindex")).toBe("0");
  });

  it("is NOT focusable when interactive=false", () => {
    render(<DonorNftBadgeCard badge={BADGE} interactive={false} />);
    const card = screen.getByRole("article");
    expect(card.getAttribute("tabindex")).toBeNull();
  });

  it("explorer link opens in new tab with rel noopener", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    const link = screen.getByRole("link", { name: /stellar explorer/i });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

// ── DonorNftBadgeCard — interactions ──────────────────────────────────────────

describe("DonorNftBadgeCard — interactions", () => {
  it("calls onClick when card is clicked", () => {
    const onClick = vi.fn();
    render(<DonorNftBadgeCard badge={BADGE} onClick={onClick} />);
    fireEvent.click(screen.getByRole("article"));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledWith(BADGE);
  });

  it("calls onClick when Enter key is pressed", () => {
    const onClick = vi.fn();
    render(<DonorNftBadgeCard badge={BADGE} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole("article"), { key: "Enter" });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("calls onClick when Space key is pressed", () => {
    const onClick = vi.fn();
    render(<DonorNftBadgeCard badge={BADGE} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole("article"), { key: " " });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does NOT call onClick when interactive=false", () => {
    const onClick = vi.fn();
    render(<DonorNftBadgeCard badge={BADGE} interactive={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole("article"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("explorer link click does not propagate to card onClick", () => {
    const onClick = vi.fn();
    render(<DonorNftBadgeCard badge={BADGE} onClick={onClick} />);
    const link = screen.getByRole("link", { name: /stellar explorer/i });
    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });
});

// ── DonorNftBadgeCard — data-attributes ──────────────────────────────────────

describe("DonorNftBadgeCard — data attributes", () => {
  it("sets data-tier attribute", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    expect(screen.getByTestId("nft-badge-card").getAttribute("data-tier")).toBe("gold");
  });

  it("sets data-rarity attribute", () => {
    render(<DonorNftBadgeCard badge={BADGE} />);
    expect(screen.getByTestId("nft-badge-card").getAttribute("data-rarity")).toBe("rare");
  });
});

// ── DonorNftBadgeGrid ─────────────────────────────────────────────────────────

describe("DonorNftBadgeGrid", () => {
  it("renders all badge cards", () => {
    const badges: DonorNftBadge[] = [
      { ...BADGE, tokenId: "1", name: "Badge One" },
      { ...BADGE, tokenId: "2", name: "Badge Two" },
      { ...BADGE, tokenId: "3", name: "Badge Three" },
    ];
    render(<DonorNftBadgeGrid badges={badges} />);
    expect(screen.getAllByTestId("nft-badge-card")).toHaveLength(3);
  });

  it("renders skeleton cards when loading", () => {
    render(<DonorNftBadgeGrid badges={[]} isLoading skeletonCount={4} />);
    // Skeletons are aria-hidden so use querySelector
    const { container } = render(
      <DonorNftBadgeGrid badges={[]} isLoading skeletonCount={4} />
    );
    const skeletons = container.querySelectorAll("[aria-hidden=true]");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no badges and not loading", () => {
    render(<DonorNftBadgeGrid badges={[]} />);
    expect(screen.getByRole("status", { name: /no nft badges/i })).toBeTruthy();
  });

  it("renders error state when error is provided", () => {
    render(<DonorNftBadgeGrid badges={[]} error="Failed to load badges" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Failed to load badges")).toBeTruthy();
  });

  it("has accessible section label", () => {
    render(<DonorNftBadgeGrid badges={[]} />);
    expect(screen.getByRole("region", { name: /donor nft badge/i })).toBeTruthy();
  });

  it("sets aria-busy=true when loading", () => {
    render(<DonorNftBadgeGrid badges={[]} isLoading />);
    const section = screen.getByRole("region", { name: /donor nft badge/i });
    expect(section.getAttribute("aria-busy")).toBe("true");
  });

  it("does not render cards when loading (shows skeletons instead)", () => {
    render(
      <DonorNftBadgeGrid
        badges={[{ ...BADGE, tokenId: "1" }]}
        isLoading
      />
    );
    expect(screen.queryByTestId("nft-badge-card")).toBeNull();
  });

  it("calls onBadgeClick with badge data when card is clicked", () => {
    const onClick = vi.fn();
    render(
      <DonorNftBadgeGrid
        badges={[{ ...BADGE, tokenId: "1", name: "Click Me" }]}
        onBadgeClick={onClick}
      />
    );
    fireEvent.click(screen.getByRole("article"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
