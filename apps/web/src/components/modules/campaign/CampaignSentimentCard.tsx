"use client";

import React, { useState } from "react";
import type { CampaignSentiment } from "@/lib/sentiment";

export interface CampaignSentimentCardProps {
  campaignId: string;
  sentiment: CampaignSentiment;
  onInitiateOutreach?: (campaignId: string) => void;
}

/**
 * CampaignSentimentCard Component (Issue #881)
 *
 * Displays sponsor sentiment analysis and reviews gauge for a campaign.
 * Automatically flags low-sentiment campaigns and provides creator outreach actions.
 */
export const CampaignSentimentCard: React.FC<CampaignSentimentCardProps> = ({
  campaignId,
  sentiment,
  onInitiateOutreach,
}) => {
  const [outreachSent, setOutreachSent] = useState(false);

  const getBadgeStyle = (label: string) => {
    switch (label) {
      case "positive":
        return "bg-emerald-950 text-emerald-300 border-emerald-700/60";
      case "neutral":
        return "bg-amber-950 text-amber-300 border-amber-700/60";
      case "negative":
        return "bg-rose-950 text-rose-300 border-rose-700/60";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  const handleOutreach = () => {
    setOutreachSent(true);
    if (onInitiateOutreach) {
      onInitiateOutreach(campaignId);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white">Sponsor Sentiment & Feedback</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            NLP-analyzed sponsor satisfaction and comment sentiment.
          </p>
        </div>
        <span
          className={`px-3 py-1 text-xs font-bold rounded-full border capitalize ${getBadgeStyle(
            sentiment.label
          )}`}
        >
          {sentiment.label}
        </span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">
            {sentiment.averageScore !== null ? sentiment.averageScore.toFixed(2) : "N/A"}
          </div>
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">
            Sentiment Score
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">
            {sentiment.averageRating !== null ? `${sentiment.averageRating.toFixed(1)} / 5` : "N/A"}
          </div>
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">
            Avg Rating
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{sentiment.totalFeedback}</div>
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">
            Reviews
          </div>
        </div>
      </div>

      {/* Low Sentiment Outreach Alert Banner */}
      {sentiment.needsOutreach && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
              <span>⚠️</span> Creator Outreach Recommended
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Low sponsor sentiment detected. Contact the campaign creator to address feedback.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOutreach}
            disabled={outreachSent}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition shrink-0 ${
              outreachSent
                ? "bg-slate-800 text-slate-400 border border-slate-700"
                : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30"
            }`}
          >
            {outreachSent ? "✓ Outreach Initiated" : "Initiate Outreach"}
          </button>
        </div>
      )}
    </div>
  );
};
