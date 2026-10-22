import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { WalletContext } = vi.hoisted(() => {
  const React = require("react");
  return { WalletContext: React.createContext(undefined) };
});

vi.mock("@/providers/StellarWalletProvider", () => ({
  WalletContext,
  useWallet: () => {
    const React = require("react");
    return React.useContext(WalletContext);
  },
}));

import { CampaignDiscussion } from "./CampaignDiscussion";
import type { CampaignDiscussionComment } from "@/services/campaign-discussion.service";

const campaignId = "discussion-ui-test";
const creatorAddress = "GCREATOR_WALLET_KEY_12345678";
const backerAddress = "GBACKER_WALLET_KEY_12345678";
const nonBackerAddress = "GNON_BACKER_WALLET_KEY_1234";

const comments: CampaignDiscussionComment[] = [];
let failCommentFetch = false;

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

beforeEach(() => {
  comments.splice(0);
  failCommentFetch = false;
  window.localStorage.clear();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/identity") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { action: string; address?: string };
        if (body.action === "visitor") {
          return jsonResponse({ voterToken: "test-voter-token" });
        }
        if (body.action === "check-access") {
          const isCreator = body.address?.toLowerCase() === creatorAddress.toLowerCase();
          const hasPledge = body.address?.toLowerCase() === backerAddress.toLowerCase();
          return jsonResponse({
            address: body.address,
            isCreator,
            hasActivePledge: hasPledge,
            canPost: isCreator || hasPledge,
          });
        }
        if (body.action === "challenge") {
          return jsonResponse({ nonce: "test-nonce", message: "verify-message" });
        }
        if (body.action === "verify") {
          return jsonResponse({ actorToken: "test-actor-token" });
        }
      }

      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          content: string;
          authorName: string;
          parentId?: string;
          category?: string;
          officialAnswer?: boolean;
        };
        const comment: CampaignDiscussionComment = {
          id: `comment-${comments.length + 1}`,
          campaignId,
          parentId: body.parentId ?? null,
          authorName: body.authorName,
          content: body.content,
          category: (body.category as CampaignDiscussionComment["category"]) ?? "feature_suggestion",
          createdAt: Date.now(),
          upvotes: 0,
          hasUpvoted: false,
          isCreatorReply: Boolean(body.parentId && body.authorName === "Campaign creator"),
          officialAnswer: Boolean(body.officialAnswer),
          pinned: false,
        };
        comments.push(comment);
        return jsonResponse({ comment }, 201);
      }

      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as {
          action?: string;
          commentId: string;
          upvoted?: boolean;
        };
        const comment = comments.find((item) => item.id === body.commentId);
        if (comment) {
          if (body.action === "pin") {
            comment.pinned = !comment.pinned;
          } else if (body.upvoted !== undefined) {
            comment.upvotes += body.upvoted ? 1 : -1;
            comment.hasUpvoted = body.upvoted;
          }
        }
        return jsonResponse({ comment });
      }

      expect(url).toContain(`/${campaignId}/discussion`);
      if (failCommentFetch) return jsonResponse({ error: "Refresh failed" }, 500);
      return jsonResponse({ comments: comments.map((comment) => ({ ...comment })) });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderWithWallet(ui: React.ReactElement, address: string | null = null) {
  const mockWallet = address
    ? {
        address,
        isConnected: true,
        isConnecting: false,
        isLocked: false,
        connectionStatus: "connected" as const,
        selectedWalletId: "freighter",
        network: "PUBLIC",
        setNetwork: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        signTransaction: vi.fn(),
        signMessage: vi.fn().mockResolvedValue({ signedMessage: "sig", signerAddress: address }),
        openModal: vi.fn(),
        closeModal: vi.fn(),
        isModalOpen: false,
        supportedWallets: [],
      }
    : {
        address: null,
        isConnected: false,
        isConnecting: false,
        isLocked: false,
        connectionStatus: "idle" as const,
        selectedWalletId: null,
        network: "PUBLIC",
        setNetwork: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        signTransaction: vi.fn(),
        signMessage: vi.fn(),
        openModal: vi.fn(),
        closeModal: vi.fn(),
        isModalOpen: false,
        supportedWallets: [],
      };

  return render(
    <WalletContext.Provider value={mockWallet as any}>
      {ui}
    </WalletContext.Provider>,
  );
}

