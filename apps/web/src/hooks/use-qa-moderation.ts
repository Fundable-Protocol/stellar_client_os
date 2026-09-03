"use client";

import { useState, useCallback, useMemo } from "react";
import type {
  QAItem,
  QAModerationStats,
  CreateQAItemInput,
  QAItemStatus,
} from "@/types/qa";
import { detectSpam } from "@/lib/spam-detection";
import { INITIAL_MOCK_QA_ITEMS } from "@/types/qa";

interface UseQAModerationOptions {
  campaignId: string;
}

interface UseQAModerationReturn {
  items: QAItem[];
  stats: QAModerationStats;
  filterStatus: QAItemStatus | "all";
  setFilterStatus: (status: QAItemStatus | "all") => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  addItem: (input: CreateQAItemInput) => QAItem;
  moderateItem: (itemId: string) => void;
  hideItem: (itemId: string) => void;
  approveItem: (itemId: string) => void;
  deleteItem: (itemId: string) => void;
  upvoteItem: (itemId: string) => void;
  bulkModerate: () => number;
}

export function useQAModeration({
  campaignId,
}: UseQAModerationOptions): UseQAModerationReturn {
  const [items, setItems] = useState<QAItem[]>(() =>
    INITIAL_MOCK_QA_ITEMS.filter((i) => i.campaignId === campaignId),
  );
  const [filterStatus, setFilterStatus] = useState<QAItemStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filtered items based on status and search
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesStatus =
        filterStatus === "all" || item.status === filterStatus;
      const matchesSearch =
        !searchQuery ||
        item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.authorName?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [items, filterStatus, searchQuery]);

  // Stats
  const stats: QAModerationStats = useMemo(() => {
    const all = items;
    const visible = all.filter((i) => i.status === "visible");
    const flagged = all.filter((i) => i.status === "flagged");
    const hidden = all.filter((i) => i.status === "hidden");
    const scores = all
      .map((i) => i.spamVerdict?.score ?? 0)
      .filter((s) => s > 0);
    const avgSpamScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

    // Top spam signals
    const signalCounts: Record<string, number> = {};
    all.forEach((item) => {
      item.spamVerdict?.signals
        ?.filter((s) => s.triggered)
        .forEach((s) => {
          signalCounts[s.name] = (signalCounts[s.name] || 0) + 1;
        });
    });
    const topSpamSignals = Object.entries(signalCounts)
      .map(([signal, count]) => ({ signal, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalItems: all.length,
      visibleItems: visible.length,
      flaggedItems: flagged.length,
      hiddenItems: hidden.length,
      avgSpamScore,
      topSpamSignals,
    };
  }, [items]);

  const addItem = useCallback(
    (input: CreateQAItemInput): QAItem => {
      const verdict = detectSpam(input.content, false);
      const newItem: QAItem = {
        id: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        campaignId: input.campaignId,
        authorAddress: input.authorAddress,
        authorName: input.authorName,
        isVerifiedBacker: false,
        content: input.content,
        createdAt: Date.now(),
        status: verdict.action === "hide" ? "hidden" : verdict.action === "flag" ? "flagged" : "visible",
        spamVerdict: verdict,
        replyToId: input.replyToId,
        upvotes: 0,
      };
      setItems((prev) => [newItem, ...prev]);
      return newItem;
    },
    [],
  );

  const moderateItem = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const verdict = detectSpam(item.content, item.isVerifiedBacker);
        return {
          ...item,
          spamVerdict: verdict,
          status: verdict.action === "hide" ? "hidden" : verdict.action === "flag" ? "flagged" : "visible",
        };
      }),
    );
  }, []);

  const hideItem = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status: "hidden" as const } : item,
      ),
    );
  }, []);

  const approveItem = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status: "visible" as const } : item,
      ),
    );
  }, []);

  const deleteItem = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status: "deleted" as const } : item,
      ),
    );
  }, []);

  const upvoteItem = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, upvotes: item.upvotes + 1 } : item,
      ),
    );
  }, []);

  const bulkModerate = useCallback((): number => {
    let count = 0;
    setItems((prev) =>
      prev.map((item) => {
        if (item.status !== "visible") return item;
        const verdict = detectSpam(item.content, item.isVerifiedBacker);
        if (verdict.action !== "approve") {
          count++;
          return {
            ...item,
            spamVerdict: verdict,
            status: verdict.action === "hide" ? "hidden" : "flagged",
          };
        }
        return item;
      }),
    );
    return count;
  }, []);

  return {
    items: filteredItems,
    stats,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    addItem,
    moderateItem,
    hideItem,
    approveItem,
    deleteItem,
    upvoteItem,
    bulkModerate,
  };
}
