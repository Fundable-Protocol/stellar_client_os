"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Heart,
  Users,
  Target,
  Calendar,
  Download,
  Share2,
  Edit,
  ShieldCheck,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CampaignSponsorWall } from "@/components/modules/campaign/sponsor-wall/CampaignSponsorWall";
import { CampaignCollaboration } from "@/components/modules/campaign/collaboration/CampaignCollaboration";

const translations = {
  es: {
    title: "Salvemos la Reserva de la Selva Amazónica",
    shortDescription: "Protegiendo 50,000 hectáreas de bosque primario mediante guardianía comunitaria y streaming de carbono.",
    fullStory: "El proyecto Reserva de la Selva Amazónica empodera a comunidades indígenas para monitorear, proteger y restaurar corredores críticos de vida silvestre. Los fondos recaudados se bloquean en flujos de pago transparentes en Stellar para operaciones contra la caza furtiva, mapeo satelital y agricultura sostenible.",
    impactStatement: "Compensar permanentemente 150 toneladas métricas de CO2 mientras se asegura hábitat para más de 200 especies en peligro.",
  },
  pt: {
    title: "Salve a Reserva da Floresta Amazônica",
    shortDescription: "Protegendo 50.000 hectares de floresta primária por meio de guarda comunitária e streaming de carbono.",
    fullStory: "O projeto Reserva da Floresta Amazônica capacita comunidades indígenas a monitorar, proteger e restaurar corredores críticos de vida selvagem. Os fundos arrecadados são bloqueados em fluxos de pagamento transparentes na Stellar para operações contra a caça ilegal, mapeamento por satélite e agricultura sustentável.",
    impactStatement: "Compensar permanentemente 150 toneladas métricas de CO2 enquanto protege o habitat de mais de 200 espécies ameaçadas.",
  },
  fr: {
    title: "Sauvons la Réserve de la forêt amazonienne",
    shortDescription: "Protéger 50 000 hectares de forêt primaire grâce à une garde communautaire et au streaming carbone.",
    fullStory: "Le projet Réserve de la forêt amazonienne permet aux communautés autochtones de surveiller, protéger et restaurer des corridors fauniques critiques. Les fonds collectés sont verrouillés dans des flux de paiement transparents sur Stellar pour les opérations anti-braconnage, la cartographie par satellite et l'agriculture durable.",
    impactStatement: "Compenser durablement 150 tonnes métriques de CO2 tout en sécurisant l'habitat de plus de 200 espèces menacées.",
  },
} as const;

const languageNames: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  ru: "Russian",
};

type TranslationKey = keyof typeof translations;

