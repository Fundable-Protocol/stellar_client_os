"use client";

/**
 * EmailCampaignBuilder
 *
 * A drag-and-drop email block editor that allows campaign creators to build
 * styled emails for their backer list. Supports:
 *   - Six block types: Heading, Text, Image, Button, Divider, Spacer
 *   - Drag to reorder blocks (HTML5 Drag-and-Drop API — no extra deps)
 *   - Live HTML preview
 *   - Audience segmentation controls (reward tier + pledge amount filters)
 *   - Subject / preview-text fields
 */

import React, { useState, useRef, useCallback, useId } from "react";
import {
  GripVertical,
  Heading1,
  AlignLeft,
  Image as ImageIcon,
  MousePointerClick,
  Minus,
  Space,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AudienceSegment,
  EmailBlock,
  EmailCampaign,
  HeadingBlock,
  TextBlock,
  ImageBlock,
  ButtonBlock,
  DividerBlock,
  SpacerBlock,
} from "@/types/email-campaign";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function cloneBlocks(blocks: EmailBlock[]): EmailBlock[] {
  return blocks.map((b) => ({ ...b }));
}

// ─── Block palette item ───────────────────────────────────────────────────────

const BLOCK_PALETTE: Array<{
  type: EmailBlock["type"];
  label: string;
  icon: React.ReactNode;
  default: () => EmailBlock;
}> = [
  {
    type: "heading",
    label: "Heading",
    icon: <Heading1 className="h-4 w-4" />,
    default: (): HeadingBlock => ({
      type: "heading",
      id: generateId(),
      content: "Your heading here",
      level: 2,
      align: "left",
    }),
  },
  {
    type: "text",
    label: "Text",
    icon: <AlignLeft className="h-4 w-4" />,
    default: (): TextBlock => ({
      type: "text",
      id: generateId(),
      content: "Write your message here…",
      align: "left",
    }),
  },
  {
    type: "image",
    label: "Image",
    icon: <ImageIcon className="h-4 w-4" />,
    default: (): ImageBlock => ({
      type: "image",
      id: generateId(),
      src: "",
      alt: "",
    }),
  },
  {
    type: "button",
    label: "Button",
    icon: <MousePointerClick className="h-4 w-4" />,
    default: (): ButtonBlock => ({
      type: "button",
      id: generateId(),
      label: "Click here",
      href: "https://",
      backgroundColor: "#16a34a",
      textColor: "#ffffff",
      align: "center",
    }),
  },
  {
    type: "divider",
    label: "Divider",
    icon: <Minus className="h-4 w-4" />,
    default: (): DividerBlock => ({
      type: "divider",
      id: generateId(),
      color: "#e5e7eb",
    }),
  },
  {
    type: "spacer",
    label: "Spacer",
    icon: <Space className="h-4 w-4" />,
    default: (): SpacerBlock => ({
      type: "spacer",
      id: generateId(),
      height: 24,
    }),
  },
];

// ─── Block editors ────────────────────────────────────────────────────────────

interface BlockEditorProps<T extends EmailBlock> {
  block: T;
  onChange: (updated: T) => void;
}

function HeadingEditor({ block, onChange }: BlockEditorProps<HeadingBlock>) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs text-gray-500">Content</Label>
        <Input
          value={block.content}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
          placeholder="Heading text"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="text-xs text-gray-500">Level</Label>
          <select
            value={block.level}
            onChange={(e) => onChange({ ...block, level: Number(e.target.value) as 1 | 2 | 3 })}
            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
        </div>
        <div className="flex-1">
          <Label className="text-xs text-gray-500">Align</Label>
          <select
            value={block.align}
            onChange={(e) => onChange({ ...block, align: e.target.value as HeadingBlock["align"] })}
            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function TextEditor({ block, onChange }: BlockEditorProps<TextBlock>) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs text-gray-500">Content</Label>
        <textarea
          value={block.content}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
          rows={4}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Your message here…"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-500">Align</Label>
        <select
          value={block.align}
          onChange={(e) => onChange({ ...block, align: e.target.value as TextBlock["align"] })}
          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
    </div>
  );
}

