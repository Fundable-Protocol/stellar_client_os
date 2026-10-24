"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bold,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Heading3,
  Heart,
  Italic,
  List,
  Lock,
  Paperclip,
  Plus,
  Quote,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ExclusiveContentAttachmentInput,
  ExclusiveContentPost,
  ExclusiveContentPostType,
  formatFileSize,
} from "@/types/campaign-exclusive-content";
import { formatBackerAmount } from "@/types/campaign-backers";
import { useCampaignExclusiveContent } from "@/hooks/use-campaign-exclusive-content";

export interface BackerExclusiveContentProps {
  campaignId: string;
  campaignTitle?: string;
  /** Connected wallet address of the current viewer. */
  viewerAddress?: string;
  /** Campaign creator address — only they can publish or delete posts. */
  creatorAddress?: string;
  /** Override creator management detection. */
  canManage?: boolean;
  /** Destination for the non-backer pledge CTA link (defaults to `/campaigns/:id/donate`). */
  pledgeHref?: string;
  /** Optional click callback when a non-backer clicks the pledge CTA. */
  onPledgeClick?: () => void;
  /** Whether to seed demo data for the demo campaign (`camp-101`). */
  seedDemoData?: boolean;
}

/**
 * Render inline bold (`**text**`) and italic (`*text*`) formatting safely as
 * React nodes without `dangerouslySetInnerHTML`.
 */
