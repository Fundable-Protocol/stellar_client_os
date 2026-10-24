"use client";

/**
 * Campaign FAQ Section — Issue #1196
 *
 * Renders a structured FAQ accordion on the campaign detail page.
 * When the viewer is the campaign creator, it surfaces an inline editor
 * with drag-and-drop reordering of FAQ items.
 *
 * Acceptance Criteria:
 * - Drag-and-drop reordering of FAQ items (HTML5 drag API; no extra lib needed)
 * - Creator can add, edit, delete, and reorder Q&A pairs
 * - Public viewers see a clean accordion
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  HelpCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CampaignFaqItem,
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_MAX_ITEMS,
  FAQ_QUESTION_MAX_LENGTH,
} from "@/types/campaign-faq";

export interface CampaignFaqSectionProps {
  campaignId: string;
  /** Pass true when the current viewer is the campaign creator. */
  isCreator?: boolean;
}

export function CampaignFaqSection({ campaignId, isCreator = false }: CampaignFaqSectionProps) {
  const [items, setItems] = useState<CampaignFaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Accordion open state (public view)
  const [openId, setOpenId] = useState<string | null>(null);

  // Add / edit form
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Drag-and-drop state
  const dragIndex = useRef<number | null>(null);

  // ── Load FAQ items ──────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/campaigns/${campaignId}/faq`);
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
      }
    } catch {
      setError("Could not load FAQ items.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // ── Save (create / update) ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!draftQuestion.trim()) {
      setFormError("Question is required.");
      return;
    }
    if (!draftAnswer.trim()) {
      setFormError("Answer is required.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const isNew = editingId === "new";
      const res = await fetch(
        isNew
          ? `/api/campaigns/${campaignId}/faq`
          : `/api/campaigns/${campaignId}/faq/${editingId}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: draftQuestion.trim(), answer: draftAnswer.trim() }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error ?? "Failed to save FAQ item.");
        return;
      }
      await loadItems();
      setEditingId(null);
    } catch {
      setFormError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this FAQ item?")) return;
    try {
      await fetch(`/api/campaigns/${campaignId}/faq/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError("Could not delete FAQ item.");
    }
  };

  // ── Drag-and-drop reorder ──────────────────────────────────────────────────
  const handleDragStart = (index: number) => {
    dragIndex.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex.current, 1);
    reordered.splice(index, 0, moved);
    dragIndex.current = index;
    setItems(reordered);
  };

  const handleDragEnd = async () => {
    dragIndex.current = null;
    // Persist new order to the API
    try {
      await fetch(`/api/campaigns/${campaignId}/faq/reorder`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: items.map((i) => i.id) }),
      });
    } catch {
      // Non-fatal — order will be restored on next load
    }
  };

  // ── Open editor ─────────────────────────────────────────────────────────────
  const openEditor = (item?: CampaignFaqItem) => {
    setEditingId(item ? item.id : "new");
    setDraftQuestion(item?.question ?? "");
    setDraftAnswer(item?.answer ?? "");
    setFormError(null);
  };

  const cancelEditor = () => {
    setEditingId(null);
    setDraftQuestion("");
    setDraftAnswer("");
    setFormError(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">Loading FAQ…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-950 dark:text-white">
          <HelpCircle className="h-5 w-5 text-fundable-purple-2" />
          Frequently Asked Questions
        </h2>
        {isCreator && items.length < FAQ_MAX_ITEMS && editingId === null && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => openEditor()}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add question
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}

      {/* Add / Edit form */}
      {editingId !== null && (
        <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900/40 dark:bg-purple-950/20 space-y-3">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {editingId === "new" ? "New FAQ item" : "Edit FAQ item"}
          </p>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Question
            </label>
            <Input
              data-testid="faq-question-input"
              maxLength={FAQ_QUESTION_MAX_LENGTH}
              value={draftQuestion}
              onChange={(e) => setDraftQuestion(e.target.value)}
              placeholder="e.g. Where will the trees be planted?"
            />
            <p className="mt-1 text-right text-[11px] text-zinc-400">
              {draftQuestion.length}/{FAQ_QUESTION_MAX_LENGTH}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Answer
            </label>
            <textarea
              data-testid="faq-answer-input"
              rows={4}
              maxLength={FAQ_ANSWER_MAX_LENGTH}
              value={draftAnswer}
              onChange={(e) => setDraftAnswer(e.target.value)}
              placeholder="Provide a clear and helpful answer…"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <p className="mt-1 text-right text-[11px] text-zinc-400">
              {draftAnswer.length}/{FAQ_ANSWER_MAX_LENGTH}
            </p>
          </div>
          {formError && (
            <p role="alert" className="text-xs text-red-500">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={cancelEditor}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* FAQ list */}
      {items.length === 0 && editingId === null ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-sm text-zinc-500">
            {isCreator
              ? "No FAQ items yet. Click "Add question" to get started."
              : "The creator hasn't added any FAQ items yet."}
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-2" aria-label="FAQ items">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable={isCreator}
              onDragStart={isCreator ? () => handleDragStart(index) : undefined}
              onDragOver={isCreator ? (e) => handleDragOver(e, index) : undefined}
              onDragEnd={isCreator ? handleDragEnd : undefined}
              className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              {/* Question row */}
              <div className="flex items-center gap-2 px-4 py-3">
                {isCreator && (
                  <GripVertical
                    className="h-4 w-4 shrink-0 cursor-grab text-zinc-400"
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  aria-expanded={openId === item.id}
                  onClick={() => setOpenId(openId === item.id ? null : item.id)}
                  className="flex flex-1 items-center justify-between text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  <span>{item.question}</span>
                  {openId === item.id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                </button>
                {isCreator && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Edit FAQ item"
                      onClick={() => openEditor(item)}
                      className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete FAQ item"
                      onClick={() => handleDelete(item.id)}
                      className="rounded p-1 text-zinc-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {/* Answer */}
              {openId === item.id && (
                <div className="border-t border-zinc-200 px-4 pb-4 pt-3 dark:border-zinc-800">
                  <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {item.answer}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {isCreator && (
        <p className="mt-3 text-[11px] text-zinc-400">
          Drag rows to reorder. Up to {FAQ_MAX_ITEMS} questions allowed.
        </p>
      )}
    </section>
  );
}