function ImageEditor({ block, onChange }: BlockEditorProps<ImageBlock>) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs text-gray-500">Image URL</Label>
        <Input
          value={block.src}
          onChange={(e) => onChange({ ...block, src: e.target.value })}
          placeholder="https://example.com/image.jpg"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-500">Alt text</Label>
        <Input
          value={block.alt}
          onChange={(e) => onChange({ ...block, alt: e.target.value })}
          placeholder="Describe the image"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-500">Click link (optional)</Label>
        <Input
          value={block.link ?? ""}
          onChange={(e) => onChange({ ...block, link: e.target.value || undefined })}
          placeholder="https://"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-500">Width (px, optional)</Label>
        <Input
          type="number"
          value={block.width ?? ""}
          onChange={(e) =>
            onChange({ ...block, width: e.target.value ? Number(e.target.value) : undefined })
          }
          placeholder="600"
        />
      </div>
    </div>
  );
}

function ButtonEditor({ block, onChange }: BlockEditorProps<ButtonBlock>) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs text-gray-500">Label</Label>
        <Input
          value={block.label}
          onChange={(e) => onChange({ ...block, label: e.target.value })}
          placeholder="Button text"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-500">URL</Label>
        <Input
          value={block.href}
          onChange={(e) => onChange({ ...block, href: e.target.value })}
          placeholder="https://"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="text-xs text-gray-500">Background</Label>
          <div className="flex gap-1">
            <input
              type="color"
              value={block.backgroundColor}
              onChange={(e) => onChange({ ...block, backgroundColor: e.target.value })}
              className="h-9 w-9 rounded border cursor-pointer"
              aria-label="Button background color"
            />
            <Input
              value={block.backgroundColor}
              onChange={(e) => onChange({ ...block, backgroundColor: e.target.value })}
              className="flex-1"
            />
          </div>
        </div>
        <div className="flex-1">
          <Label className="text-xs text-gray-500">Text color</Label>
          <div className="flex gap-1">
            <input
              type="color"
              value={block.textColor}
              onChange={(e) => onChange({ ...block, textColor: e.target.value })}
              className="h-9 w-9 rounded border cursor-pointer"
              aria-label="Button text color"
            />
            <Input
              value={block.textColor}
              onChange={(e) => onChange({ ...block, textColor: e.target.value })}
              className="flex-1"
            />
          </div>
        </div>
      </div>
      <div>
        <Label className="text-xs text-gray-500">Align</Label>
        <select
          value={block.align}
          onChange={(e) => onChange({ ...block, align: e.target.value as ButtonBlock["align"] })}
          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
    </div>
  );
}

function DividerEditor({ block, onChange }: BlockEditorProps<DividerBlock>) {
  return (
    <div>
      <Label className="text-xs text-gray-500">Color</Label>
      <div className="flex gap-1">
        <input
          type="color"
          value={block.color}
          onChange={(e) => onChange({ ...block, color: e.target.value })}
          className="h-9 w-9 rounded border cursor-pointer"
          aria-label="Divider color"
        />
        <Input
          value={block.color}
          onChange={(e) => onChange({ ...block, color: e.target.value })}
          className="flex-1"
        />
      </div>
    </div>
  );
}

function SpacerEditor({ block, onChange }: BlockEditorProps<SpacerBlock>) {
  return (
    <div>
      <Label className="text-xs text-gray-500">Height (px)</Label>
      <Input
        type="number"
        min={4}
        max={200}
        value={block.height}
        onChange={(e) => onChange({ ...block, height: Math.max(4, Number(e.target.value)) })}
      />
    </div>
  );
}

function BlockEditor({
  block,
  onChange,
}: {
  block: EmailBlock;
  onChange: (updated: EmailBlock) => void;
}) {
  switch (block.type) {
    case "heading":
      return <HeadingEditor block={block} onChange={onChange} />;
    case "text":
      return <TextEditor block={block} onChange={onChange} />;
    case "image":
      return <ImageEditor block={block} onChange={onChange} />;
    case "button":
      return <ButtonEditor block={block} onChange={onChange} />;
    case "divider":
      return <DividerEditor block={block} onChange={onChange} />;
    case "spacer":
      return <SpacerEditor block={block} onChange={onChange} />;
    default:
      return null;
  }
}

// ─── Single block row ─────────────────────────────────────────────────────────

interface BlockRowProps {
  block: EmailBlock;
  index: number;
  total: number;
  onUpdate: (updated: EmailBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
}

function BlockRow({
  block,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
}: BlockRowProps) {
  const [expanded, setExpanded] = useState(true);
  const paletteItem = BLOCK_PALETTE.find((p) => p.type === block.type);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className="rounded-lg border border-gray-200 bg-white shadow-sm"
      aria-label={`${paletteItem?.label ?? block.type} block`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-t-lg border-b border-gray-200">
        <span
          className="cursor-grab text-gray-400 hover:text-gray-600"
          title="Drag to reorder"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="text-gray-500">{paletteItem?.icon}</span>
        <span className="flex-1 text-sm font-medium text-gray-700">
          {paletteItem?.label ?? block.type}
        </span>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
          aria-label="Move block up"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
          aria-label="Move block down"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="p-1 rounded text-gray-400 hover:text-gray-700"
          aria-label={expanded ? "Collapse block" : "Expand block"}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded text-red-400 hover:text-red-600"
          aria-label="Remove block"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Body */}
      {expanded && (
        <div className="p-3">
          <BlockEditor block={block} onChange={onUpdate} />
        </div>
      )}
    </div>
  );
}