function renderInlineRichText(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return (
        <strong key={index} className="font-semibold text-zinc-100">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
      return (
        <em key={index} className="italic text-zinc-200">
          {token.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={index}>{token}</React.Fragment>;
  });
}

/**
 * Render lightweight rich-text markdown blocks (headings, bullet lists,
 * blockquotes, and paragraphs) into semantic React elements.
 */
function RichTextRenderer({ content }: { content: string }) {
  const blocks = content.split(/\n\n+/);
  return (
    <div
      data-testid="exclusive-rich-text-body"
      className="space-y-2.5 text-sm text-zinc-300 leading-relaxed"
    >
      {blocks.map((rawBlock, idx) => {
        const block = rawBlock.trim();
        if (!block) return null;

        if (block.startsWith("### ")) {
          return (
            <h4 key={idx} className="text-base font-bold text-zinc-100">
              {renderInlineRichText(block.slice(4))}
            </h4>
          );
        }
        if (block.startsWith("## ")) {
          return (
            <h4 key={idx} className="text-base font-bold text-zinc-100">
              {renderInlineRichText(block.slice(3))}
            </h4>
          );
        }
        if (block.startsWith("> ")) {
          return (
            <blockquote
              key={idx}
              className="border-l-2 border-purple-500/70 bg-purple-950/20 pl-3 py-1.5 text-xs italic text-purple-200/90 rounded-r"
            >
              {renderInlineRichText(block.slice(2))}
            </blockquote>
          );
        }

        const lines = block.split("\n");
        if (lines.every((line) => line.trim().startsWith("- "))) {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1 text-sm text-zinc-300">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx}>
                  {renderInlineRichText(line.trim().slice(2))}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="text-sm text-zinc-300 leading-relaxed">
            {renderInlineRichText(block)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Backer-only exclusive content area on campaign pages (#1267).
 *
 *  - Checks pledge status via the content gate (`useCampaignExclusiveContent`).
 *  - Lets the campaign creator publish rich-text posts and upload files.
 *  - Shows non-backers a blurred teaser with a prominent pledge CTA.
 */
export function BackerExclusiveContent({
  campaignId,
  campaignTitle,
  viewerAddress,
  creatorAddress,
  canManage,
  pledgeHref,
  onPledgeClick,
  seedDemoData = true,
}: BackerExclusiveContentProps) {
  const [previewAsNonBacker, setPreviewAsNonBacker] = useState(false);
  const effectiveViewer = previewAsNonBacker ? undefined : viewerAddress;

  const {
    posts,
    gateStatus,
    totalPosts,
    isCreator,
    error,
    publishPost,
    deletePost,
  } = useCampaignExclusiveContent({
    campaignId,
    viewerAddress: effectiveViewer,
    creatorAddress,
    seedDemoData,
  });

  const isActualCreator =
    canManage ??
    (Boolean(
      viewerAddress &&
        creatorAddress &&
        viewerAddress.trim().toLowerCase() === creatorAddress.trim().toLowerCase(),
    ) ||
      isCreator);

  const canPublish = isActualCreator && !previewAsNonBacker;
  const targetPledgeHref = pledgeHref ?? `/campaigns/${campaignId}/donate`;

  // Composer state
  const [composing, setComposing] = useState(false);
  const [postType, setPostType] = useState<ExclusiveContentPostType>("RICH_TEXT");
  const [title, setTitle] = useState("");
  const [teaser, setTeaser] = useState("");
  const [richTextContent, setRichTextContent] = useState("");
  const [minPledgeAmount, setMinPledgeAmount] = useState("");
  const [attachments, setAttachments] = useState<ExclusiveContentAttachmentInput[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetComposer = () => {
    setTitle("");
    setTeaser("");
    setRichTextContent("");
    setMinPledgeAmount("");
    setAttachments([]);
    setPostType("RICH_TEXT");
    setFormError(null);
  };

  const applyFormatSnippet = (snippet: string) => {
    setRichTextContent((prev) => (prev ? `${prev}\n\n${snippet}` : snippet));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const added: ExclusiveContentAttachmentInput[] = [];
    for (let i = 0; i < fileList.length; i += 1) {
      const file = fileList.item(i);
      if (!file) continue;
      const objectUrl =
        typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(file)
          : `data:${file.type || "application/octet-stream"};base64,${encodeURIComponent(file.name)}`;
      added.push({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSizeBytes: file.size > 0 ? file.size : 1024,
        downloadUrl: objectUrl,
      });
    }

    setAttachments((prev) => [...prev, ...added]);
    setPostType("FILE");
    event.target.value = "";
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const outcome = publishPost({
      title,
      teaser: teaser.trim() || undefined,
      postType,
      richTextContent: richTextContent.trim() || undefined,
      attachments,
      minPledgeAmount: minPledgeAmount.trim() || undefined,
    });

    if (!outcome.ok) {
      setFormError(outcome.error);
      return;
    }

    resetComposer();
    setComposing(false);
  };

  return (
    <section
      aria-label="Backer-only exclusive content"
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5"
    >
      {/* Header & Pledge Gate Status */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            {gateStatus.hasAccess ? (
              <Unlock className="h-5 w-5 text-emerald-400" />
            ) : (
              <Lock className="h-5 w-5 text-amber-400" />
            )}
            Backer-Only Exclusive Content
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            {campaignTitle ? `${campaignTitle} · ` : ""}
            Field reports, rich-text updates, and downloadable datasets reserved for verified backers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            data-testid="exclusive-gate-status"
            variant="outline"
            className={
              gateStatus.hasAccess
                ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-300 text-[11px]"
                : "border-amber-500/50 bg-amber-950/30 text-amber-300 text-[11px]"
            }
          >
            {gateStatus.isCreator ? (
              <>
                <ShieldCheck className="mr-1 h-3 w-3" /> Creator Access · Unlocked
              </>
            ) : gateStatus.hasAccess ? (
              <>
                <CheckCircle2 className="mr-1 h-3 w-3" /> Verified Backer ·{" "}
                {formatBackerAmount(gateStatus.pledgedAmount)} {gateStatus.token} Pledged
              </>
            ) : (
              <>
                <Lock className="mr-1 h-3 w-3" /> Backers Only · Pledge Required
              </>
            )}
          </Badge>

          <Badge variant="outline" className="border-zinc-700 text-zinc-300 text-[11px]">
            <Sparkles className="mr-1 h-3 w-3 text-purple-400" /> {totalPosts}{" "}
            {totalPosts === 1 ? "exclusive post" : "exclusive posts"}
          </Badge>

          {isActualCreator && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPreviewAsNonBacker((prev) => !prev)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              {previewAsNonBacker ? "Exit Non-Backer Preview" : "Preview Non-Backer Gate"}
            </Button>
          )}

          {canPublish && !composing && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                resetComposer();
                setComposing(true);
              }}
              className="border-purple-600/40 text-purple-300 hover:bg-purple-950/40 text-xs"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Publish Exclusive Content
            </Button>
          )}
        </div>
      </div>

      {/* Service / Hook Error Alert */}
      {(error || formError) && (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs text-rose-300"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {formError ?? error}
        </p>
      )}

      {/* Creator Publishing Form (Rich-Text Posts & File Uploads) */}
      {canPublish && composing && (
        <form
          onSubmit={handleSubmit}
          aria-label="Publish backer-only exclusive content"
          className="rounded-xl border border-purple-800/40 bg-zinc-950/90 p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-zinc-100">
              Publish to Backer-Only Area
            </h4>
            <div className="flex gap-1.5" role="group" aria-label="Content format">
              <button
                type="button"
                aria-pressed={postType === "RICH_TEXT"}
                onClick={() => setPostType("RICH_TEXT")}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold ${
                  postType === "RICH_TEXT"
                    ? "border-purple-500 bg-purple-950/60 text-purple-200"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400"
                }`}
              >
                <FileText className="h-3.5 w-3.5" /> Rich-Text Post
              </button>
              <button
                type="button"
                aria-pressed={postType === "FILE"}
                onClick={() => setPostType("FILE")}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold ${
                  postType === "FILE"
                    ? "border-purple-500 bg-purple-950/60 text-purple-200"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400"
                }`}
              >
                <Upload className="h-3.5 w-3.5" /> File Upload
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Post Title *
              </label>
              <Input
                aria-label="Exclusive post title"
                placeholder="e.g. Q4 Drone Canopy Survey & Field Notes"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Min. Pledge to Unlock (optional)
              </label>
              <Input
                aria-label="Minimum pledge amount"
                placeholder="Any positive pledge (default)"
                value={minPledgeAmount}
                onChange={(e) => setMinPledgeAmount(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Teaser Preview for Non-Backers (optional)
            </label>
            <Input
              aria-label="Teaser preview for non-backers"
              placeholder="Short teaser snippet shown in the blurred preview card..."
              value={teaser}
              onChange={(e) => setTeaser(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Rich-Text Editor with Formatting Toolbar */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-zinc-400">
                Rich-Text Post Body
              </label>
              <div
                className="flex flex-wrap items-center gap-1"
                role="toolbar"
                aria-label="Rich-text formatting toolbar"
              >
                <button
                  type="button"
                  title="Insert heading"
                  onClick={() => applyFormatSnippet("### Section Heading")}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  <Heading3 className="inline h-3 w-3 mr-1" /> Heading
                </button>
                <button
                  type="button"
                  title="Insert bold text"
                  onClick={() => applyFormatSnippet("**Highlighted update**")}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  <Bold className="inline h-3 w-3 mr-1" /> Bold
                </button>
                <button
                  type="button"
                  title="Insert italic text"
                  onClick={() => applyFormatSnippet("*Field observation*")}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  <Italic className="inline h-3 w-3 mr-1" /> Italic
                </button>
                <button
                  type="button"
                  title="Insert bullet list"
                  onClick={() =>
                    applyFormatSnippet("- First milestone detail\n- Second milestone detail")
                  }
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  <List className="inline h-3 w-3 mr-1" /> List
                </button>
                <button
                  type="button"
                  title="Insert quote"
                  onClick={() => applyFormatSnippet("> Key takeaway from the field team")}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  <Quote className="inline h-3 w-3 mr-1" /> Quote
                </button>
              </div>
            </div>
            <textarea
              aria-label="Rich-text post content"
              rows={4}
              value={richTextContent}
              onChange={(e) => setRichTextContent(e.target.value)}
              placeholder="Write your backer-only update using rich text (headings, bold, lists, quotes)..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
          </div>

          {/* File Attachments Upload Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">
                Exclusive File Attachments
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Choose Files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                aria-label="Upload exclusive files"
                onChange={handleFileChange}
                className="sr-only"
              />
            </div>

            {attachments.length > 0 && (
              <ul className="space-y-1.5" aria-label="Staged file attachments">
                {attachments.map((att, index) => (
                  <li
                    key={`${att.fileName}-${index}`}
                    className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs"
                  >
                    <span className="flex items-center gap-2 text-zinc-200 truncate">
                      <Paperclip className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                      <span className="font-medium truncate">{att.fileName}</span>
                      <span className="text-zinc-500">
                        ({formatFileSize(att.fileSizeBytes)})
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${att.fileName}`}
                      onClick={() => handleRemoveAttachment(index)}
                      className="text-zinc-500 hover:text-rose-400 p-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                resetComposer();
                setComposing(false);
              }}
              className="text-xs text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
            >
              Publish to Backers
            </Button>
          </div>
        </form>
      )}

      {/* Exclusive Content Posts List */}
      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-8 text-center">
          <p className="text-sm text-zinc-300">No exclusive posts published yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            The campaign creator has not published any backer-only posts or files yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <ExclusivePostCard
              key={post.id}
              post={post}
              token={gateStatus.token}
              canManage={canPublish}
              pledgeHref={targetPledgeHref}
              onPledgeClick={onPledgeClick}
              onDelete={() => deletePost(post.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface ExclusivePostCardProps {
  post: ExclusiveContentPost;
  token: string;
  canManage: boolean;
  pledgeHref: string;
  onPledgeClick?: () => void;
  onDelete: () => void;
}

function ExclusivePostCard({
  post,
  token,
  canManage,
  pledgeHref,
  onPledgeClick,
  onDelete,
}: ExclusivePostCardProps) {
  const formattedDate = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (post.locked) {
    return (
      <article
        data-testid={`exclusive-post-${post.id}`}
        className="relative overflow-hidden rounded-xl border border-amber-800/40 bg-zinc-950/80 p-5 space-y-4"
      >
        {/* Visible Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-amber-600/20 text-amber-300 border border-amber-500/40 text-[10px]">
              <Lock className="mr-1 h-3 w-3" /> Backers Only
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">
              {post.postType === "FILE" ? "Exclusive Files" : "Rich-Text Post"}
            </Badge>
            {post.attachments.length > 0 && (
              <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">
                <Paperclip className="mr-1 h-2.5 w-2.5" /> {post.attachments.length}{" "}
                {post.attachments.length === 1 ? "file" : "files"}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-zinc-500">{formattedDate}</span>
        </div>

        <h4 className="text-base font-bold text-zinc-100">{post.title}</h4>

        {/* Blurred Teaser Preview + Pledge CTA Overlay */}
        <div className="relative rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-4 overflow-hidden">
          <div
            data-testid="exclusive-blurred-teaser"
            aria-hidden="true"
            className="blur-sm select-none pointer-events-none space-y-2 text-sm text-zinc-400"
          >
            <p>{post.teaser}</p>
            <p>
              Full field telemetry, high-resolution imagery, and verified GPS patrol logs are
              reserved exclusively for backers supporting this campaign on Stellar.
            </p>
            {post.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {post.attachments.map((att) => (
                  <span
                    key={att.id}
                    className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-400"
                  >
                    <Paperclip className="h-3 w-3" /> {att.fileName} (
                    {formatFileSize(att.fileSizeBytes)})
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Lock Callout & Pledge CTA */}
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-500/30 bg-zinc-950/95 px-4 py-3 shadow-lg">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                {post.minPledgeAmount
                  ? `Pledge at least ${post.minPledgeAmount} ${token} to unlock`
                  : "Exclusive to Verified Campaign Backers"}
              </p>
              <p className="text-[11px] text-zinc-400">
                Back this campaign to unlock the full update and downloadable files.
              </p>
            </div>

            {onPledgeClick ? (
              <Button
                type="button"
                size="sm"
                data-testid="exclusive-pledge-cta"
                onClick={onPledgeClick}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 font-bold text-white hover:from-emerald-700 hover:to-teal-700 text-xs shrink-0"
              >
                <Heart className="mr-1.5 h-3.5 w-3.5 fill-white" /> Pledge to Unlock
              </Button>
            ) : (
              <Link
                href={pledgeHref}
                data-testid="exclusive-pledge-cta"
                className="inline-flex items-center justify-center rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:from-emerald-700 hover:to-teal-700 shrink-0"
              >
                <Heart className="mr-1.5 h-3.5 w-3.5 fill-white" /> Pledge to Unlock
              </Link>
            )}
          </div>
        </div>
      </article>
    );
  }

  // Unlocked post view for verified backers and the campaign creator
  return (
    <article
      data-testid={`exclusive-post-${post.id}`}
      className="rounded-xl border border-emerald-800/40 bg-zinc-950/70 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
            <Unlock className="mr-1 h-3 w-3" /> Unlocked
          </Badge>
          <Badge variant="outline" className="border-zinc-700 text-zinc-300 text-[10px]">
            {post.postType === "FILE" ? "Exclusive Files" : "Rich-Text Post"}
          </Badge>
          {post.minPledgeAmount && (
            <Badge variant="outline" className="border-purple-600/50 text-purple-300 text-[10px]">
              Min. pledge: {post.minPledgeAmount} {token}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">{formattedDate}</span>
          {canManage && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Delete ${post.title}`}
              onClick={onDelete}
              className="h-7 px-2 text-zinc-500 hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <h4 className="text-base font-bold text-zinc-100">{post.title}</h4>

      {post.richTextContent && <RichTextRenderer content={post.richTextContent} />}

      {post.attachments.length > 0 && (
        <div data-testid="exclusive-attachments-list" className="space-y-2 pt-1">
          <p className="text-xs font-semibold text-zinc-400">
            Attached Backer Files ({post.attachments.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {post.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/70 p-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-purple-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-100 truncate">
                      {att.fileName}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {formatFileSize(att.fileSizeBytes)} · {att.mimeType}
                    </p>
                  </div>
                </div>

                {att.downloadUrl && (
                  <a
                    href={att.downloadUrl}
                    download={att.fileName}
                    aria-label={`Download ${att.fileName}`}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-600/40 bg-emerald-950/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-950/60 shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default BackerExclusiveContent;
