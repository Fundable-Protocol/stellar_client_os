import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
  type CampaignEmailer,
} from "./campaign.service";
import { EmailService } from "./email.service";
import {
  buildCampaignImpactReportPdf,
  type BackerDemographicEntry,
  type SpeciesBreakdownEntry,
} from "./campaign-impact-report.service";
import { getCampaignAnalyticsDashboard } from "./campaign-analytics-dashboard.service";
import { getTreeSpecies } from "@/lib/co2-impact";

export interface GeneratedCampaignImpactReport {
  id: string;
  campaignId: string;
  campaignName: string;
  creator: string;
  creatorEmail?: string;
  status: "generated" | "delivered" | "failed";
  generatedAt: number;
  closedAt: number;
  publicUrl: string;
  publicShareUrl: string;
  downloadUrl: string;
  pdfBytes?: Uint8Array;
  emailSent: boolean;
  emailSentTo?: string;
  campaignPerformance: {
    status: string;
    raisedAmount: string;
    goalAmount: string;
    sponsorCount: number;
    treeCount: number;
    co2KgPerYear: number;
  };
  demographics: BackerDemographicEntry[];
  statedProjectImpact: string;
}

export interface CampaignImpactReportOptions {
  dataSource?: CampaignDataSource;
  emailService?: CampaignEmailer;
  baseUrl?: string;
  now?: number;
  force?: boolean;
}

const impactReportStore = new Map<string, GeneratedCampaignImpactReport>();

/**
 * Clear all in-memory generated reports (used in tests).
 */
export function clearImpactReportStore(): void {
  impactReportStore.clear();
}

/**
 * Derive species breakdown from campaign record.
 */
export function deriveSpeciesBreakdown(campaign: CampaignRecord): SpeciesBreakdownEntry[] | undefined {
  if (campaign.treeCount <= 0) return undefined;

  if (campaign.speciesId) {
    const sp = getTreeSpecies(campaign.speciesId);
    return [{
      species: campaign.species ?? sp.label,
      count: campaign.treeCount,
      co2KgPerYear: campaign.treeCount * sp.co2PerTreePerYearKg,
    }];
  }

  if (campaign.co2SequestrationKg) {
    const totalKg = Number(campaign.co2SequestrationKg);
    if (Number.isFinite(totalKg) && totalKg > 0) {
      return [{
        species: campaign.species ?? campaign.treeSpecies ?? "Mixed species",
        count: campaign.treeCount,
        co2KgPerYear: totalKg,
      }];
    }
  }

  return undefined;
}

/**
 * Get or derive backer demographics for the campaign impact report.
 */
export async function getBackerDemographicsForReport(
  campaign: CampaignRecord,
  dataSource: CampaignDataSource = getCampaignDataSource(),
): Promise<BackerDemographicEntry[]> {
  try {
    const dashboard = await getCampaignAnalyticsDashboard(campaign.id, dataSource);
    if (dashboard?.demographics && dashboard.demographics.length > 0) {
      return dashboard.demographics;
    }
  } catch {
    // best effort
  }

  // Fallback: derive demographics from sponsor records
  if (campaign.sponsors && campaign.sponsors.length > 0) {
    const region = campaign.location || (campaign.countries && campaign.countries[0]) || "Global Backers";
    const total = campaign.sponsors.reduce((acc, s) => {
      const amt = BigInt(s.amount || "0");
      return acc + amt;
    }, 0n);

    return [
      {
        region,
        backers: campaign.sponsors.length,
        totalAmount: total.toString(),
        share: 100,
      },
    ];
  }

  return [];
}

/**
 * Render HTML email to notify creator that their campaign impact report is ready.
 */
