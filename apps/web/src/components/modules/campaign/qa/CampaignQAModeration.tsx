"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  EyeOff,
  ThumbsUp,
  Search,
  Filter,
  Send,
  ShieldAlert,
  BadgeCheck,
  Trash2,
  CheckCircle,
  XCircle,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQAModeration } from "@/hooks/use-qa-moderation";
import type { QAItem, QAItemStatus } from "@/types/qa";
import { cn } from "@/lib/utils";

export interface CampaignQAModerationProps {
  campaignId: string;
  campaignTitle?: string;
}

const STATUS_FILTERS: { label: string; value: QAItemStatus | "all"; icon: React.ReactNode }[] = [
  { label: "All", value: "all", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { label: "Visible", value: "visible", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  { label: "Flagged", value: "flagged", icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> },
  { label: "Hidden", value: "hidden", icon: <EyeOff className="h-3.5 w-3.5 text-red-400" /> },
];

function TimeAgo({ timestamp }: { timestamp: number }) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return <span>{days}d ago</span>;
  if (hours > 0) return <span>{hours}h ago</span>;
  return <span>{minutes}m ago</span>;
}

function SpamBadge({ score }: { score: number }) {
  if (score === 0) return null;
  const color =
    score >= 80
      ? "bg-red-600 text-white"
      : score >= 60
        ? "bg-amber-600 text-white"
        : score >= 40
          ? "bg-yellow-600 text-black"
          : "bg-zinc-600 text-white";
  return (
    <Badge className={cn("text-[10px] font-bold", color)}>
      <ShieldAlert className="mr-1 h-3 w-3" />
      Spam {score}%
    </Badge>
  );
}

function QACard({
  item,
  onHide,
  onApprove,
  onDelete,
  onUpvote,
}: {
  item: QAItem;
  onHide: () => void;
  onApprove: () => void;
  onDelete: () => void;
  onUpvote: () => void;
}) {
  const [showSignals, setShowSignals] = useState(false);

  const isHidden = item.status === "hidden";
  const isFlagged = item.status === "flagged";

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3 transition-all",
        item.isVerifiedBacker
          ? "border-emerald-600/40 bg-emerald-950/10"
          : "border-zinc-800 bg-zinc-900/60",
        isHidden && "opacity-50 border-red-800/40 bg-red-950/10",
        isFlagged && "border-amber-700/40 bg-amber-950/10",
      )}
    >
      {/* Author row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {item.isVerifiedBacker && (
            <Badge className="bg-emerald-600 text-white text-[10px] font-semibold">
              <BadgeCheck className="mr-1 h-3 w-3" /> Verified Backer
            </Badge>
          )}
          <span className="text-xs font-semibold text-zinc-200">
            {item.authorName ?? item.authorAddress}
          </span>
          <span className="text-[10px] text-zinc-500">
            <TimeAgo timestamp={item.createdAt} />
          </span>
        </div>

        <div className="flex items-center gap-2">
          {item.spamVerdict && <SpamBadge score={item.spamVerdict.score} />}
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-medium",
              item.status === "visible" && "border-emerald-600 text-emerald-400",
              item.status === "flagged" && "border-amber-600 text-amber-400",
              item.status === "hidden" && "border-red-600 text-red-400",
            )}
          >
            {item.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <p className={cn("text-sm leading-relaxed", isHidden ? "text-zinc-500 line-through" : "text-zinc-200")}>
        {item.content}
      </p>

      {/* Spam signals */}
      {item.spamVerdict && item.spamVerdict.signals.some((s) => s.triggered) && (
        <div>
          <button
            onClick={() => setShowSignals(!showSignals)}
            className="text-[10px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
          >
            <AlertTriangle className="h-3 w-3" />
            {showSignals ? "Hide signals" : `Show ${item.spamVerdict.signals.filter((s) => s.triggered).length} spam signals`}
          </button>
          {showSignals && (
            <div className="mt-2 space-y-1 pl-4 border-l-2 border-amber-700/40">
              {item.spamVerdict.signals
                .filter((s) => s.triggered)
                .map((s) => (
                  <div key={s.name} className="text-[10px] text-amber-300/80">
                    <span className="font-mono font-bold">{s.name}</span>
                    {s.details && <span className="ml-2 text-zinc-500">— {s.details}</span>}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={onUpvote}
          className="border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800 h-7"
        >
          <ThumbsUp className="mr-1 h-3 w-3" /> {item.upvotes}
        </Button>

        {item.status !== "visible" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onApprove}
            className="border-emerald-700 bg-emerald-950/40 text-xs text-emerald-400 hover:bg-emerald-900/40 h-7"
          >
            <CheckCircle className="mr-1 h-3 w-3" /> Approve
          </Button>
        )}

        {item.status === "visible" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onHide}
            className="border-red-700 bg-red-950/40 text-xs text-red-400 hover:bg-red-900/40 h-7"
          >
            <EyeOff className="mr-1 h-3 w-3" /> Hide
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          className="border-zinc-700 bg-zinc-900 text-xs text-zinc-400 hover:bg-red-950/40 hover:text-red-400 h-7"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function CampaignQAModeration({
  campaignId,
  campaignTitle = "Campaign",
}: CampaignQAModerationProps) {
  const qa = useQAModeration({ campaignId });
  const [newQuestion, setNewQuestion] = useState("");
  const [bulkCount, setBulkCount] = useState<number | null>(null);

  const handleSubmitQuestion = () => {
    if (!newQuestion.trim()) return;
    qa.addItem({
      campaignId,
      authorAddress: "GD6W...X892",
      authorName: "You",
      content: newQuestion.trim(),
    });
    setNewQuestion("");
  };

  const handleBulkModerate = () => {
    const count = qa.bulkModerate();
    setBulkCount(count);
    setTimeout(() => setBulkCount(null), 3000);
  };

  return (
    <section className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-zinc-50 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-purple-400" />
            Q&A &amp; Discussion
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Community questions &amp; answers for {campaignTitle} — moderated by AI spam detection.
          </p>
        </div>

        {/* Moderation stats */}
        <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-purple-400" />
            <div>
              <span className="text-zinc-400 block text-[10px]">Total</span>
              <strong className="text-zinc-100 font-bold text-sm">{qa.stats.totalItems}</strong>
            </div>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-400" />
            <div>
              <span className="text-zinc-400 block text-[10px]">Avg Spam</span>
              <strong className="text-zinc-100 font-bold text-sm">{qa.stats.avgSpamScore}%</strong>
            </div>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <div>
              <span className="text-zinc-400 block text-[10px]">Flagged</span>
              <strong className="text-zinc-100 font-bold text-sm">{qa.stats.flaggedItems}</strong>
            </div>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <EyeOff className="h-4 w-4 text-red-400" />
            <div>
              <span className="text-zinc-400 block text-[10px]">Hidden</span>
              <strong className="text-zinc-100 font-bold text-sm">{qa.stats.hiddenItems}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* New Question Input */}
      <div className="flex gap-2">
        <Input
          placeholder="Ask a question about this campaign..."
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmitQuestion()}
          className="flex-1 border-zinc-700 bg-zinc-900 text-xs text-zinc-100 placeholder:text-zinc-500"
        />
        <Button
          onClick={handleSubmitQuestion}
          disabled={!newQuestion.trim()}
          className="bg-purple-600 text-white hover:bg-purple-700 text-xs font-semibold"
        >
          <Send className="mr-1.5 h-3.5 w-3.5" /> Post
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search questions or authors..."
            value={qa.searchQuery}
            onChange={(e) => qa.setSearchQuery(e.target.value)}
            className="pl-9 border-zinc-700 bg-zinc-900 text-xs text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter buttons */}
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            {STATUS_FILTERS.map((sf) => (
              <button
                key={sf.value}
                onClick={() => qa.setFilterStatus(sf.value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1",
                  qa.filterStatus === sf.value
                    ? "bg-purple-600 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800",
                )}
              >
                {sf.icon}
                {sf.label}
              </button>
            ))}
          </div>

          {/* Bulk moderate button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkModerate}
            className="border-amber-700 bg-amber-950/40 text-xs text-amber-400 hover:bg-amber-900/40"
          >
            <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
            Bulk Moderate
          </Button>
          {bulkCount !== null && (
            <span className="text-[10px] text-emerald-400 font-semibold">
              {bulkCount > 0 ? `${bulkCount} items moderated` : "No spam detected"}
            </span>
          )}
        </div>
      </div>

      {/* Q&A Items List */}
      {qa.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-xs text-zinc-500">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 text-zinc-700" />
          No questions match the current filter. Be the first to ask!
        </div>
      ) : (
        <div className="space-y-3">
          {qa.items.map((item) => (
            <QACard
              key={item.id}
              item={item}
              onHide={() => qa.hideItem(item.id)}
              onApprove={() => qa.approveItem(item.id)}
              onDelete={() => qa.deleteItem(item.id)}
              onUpvote={() => qa.upvoteItem(item.id)}
            />
          ))}
        </div>
      )}

      {/* Top Spam Signals */}
      {qa.stats.topSpamSignals.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5" />
            Top Spam Signals
          </h4>
          <div className="flex flex-wrap gap-2">
            {qa.stats.topSpamSignals.map((s) => (
              <Badge
                key={s.signal}
                variant="outline"
                className="border-amber-800 text-amber-300 text-[10px] font-mono"
              >
                {s.signal}: {s.count}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default CampaignQAModeration;