// ─── Audience controls ────────────────────────────────────────────────────────

interface AudienceControlsProps {
  audience: AudienceSegment;
  onChange: (updated: AudienceSegment) => void;
  availableTiers: string[];
}

function AudienceControls({ audience, onChange, availableTiers }: AudienceControlsProps) {
  const handleTierToggle = (tier: string) => {
    const current = audience.rewardTiers ?? [];
    const next = current.includes(tier)
      ? current.filter((t) => t !== tier)
      : [...current, tier];
    onChange({ ...audience, rewardTiers: next.length > 0 ? next : undefined });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="audience-all"
          checked={audience.includeAll ?? false}
          onChange={(e) => onChange({ ...audience, includeAll: e.target.checked })}
          className="rounded"
        />
        <label htmlFor="audience-all" className="text-sm font-medium text-gray-700">
          Send to all backers
        </label>
      </div>

      {!audience.includeAll && (
        <div className="space-y-3 pl-4 border-l-2 border-gray-100">
          {availableTiers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Reward tiers</p>
              <div className="flex flex-wrap gap-2">
                {availableTiers.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => handleTierToggle(tier)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      (audience.rewardTiers ?? []).includes(tier)
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-green-400"
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Min pledge amount</Label>
              <Input
                type="text"
                value={audience.minPledgeAmount ?? ""}
                onChange={(e) =>
                  onChange({ ...audience, minPledgeAmount: e.target.value || undefined })
                }
                placeholder="e.g. 100"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Max pledge amount</Label>
              <Input
                type="text"
                value={audience.maxPledgeAmount ?? ""}
                onChange={(e) =>
                  onChange({ ...audience, maxPledgeAmount: e.target.value || undefined })
                }
                placeholder="e.g. 10000"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HTML preview renderer ────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function blockToHtml(block: EmailBlock): string {
  switch (block.type) {
    case "heading": {
      const t = `h${block.level}`;
      return `<${t} style="text-align:${block.align};margin:0 0 12px">${escHtml(block.content)}</${t}>`;
    }
    case "text":
      return `<p style="text-align:${block.align};margin:0 0 12px;line-height:1.6">${escHtml(
        block.content,
      ).replace(/\n/g, "<br>")}</p>`;
    case "image": {
      const img = block.src
        ? `<img src="${escHtml(block.src)}" alt="${escHtml(block.alt)}"${block.width ? ` width="${block.width}"` : ""} style="max-width:100%;display:block">`
        : `<div style="background:#f3f4f6;height:120px;display:flex;align-items:center;justify-content:center;color:#9ca3af;border-radius:4px">Image placeholder</div>`;
      return `<div style="margin:0 0 12px">${block.link ? `<a href="${escHtml(block.link)}">${img}</a>` : img}</div>`;
    }
    case "button":
      return `<div style="text-align:${block.align};margin:0 0 12px"><a href="${escHtml(
        block.href,
      )}" style="display:inline-block;padding:12px 24px;background:${escHtml(
        block.backgroundColor,
      )};color:${escHtml(block.textColor)};text-decoration:none;border-radius:4px;font-weight:600">${escHtml(
        block.label,
      )}</a></div>`;
    case "divider":
      return `<hr style="border:none;border-top:1px solid ${escHtml(block.color)};margin:16px 0">`;
    case "spacer":
      return `<div style="height:${block.height}px"></div>`;
    default:
      return "";
  }
}

function buildPreviewHtml(blocks: EmailBlock[]): string {
  return blocks.map(blockToHtml).join("\n");
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface EmailCampaignBuilderProps {
  /** Partial campaign data to pre-populate (for editing an existing draft). */
  initialData?: Partial<
    Pick<EmailCampaign, "subject" | "previewText" | "blocks" | "audience">
  >;
  /** Reward tier names available for this campaign (from its sponsorship tiers). */
  availableTiers?: string[];
  /** Called when the creator saves/submits the campaign. */
  onSave?: (data: {
    subject: string;
    previewText: string;
    blocks: EmailBlock[];
    audience: AudienceSegment;
  }) => void | Promise<void>;
  /** Disable all controls while a network request is in progress. */
  disabled?: boolean;
}

export function EmailCampaignBuilder({
  initialData,
  availableTiers = [],
  onSave,
  disabled = false,
}: EmailCampaignBuilderProps) {
  const [subject, setSubject] = useState(initialData?.subject ?? "");
  const [previewText, setPreviewText] = useState(initialData?.previewText ?? "");
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialData?.blocks ?? []);
  const [audience, setAudience] = useState<AudienceSegment>(
    initialData?.audience ?? { includeAll: true },
  );
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag-and-drop state
  const dragIndex = useRef<number | null>(null);
  const overIndex = useRef<number | null>(null);

  const addBlock = useCallback((paletteIndex: number) => {
    const palette = BLOCK_PALETTE[paletteIndex];
    if (!palette) return;
    setBlocks((prev) => [...prev, palette.default()]);
  }, []);

  const updateBlock = useCallback((index: number, updated: EmailBlock) => {
    setBlocks((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  const removeBlock = useCallback((index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveBlock = useCallback((index: number, direction: "up" | "down") => {
    setBlocks((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleDrop = useCallback(() => {
    if (dragIndex.current === null || overIndex.current === null) return;
    if (dragIndex.current === overIndex.current) return;
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex.current!, 1);
      next.splice(overIndex.current!, 0, moved);
      return next;
    });
    dragIndex.current = null;
    overIndex.current = null;
  }, []);

  const handleSave = async () => {
    if (!subject.trim()) {
      setError("Subject line is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave?.({ subject: subject.trim(), previewText, blocks, audience });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const previewHtml = buildPreviewHtml(blocks);
  const formId = useId();

  return (
    <div className="flex flex-col gap-6" aria-label="Email campaign builder">
      {/* ── Meta fields ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Mail className="h-4 w-4 text-green-600" />
          Email details
        </h2>
        <div className="space-y-3">
          <div>
            <Label htmlFor={`${formId}-subject`}>Subject line *</Label>
            <Input
              id={`${formId}-subject`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Campaign update: 50% funded!"
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor={`${formId}-preview`}>
              Preview text{" "}
              <span className="text-xs text-gray-400 font-normal">(shown below subject in inbox)</span>
            </Label>
            <Input
              id={`${formId}-preview`}
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="A short teaser…"
              disabled={disabled}
              className="mt-1"
            />
          </div>
        </div>
      </section>

      {/* ── Audience ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Audience</h2>
        <AudienceControls
          audience={audience}
          onChange={setAudience}
          availableTiers={availableTiers}
        />
      </section>

      {/* ── Block builder ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Email content</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? (
              <>
                <EyeOff className="h-3.5 w-3.5 mr-1" />
                Hide preview
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 mr-1" />
                Preview
              </>
            )}
          </Button>
        </div>

        <div className={showPreview ? "grid grid-cols-2 gap-6" : "block"}>
          {/* Block list */}
          <div className="space-y-3">
            {blocks.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                Add blocks below to build your email.
              </p>
            )}
            {blocks.map((block, i) => (
              <BlockRow
                key={block.id}
                block={block}
                index={i}
                total={blocks.length}
                onUpdate={(updated) => updateBlock(i, updated)}
                onRemove={() => removeBlock(i)}
                onMoveUp={() => moveBlock(i, "up")}
                onMoveDown={() => moveBlock(i, "down")}
                onDragStart={(idx) => {
                  dragIndex.current = idx;
                }}
                onDragOver={(idx) => {
                  overIndex.current = idx;
                }}
                onDrop={handleDrop}
              />
            ))}

            {/* Palette */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Add block</p>
              <div className="flex flex-wrap gap-2">
                {BLOCK_PALETTE.map((item, idx) => (
                  <button
                    key={item.type}
                    type="button"
                    disabled={disabled}
                    onClick={() => addBlock(idx)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-green-50 hover:border-green-400 hover:text-green-700 disabled:opacity-50 transition-colors"
                  >
                    {item.icon}
                    {item.label}
                    <Plus className="h-3 w-3 opacity-60" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="sticky top-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Live preview</p>
              <div
                className="rounded-lg border border-gray-200 p-4 bg-white overflow-auto max-h-[600px] text-sm"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
                aria-label="Email preview"
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Actions ── */}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={disabled || saving}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {saving ? "Saving…" : "Save campaign"}
        </Button>
      </div>
    </div>
  );
}
