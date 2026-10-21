"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { Star, BarChart3, Plus, RefreshCw, Send, CheckCircle2, MessageSquare, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignSurvey, SurveyAnalyticsSummary } from "@/types/campaign-survey";
import { SurveyBuilderModal } from "./SurveyBuilderModal";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts";

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];

export interface CreatorSurveyResultsDashboardProps {
  campaignId: string;
  creatorAddress?: string;
  campaignStatus?: string;
}

export function CreatorSurveyResultsDashboard({
  campaignId,
  creatorAddress,
  campaignStatus,
}: CreatorSurveyResultsDashboardProps) {
  const { address } = useWallet();
  const effectiveCreator = creatorAddress || address || "";

  const [surveys, setSurveys] = useState<CampaignSurvey[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<SurveyAnalyticsSummary | null>(null);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  const fetchSurveys = async () => {
    setLoadingSurveys(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/surveys`);
      const data = await res.json();
      if (data.success && Array.isArray(data.surveys)) {
        setSurveys(data.surveys);
        if (data.surveys.length > 0 && !selectedSurveyId) {
          setSelectedSurveyId(data.surveys[0].id);
        }
      }
    } catch (err) {
      console.error("Error fetching surveys:", err);
    } finally {
      setLoadingSurveys(false);
    }
  };

  const fetchAnalytics = async (surveyId: string) => {
    setLoadingAnalytics(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/surveys/${surveyId}/analytics`);
      const data = await res.json();
      if (data.success && data.analytics) {
        setAnalytics(data.analytics);
      }
    } catch (err) {
      console.error("Error fetching analytics:", err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    fetchSurveys();
  }, [campaignId]);

  useEffect(() => {
    if (selectedSurveyId) {
      fetchAnalytics(selectedSurveyId);
    } else {
      setAnalytics(null);
    }
  }, [selectedSurveyId]);

  const handleDispatchSurvey = async (surveyId: string) => {
    setDispatchStatus("Sending...");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/surveys/${surveyId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorAddress: effectiveCreator }),
      });
      const data = await res.json();
      if (data.success) {
        setDispatchStatus(`Sent to ${data.totalBackers} backers (${data.emailCount} emails, ${data.inAppCount} in-app notifications).`);
      } else {
        setDispatchStatus(`Dispatch error: ${data.error}`);
      }
    } catch (err) {
      setDispatchStatus("Network error sending survey.");
    }
    setTimeout(() => setDispatchStatus(null), 5000);
  };

  return (
    <section
      data-testid="creator-survey-dashboard"
      className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Post-Campaign Backer Surveys</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Collect and visualize backer feedback on product expectations, fulfillment, and campaign experience.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchSurveys}
            disabled={loadingSurveys}
            className="border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800"
            title="Refresh surveys"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSurveys ? "animate-spin" : ""}`} />
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setIsBuilderOpen(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs flex items-center gap-1.5"
            data-testid="open-survey-builder-btn"
          >
            <Plus className="w-4 h-4" />
            New Survey
          </Button>
        </div>
      </div>

      {dispatchStatus && (
        <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
          <span>{dispatchStatus}</span>
        </div>
      )}

      {/* Survey Selection Tabs */}
      {surveys.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-zinc-800/40">
            {surveys.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSurveyId(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                  selectedSurveyId === s.id
                    ? "bg-purple-600/20 text-purple-300 border border-purple-500/30"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }`}
              >
                <span>{s.title}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] ${
                    s.status === "published"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-zinc-700 text-zinc-300"
                  }`}
                >
                  {s.status}
                </span>
              </button>
            ))}
          </div>

          {/* Survey Action Bar */}
          {selectedSurveyId && (
            <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-950/40 p-3 rounded-xl border border-zinc-800/60">
              <div className="flex items-center gap-3">
                <span>
                  Responses: <strong className="text-white">{analytics?.totalResponses ?? 0}</strong>
                </span>
                <span>•</span>
                <span>
                  Response Rate:{" "}
                  <strong className="text-purple-300">{analytics?.responseRatePct ?? 0}%</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDispatchSurvey(selectedSurveyId)}
                  className="h-7 text-xs border-zinc-700 hover:bg-zinc-800 flex items-center gap-1.5 text-zinc-200"
                >
                  <Send className="w-3 h-3 text-purple-400" /> Resend to Backers
                </Button>
                <a
                  href={`/campaigns/${campaignId}/surveys/${selectedSurveyId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="h-7 px-2.5 rounded-md border border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-200 text-xs inline-flex items-center gap-1"
                >
                  Backer View <ChevronRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Charts & Breakdown */}
          {loadingAnalytics ? (
            <div className="p-12 text-center text-xs text-zinc-500">Loading survey results...</div>
          ) : analytics && analytics.questions.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              {analytics.questions.map((q) => (
                <div
                  key={q.questionId}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 space-y-4"
                  data-testid={`analytics-card-${q.questionId}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {q.type.replace("_", " ")}
                      </span>
                      <h3 className="text-sm font-semibold text-white mt-1.5">{q.title}</h3>
                    </div>
                    <span className="text-xs text-zinc-400 font-mono whitespace-nowrap">
                      {q.totalAnswers} {q.totalAnswers === 1 ? "answer" : "answers"}
                    </span>
                  </div>

                  {/* Rating Chart */}
                  {q.type === "rating" && q.ratingMetric && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 bg-zinc-900/60 p-3 rounded-lg border border-zinc-800">
                        <div className="flex items-center gap-1 text-amber-400">
                          <Star className="w-5 h-5 fill-amber-400" />
                          <span className="text-2xl font-bold">{q.ratingMetric.average}</span>
                        </div>
                        <div className="text-xs text-zinc-400">
                          Average rating based on {q.ratingMetric.count} ratings
                        </div>
                      </div>

                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              { rating: "1 Star", count: q.ratingMetric.distribution[1] || 0 },
                              { rating: "2 Stars", count: q.ratingMetric.distribution[2] || 0 },
                              { rating: "3 Stars", count: q.ratingMetric.distribution[3] || 0 },
                              { rating: "4 Stars", count: q.ratingMetric.distribution[4] || 0 },
                              { rating: "5 Stars", count: q.ratingMetric.distribution[5] || 0 },
                            ]}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <XAxis dataKey="rating" stroke="#71717a" fontSize={11} tickLine={false} />
                            <YAxis stroke="#71717a" fontSize={11} tickLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: 12 }}
                            />
                            <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Multiple Choice Chart */}
                  {q.type === "multiple_choice" && q.optionMetrics && (
                    <div className="space-y-4">
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            layout="vertical"
                            data={q.optionMetrics.map((opt) => ({
                              name: opt.option,
                              count: opt.count,
                              percentage: opt.percentage,
                            }))}
                            margin={{ top: 5, right: 25, left: 10, bottom: 5 }}
                          >
                            <XAxis type="number" stroke="#71717a" fontSize={11} allowDecimals={false} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              stroke="#71717a"
                              fontSize={11}
                              width={110}
                              tickLine={false}
                            />
                            <Tooltip
                              formatter={(value: any, _name: any, item: any) => [
                                `${value} votes (${item.payload.percentage}%)`,
                                "Selected",
                              ]}
                              contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: 12 }}
                            />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                              {q.optionMetrics.map((_, i) => (
                                <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Text Responses List */}
                  {q.type === "text" && (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {q.textResponses && q.textResponses.length > 0 ? (
                        q.textResponses.map((tr, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs space-y-1"
                          >
                            <p className="text-zinc-200">{tr.text}</p>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              {tr.backerAddress.slice(0, 6)}...{tr.backerAddress.slice(-4)} •{" "}
                              {new Date(tr.submittedAt).toLocaleDateString()}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-zinc-500">
                          No text feedback submitted yet.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-zinc-500">
              No survey analytics available yet. Share the survey with backers to collect responses!
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl space-y-3">
          <p className="text-xs text-zinc-400">
            No backer surveys created yet for this campaign.
          </p>
          <Button
            size="sm"
            onClick={() => setIsBuilderOpen(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs"
          >
            Create Your First Survey
          </Button>
        </div>
      )}

      {/* Builder Modal */}
      <SurveyBuilderModal
        campaignId={campaignId}
        creatorAddress={effectiveCreator}
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        onSurveyCreated={() => {
          fetchSurveys();
        }}
      />
    </section>
  );
}

export default CreatorSurveyResultsDashboard;
