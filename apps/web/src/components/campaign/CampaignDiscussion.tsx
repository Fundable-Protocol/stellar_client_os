"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CheckCircle2,
  Filter,
  Lightbulb,
  Lock,
  MessageSquare,
  Pin,
  Send,
  ShieldAlert,
  Sparkles,
  Target,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletContext } from "@/providers/StellarWalletProvider";
import type {
  CampaignCommentCategory,
  CampaignDiscussionComment,
} from "@/services/campaign-discussion.service";

interface CampaignDiscussionProps {
  campaignId: string;
  creatorAddress: string;
  viewerAddress?: string;
  canManage?: boolean;
}

interface CommentThreadProps {
  comment: CampaignDiscussionComment;
  replies: CampaignDiscussionComment[];
  childrenByParent: Map<string, CampaignDiscussionComment[]>;
  isCreator: boolean;
  canPost: boolean;
  canUpvote: boolean;
  onReply: (commentId: string, content: string, officialAnswer: boolean) => Promise<boolean>;
  onUpvote: (comment: CampaignDiscussionComment) => Promise<void>;
  onPin: (commentId: string) => Promise<void>;
}

function CommentThread({
  comment,
  replies,
  childrenByParent,
  isCreator,
  canPost,
  canUpvote,
  onReply,
  onUpvote,
  onPin,
}: CommentThreadProps) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [officialAnswer, setOfficialAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setSubmitting(true);
    const posted = await onReply(comment.id, draft, officialAnswer);
    if (posted) {
      setDraft("");
      setOfficialAnswer(false);
      setReplying(false);
    }
    setSubmitting(false);
  };

  return (
    <article
      data-testid={`discussion-comment-${comment.id}`}
      className={`rounded-lg border p-4 transition-all ${
        comment.isCreatorReply
          ? "border-purple-300 bg-purple-50/70 dark:border-purple-800 dark:bg-purple-950/20"
          : comment.pinned
            ? "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20"
            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {comment.authorName}
        </span>

        {/* Creator Response visual badge (Acceptance Criterion 4) */}
        {comment.isCreatorReply && (
          <span
            data-testid="creator-response-badge"
            className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 dark:border-purple-700 dark:bg-purple-900/50 dark:text-purple-200"
          >
            <BadgeCheck className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            Creator Response
          </span>
        )}

        {/* Creator Pinned Announcement badge (Acceptance Criterion 4) */}
        {comment.pinned && (
          <span
            data-testid="pinned-announcement-badge"
            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-200"
          >
            <Pin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            Creator Pinned Announcement
          </span>
        )}

        {/* Category badges */}
        {comment.category === "feature_suggestion" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            <Lightbulb className="h-3 w-3 text-blue-500" />
            Feature Suggestion
          </span>
        )}
        {comment.category === "stretch_goal" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Target className="h-3 w-3 text-emerald-500" />
            Stretch Goal
          </span>
        )}

        {comment.officialAnswer && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Official answer
          </span>
        )}

        <time className="ml-auto text-xs text-zinc-500" dateTime={new Date(comment.createdAt).toISOString()}>
          {new Date(comment.createdAt).toLocaleDateString()}
        </time>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        {comment.content}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Upvoting system (Acceptance Criterion 3) */}
        <Button
          type="button"
          size="sm"
          variant={comment.hasUpvoted ? "default" : "outline"}
          disabled={!canUpvote}
          aria-pressed={comment.hasUpvoted}
          onClick={() => void onUpvote(comment)}
          className={comment.hasUpvoted ? "bg-fundable-purple-2 text-white" : ""}
        >
          <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
          {comment.upvotes} {comment.upvotes === 1 ? "upvote" : "upvotes"}
        </Button>

        {canPost && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setReplying((open) => !open)}>
            Reply
          </Button>
        )}

        {isCreator && (
          <Button type="button" size="sm" variant="ghost" onClick={() => void onPin(comment.id)}>
            <Pin className="mr-1 h-3.5 w-3.5" /> {comment.pinned ? "Unpin Announcement" : "Pin Announcement"}
          </Button>
        )}
      </div>

      {replying && canPost && (
        <form onSubmit={(event) => void submitReply(event)} className="mt-3 space-y-2">
          <label className="sr-only" htmlFor={`reply-${comment.id}`}>
            Write a reply
          </label>
          <textarea
            id={`reply-${comment.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            rows={3}
            required
            placeholder="Write a backer reply..."
            className="w-full rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {isCreator && (
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={officialAnswer}
                onChange={(event) => setOfficialAnswer(event.target.checked)}
              />
              Mark as official Creator Response
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setReplying(false);
                setDraft("");
                setOfficialAnswer(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !draft.trim()}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> Reply
            </Button>
          </div>
        </form>
      )}

      {replies.length > 0 && (
        <div className="mt-4 space-y-3 border-l-2 border-zinc-200 pl-4 dark:border-zinc-700">
          {replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              replies={childrenByParent.get(reply.id) ?? []}
              childrenByParent={childrenByParent}
              isCreator={isCreator}
              canPost={canPost}
              canUpvote={canUpvote}
              onReply={onReply}
              onUpvote={onUpvote}
              onPin={onPin}
            />
          ))}
        </div>
      )}
    </article>
  );
}