export function renderImpactReportEmailHtml(
  campaign: CampaignRecord,
  report: {
    publicShareUrl: string;
    downloadUrl: string;
    treeCount: number;
    co2KgPerYear: number;
    raisedAmount: string;
    goalAmount: string;
    sponsorCount: number;
    demographics?: BackerDemographicEntry[];
  },
): { subject: string; html: string } {
  const subject = `Campaign Impact Report: ${campaign.name} is ready`;
  const treeLabel = campaign.treeCount.toLocaleString();
  const co2Label = `${report.co2KgPerYear.toFixed(1)} kg`;
  const raisedGoalLabel = `${report.raisedAmount} / ${report.goalAmount}`;

  const demographicsRows = (report.demographics && report.demographics.length > 0)
    ? report.demographics.map((d) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e5eb;">${d.region}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e5eb;">${d.backers}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e5eb;">${d.totalAmount}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e5eb;">${d.share.toFixed(1)}%</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" style="padding:8px 12px;color:#888;">No regional demographics recorded.</td></tr>`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:620px;margin:0 auto;color:#18181b;line-height:1.5;">
  <div style="background:#4f2d99;padding:24px;border-radius:12px 12px 0 0;color:#ffffff;">
    <h1 style="margin:0;font-size:22px;font-weight:700;">Fundable Protocol</h1>
    <p style="margin:4px 0 0 0;font-size:13px;color:#d9d4ee;">Campaign Close Impact Report</p>
  </div>
  <div style="padding:24px;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 12px 12px;background:#ffffff;">
    <h2 style="margin-top:0;font-size:18px;color:#18181b;">Congratulations on closing your campaign!</h2>
    <p style="font-size:14px;color:#52525b;">
      Your campaign <strong>${campaign.name}</strong> has closed, and your official PDF impact report has been automatically generated.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8f7fc;border-radius:8px;border:1px solid #e4defa;">
      <tr>
        <td style="padding:12px 16px;border-right:1px solid #e4defa;">
          <div style="font-size:10px;color:#6b6b80;text-transform:uppercase;letter-spacing:.05em;">Trees Planted</div>
          <div style="font-size:20px;font-weight:700;color:#4f2d99;">${treeLabel}</div>
        </td>
        <td style="padding:12px 16px;border-right:1px solid #e4defa;">
          <div style="font-size:10px;color:#6b6b80;text-transform:uppercase;letter-spacing:.05em;">CO&#8322; / Year</div>
          <div style="font-size:20px;font-weight:700;color:#15803d;">${co2Label}</div>
        </td>
        <td style="padding:12px 16px;border-right:1px solid #e4defa;">
          <div style="font-size:10px;color:#6b6b80;text-transform:uppercase;letter-spacing:.05em;">Backers</div>
          <div style="font-size:20px;font-weight:700;color:#4f2d99;">${report.sponsorCount}</div>
        </td>
        <td style="padding:12px 16px;">
          <div style="font-size:10px;color:#6b6b80;text-transform:uppercase;letter-spacing:.05em;">Raised / Goal</div>
          <div style="font-size:14px;font-weight:700;color:#18181b;">${raisedGoalLabel}</div>
        </td>
      </tr>
    </table>

    <h3 style="font-size:14px;margin-top:20px;margin-bottom:8px;color:#27272a;">Backer Demographics Summary</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;border:1px solid #e4e4e7;">
      <thead>
        <tr style="background:#f4f4f5;text-align:left;color:#71717a;">
          <th style="padding:8px 12px;border-bottom:1px solid #e4e4e7;">Region</th>
          <th style="padding:8px 12px;border-bottom:1px solid #e4e4e7;">Backers</th>
          <th style="padding:8px 12px;border-bottom:1px solid #e4e4e7;">Total Funded</th>
          <th style="padding:8px 12px;border-bottom:1px solid #e4e4e7;">Share</th>
        </tr>
      </thead>
      <tbody>
        ${demographicsRows}
      </tbody>
    </table>

    <div style="margin:28px 0;">
      <a href="${report.publicShareUrl}" style="display:inline-block;background:#4f2d99;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;margin-right:10px;">
        View Public Report
      </a>
      <a href="${report.downloadUrl}" style="display:inline-block;background:#f4f4f5;color:#18181b;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;border:1px solid #e4e4e7;">
        Download PDF Report
      </a>
    </div>

    <p style="font-size:13px;color:#71717a;margin-top:20px;">
      <strong>Shareable Public Link:</strong><br/>
      <a href="${report.publicShareUrl}" style="color:#4f2d99;word-break:break-all;">${report.publicShareUrl}</a>
    </p>

    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
    <p style="font-size:12px;color:#a1a1aa;margin:0;">
      This impact report is also permanently accessible from your Creator Dashboard.<br />
      &mdash; Fundable Protocol Team
    </p>
  </div>
</div>
`;

  return { subject, html };
}

/**
 * Generate a PDF impact report for creators at campaign close.
 *
 * Summarises:
 * 1. Campaign performance (goal, raised, backers, trees, timeline)
 * 2. Backer demographics (regional breakdown, funded amount, percentage share)
 * 3. Stated project impact (ecological impact, species breakdown, carbon sequestration)
 *
 * Delivers via email to creator, makes available in dashboard, and provides a shareable public link.
 */
export async function generateCampaignImpactReport(
  campaignId: string,
  options: CampaignImpactReportOptions = {},
): Promise<GeneratedCampaignImpactReport> {
  const dataSource = options.dataSource ?? getCampaignDataSource();
  const emailService = options.emailService ?? new EmailService();
  const now = options.now ?? Date.now();
  const baseUrl = options.baseUrl ?? (process.env.NEXT_PUBLIC_APP_URL || "https://fundable.stellar");

  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const existing = impactReportStore.get(campaignId);
  if (existing && !options.force) {
    return existing;
  }

  const speciesBreakdown = deriveSpeciesBreakdown(campaign);
  const demographics = await getBackerDemographicsForReport(campaign, dataSource);
  const statedProjectImpact = campaign.description || "Project completed successfully.";

  const publicUrl = `/campaigns/${campaign.id}/impact-report`;
  const publicShareUrl = `${baseUrl}${publicUrl}`;
  const downloadUrl = `/api/reports/campaign/${campaign.id}`;

  const totalCo2 = speciesBreakdown
    ? speciesBreakdown.reduce((sum, sp) => sum + sp.co2KgPerYear, 0)
    : campaign.treeCount * 20;

  // Build the PDF with performance, stated impact, demographics, and public link
  const pdfBytes = await buildCampaignImpactReportPdf({
    campaign,
    speciesBreakdown,
    demographics,
    statedProjectImpact,
    publicShareUrl,
  }, new Date(now));

  // Send email to creator if available
  let emailSent = false;
  if (campaign.creatorEmail) {
    try {
      const emailContent = renderImpactReportEmailHtml(campaign, {
        publicShareUrl,
        downloadUrl,
        treeCount: campaign.treeCount,
        co2KgPerYear: totalCo2,
        raisedAmount: campaign.raisedAmount,
        goalAmount: campaign.goalAmount,
        sponsorCount: campaign.sponsorCount,
        demographics,
      });

      emailSent = await emailService.sendEmail({
        to: campaign.creatorEmail,
        subject: emailContent.subject,
        html: emailContent.html,
      });
    } catch (emailErr) {
      console.error(`[Impact Report] Failed to email report to creator ${campaign.creatorEmail}:`, emailErr);
    }
  }

  const report: GeneratedCampaignImpactReport = {
    id: `report:${campaign.id}:${now}`,
    campaignId: campaign.id,
    campaignName: campaign.name,
    creator: campaign.creator,
    creatorEmail: campaign.creatorEmail,
    status: emailSent ? "delivered" : "generated",
    generatedAt: now,
    closedAt: campaign.statusChangedAt || now,
    publicUrl,
    publicShareUrl,
    downloadUrl,
    pdfBytes,
    emailSent,
    emailSentTo: campaign.creatorEmail,
    campaignPerformance: {
      status: campaign.status,
      raisedAmount: campaign.raisedAmount,
      goalAmount: campaign.goalAmount,
      sponsorCount: campaign.sponsorCount,
      treeCount: campaign.treeCount,
      co2KgPerYear: totalCo2,
    },
    demographics,
    statedProjectImpact,
  };

  impactReportStore.set(campaign.id, report);

  // Update campaign with impactReport metadata
  await dataSource.saveCampaign({
    ...campaign,
    impactReport: {
      id: report.id,
      generatedAt: now,
      closedAt: report.closedAt,
      publicUrl,
      downloadUrl,
      emailSent,
      emailSentTo: campaign.creatorEmail,
    },
    updatedAt: now,
  });

  return report;
}

/**
 * Automates report generation for campaigns closed within 24 hours (or pending generation).
 * Acceptance criterion: Report generated within 24 hours of campaign close.
 */
export async function generatePendingCampaignCloseReports(
  options: CampaignImpactReportOptions = {},
): Promise<GeneratedCampaignImpactReport[]> {
  const dataSource = options.dataSource ?? getCampaignDataSource();
  const now = options.now ?? Date.now();
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

  const campaigns = await dataSource.getCampaigns();
  const eligible = campaigns.filter((c) => {
    // Only completed / closed campaigns
    if (c.status !== "COMPLETED") return false;

    // Check if already generated
    const reportSummary = c.impactReport;
    if (reportSummary?.generatedAt && !options.force) return false;

    // Within 24 hours of campaign close
    const closedAt = c.statusChangedAt || c.updatedAt || c.createdAt;
    const isWithin24h = (now - closedAt) <= maxAgeMs;

    return isWithin24h || !reportSummary?.generatedAt;
  });

  const generated: GeneratedCampaignImpactReport[] = [];
  for (const c of eligible) {
    try {
      const rep = await generateCampaignImpactReport(c.id, { ...options, dataSource, now });
      generated.push(rep);
    } catch (err) {
      console.error(`[Impact Report Generator] Error processing campaign ${c.id}:`, err);
    }
  }

  return generated;
}

/**
 * Retrieve the generated impact report for a single campaign.
 */
export async function getCampaignImpactReport(
  campaignId: string,
  dataSource: CampaignDataSource = getCampaignDataSource(),
): Promise<GeneratedCampaignImpactReport | null> {
  let report = impactReportStore.get(campaignId);
  if (!report) {
    const campaign = await getCampaign(campaignId, dataSource);
    if (!campaign) return null;
    if (campaign.status === "COMPLETED" || campaign.impactReport) {
      report = await generateCampaignImpactReport(campaignId, { dataSource });
    }
  }
  return report ?? null;
}

/**
 * Retrieve all impact reports for a given creator.
 * Acceptance criterion: Creator receives report in dashboard.
 */
export async function getCreatorImpactReports(
  creatorAddress: string,
  dataSource: CampaignDataSource = getCampaignDataSource(),
): Promise<GeneratedCampaignImpactReport[]> {
  const campaigns = await dataSource.getCampaigns();
  const creatorCampaigns = campaigns.filter(
    (c) => c.creator === creatorAddress && (c.status === "COMPLETED" || c.impactReport),
  );
  const reports: GeneratedCampaignImpactReport[] = [];

  for (const campaign of creatorCampaigns) {
    let report = impactReportStore.get(campaign.id);
    if (!report) {
      try {
        report = await generateCampaignImpactReport(campaign.id, { dataSource });
      } catch (err) {
        console.error(`Error loading report for creator campaign ${campaign.id}:`, err);
      }
    }
    if (report) {
      reports.push(report);
    }
  }

  return reports.sort((a, b) => b.generatedAt - a.generatedAt);
}
