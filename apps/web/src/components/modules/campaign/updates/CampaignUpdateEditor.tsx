"use client";

/**
 * Editor for a campaign update post.
 *
 * Supports Markdown authoring with a formatting toolbar and a live preview,
 * plus image uploads. Images are uploaded straight to S3 through the
 * presigned-upload endpoint, so no file ever passes through the app server.
 */

import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  Bold,
  CheckCircle2,
  Code,
  Eye,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  Loader2,
  MessageSquareQuote,
  Paperclip,
  PenLine,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  MAX_CAMPAIGN_UPDATE_IMAGES,
  type CampaignUpdateNotificationMode,
  type CampaignUpdatePost,
  type CampaignUpdateVisibility,
} from "@/types/campaign-update";

export interface CampaignUpdateEditorProps {
  campaignId: string;
  campaignTitle?: string;
  /** Wallet address of the creator — sent to the API for authorization. */
  creatorAddress: string;
  /** Update being edited; omit to compose a new one. */
  initialUpdate?: CampaignUpdatePost | null;
  /** Called after the update has been saved (draft or published). */
  onSaved?: (update: CampaignUpdatePost) => void;
  onCancel?: () => void;
}

type ToolbarAction =
  | "bold"
  | "italic"
  | "heading"
  | "link"
  | "list"
  | "quote"
  | "code";

const TOOLBAR: Array<{ action: ToolbarAction; label: string; icon: React.ReactNode }> = [
  { action: "bold", label: "Bold", icon: <Bold className="h-3.5 w-3.5" /> },
  { action: "italic", label: "Italic", icon: <Italic className="h-3.5 w-3.5" /> },
  { action: "heading", label: "Heading", icon: <Heading2 className="h-3.5 w-3.5" /> },
  { action: "link", label: "Link", icon: <Link2 className="h-3.5 w-3.5" /> },
  { action: "list", label: "List", icon: <List className="h-3.5 w-3.5" /> },
  { action: "quote", label: "Quote", icon: <MessageSquareQuote className="h-3.5 w-3.5" /> },
  { action: "code", label: "Code", icon: <Code className="h-3.5 w-3.5" /> },
];

const WRAPPERS: Record<ToolbarAction, { prefix: string; suffix: string }> = {
  bold: { prefix: "**", suffix: "**" },
  italic: { prefix: "*", suffix: "*" },
  heading: { prefix: "## ", suffix: "" },
  link: { prefix: "[", suffix: "](https://)" },
  list: { prefix: "- ", suffix: "" },
  quote: { prefix: "> ", suffix: "" },
  code: { prefix: "`", suffix: "`" },
};