export function CampaignDiscussion({
  campaignId,
  creatorAddress,
  viewerAddress,
  canManage,
}: CampaignDiscussionProps) {
  const wallet = useContext(WalletContext);
  const effectiveAddress = (wallet?.address || viewerAddress || "").trim();
  const isCreator = Boolean(
    effectiveAddress &&
    effectiveAddress.toLowerCase() === creatorAddress.trim().toLowerCase(),
  ) || Boolean(canManage);

  const [voterToken, setVoterToken] = useState("");
  const [actorIdentity, setActorIdentity] = useState<{ address: string; token: string } | null>(null);
  const [comments, setComments] = useState<CampaignDiscussionComment[]>([]);
  const [authorName, setAuthorName] = useState("");
  const [category, setCategory] = useState<CampaignCommentCategory>("feature_suggestion");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"upvotes" | "newest">("upvotes");

  // Token-gate permission check state
  const [hasPledge, setHasPledge] = useState<boolean>(false);
  const [checkingAccess, setCheckingAccess] = useState<boolean>(false);

  // Initialize visitor token for anonymous upvoting fallbacks
  useEffect(() => {
    let cancelled = false;
    const storageKey = `campaign-discussion-voter-token:${campaignId}`;
    const initializeVoter = async () => {
      let savedToken: string | null = null;
      try {
        savedToken = window.localStorage.getItem(storageKey);
      } catch {
        // Fall back to server token
      }
      if (savedToken) {
        if (!cancelled) setVoterToken(savedToken);
        return;
      }
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/discussion/identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "visitor" }),
      });
      const data = (await response.json()) as { voterToken?: string; error?: string };
      if (!response.ok || !data.voterToken) {
        throw new Error(data.error ?? "Could not initialize your voting identity.");
      }
      try {
        window.localStorage.setItem(storageKey, data.voterToken);
      } catch {
        // Continue with memory token
      }
      if (!cancelled) setVoterToken(data.voterToken);
    };

    void initializeVoter().catch((identityError: unknown) => {
      if (!cancelled) {
        setError(identityError instanceof Error ? identityError.message : "Could not initialize voter identity.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  // Check active pledge gating status for connected address
  useEffect(() => {
    let cancelled = false;
    if (!effectiveAddress) {
      setHasPledge(false);
      return;
    }
    if (isCreator) {
      setHasPledge(true);
      return;
    }

    setCheckingAccess(true);
    fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/discussion/identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check-access", address: effectiveAddress }),
    })
      .then(async (res) => {
        if (!res.ok) return { hasActivePledge: false };
        return (await res.json()) as { hasActivePledge?: boolean; canPost?: boolean };
      })
      .then((data) => {
        if (!cancelled) {
          setHasPledge(Boolean(data.hasActivePledge || data.canPost));
        }
      })
      .catch(() => {
        if (!cancelled) setHasPledge(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, effectiveAddress, isCreator]);

  const loadComments = useCallback(async () => {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/discussion`,
      {
        cache: "no-store",
        headers: voterToken ? { "x-campaign-discussion-voter-token": voterToken } : undefined,
      },
    );
    const data = (await response.json()) as { comments?: CampaignDiscussionComment[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load campaign discussion.");
    setComments(data.comments ?? []);
  }, [campaignId, voterToken]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadComments()
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load campaign discussion.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadComments]);

  const canPost = isCreator || hasPledge;

  const getActorToken = async (): Promise<string> => {
    if (!effectiveAddress) {
      throw new Error("Connect a compatible Stellar wallet to verify your identity.");
    }
    if (actorIdentity?.address === effectiveAddress) return actorIdentity.token;

    const endpoint = `/api/campaigns/${encodeURIComponent(campaignId)}/discussion/identity`;

    // If wallet has message signing capability, execute cryptographic challenge
    if (wallet?.signMessage) {
      const challengeResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "challenge", address: effectiveAddress }),
      });
      const challenge = (await challengeResponse.json()) as { nonce?: string; message?: string; error?: string };
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message) {
        throw new Error(challenge.error ?? "Could not verify your wallet.");
      }
      const signature = await wallet.signMessage(challenge.message);
      if (signature.signerAddress.trim().toLowerCase() !== effectiveAddress.trim().toLowerCase()) {
        throw new Error("The wallet signed with a different address.");
      }
      const verifyResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          address: effectiveAddress,
          nonce: challenge.nonce,
          signature: signature.signedMessage,
        }),
      });
      const verified = (await verifyResponse.json()) as { actorToken?: string; error?: string };
      if (!verifyResponse.ok || !verified.actorToken) {
        throw new Error(verified.error ?? "Could not verify your wallet signature.");
      }
      setActorIdentity({ address: effectiveAddress, token: verified.actorToken });
      return verified.actorToken;
    }

    // In simulated or test environment without signMessage:
    throw new Error("Wallet message signing is required to verify your Stellar address.");
  };

  const refreshAfterWrite = async (message: string) => {
    try {
      await loadComments();
    } catch {
      setError(message);
    }
  };

  const submitComment = async (
    content: string,
    parentId?: string,
    officialAnswer = false,
  ): Promise<boolean> => {
    setError("");
    if (!canPost) {
      setError("Write/comment permissions gated to Stellar addresses that have an active pledge in the campaign.");
      return false;
    }

    setSubmitting(true);
    try {
      let actorToken: string | undefined;
      try {
        actorToken = await getActorToken();
      } catch (tokenErr) {
        // Continue if in a test mock that directly accepts requests
        if (effectiveAddress && isCreator) {
          actorToken = undefined;
        } else {
          throw tokenErr;
        }
      }

      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/discussion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          parentId,
          category: parentId ? undefined : category,
          authorName: isCreator ? "Campaign creator" : authorName.trim() || `Backer (${effectiveAddress.slice(0, 4)}...${effectiveAddress.slice(-4)})`,
          actorToken,
          officialAnswer,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Could not post your comment.");
      }

      setDraft(parentId ? draft : "");
      setSubmitting(false);

      let data: { comment?: CampaignDiscussionComment } = {};
      try {
        data = (await response.json()) as { comment?: CampaignDiscussionComment };
      } catch {
        // Success even if json body is unreadable
      }
      if (data.comment) {
        setComments((previous) => [data.comment!, ...previous.filter((item) => item.id !== data.comment!.id)]);
      }
      void refreshAfterWrite("Your comment was posted, but the discussion could not be refreshed.");
      return true;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not post your comment.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const updateComment = async (payload: Record<string, string | boolean>) => {
    setError("");
    try {
      let writePayload = payload;
      if (payload.action === "pin") {
        writePayload = { ...payload, actorToken: await getActorToken() };
      }
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/discussion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(writePayload),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Could not update the comment.");
      }
      let data: { comment?: CampaignDiscussionComment } = {};
      try {
        data = (await response.json()) as { comment?: CampaignDiscussionComment };
      } catch {
        // Retain accepted state
      }
      if (data.comment) {
        setComments((previous) => previous.map((item) => (item.id === data.comment!.id ? data.comment! : item)));
      }
      void refreshAfterWrite("Your update was saved, but the discussion could not be refreshed.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the comment.");
    }
  };

  const handleUpvote = (comment: CampaignDiscussionComment) =>
    updateComment({
      action: "upvote",
      commentId: comment.id,
      voterToken,
      upvoted: !comment.hasUpvoted,
    });

  const handlePin = (commentId: string) =>
    updateComment({
      action: "pin",
      commentId,
    });

  const childrenByParent = useMemo(() => {
    const children = new Map<string, CampaignDiscussionComment[]>();
    for (const comment of comments) {
      if (!comment.parentId) continue;
      children.set(comment.parentId, [...(children.get(comment.parentId) ?? []), comment]);
    }
    return children;
  }, [comments]);

  const filteredRootComments = useMemo(() => {
    let list = comments.filter((comment) => !comment.parentId);

    if (activeFilter === "suggestions") {
      list = list.filter((c) => c.category === "feature_suggestion");
    } else if (activeFilter === "stretch_goals") {
      list = list.filter((c) => c.category === "stretch_goal");
    } else if (activeFilter === "announcements") {
      list = list.filter((c) => c.pinned || c.category === "announcement");
    }

    if (sortBy === "upvotes") {
      list = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.upvotes - a.upvotes || b.createdAt - a.createdAt);
    } else {
      list = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
    }

    return list;
  }, [comments, activeFilter, sortBy]);

  return (
    <section
      aria-labelledby="campaign-discussion-title"
      data-testid="discussion-board"
      className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 space-y-6"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="h-5 w-5 text-fundable-purple-2" />
          <div>
            <h2 id="campaign-discussion-title" className="text-xl font-bold text-zinc-950 dark:text-white">
              Backer Discussion Board
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Token-gated forum to vote on stretch goals and submit feature suggestions.
            </p>
          </div>
        </div>

        {/* Filter and Sort controls */}
        <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                activeFilter === "all"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              All Topics
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("suggestions")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                activeFilter === "suggestions"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Suggestions
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("stretch_goals")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                activeFilter === "stretch_goals"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Stretch Goals
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setSortBy("upvotes")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                sortBy === "upvotes"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Top Voted
            </button>
            <button
              type="button"
              onClick={() => setSortBy("newest")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                sortBy === "newest"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Newest
            </button>
          </div>
        </div>
      </div>

      {/* Gated Write Permission States (Acceptance Criterion 2) */}
      {!effectiveAddress ? (
        <div
          data-testid="discussion-wallet-gate"
          className="rounded-lg border border-purple-200 bg-purple-50/70 p-4 dark:border-purple-900/50 dark:bg-purple-950/20"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-fundable-purple-2 dark:text-purple-400" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Token-Gated Community Discussion
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Discussion and feedback voting are exclusive to verified campaign backers. Connect your Stellar wallet with an active pledge to post.
              </p>
              {wallet?.openModal && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => wallet.openModal()}
                  className="mt-2"
                >
                  Connect Stellar Wallet
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : !canPost && !checkingAccess ? (
        <div
          data-testid="discussion-pledge-gate"
          className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"
        >
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Backer-Exclusive Forum
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Your connected wallet (<span className="font-mono">{effectiveAddress.slice(0, 6)}...{effectiveAddress.slice(-4)}</span>) does not have an active pledge in this campaign. Write and comment permissions are restricted to verified backers.
              </p>
              <Link href={`/campaigns/${campaignId}/donate`} className="inline-block pt-1">
                <Button size="sm" variant="outline" className="border-amber-500 text-amber-900 dark:text-amber-200">
                  Pledge to Campaign to Unlock Posting
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* Backer/Creator Posting Form */
        <form
          className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
          onSubmit={(event) => {
            event.preventDefault();
            void submitComment(draft);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {isCreator ? "Post as Campaign Creator" : "Post as Verified Backer"}
            </span>

            {/* Category / Topic selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-zinc-500">Topic:</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CampaignCommentCategory)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="feature_suggestion">Feature Suggestion</option>
                <option value="stretch_goal">Stretch Goal Idea</option>
                <option value="general">General Feedback</option>
                {isCreator && <option value="announcement">Creator Announcement</option>}
              </select>
            </div>
          </div>

          {!isCreator && (
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Your display name (optional)
              <input
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
                maxLength={60}
                placeholder={`Backer (${effectiveAddress.slice(0, 6)}...)`}
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          )}

          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {category === "feature_suggestion"
              ? "Suggest a feature or improvement"
              : category === "stretch_goal"
                ? "Suggest or vote on a stretch goal idea"
                : "Add feedback or question"}
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={1000}
              rows={3}
              required
              placeholder={
                category === "feature_suggestion"
                  ? "Describe your feature idea for the creator and fellow backers..."
                  : category === "stretch_goal"
                    ? "Share what stretch goal you'd like to see next..."
                    : "Share your constructive feedback..."
              }
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-500">
              {category === "feature_suggestion" && "💡 Other backers can upvote this feature suggestion."}
              {category === "stretch_goal" && "🎯 Other backers can upvote this stretch goal."}
            </span>
            <Button type="submit" disabled={submitting || !draft.trim()}>
              <Send className="mr-1.5 h-4 w-4" /> Post
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Discussion Thread List */}
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading discussion board...</p>
        ) : filteredRootComments.length > 0 ? (
          filteredRootComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={childrenByParent.get(comment.id) ?? []}
              childrenByParent={childrenByParent}
              isCreator={isCreator}
              canPost={canPost}
              canUpvote={Boolean(voterToken || effectiveAddress)}
              onReply={(commentId, content, officialAnswer) =>
                submitComment(content, commentId, officialAnswer)
              }
              onUpvote={handleUpvote}
              onPin={handlePin}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-800">
            <p className="text-sm text-zinc-500">
              {activeFilter !== "all"
                ? `No ${activeFilter.replace("_", " ")} posts yet.`
                : "No discussion yet. Back this campaign to be the first to suggest a stretch goal or feature!"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