const detectLanguage = (text: string): string => {
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return "zh";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  return "en";
};

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState("overview");

  // Mock campaign record data
  const campaign = {
    id: id || "camp-101",
    title: "Save the Amazon RainForest Reserve",
    category: "Environmental & Reforestation",
    creator: "GD6W...X892",
    shortDescription: "Protecting 50,000 hectares of primary rainforest through community-led guardianship and carbon streaming.",
    fullStory: "The Amazon RainForest Reserve project empowers indigenous communities to monitor, protect, and restore critical wildlife corridors. Funds raised are locked in transparent Stellar payment streams for anti-poaching operations, satellite mapping, and sustainable agriculture.",
    goalAmount: "50,000",
    raisedAmount: "33,850",
    token: "XLM",
    status: "ACTIVE",
    startDate: "2026-08-01",
    endDate: "2026-10-31",
    impactStatement: "Permanently offset 150 metric tons of CO2 while securing habitat for 200+ endangered species.",
    beneficiaries: "5,000 local indigenous community members",
    co2OffsetTons: "150",
    treesPlanted: "1,500",
  };

  const detectedLang = detectLanguage(campaign.title + campaign.shortDescription + campaign.fullStory);
  const detectedLanguageName = languageNames[detectedLang] ?? detectedLang;
  const [translationLang, setTranslationLang] = useState<TranslationKey | "">("");
  const translation = translationLang ? translations[translationLang] : null;

  const progressPct = Math.min(100, Math.round((parseFloat(campaign.raisedAmount) / parseFloat(campaign.goalAmount)) * 100));

  const downloadCertificate = () => {
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Campaign Certificate</title>
          <style>
            body { font-family: Georgia, serif; background: #f8f4ea; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .certificate { max-width: 680px; background: #fff; border: 8px solid #b45309; padding: 48px 64px; text-align: center; }
            .certificate h1 { color: #92400e; margin: 0 0 4px; }
            .subtitle { text-transform: uppercase; color: #78350f; margin-bottom: 16px; font-size: 13px; }
            .impact { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0; }
            .impact div { border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px; }
            .impact strong { display: block; font-size: 20px; color: #166534; }
          </style>
        </head>
        <body>
          <div class="certificate">
            <div class="subtitle">Campaign Completion Certificate</div>
            <h1>${campaign.title}</h1>
            <p>This certifies the successful completion of the campaign and its verified impact.</p>
            <div class="impact">
              <div><strong>${campaign.treesPlanted}</strong>Trees Planted</div>
              <div><strong>${campaign.co2OffsetTons} tons</strong>CO2 Offset</div>
              <div><strong>${campaign.raisedAmount} ${campaign.token}</strong>Total Cost</div>
            </div>
            <p>Issued for <strong>${campaign.creator}</strong></p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Navigation Top */}
      <div className="flex items-center justify-between">
        <Link
          href="/campaigns"
          className="inline-flex items-center text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Campaigns Directory
        </Link>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={downloadCertificate}
            className="border-amber-600/40 text-amber-300 hover:bg-amber-950/40 text-xs"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download Certificate
          </Button>
          <Link href="/campaigns/create">
            <Button size="sm" variant="outline" className="border-purple-600/40 text-purple-300 hover:bg-purple-950/40 text-xs">
              <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit Campaign
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero Banner Header */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900 via-purple-950/20 to-zinc-900 p-6 md:p-8 shadow-2xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2.5">
              <Badge className="bg-purple-600 text-white font-semibold text-xs">{campaign.category}</Badge>
              <Badge variant="outline" className="border-emerald-500 text-emerald-400 text-xs font-semibold">
                <ShieldCheck className="mr-1 h-3 w-3" /> {campaign.status}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Globe className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                Detected: {detectedLanguageName}
              </span>
              <select
                className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200"
                value={translationLang}
                onChange={(e) => setTranslationLang(e.target.value as TranslationKey | "")}
                aria-label="Translate campaign description"
              >
                <option value="">Original ({detectedLanguageName})</option>
                <option value="es">Spanish</option>
                <option value="pt">Portuguese</option>
                <option value="fr">French</option>
              </select>
            </div>

            <h1 lang={translationLang || detectedLang} className="text-3xl font-extrabold text-zinc-50 tracking-tight">
              {translation?.title ?? campaign.title}
            </h1>
            <p lang={translationLang || detectedLang} className="text-sm text-zinc-300 leading-relaxed">
              {translation?.shortDescription ?? campaign.shortDescription}
            </p>

            <div className="flex items-center gap-4 text-xs text-zinc-400 pt-2">
              <span>Created by: <strong className="text-zinc-200 font-mono">{campaign.creator}</strong></span>
              <span>Ends: <strong className="text-zinc-200">{campaign.endDate}</strong></span>
            </div>
          </div>

          {/* Raise Goal Card */}
          <div className="w-full md:w-80 rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-4 shadow-xl">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-zinc-400">Total Raised</span>
              <span className="text-xs font-bold text-emerald-400">{progressPct}% Funded</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-zinc-50">{campaign.raisedAmount}</span>
              <span className="text-sm font-semibold text-purple-400">{campaign.token}</span>
              <span className="text-xs text-zinc-500">/ {campaign.goalAmount}</span>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <Button className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 font-bold text-white hover:from-emerald-700 hover:to-teal-700 shadow-md">
              <Heart className="mr-2 h-4 w-4 fill-white" /> Sponsor This Campaign
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Tabs (Overview, Sponsor Wall #724, Co-Creators #722) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
          <TabsTrigger value="overview" className="text-xs font-semibold data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <Target className="mr-1.5 h-4 w-4" /> Overview & Story
          </TabsTrigger>
          <TabsTrigger value="sponsors" className="text-xs font-semibold data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <Heart className="mr-1.5 h-4 w-4 text-rose-400" /> Sponsor Wall (#724)
          </TabsTrigger>
          <TabsTrigger value="collaboration" className="text-xs font-semibold data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <Users className="mr-1.5 h-4 w-4 text-purple-400" /> Co-Creators (#722)
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-3">
                <h3 className="text-lg font-bold text-zinc-100">Full Campaign Story</h3>
                <p
                  lang={translationLang || detectedLang}
                  className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line"
                >
                  {translation?.fullStory ?? campaign.fullStory}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-3">
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400" /> Impact Statement & Beneficiaries
                </h3>
                <p
                  lang={translationLang || detectedLang}
                  className="text-sm text-amber-200/90 italic bg-amber-950/20 p-4 rounded-lg border border-amber-900/30"
                >
                  "{translation?.impactStatement ?? campaign.impactStatement}"
                </p>
                <div className="grid grid-cols-2 gap-4 text-xs pt-2">
                  <div>Beneficiaries: <strong className="text-zinc-100">{campaign.beneficiaries}</strong></div>
                  <div>Estimated CO2 Offset: <strong className="text-amber-400 font-bold">{campaign.co2OffsetTons} Tons</strong></div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">Campaign Timeline</h4>
                <div className="text-xs space-y-2">
                  <div className="flex justify-between border-b border-zinc-800 pb-2">
                    <span className="text-zinc-400">Start Date</span>
                    <strong className="text-zinc-100">{campaign.startDate}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">End Date</span>
                    <strong className="text-zinc-100">{campaign.endDate}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Sponsor Wall (#724) */}
        <TabsContent value="sponsors">
          <CampaignSponsorWall campaignId={campaign.id} campaignTitle={campaign.title} />
        </TabsContent>

        {/* Tab 3: Co-Creators Collaboration (#722) */}
        <TabsContent value="collaboration">
          <CampaignCollaboration campaignId={campaign.id} campaignTitle={campaign.title} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