export function CampaignUpdateEditor({
  campaignId,
  campaignTitle,
  creatorAddress,
  initialUpdate,
  onSaved,
  onCancel,
}: CampaignUpdateEditorProps) {
  const [title, setTitle] = useState(initialUpdate?.title ?? "");
  const [body, setBody] = useState(initialUpdate?.bodyMarkdown ?? "");
  const [imageUrls, setImageUrls] = useState<string[]>(initialUpdate?.imageUrls ?? []);
  const [visibility, setVisibility] = useState<CampaignUpdateVisibility>(
    initialUpdate?.visibility ?? "public",
  );
  const [notifyBackers, setNotifyBackers] = useState(initialUpdate?.notifyBackers ?? true);
  const [notificationMode, setNotificationMode] = useState<CampaignUpdateNotificationMode>(
    initialUpdate?.notificationMode ?? "instant",
  );
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyFormat = useCallback((action: ToolbarAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { prefix, suffix } = WRAPPERS[action];
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.slice(start, end);
    const next = `${body.slice(0, start)}${prefix}${selected}${suffix}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  }, [body]);

  /** Upload an image to S3 through the presigned-upload endpoint. */
  const uploadImage = useCallback(
    async (file: File) => {
      if (imageUrls.length >= MAX_CAMPAIGN_UPDATE_IMAGES) {
        setStatus({
          type: "error",
          message: `An update can hold at most ${MAX_CAMPAIGN_UPDATE_IMAGES} images.`,
        });
        return;
      }
      setUploading(true);
      setStatus(null);
      try {
        const presignRes = await fetch("/api/presign-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            updateId: initialUpdate?.id ?? "draft",
            contentType: file.type,
            purpose: "campaign-update",
          }),
        });
        const presign = await presignRes.json();
        if (!presignRes.ok) {
          throw new Error(presign.error ?? "Could not prepare the image upload");
        }

        const uploadRes = await fetch(presign.url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) {
          throw new Error("Image upload failed");
        }

        const publicUrl: string = presign.publicUrl ?? presign.key;
        setImageUrls((current) => [...current, publicUrl]);
        setStatus({ type: "success", message: "Image uploaded." });
      } catch (err) {
        setStatus({
          type: "error",
          message: err instanceof Error ? err.message : "Image upload failed",
        });
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [campaignId, imageUrls.length, initialUpdate?.id],
  );

  const save = useCallback(
    async (publish: boolean) => {
      if (!title.trim()) {
        setStatus({ type: "error", message: "A title is required." });
        return;
      }
      if (!body.trim()) {
        setStatus({ type: "error", message: "An update body is required." });
        return;
      }

      setSaving(true);
      setStatus(null);
      try {
        const payload = {
          creatorAddress,
          title: title.trim(),
          bodyMarkdown: body,
          imageUrls,
          visibility,
          notifyBackers,
          notificationMode,
          campaignTitle,
        };

        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/updates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, status: publish ? "published" : "draft" }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to save the update");

        setStatus({
          type: "success",
          message: publish
            ? "Update published and backers notified."
            : "Draft saved.",
        });
        if (json.update) onSaved?.(json.update as CampaignUpdatePost);
      } catch (err) {
        setStatus({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to save the update",
        });
      } finally {
        setSaving(false);
      }
    },
    [
      body,
      campaignId,
      campaignTitle,
      creatorAddress,
      imageUrls,
      notifyBackers,
      notificationMode,
      onSaved,
      title,
      visibility,
    ],
  );

  return (
    <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div>
        <label htmlFor="campaign-update-title" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Title
        </label>
        <Input
          id="campaign-update-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What happened since the last update?"
          maxLength={200}
          className="mt-1.5 bg-zinc-950 border-zinc-800 text-zinc-100"
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="campaign-update-body" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Update (Markdown)
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {TOOLBAR.map((item) => (
              <button
                key={item.action}
                type="button"
                onClick={() => applyFormat(item.action)}
                title={item.label}
                aria-label={item.label}
                className="rounded-md border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
              >
                {item.icon}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              title={showPreview ? "Back to editing" : "Preview"}
              aria-label={showPreview ? "Back to editing" : "Preview"}
              className="rounded-md border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              {showPreview ? <PenLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {showPreview ? (
          <div className="mt-1.5 min-h-[220px] rounded-md border border-zinc-800 bg-zinc-950 p-4">
            {body.trim() ? (
              <MarkdownRenderer content={body} />
            ) : (
              <p className="text-sm text-zinc-600">Nothing to preview yet.</p>
            )}
          </div>
        ) : (
          <textarea
            id="campaign-update-body"
            ref={textareaRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={12}
            placeholder={"# Field report\n\nWe planted **120** trees this week…"}
            className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm text-zinc-100 outline-none focus:border-purple-600"
          />
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <Paperclip className="h-3.5 w-3.5 text-purple-400" /> Images
          </span>
          <span className="text-[11px] text-zinc-500">
            {imageUrls.length}/{MAX_CAMPAIGN_UPDATE_IMAGES}
          </span>
        </div>

        {imageUrls.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {imageUrls.map((url) => (
              <li key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-zinc-800 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImageUrls((current) => current.filter((item) => item !== url))}
                  aria-label="Remove image"
                  className="absolute -right-1.5 -top-1.5 rounded-full border border-zinc-700 bg-zinc-900 p-0.5 text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadImage(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 border-zinc-700 text-zinc-300"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || imageUrls.length >= MAX_CAMPAIGN_UPDATE_IMAGES}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          {uploading ? "Uploading…" : "Upload image"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="campaign-update-visibility" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Visibility
          </label>
          <select
            id="campaign-update-visibility"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as CampaignUpdateVisibility)}
            className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="public">Public</option>
            <option value="backers_only">Backers only</option>
          </select>
        </div>

        <div>
          <label htmlFor="campaign-update-mode" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Notify backers
          </label>
          <select
            id="campaign-update-mode"
            value={notificationMode}
            onChange={(event) =>
              setNotificationMode(event.target.value as CampaignUpdateNotificationMode)
            }
            disabled={!notifyBackers}
            className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
          >
            <option value="instant">Instantly</option>
            <option value="daily_digest">Daily digest</option>
            <option value="weekly_digest">Weekly digest</option>
            <option value="off">No email</option>
          </select>
        </div>

        <label className="flex items-end gap-2 pb-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={notifyBackers}
            onChange={(event) => setNotifyBackers(event.target.checked)}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
          />
          Notify backers
        </label>
      </div>

      {status && (
        <p
          role="status"
          className={`flex items-center gap-2 text-xs ${
            status.type === "success" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {status.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
        <Button
          type="button"
          onClick={() => void save(false)}
          disabled={saving || uploading}
          variant="outline"
          className="border-zinc-700 text-zinc-300"
        >
          <Save className="h-3.5 w-3.5" /> Save draft
        </Button>
        <Button
          type="button"
          onClick={() => void save(true)}
          disabled={saving || uploading}
          className="bg-purple-600 text-white hover:bg-purple-500"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Publish & notify
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="text-zinc-400">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export default CampaignUpdateEditor;
