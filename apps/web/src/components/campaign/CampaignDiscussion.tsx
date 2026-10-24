"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MessageSquare, Pin, Send, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletContext } from "@/providers/StellarWalletProvider";
import type { CampaignDiscussionComment } from "@/services/campaign-discussion.service";

interface CampaignDiscussionProps {
  campaignId: string;
  creatorAddress: string;
}

interface CommentThreadProps {
  comment: CampaignDiscussionComment;
  replies: CampaignDiscussionComment[];
  childrenByParent: Map<string, CampaignDiscussionComment[]>;
  isCreator: boolean;
  canUpvote: boolean;
  onReply: (commentId: string, content: string, officialAnswer: boolean) => Promise<boolean>;
  onUpvote: (comment: CampaignDiscussionComment) => Promise<void>;
  onPin: (commentId: string) => Promise<void>;
}

function CommentThread({ comment, replies, childrenByParent, isCreator, canUpvote, onReply, onUpvote, onPin }: CommentThreadProps) {
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
    <article className={`rounded-lg border p-4 ${comment.isCreatorReply
      ? "border-purple-300 bg-purple-50/70 dark:border-purple-800 dark:bg-purple-950/20"
      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{comment.authorName}</span>
        {comment.isCreatorReply && (
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/50 dark:text-purple-200">
            Campaign creator
          </span>
        )}
        {comment.officialAnswer && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
            Official answer
          </span>
        )}
        {comment.pinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            <Pin className="h-3 w-3" /> Pinned
          </span>
        )}
        <time className="ml-auto text-xs text-zinc-500" dateTime={new Date(comment.createdAt).toISOString()}>
          {new Date(comment.createdAt).toLocaleDateString()}
        </time>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700 dark:text-zinc-300">{comment.content}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canUpvote}
          aria-pressed={comment.hasUpvoted}
          onClick={() => void onUpvote(comment)}
        >
          <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
          {comment.upvotes} {comment.upvotes === 1 ? "upvote" : "upvotes"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setReplying((open) => !open)}>
          Reply
        </Button>
        {isCreator && (
          <Button type="button" size="sm" variant="ghost" onClick={() => void onPin(comment.id)}>
            <Pin className="mr-1 h-3.5 w-3.5" /> {comment.pinned ? "Unpin" : "Pin"}
          </Button>
        )}
      </div>

      {replying && (
        <form onSubmit={(event) => void submitReply(event)} className="mt-3 space-y-2">
          <label className="sr-only" htmlFor={`reply-${comment.id}`}>Write a reply</label>
          <textarea
            id={`reply-${comment.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            rows={3}
            required
            placeholder="Write a reply..."
            className="w-full rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {isCreator && (
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={officialAnswer}
                onChange={(event) => setOfficialAnswer(event.target.checked)}
              />
              Mark as an official answer
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

export function CampaignDiscussion({ campaignId, creatorAddress }: CampaignDiscussionProps) {
  const wallet = useContext(WalletContext);
  const walletAddress = wallet?.address ?? "";
  const isCreator = Boolean(walletAddress
    && walletAddress.trim().toLowerCase() === creatorAddress.trim().toLowerCase());
  const [voterToken, setVoterToken] = useState("");
  const [actorIdentity, setActorIdentity] = useState<{ address: string; token: string } | null>(null);
  const [comments, setComments] = useState<CampaignDiscussionComment[]>([]);
  const [authorName, setAuthorName] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const storageKey = `campaign-discussion-voter-token:${campaignId}`;
    const initializeVoter = async () => {
      let savedToken: string | null = null;
      try {
        savedToken = window.localStorage.getItem(storageKey);
      } catch {
        // Continue with an in-memory token when browser storage is unavailable.
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
      const data = await response.json() as { voterToken?: string; error?: string };
      if (!response.ok || !data.voterToken) {
        throw new Error(data.error ?? "Could not initialize your voting identity.");
      }
      try {
        window.localStorage.setItem(storageKey, data.voterToken);
      } catch {
        // Keep the server-issued token for this page view.
      }
      if (!cancelled) setVoterToken(data.voterToken);
    };
    void initializeVoter().catch((identityError: unknown) => {
      if (!cancelled) {
        setError(identityError instanceof Error ? identityError.message : "Could not initialize your voting identity.");
      }
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  const loadComments = useCallback(async () => {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/discussion`,
      {
        cache: "no-store",
        headers: voterToken ? { "x-campaign-discussion-voter-token": voterToken } : undefined,
      },
    );
    const data = await response.json() as { comments?: CampaignDiscussionComment[]; error?: string };
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
    return () => { cancelled = true; };
  }, [loadComments]);

  const childrenByParent = useMemo(() => {
    const children = new Map<string, CampaignDiscussionComment[]>();
    for (const comment of comments) {
      if (!comment.parentId) continue;
      children.set(comment.parentId, [...(children.get(comment.parentId) ?? []), comment]);
    }
    return children;
  }, [comments]);
  const rootComments = useMemo(
    () => comments.filter((comment) => !comment.parentId),
    [comments],
  );

  const getActorToken = async (): Promise<string> => {
    if (!walletAddress || !wallet?.signMessage) {
      throw new Error("Connect a compatible wallet to verify your creator identity.");
    }
    if (actorIdentity?.address === walletAddress) return actorIdentity.token;

    const endpoint = `/api/campaigns/${encodeURIComponent(campaignId)}/discussion/identity`;
    const challengeResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "challenge", address: walletAddress }),
    });
    const challenge = await challengeResponse.json() as { nonce?: string; message?: string; error?: string };
    if (!challengeResponse.ok || !challenge.nonce || !challenge.message) {
      throw new Error(challenge.error ?? "Could not verify your wallet.");
    }
    const signature = await wallet.signMessage(challenge.message);
    if (signature.signerAddress.trim().toLowerCase() !== walletAddress.trim().toLowerCase()) {
      throw new Error("The wallet signed with a different address.");
    }
    const verifyResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "verify",
        address: walletAddress,
        nonce: challenge.nonce,
        signature: signature.signedMessage,
      }),
    });
    const verified = await verifyResponse.json() as { actorToken?: string; error?: string };
    if (!verifyResponse.ok || !verified.actorToken) {
      throw new Error(verified.error ?? "Could not verify your wallet signature.");
    }
    setActorIdentity({ address: walletAddress, token: verified.actorToken });
    return verified.actorToken;
  };

  const refreshAfterWrite = async (message: string) => {
    try {
      await loadComments();
    } catch {
      setError(message);
    }
  };

  const submitComment = async (content: string, parentId?: string, officialAnswer = false): Promise<boolean> => {
    setError("");
    setSubmitting(true);
    try {
      const actorToken = isCreator || officialAnswer ? await getActorToken() : undefined;
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/discussion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          parentId,
          authorName: isCreator ? "Campaign creator" : (authorName.trim() || "Visitor"),
          actorToken,
          officialAnswer,
        }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "Could not post your comment.");
      }
      setDraft(parentId ? draft : "");
      setSubmitting(false);
      let data: { comment?: CampaignDiscussionComment } = {};
      try {
        data = await response.json() as { comment?: CampaignDiscussionComment };
      } catch {
        // The accepted write remains successful if its response body is unreadable.
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
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "Could not update the comment.");
      }
      let data: { comment?: CampaignDiscussionComment } = {};
      try {
        data = await response.json() as { comment?: CampaignDiscussionComment };
      } catch {
        // The accepted update remains successful if its response body is unreadable.
      }
      if (data.comment) {
        setComments((previous) => previous.map((item) => item.id === data.comment!.id ? data.comment! : item));
      }
      void refreshAfterWrite("Your update was saved, but the discussion could not be refreshed.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the comment.");
    }
  };

  const handleUpvote = (comment: CampaignDiscussionComment) => updateComment({
    action: "upvote",
    commentId: comment.id,
    voterToken,
    upvoted: !comment.hasUpvoted,
  });
  const handlePin = (commentId: string) => updateComment({
    action: "pin",
    commentId,
  });

  return (
    <section aria-labelledby="campaign-discussion-title" className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-fundable-purple-2" />
        <h2 id="campaign-discussion-title" className="text-xl font-bold text-zinc-950 dark:text-white">
          Questions &amp; comments
        </h2>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Ask the creator a question or join the campaign discussion.
      </p>

      <form
        className="mt-5 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submitComment(draft);
        }}
      >
        {!isCreator && (
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Your name
            <input
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              maxLength={60}
              placeholder="Visitor"
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
        )}
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Add a question or comment
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            rows={3}
            required
            placeholder="What would you like to know about this campaign?"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !draft.trim()}>
            <Send className="mr-1.5 h-4 w-4" /> Post comment
          </Button>
        </div>
      </form>

      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-6 space-y-4">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading discussion...</p>
        ) : rootComments.length > 0 ? (
          rootComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={childrenByParent.get(comment.id) ?? []}
              childrenByParent={childrenByParent}
              isCreator={isCreator}
              canUpvote={Boolean(voterToken)}
              onReply={(commentId, content, officialAnswer) => submitComment(content, commentId, officialAnswer)}
              onUpvote={handleUpvote}
              onPin={handlePin}
            />
          ))
        ) : (
          <p className="text-sm text-zinc-500">No comments yet. Start the conversation.</p>
        )}
      </div>
    </section>
  );
}
