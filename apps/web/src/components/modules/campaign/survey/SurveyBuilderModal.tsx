"use client";

import React, { useState } from "react";
import { Plus, Trash2, Send, ListChecks, HelpCircle, Star, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SurveyQuestionType } from "@/types/campaign-survey";

export interface SurveyQuestionDraft {
  type: SurveyQuestionType;
  title: string;
  description: string;
  required: boolean;
  options: string[];
}

export interface SurveyBuilderModalProps {
  campaignId: string;
  creatorAddress: string;
  isOpen: boolean;
  onClose: () => void;
  onSurveyCreated?: () => void;
}

export function SurveyBuilderModal({
  campaignId,
  creatorAddress,
  isOpen,
  onClose,
  onSurveyCreated,
}: SurveyBuilderModalProps) {
  const [title, setTitle] = useState("Post-Campaign Feedback Survey");
  const [description, setDescription] = useState(
    "Help us improve future campaigns and align product expectations."
  );
  const [sendAfterCreate, setSendAfterCreate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<SurveyQuestionDraft[]>([
    {
      type: "rating",
      title: "How satisfied are you with the campaign delivery and updates?",
      description: "Scale of 1 (poor) to 5 (excellent)",
      required: true,
      options: [],
    },
    {
      type: "multiple_choice",
      title: "Which milestone or product feature are you most excited for next?",
      description: "Select the option that best reflects your expectation",
      required: true,
      options: ["Mobile App & Onchain Verification", "Eco-NFT Certificate Perks", "Community Governance"],
    },
    {
      type: "text",
      title: "What feedback or suggestions do you have for the creator team?",
      description: "Open-ended comments or ideas",
      required: false,
      options: [],
    },
  ]);

  if (!isOpen) return null;

  const handleAddQuestion = (type: SurveyQuestionType) => {
    const newQuestion: SurveyQuestionDraft = {
      type,
      title: "",
      description: "",
      required: true,
      options: type === "multiple_choice" ? ["Option 1", "Option 2"] : [],
    };
    setQuestions([...questions, newQuestion]);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleUpdateQuestion = (index: number, patch: Partial<SurveyQuestionDraft>) => {
    setQuestions(
      questions.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );
  };

  const handleAddOption = (questionIndex: number) => {
    const q = questions[questionIndex];
    handleUpdateQuestion(questionIndex, {
      options: [...q.options, `Option ${q.options.length + 1}`],
    });
  };

  const handleUpdateOption = (questionIndex: number, optionIndex: number, val: string) => {
    const q = questions[questionIndex];
    const newOptions = [...q.options];
    newOptions[optionIndex] = val;
    handleUpdateQuestion(questionIndex, { options: newOptions });
  };

  const handleRemoveOption = (questionIndex: number, optionIndex: number) => {
    const q = questions[questionIndex];
    handleUpdateQuestion(questionIndex, {
      options: q.options.filter((_, i) => i !== optionIndex),
    });
  };

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Please provide a survey title.");
      return;
    }
    if (questions.length === 0) {
      setError("Please add at least one question.");
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].title.trim()) {
        setError(`Question #${i + 1} is missing a title.`);
        return;
      }
      if (questions[i].type === "multiple_choice") {
        const validOptions = questions[i].options.filter((o) => o.trim().length > 0);
        if (validOptions.length < 2) {
          setError(`Multiple choice Question #${i + 1} must have at least 2 options.`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      // 1. Create Survey
      const res = await fetch(`/api/campaigns/${campaignId}/surveys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorAddress,
          title: title.trim(),
          description: description.trim(),
          questions: questions.map((q) => ({
            type: q.type,
            title: q.title.trim(),
            description: q.description.trim() || undefined,
            required: q.required,
            options: q.type === "multiple_choice" ? q.options.map((o) => o.trim()).filter(Boolean) : undefined,
            minRating: q.type === "rating" ? 1 : undefined,
            maxRating: q.type === "rating" ? 5 : undefined,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create survey");
      }

      const surveyId = data.survey.id;

      // 2. Dispatch if selected
      if (sendAfterCreate && surveyId) {
        await fetch(`/api/campaigns/${campaignId}/surveys/${surveyId}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorAddress,
            subject: `Feedback Request: ${title}`,
            message: description,
          }),
        });
      }

      onSurveyCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating survey");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="survey-builder-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-purple-400" />
              Create Post-Campaign Backer Survey
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Gather structured feedback on campaign experience and product expectations.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Survey Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Campaign Wrap-up & Product Roadmap Survey"
              className="bg-zinc-800/60 border-zinc-700 text-white text-sm"
              data-testid="survey-title-input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Description / Instructions
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Give context to backers..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-800/60 p-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
              data-testid="survey-desc-input"
            />
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-200">Survey Questions ({questions.length})</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddQuestion("multiple_choice")}
                  className="text-xs border-zinc-700 hover:bg-zinc-800 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-400" /> + Choice
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddQuestion("rating")}
                  className="text-xs border-zinc-700 hover:bg-zinc-800 flex items-center gap-1"
                >
                  <Star className="w-3.5 h-3.5 text-amber-400" /> + Rating
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddQuestion("text")}
                  className="text-xs border-zinc-700 hover:bg-zinc-800 flex items-center gap-1"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> + Text
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {questions.map((q, qIdx) => (
                <div
                  key={qIdx}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3"
                  data-testid={`question-item-${qIdx}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      Q{qIdx + 1} • {q.type.replace("_", " ").toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qIdx)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                      title="Delete question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <Input
                      value={q.title}
                      onChange={(e) => handleUpdateQuestion(qIdx, { title: e.target.value })}
                      placeholder="Question prompt..."
                      className="bg-zinc-800/40 border-zinc-700/60 text-white text-xs"
                      data-testid={`question-title-${qIdx}`}
                    />
                  </div>

                  {q.type === "multiple_choice" && (
                    <div className="space-y-2 pl-2 border-l border-zinc-800">
                      <span className="text-[11px] text-zinc-400">Options:</span>
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <Input
                            value={opt}
                            onChange={(e) => handleUpdateOption(qIdx, optIdx, e.target.value)}
                            className="h-7 text-xs bg-zinc-800/30 border-zinc-700"
                            placeholder={`Option ${optIdx + 1}`}
                          />
                          {q.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(qIdx, optIdx)}
                              className="text-zinc-500 hover:text-red-400"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleAddOption(qIdx)}
                        className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Choice Option
                      </button>
                    </div>
                  )}

                  {q.type === "rating" && (
                    <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <span>Rating 1 to 5 stars (1 = Lowest, 5 = Highest)</span>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => handleUpdateQuestion(qIdx, { required: e.target.checked })}
                      className="rounded border-zinc-700"
                    />
                    Required answer
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={sendAfterCreate}
                onChange={(e) => setSendAfterCreate(e.target.checked)}
                className="rounded border-zinc-700"
              />
              Immediately send to backers via email with in-app notification fallback
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5"
            data-testid="save-survey-btn"
          >
            <Send className="w-4 h-4" />
            {submitting ? "Publishing..." : "Publish & Send Survey"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SurveyBuilderModal;
