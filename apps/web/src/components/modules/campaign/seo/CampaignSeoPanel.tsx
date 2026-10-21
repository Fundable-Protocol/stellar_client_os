"use client";

import { useEffect, useId, useState } from "react";
import { Globe, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEO_DESCRIPTION_RANGE,
  SEO_TITLE_RANGE,
  getSeoLengthStatus,
  isValidSeoImageUrl,
  normalizeSeoText,
  resolveCampaignSeo,
  truncateForPreview,
  type SeoLengthStatus,
} from "@/lib/campaign-seo";
import { useTranslation } from "@/i18n/I18nProvider";
import { useWallet } from "@/providers/StellarWalletProvider";

interface CampaignSeoPanelProps {
  campaignId: string | number;
  campaignName: string;
  campaignDescription?: string;
}

const STATUS_STYLES: Record<SeoLengthStatus, string> = {
  empty: "text-zinc-500",
  short: "text-amber-400",
  good: "text-emerald-400",
  long: "text-red-400",
};

function CharacterCount({
  id,
  value,
  range,
}: {
  id: string;
  value: string;
  range: { min: number; max: number };
}) {
  const { t } = useTranslation();
  const length = normalizeSeoText(value).length;
  const status = getSeoLengthStatus(length, range);
  const message =
    status === "long"
      ? t("seo.statusLong", { count: length - range.max })
      : status === "short"
        ? t("seo.statusShort")
        : status === "good"
          ? t("seo.statusGood")
          : null;

  return (
    <div id={id} aria-live="polite" className="mt-1 flex items-center justify-between gap-2 text-xs">
      <span className={STATUS_STYLES[status]}>{message}</span>
      <span className={cn("tabular-nums", STATUS_STYLES[status === "empty" ? "empty" : status])}>
        {t("seo.characterCount", { count: length, max: range.max })}
      </span>
    </div>
  );
}

/**
 * SEO panel for the campaign editor's advanced section (#1222): title tag,
 * meta description and Open Graph image, with live search and social previews.
 */
export function CampaignSeoPanel({ campaignId, campaignName, campaignDescription }: CampaignSeoPanelProps) {
  const { t } = useTranslation();
  const { address } = useWallet();
  const ids = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [origin, setOrigin] = useState("https://fundable.finance");

  useEffect(() => {
    setOrigin(window.location.origin);
    let cancelled = false;
    fetch(`/api/campaigns/${campaignId}/seo`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { seo?: { title?: string; description?: string; ogImageUrl?: string } | null } | null) => {
        if (cancelled || !data?.seo) return;
        setTitle(data.seo.title ?? "");
        setDescription(data.seo.description ?? "");
        setOgImageUrl(data.seo.ogImageUrl ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const imageInvalid = ogImageUrl.trim() !== "" && !isValidSeoImageUrl(ogImageUrl.trim());
  const preview = resolveCampaignSeo(
    { title: normalizeSeoText(title), description: normalizeSeoText(description), ogImageUrl: imageInvalid ? undefined : ogImageUrl.trim() },
    { name: campaignName, description: campaignDescription },
  );
  const pageUrl = `${origin}/campaigns/${campaignId}`;
  const host = pageUrl.replace(/^https?:\/\//, "").split("/")[0];

  const handleSave = async () => {
    setFeedback(null);
    if (imageInvalid) {
      setFeedback({ type: "error", message: t("seo.invalidImage") });
      return;
    }
    if (!address) {
      setFeedback({ type: "error", message: t("common.connectWalletPrompt") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/seo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerAddress: address, title, description, ogImageUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || t("common.somethingWentWrong"));
      setFeedback({ type: "success", message: t("seo.saveSuccess") });
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : t("common.somethingWentWrong") });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500";

  return (
    <section aria-labelledby={`${ids}-heading`} className="space-y-4">
      <div>
        <h3 id={`${ids}-heading`} className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Globe aria-hidden="true" className="h-4 w-4 text-emerald-400" /> {t("seo.sectionTitle")}
        </h3>
        <p className="mt-1 text-xs text-slate-400">{t("seo.description")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("seo.fallbackNotice")}</p>
      </div>

      <div>
        <label htmlFor={`${ids}-title`} className="block text-sm font-medium text-slate-300 mb-1">
          {t("seo.titleLabel")}
        </label>
        <input
          id={`${ids}-title`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-describedby={`${ids}-title-count`}
          placeholder={t("seo.titlePlaceholder")}
          className={inputClass}
        />
        <CharacterCount id={`${ids}-title-count`} value={title} range={SEO_TITLE_RANGE} />
      </div>

      <div>
        <label htmlFor={`${ids}-description`} className="block text-sm font-medium text-slate-300 mb-1">
          {t("seo.descriptionLabel")}
        </label>
        <textarea
          id={`${ids}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby={`${ids}-description-count`}
          rows={3}
          placeholder={t("seo.descriptionPlaceholder")}
          className={inputClass}
        />
        <CharacterCount id={`${ids}-description-count`} value={description} range={SEO_DESCRIPTION_RANGE} />
      </div>

      <div>
        <label htmlFor={`${ids}-image`} className="block text-sm font-medium text-slate-300 mb-1">
          {t("seo.ogImageLabel")}
        </label>
        <input
          id={`${ids}-image`}
          type="url"
          inputMode="url"
          value={ogImageUrl}
          onChange={(e) => setOgImageUrl(e.target.value)}
          aria-invalid={imageInvalid}
          aria-describedby={`${ids}-image-hint`}
          placeholder="https://"
          className={cn(inputClass, "ltr-isolate", imageInvalid && "border-red-500")}
        />
        <p id={`${ids}-image-hint`} className={cn("mt-1 text-xs", imageInvalid ? "text-red-400" : "text-slate-500")}>
          {imageInvalid ? t("seo.invalidImage") : t("seo.ogImageHint")}
        </p>
      </div>

      {/* Search engine result preview */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("seo.searchPreview")}</p>
        <div className="rounded-lg bg-white p-4 text-start font-sans" data-testid="seo-search-preview">
          <p className="truncate text-xs text-[#202124] ltr-isolate">{host} › campaigns › {String(campaignId)}</p>
          <p className="mt-1 text-lg leading-snug text-[#1a0dab]">
            {truncateForPreview(preview.title, SEO_TITLE_RANGE.max)}
          </p>
          <p className="mt-1 text-sm leading-snug text-[#4d5156]">
            {truncateForPreview(preview.description, SEO_DESCRIPTION_RANGE.max)}
          </p>
        </div>
      </div>

      {/* Social share card preview */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("seo.socialPreview")}</p>
        <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950" data-testid="seo-social-preview">
          <div className="flex aspect-[1200/630] items-center justify-center bg-slate-800">
            {preview.ogImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary creator-supplied host
              <img src={preview.ogImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <ImageOff aria-hidden="true" className="h-4 w-4" /> {t("seo.noImage")}
              </span>
            )}
          </div>
          <div className="space-y-1 p-3">
            <p className="text-[11px] uppercase text-slate-500 ltr-isolate">{host}</p>
            <p className="truncate text-sm font-semibold text-slate-100">{preview.title}</p>
            <p className="line-clamp-2 text-xs text-slate-400">{preview.description}</p>
          </div>
        </div>
      </div>

      {feedback && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={cn("text-sm", feedback.type === "error" ? "text-red-400" : "text-emerald-400")}
        >
          {feedback.message}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </section>
  );
}
