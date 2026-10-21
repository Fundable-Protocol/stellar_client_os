"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { CampaignSurvey, SurveyAnswer } from "@/types/campaign-survey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Star, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export interface BackerSurveyResponseFormProps {
  campaignId: string;
  surveyId: string;
}

export function BackerSurveyResponseForm({
  campaignId,
  surveyId,
}: BackerSurveyResponseFormProps) {
  const { address, isConnected, openModal } = useWallet();
  const effectiveAddress = address || "";

  const [survey, setSurvey] = useState<CampaignSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasResponded, setHasResponded] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/surveys/${surveyId}`);
        const data = await res.json();
        if (data.success && data.survey) {
          setSurvey(data.survey);
        }

        if (effectiveAddress) {
          const respRes = await fetch(
            `/api/campaigns/${campaignId}/surveys/${surveyId}/responses?backer=${effectiveAddress}`
          );
          const respData = await respRes.json();
          if (respData.success && respData.hasResponded) {
            setHasResponded(true);
          }
        }
      } catch (err) {
        console.error("Error loading survey:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [campaignId, surveyId, effectiveAddress]);

  const handleAnswerChange = (questionId: string, val: string | number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isConnected || !effectiveAddress) {
      setError("Please connect your Stellar wallet to submit your feedback.");
      openModal();
      return;
    }

    if (!survey) return;

    // Validate required questions
    for (const q of survey.questions) {
      if (q.required) {
        const val = answers[q.id];
        if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
          setError(`Please answer the required question: "${q.title}"`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const formattedAnswers: SurveyAnswer[] = Object.entries(answers).map(([qId, val]) => ({
        questionId: qId,
        value: val,
      }));

      const res = await fetch(`/api/campaigns/${campaignId}/surveys/${surveyId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backerAddress: effectiveAddress,
          answers: formattedAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit survey");
      }

      setSuccess(true);
      setHasResponded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error submitting survey");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-sm text-zinc-400">
        Loading campaign survey...
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="p-8 text-center text-sm text-zinc-400 space-y-3">
        <p>Survey not found or no longer available.</p>
        <Link
          href={`/campaigns/${campaignId}`}
          className="text-purple-400 hover:underline text-xs inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back to campaign
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid="backer-survey-form"
      className="max-w-2xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 md:p-8 space-y-6 shadow-xl"
    >
      <div className="border-b border-zinc-800 pb-4">
        <Link
          href={`/campaigns/${campaignId}`}
          className="text-zinc-400 hover:text-white text-xs inline-flex items-center gap-1 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to campaign
        </Link>
        <h1 className="text-2xl font-bold text-white">{survey.title}</h1>
        {survey.description && (
          <p className="text-sm text-zinc-400 mt-2">{survey.description}</p>
        )}
      </div>

      {hasResponded || success ? (
        <div
          data-testid="survey-success-state"
          className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3"
        >
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <h2 className="text-lg font-semibold text-white">Thank you for your feedback!</h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Your response has been recorded and will help the creator enhance the project milestones and overall backer experience.
          </p>
          <div className="pt-2">
            <Link
              href={`/campaigns/${campaignId}`}
              className="inline-block px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white rounded-lg transition"
            >
              Return to Campaign
            </Link>
          </div>
        </div>
      ) : survey.status !== "published" ? (
        <div className="p-6 rounded-xl bg-zinc-800/60 border border-zinc-700 text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
          <p className="text-sm text-zinc-300">This survey has been closed by the creator.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-xl">
              {error}
            </div>
          )}

          {!isConnected && (
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 flex items-center justify-between">
              <span>Connect your backer wallet to submit your verified answers.</span>
              <Button type="button" size="sm" onClick={openModal} className="text-xs bg-purple-600 hover:bg-purple-500">
                Connect Wallet
              </Button>
            </div>
          )}

          <div className="space-y-6">
            {survey.questions.map((q, idx) => (
              <div
                key={q.id}
                className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/80 space-y-3"
                data-testid={`survey-q-${q.id}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-purple-400">Q{idx + 1}.</span>
                    <h2 className="text-sm font-medium text-white">{q.title}</h2>
                    {q.required && <span className="text-xs text-red-400">*</span>}
                  </div>
                  {q.description && <p className="text-xs text-zinc-400">{q.description}</p>}
                </div>

                {/* Rating Input */}
                {q.type === "rating" && (
                  <div className="flex items-center gap-2 pt-1">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const currentVal = Number(answers[q.id] || 0);
                      const isSelected = currentVal >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onClick={() => handleAnswerChange(q.id, star)}
                          className={`p-2 rounded-lg border transition ${
                            isSelected
                              ? "border-amber-400 bg-amber-400/10 text-amber-400"
                              : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700"
                          }`}
                          title={`Rate ${star} star`}
                        >
                          <Star className={`w-5 h-5 ${isSelected ? "fill-amber-400" : ""}`} />
                        </button>
                      );
                    })}
                    {answers[q.id] && (
                      <span className="text-xs text-zinc-400 ml-2 font-mono">
                        {answers[q.id]} / 5
                      </span>
                    )}
                  </div>
                )}

                {/* Multiple Choice Input */}
                {q.type === "multiple_choice" && (
                  <div className="space-y-2 pt-1">
                    {q.options?.map((option, optIdx) => {
                      const isSelected = answers[q.id] === option;
                      return (
                        <label
                          key={optIdx}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition text-xs ${
                            isSelected
                              ? "border-purple-500 bg-purple-500/10 text-white"
                              : "border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={option}
                            checked={isSelected}
                            onChange={() => handleAnswerChange(q.id, option)}
                            className="text-purple-600 focus:ring-purple-500"
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Text Input */}
                {q.type === "text" && (
                  <div className="pt-1">
                    <textarea
                      rows={3}
                      value={String(answers[q.id] || "")}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      placeholder="Share your thoughts..."
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900/80 p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-zinc-800 flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-6"
              data-testid="submit-survey-btn"
            >
              {submitting ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default BackerSurveyResponseForm;
