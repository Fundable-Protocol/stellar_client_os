"use client";

import React, { useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Eye,
  Megaphone,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreatorSocialSettings } from "./CreatorSocialSettings";
import { SocialPostPreview } from "./SocialPostPreview";
import {
  ALL_SCHEDULABLE_PLATFORMS,
  SCHEDULABLE_PLATFORMS,
  buildMultiPlatformPreviews,
  cancelScheduledPost,
  getCalendarMonthGrid,
  getCreatorSocialSettings,
  groupScheduledPostsByDate,
  listScheduledPosts,
  normalizeHashtags,
  scheduleSocialPost,
  type CreatorSocialSettings as CreatorSocialSettingsRecord,
  type SchedulablePlatform,
  type ScheduledSocialPost,
} from "@/services/campaign-social-scheduler.service";

export interface CampaignSocialSchedulerProps {
  campaignId?: string;
  campaignTitle?: string;
  creatorAddress?: string;
  campaignUrl?: string;
  /** Optional initial calendar date (YYYY-MM-DD) for deterministic testing */
  initialDateKey?: string;
}

interface PromotionalPreset {
  id: string;
  label: string;
  getText: (title: string) => string;
  hashtags: string;
}

const PROMOTIONAL_PRESETS: PromotionalPreset[] = [
  {
    id: "launch",
    label: "Campaign Launch",
    getText: (title) =>
      `We just launched "${title}" on Fundable! Every contribution streams transparently on Stellar to fund verified tree planting and carbon sequestration.`,
    hashtags: "#Fundable, #Stellar, #Reforestation, #ClimateAction",
  },
  {
    id: "milestone",
    label: "50% Milestone Update",
    getText: (title) =>
      `Incredible momentum: "${title}" has crossed 50% of its funding goal with 1,500+ native trees planted! Join our community of verified climate backers today.`,
    hashtags: "#ClimateImpact, #Stellar, #TreePlanting",
  },
  {
    id: "final-push",
    label: "Final 48 Hours Push",
    getText: (title) =>
      `Final 48 hours to back "${title}"! Help us unlock our final restoration milestone and receive your on-chain Impact NFT certificate.`,
    hashtags: "#Reforestation, #ReFi, #Fundable",
  },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDefaultFutureDateKey(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const y = tomorrow.getUTCFullYear();
  const m = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(tomorrow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const CampaignSocialScheduler: React.FC<CampaignSocialSchedulerProps> = ({
  campaignId = "camp-101",
  campaignTitle = "Save the Amazon RainForest Reserve",
  creatorAddress = "GD6W...X892",
  campaignUrl,
  initialDateKey,
}) => {
  const defaultDateKey = useMemo(
    () => initialDateKey || getDefaultFutureDateKey(),
    [initialDateKey],
  );

  const [settings, setSettings] = useState<CreatorSocialSettingsRecord>(() =>
    getCreatorSocialSettings(creatorAddress),
  );

  const [posts, setPosts] = useState<ScheduledSocialPost[]>(() =>
    listScheduledPosts({ campaignId }),
  );

  const [selectedPlatforms, setSelectedPlatforms] = useState<SchedulablePlatform[]>([
    "twitter",
    "facebook",
    "linkedin",
  ]);

  const [content, setContent] = useState<string>(() =>
    PROMOTIONAL_PRESETS[0].getText(campaignTitle),
  );
  const [hashtagsInput, setHashtagsInput] = useState<string>(() =>
    settings.defaultHashtags.join(", "),
  );

  const [selectedDateKey, setSelectedDateKey] = useState<string>(defaultDateKey);
  const [selectedTime, setSelectedTime] = useState<string>("14:00");

  const initialYear = Number(defaultDateKey.slice(0, 4)) || 2026;
  const initialMonthIndex = (Number(defaultDateKey.slice(5, 7)) || 10) - 1;
  const [calendarYear, setCalendarYear] = useState<number>(initialYear);
  const [calendarMonthIndex, setCalendarMonthIndex] = useState<number>(initialMonthIndex);

  const [previewReviewed, setPreviewReviewed] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  const resolvedCampaignUrl =
    campaignUrl || `https://fundable.protocol/campaigns/${encodeURIComponent(campaignId)}`;

  const scheduledIso = `${selectedDateKey}T${selectedTime || "14:00"}:00.000Z`;

  const parsedHashtags = useMemo(
    () => normalizeHashtags(hashtagsInput),
    [hashtagsInput],
  );

  const previews = useMemo(
    () =>
      buildMultiPlatformPreviews({
        platforms: selectedPlatforms,
        content,
        hashtags: parsedHashtags,
        campaignTitle,
        campaignUrl: resolvedCampaignUrl,
        scheduledFor: scheduledIso,
        settings,
      }),
    [selectedPlatforms, content, parsedHashtags, campaignTitle, resolvedCampaignUrl, scheduledIso, settings],
  );

  const calendarCells = useMemo(
    () => getCalendarMonthGrid(calendarYear, calendarMonthIndex),
    [calendarYear, calendarMonthIndex],
  );

  const postsByDate = useMemo(() => groupScheduledPostsByDate(posts), [posts]);

  const activePostsForSelectedDate = useMemo(
    () => postsByDate[selectedDateKey] ?? [],
    [postsByDate, selectedDateKey],
  );

  const allActivePosts = useMemo(
    () => posts.filter((p) => p.status !== "cancelled"),
    [posts],
  );

  const togglePlatform = (platform: SchedulablePlatform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform],
    );
    setPreviewReviewed(false);
  };

  const handleApplyPreset = (preset: PromotionalPreset) => {
    setContent(preset.getText(campaignTitle));
    setHashtagsInput(preset.hashtags);
    setPreviewReviewed(false);
    setFeedback(null);
  };

  const handlePreviousMonth = () => {
    if (calendarMonthIndex === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonthIndex(11);
    } else {
      setCalendarMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonthIndex === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonthIndex(0);
    } else {
      setCalendarMonthIndex((m) => m + 1);
    }
  };

  const handleSelectCalendarDay = (dateKey: string, year: number, monthIndex: number) => {
    setSelectedDateKey(dateKey);
    if (year !== calendarYear || monthIndex !== calendarMonthIndex) {
      setCalendarYear(year);
      setCalendarMonthIndex(monthIndex);
    }
    setFeedback(null);
  };

  const handlePreviewBeforeSchedule = () => {
    setPreviewReviewed(true);
    setFeedback({
      type: "success",
      message: "Post preview verified across selected platforms. Ready to schedule!",
    });
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const result = scheduleSocialPost({
      campaignId,
      campaignTitle,
      creatorAddress,
      platforms: selectedPlatforms,
      content,
      hashtags: parsedHashtags,
      campaignUrl: resolvedCampaignUrl,
      scheduledFor: scheduledIso,
    });

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setPosts(listScheduledPosts({ campaignId }));
    setPreviewReviewed(false);
    setFeedback({
      type: "success",
      message: `Scheduled promotional post for ${selectedDateKey} at ${selectedTime} (${settings.timezone}) across ${result.post.platforms
        .map((p) => SCHEDULABLE_PLATFORMS[p].label)
        .join(", ")}.`,
    });
  };

  const handleCancelPost = (postId: string) => {
    cancelScheduledPost(postId);
    setPosts(listScheduledPosts({ campaignId }));
    setFeedback({
      type: "success",
      message: "Cancelled scheduled promotional post.",
    });
  };

  return (
    <div className="space-y-8" data-testid="campaign-social-scheduler">
      {/* Header Banner */}
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900 via-purple-950/25 to-zinc-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-purple-600 text-white text-xs font-semibold">
                <Megaphone className="mr-1 h-3 w-3" aria-hidden="true" /> Campaign Promotions
              </Badge>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-xs">
                {allActivePosts.length} Scheduled Post{allActivePosts.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <h2 className="text-2xl font-extrabold text-zinc-50 tracking-tight">
              Social Media Post Scheduler
            </h2>
            <p className="text-sm text-zinc-400">
              Connect your Twitter/X, Facebook, and LinkedIn accounts, preview promotional posts, and schedule campaigns on your calendar for{" "}
              <strong className="text-zinc-200">{campaignTitle}</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* 1. Acceptance Criterion 1: Social media account connections in creator settings */}
      <CreatorSocialSettings
        creatorAddress={creatorAddress}
        settings={settings}
        onSettingsChange={(next) => {
          setSettings(next);
          setFeedback(null);
        }}
      />

      {/* 2. Acceptance Criterion 2: Post scheduler with calendar UI */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Post Composer Form (Left 7 Cols) */}
        <form
          onSubmit={handleScheduleSubmit}
          data-testid="social-post-scheduler-form"
          className="lg:col-span-7 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" aria-hidden="true" />
                Compose Promotional Post
              </h3>
              <p className="mt-1 text-xs text-zinc-400">
                Select target accounts, customize your campaign message, and choose a date from the calendar.
              </p>
            </div>
          </div>

          {/* Quick Templates */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-zinc-300">
              Promotional Copy Presets
            </span>
            <div className="flex flex-wrap gap-2">
              {PROMOTIONAL_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid={`preset-btn-${preset.id}`}
                  onClick={() => handleApplyPreset(preset)}
                  className="border-zinc-700 bg-zinc-950 text-xs text-zinc-200 hover:border-purple-500/50 hover:bg-purple-950/30"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Target Platforms Selection */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-zinc-300">
              Target Social Platforms
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {ALL_SCHEDULABLE_PLATFORMS.map((platform) => {
                const meta = SCHEDULABLE_PLATFORMS[platform];
                const isSelected = selectedPlatforms.includes(platform);
                const isConnected = settings.accounts[platform]?.connected;

                return (
                  <button
                    key={platform}
                    type="button"
                    role="switch"
                    aria-checked={isSelected}
                    aria-label={`Target ${meta.label}`}
                    data-testid={`platform-toggle-${platform}`}
                    onClick={() => togglePlatform(platform)}
                    className={`flex items-center justify-between rounded-lg border p-3 text-left text-xs transition-all ${
                      isSelected
                        ? "border-purple-500 bg-purple-950/30 text-zinc-100"
                        : "border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold text-white"
                        style={{ backgroundColor: meta.accentColor }}
                      >
                        {meta.shortLabel}
                      </span>
                      <div>
                        <p className="font-semibold">{meta.label}</p>
                        <p className="text-[10px] text-zinc-400">
                          {isConnected ? settings.accounts[platform].handle : "Not connected"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isSelected ? "bg-emerald-400" : "bg-zinc-700"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Post Content */}
          <div>
            <label htmlFor="social-post-content" className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Promotional Post Copy
            </label>
            <textarea
              id="social-post-content"
              data-testid="social-post-content-input"
              rows={4}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setPreviewReviewed(false);
              }}
              placeholder="Share your campaign's progress, impact metrics, and call-to-action..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Hashtags */}
          <div>
            <label htmlFor="social-post-hashtags" className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Hashtags
            </label>
            <input
              id="social-post-hashtags"
              type="text"
              data-testid="social-post-hashtags-input"
              value={hashtagsInput}
              onChange={(e) => {
                setHashtagsInput(e.target.value);
                setPreviewReviewed(false);
              }}
              placeholder="#Fundable, #Stellar, #Reforestation"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Date & Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="social-post-date" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
                  Scheduled Date
                </span>
              </label>
              <input
                id="social-post-date"
                type="date"
                data-testid="social-post-date-input"
                value={selectedDateKey}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedDateKey(val);
                  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                    setCalendarYear(Number(val.slice(0, 4)));
                    setCalendarMonthIndex(Number(val.slice(5, 7)) - 1);
                  }
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label htmlFor="social-post-time" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  Scheduled Time ({settings.timezone})
                </span>
              </label>
              <input
                id="social-post-time"
                type="time"
                data-testid="social-post-time-input"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {feedback && (
            <div
              role={feedback.type === "error" ? "alert" : "status"}
              data-testid="scheduler-feedback"
              className={`rounded-lg border px-4 py-3 text-xs font-medium flex items-center gap-2 ${
                feedback.type === "error"
                  ? "border-rose-700/50 bg-rose-950/30 text-rose-300"
                  : "border-emerald-700/50 bg-emerald-950/30 text-emerald-300"
              }`}
            >
              {feedback.type === "success" && (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              data-testid="preview-before-schedule-btn"
              onClick={handlePreviewBeforeSchedule}
              className="border-emerald-700/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 text-xs font-semibold"
            >
              <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {previewReviewed ? "Preview Verified" : "Preview Post"}
            </Button>

            <Button
              type="submit"
              data-testid="schedule-post-submit-btn"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 text-xs font-bold text-white hover:from-purple-700 hover:to-indigo-700"
            >
              <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Schedule Promotional Post
            </Button>
          </div>
        </form>

        {/* Calendar UI & Selected Date Queue (Right 5 Cols) */}
        <section
          data-testid="social-scheduler-calendar"
          aria-labelledby="calendar-scheduler-heading"
          className="lg:col-span-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5 flex flex-col justify-between"
        >
          <div className="space-y-4">
            {/* Calendar Header & Month Navigation */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3
                  id="calendar-scheduler-heading"
                  className="text-lg font-bold text-zinc-100 flex items-center gap-2"
                >
                  <CalendarIcon className="h-5 w-5 text-purple-400" aria-hidden="true" />
                  Promotion Calendar
                </h3>
                <p className="text-xs text-zinc-400">
                  Click any date to schedule or inspect queued posts.
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="Previous month"
                  data-testid="calendar-prev-month"
                  onClick={handlePreviousMonth}
                  className="h-8 w-8 p-0 border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span
                  data-testid="calendar-month-label"
                  className="min-w-[125px] text-center text-xs font-bold text-zinc-100"
                >
                  {MONTH_NAMES[calendarMonthIndex]} {calendarYear}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="Next month"
                  data-testid="calendar-next-month"
                  onClick={handleNextMonth}
                  className="h-8 w-8 p-0 border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {WEEKDAY_LABELS.map((day) => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* 42-Day Calendar Grid */}
            <div
              role="grid"
              aria-label="Promotional post schedule calendar"
              className="grid grid-cols-7 gap-1"
            >
              {calendarCells.map((cell) => {
                const dayPosts = postsByDate[cell.dateKey] ?? [];
                const isSelected = cell.dateKey === selectedDateKey;

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    data-testid={`calendar-day-${cell.dateKey}`}
                    aria-label={`${cell.dateKey}${dayPosts.length > 0 ? ` (${dayPosts.length} scheduled)` : ""}`}
                    aria-pressed={isSelected}
                    onClick={() =>
                      handleSelectCalendarDay(cell.dateKey, cell.year, cell.monthIndex)
                    }
                    className={`min-h-[54px] rounded-lg border p-1.5 flex flex-col items-start justify-between text-left transition-all ${
                      isSelected
                        ? "border-purple-500 bg-purple-950/50 text-white ring-1 ring-purple-500"
                        : cell.isCurrentMonth
                        ? "border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:border-zinc-700"
                        : "border-zinc-900 bg-zinc-950/20 text-zinc-600 hover:border-zinc-800"
                    }`}
                  >
                    <span className="text-[11px] font-bold">{cell.dayOfMonth}</span>

                    {dayPosts.length > 0 && (
                      <div
                        data-testid={`calendar-day-badges-${cell.dateKey}`}
                        className="flex flex-wrap gap-0.5 w-full"
                      >
                        {dayPosts.slice(0, 3).map((post) => (
                          <span
                            key={post.id}
                            className="inline-flex items-center rounded bg-emerald-500/20 border border-emerald-500/40 px-1 py-0.2 text-[9px] font-bold text-emerald-300"
                          >
                            {post.platforms.map((p) => SCHEDULABLE_PLATFORMS[p].shortLabel).join("+")}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Date Scheduled Posts List */}
          <div className="space-y-3 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                Scheduled for {selectedDateKey}
              </h4>
              <span className="text-[11px] text-zinc-400">
                {activePostsForSelectedDate.length} post
                {activePostsForSelectedDate.length === 1 ? "" : "s"}
              </span>
            </div>

            {activePostsForSelectedDate.length === 0 ? (
              <p
                data-testid="selected-date-empty"
                className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500"
              >
                No promotional posts scheduled for {selectedDateKey}.
              </p>
            ) : (
              <ul className="space-y-2 max-h-52 overflow-y-auto" data-testid="selected-date-posts-list">
                {activePostsForSelectedDate.map((post) => (
                  <li
                    key={post.id}
                    data-testid={`scheduled-post-item-${post.id}`}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {post.platforms.map((platform) => (
                          <Badge
                            key={platform}
                            variant="outline"
                            className="border-purple-500/40 bg-purple-950/30 text-purple-200 text-[10px]"
                          >
                            {SCHEDULABLE_PLATFORMS[platform].label}
                          </Badge>
                        ))}
                        <span className="font-mono text-[11px] text-emerald-400">
                          {post.scheduledFor.slice(11, 16)} {settings.timezone}
                        </span>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Cancel scheduled post ${post.id}`}
                        data-testid={`cancel-post-btn-${post.id}`}
                        onClick={() => handleCancelPost(post.id)}
                        className="h-7 px-2 text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                    <p className="text-zinc-300 line-clamp-2">{post.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* 3. Acceptance Criterion 3: Post preview before scheduling */}
      <SocialPostPreview
        previews={previews}
        scheduledDateLabel={`${selectedDateKey} · ${selectedTime}`}
        timezone={settings.timezone}
      />
    </div>
  );
};

export default CampaignSocialScheduler;