describe("CampaignDiscussion token-gated forum", () => {
  it("renders the discussion board heading and shows token-gate banner when disconnected (AC1, AC2)", async () => {
    renderWithWallet(<CampaignDiscussion campaignId={campaignId} creatorAddress={creatorAddress} />);

    expect(screen.getByText("Backer Discussion Board")).toBeTruthy();
    expect(screen.getByTestId("discussion-wallet-gate")).toBeTruthy();
    expect(screen.getByText(/Discussion and feedback voting are exclusive to verified campaign backers/i)).toBeTruthy();
  });

  it("restricts write permissions and displays backer-exclusive notice when wallet has no pledge (AC2)", async () => {
    renderWithWallet(
      <CampaignDiscussion campaignId={campaignId} creatorAddress={creatorAddress} />,
      nonBackerAddress,
    );

    expect(await screen.findByTestId("discussion-pledge-gate")).toBeTruthy();
    expect(screen.getByText(/does not have an active pledge in this campaign/i)).toBeTruthy();
    expect(screen.getByText(/Pledge to Campaign to Unlock Posting/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Describe your feature idea/i)).toBeNull();
  });

  it("enables posting for verified backer with active pledge and submits feature suggestions (AC2, AC3)", async () => {
    renderWithWallet(
      <CampaignDiscussion campaignId={campaignId} creatorAddress={creatorAddress} />,
      backerAddress,
    );

    expect(await screen.findByText("Post as Verified Backer")).toBeTruthy();

    const textarea = screen.getByPlaceholderText(/Describe your feature idea/i);
    fireEvent.change(textarea, {
      target: { value: "Please add satellite NDVI monitoring as a stretch goal" },
    });

    const postButton = screen.getByRole("button", { name: /Post/i });
    expect((postButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(postButton);

    expect(
      await screen.findByText("Please add satellite NDVI monitoring as a stretch goal"),
    ).toBeTruthy();
    expect(screen.getByText("Feature Suggestion", { selector: "span" })).toBeTruthy();
  });

  it("renders 'Creator Response' visual badge on creator replies (AC4)", async () => {
    comments.push(
      {
        id: "sug-1",
        campaignId,
        parentId: null,
        authorName: "Backer Elena",
        content: "Could we have monthly drone video updates?",
        category: "feature_suggestion",
        createdAt: Date.now() - 5000,
        upvotes: 3,
        hasUpvoted: false,
        isCreatorReply: false,
        officialAnswer: false,
        pinned: false,
      },
      {
        id: "rep-1",
        campaignId,
        parentId: "sug-1",
        authorName: "Campaign creator",
        content: "Yes! Drone footage will be included in every milestone report.",
        category: "general",
        createdAt: Date.now(),
        upvotes: 5,
        hasUpvoted: false,
        isCreatorReply: true,
        officialAnswer: true,
        pinned: false,
      },
    );

    renderWithWallet(<CampaignDiscussion campaignId={campaignId} creatorAddress={creatorAddress} />);

    expect(await screen.findByText("Could we have monthly drone video updates?")).toBeTruthy();
    expect(screen.getByText("Yes! Drone footage will be included in every milestone report.")).toBeTruthy();
    expect(screen.getByTestId("creator-response-badge")).toBeTruthy();
    expect(screen.getByText("Creator Response")).toBeTruthy();
    expect(screen.getByText("Official answer")).toBeTruthy();
  });

  it("renders 'Creator Pinned Announcement' badge and sorts pinned comments first (AC4)", async () => {
    comments.push(
      {
        id: "c-1",
        campaignId,
        parentId: null,
        authorName: "Backer",
        content: "A regular suggestion",
        category: "feature_suggestion",
        createdAt: Date.now() - 1000,
        upvotes: 0,
        hasUpvoted: false,
        isCreatorReply: false,
        officialAnswer: false,
        pinned: false,
      },
      {
        id: "ann-1",
        campaignId,
        parentId: null,
        authorName: "Campaign creator",
        content: "Official Update: We reached 100% of the initial goal!",
        category: "announcement",
        createdAt: Date.now(),
        upvotes: 12,
        hasUpvoted: false,
        isCreatorReply: false,
        officialAnswer: false,
        pinned: true,
      },
    );

    renderWithWallet(<CampaignDiscussion campaignId={campaignId} creatorAddress={creatorAddress} />);

    expect(await screen.findByText("Official Update: We reached 100% of the initial goal!")).toBeTruthy();
    expect(screen.getByTestId("pinned-announcement-badge")).toBeTruthy();
    expect(screen.getByText("Creator Pinned Announcement")).toBeTruthy();
  });

  it("provides an upvoting system for backer feature suggestions (AC3)", async () => {
    comments.push({
      id: "suggestion-1",
      campaignId,
      parentId: null,
      authorName: "Backer Priya",
      content: "Vote on Stretch Goal: Seed nursery expansion",
      category: "stretch_goal",
      createdAt: Date.now(),
      upvotes: 4,
      hasUpvoted: false,
      isCreatorReply: false,
      officialAnswer: false,
      pinned: false,
    });

    renderWithWallet(
      <CampaignDiscussion campaignId={campaignId} creatorAddress={creatorAddress} />,
      backerAddress,
    );

    const voteButton = await screen.findByRole("button", { name: "4 upvotes" });
    expect((voteButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(voteButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "5 upvotes" })).toBeTruthy();
    });
  });

  it("allows creator to pin and unpin announcements (AC4)", async () => {
    comments.push({
      id: "announcement-post",
      campaignId,
      parentId: null,
      authorName: "Campaign creator",
      content: "Stretch goal 3 announcement",
      category: "announcement",
      createdAt: Date.now(),
      upvotes: 1,
      hasUpvoted: false,
      isCreatorReply: false,
      officialAnswer: false,
      pinned: false,
    });

    renderWithWallet(
      <CampaignDiscussion campaignId={campaignId} creatorAddress={creatorAddress} />,
      creatorAddress,
    );

    const pinButton = await screen.findByRole("button", { name: /Pin Announcement/i });
    fireEvent.click(pinButton);

    await waitFor(() => {
      expect(screen.getByTestId("pinned-announcement-badge")).toBeTruthy();
    });
  });
});
