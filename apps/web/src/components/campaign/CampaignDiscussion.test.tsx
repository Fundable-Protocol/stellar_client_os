import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CampaignDiscussion } from "./CampaignDiscussion";
import type { CampaignDiscussionComment } from "@/services/campaign-discussion.service";

vi.mock("@/providers/StellarWalletProvider", async () => {
  const React = await import("react");
  return { WalletContext: React.createContext(undefined) };
});

const campaignId = "discussion-ui-test";
const comments: CampaignDiscussionComment[] = [];
let failCommentFetch = false;

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
}) as Response;

beforeEach(() => {
  comments.splice(0);
  failCommentFetch = false;
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/identity") && init?.method === "POST") {
      return jsonResponse({ voterToken: "test-voter-token" });
    }
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as {
        content: string;
        authorName: string;
        parentId?: string;
      };
      const comment: CampaignDiscussionComment = {
        id: `comment-${comments.length + 1}`,
        campaignId,
        parentId: body.parentId ?? null,
        authorName: body.authorName,
        content: body.content,
        createdAt: Date.now(),
        upvotes: 0,
        hasUpvoted: false,
        isCreatorReply: false,
        officialAnswer: false,
        pinned: false,
      };
      comments.push(comment);
      return jsonResponse({ comment }, 201);
    }
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { commentId: string; upvoted?: boolean };
      const comment = comments.find((item) => item.id === body.commentId);
      if (comment && body.upvoted !== undefined) {
        comment.upvotes += body.upvoted ? 1 : -1;
        comment.hasUpvoted = body.upvoted;
      }
      return jsonResponse({ comment });
    }
    expect(url).toContain(`/${campaignId}/discussion`);
    if (failCommentFetch) return jsonResponse({ error: "Refresh failed" }, 500);
    return jsonResponse({ comments: comments.map((comment) => ({ ...comment })) });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CampaignDiscussion", () => {
  it("lets a visitor post a comment and renders it in the thread", async () => {
    render(<CampaignDiscussion campaignId={campaignId} creatorAddress="GCREATOR" />);

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "River" } });
    fireEvent.change(screen.getByLabelText("Add a question or comment"), {
      target: { value: "When does the project begin?" },
    });
    const submitButton = screen.getByRole("button", { name: "Post comment" }) as HTMLButtonElement;
    await waitFor(() => expect(submitButton.disabled).toBe(false));
    fireEvent.click(submitButton);

    await waitFor(() => expect(comments.some((comment) => comment.content === "When does the project begin?")).toBe(true));
    expect(await screen.findByText("When does the project begin?", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("River", { selector: "span" })).toBeTruthy();
  });

  it("loads comments and allows posting when localStorage is unavailable", async () => {
    comments.push({
      id: "existing",
      campaignId,
      parentId: null,
      authorName: "Visitor",
      content: "Already posted",
      createdAt: Date.now(),
      upvotes: 0,
      hasUpvoted: false,
      isCreatorReply: false,
      officialAnswer: false,
      pinned: false,
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage is disabled.");
    });
    render(<CampaignDiscussion campaignId={campaignId} creatorAddress="GCREATOR" />);

    expect(await screen.findByText("Already posted", { selector: "p" })).toBeTruthy();
    expect(screen.getByLabelText("Add a question or comment")).toBeTruthy();
  });

  it("keeps a successful post when refreshing comments fails", async () => {
    failCommentFetch = true;
    render(<CampaignDiscussion campaignId={campaignId} creatorAddress="GCREATOR" />);
    const editor = screen.getByLabelText("Add a question or comment");
    fireEvent.change(editor, { target: { value: "Post once only" } });
    const submitButton = screen.getByRole("button", { name: "Post comment" });
    await waitFor(() => expect((submitButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submitButton);

    expect(await screen.findByText("Post once only", { selector: "p" })).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("Your comment was posted, but the discussion could not be refreshed.");
    expect((editor as HTMLTextAreaElement).value).toBe("");
    expect(vi.mocked(fetch).mock.calls.filter(([input, init]) =>
      String(input).endsWith("/discussion") && init?.method === "POST")).toHaveLength(1);
  });

  it("shows nested replies with creator and official-answer badges", async () => {
    comments.push({
      id: "question",
      campaignId,
      parentId: null,
      authorName: "Visitor",
      content: "How are funds used?",
      createdAt: Date.now(),
      upvotes: 0,
      hasUpvoted: false,
      isCreatorReply: false,
      officialAnswer: false,
      pinned: false,
    }, {
      id: "answer",
      campaignId,
      parentId: "question",
      authorName: "Campaign creator",
      content: "Funds support the field team.",
      createdAt: Date.now(),
      upvotes: 2,
      hasUpvoted: false,
      isCreatorReply: true,
      officialAnswer: true,
      pinned: true,
    });

    render(<CampaignDiscussion campaignId={campaignId} creatorAddress="GCREATOR" />);
    expect(await screen.findByText("Funds support the field team.")).toBeTruthy();
    expect(screen.getByText("Official answer")).toBeTruthy();
    expect(screen.getAllByText("Campaign creator")).toHaveLength(2);
    expect(screen.getByText("Pinned")).toBeTruthy();
  });

  it("refreshes the displayed vote count after upvoting", async () => {
    comments.push({
      id: "question",
      campaignId,
      parentId: null,
      authorName: "Visitor",
      content: "A useful question",
      createdAt: Date.now(),
      upvotes: 0,
      hasUpvoted: false,
      isCreatorReply: false,
      officialAnswer: false,
      pinned: false,
    });
    render(<CampaignDiscussion campaignId={campaignId} creatorAddress="GCREATOR" />);
    const voteButton = await screen.findByRole("button", { name: "0 upvotes" });
    await waitFor(() => expect((voteButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(voteButton);

    await waitFor(() => expect(screen.getByRole("button", { name: "1 upvote" })).toBeTruthy());
  });

  it("does not reverse a successful upvote when refreshing fails", async () => {
    comments.push({
      id: "question",
      campaignId,
      parentId: null,
      authorName: "Visitor",
      content: "A useful question",
      createdAt: Date.now(),
      upvotes: 0,
      hasUpvoted: false,
      isCreatorReply: false,
      officialAnswer: false,
      pinned: false,
    });
    render(<CampaignDiscussion campaignId={campaignId} creatorAddress="GCREATOR" />);
    const voteButton = await screen.findByRole("button", { name: "0 upvotes" });
    await waitFor(() => expect((voteButton as HTMLButtonElement).disabled).toBe(false));
    failCommentFetch = true;
    fireEvent.click(voteButton);

    expect(await screen.findByRole("button", { name: "1 upvote" })).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("Your update was saved, but the discussion could not be refreshed.");
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  });
});
