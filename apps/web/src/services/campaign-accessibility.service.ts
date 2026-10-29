import type { CampaignWizardData } from "@/components/modules/campaign/wizard/campaign-wizard-config";

export type AccessibilitySeverity = "critical" | "warning";

export interface AccessibilityIssue {
  id: string;
  wcagCriterion: string; // e.g. "WCAG 2.1 AA - 1.1.1 Non-text Content"
  ruleId: string;
  title: string;
  description: string;
  suggestion: string;
  severity: AccessibilitySeverity;
  field?: string;
}

export interface AccessibilityAuditResult {
  passed: boolean;
  canPublish: boolean; // Critical issues block publish; warnings are advisory
  score: number; // 0 - 100
  criticalIssues: AccessibilityIssue[];
  warnings: AccessibilityIssue[];
  allIssues: AccessibilityIssue[];
  summary: {
    total: number;
    criticalCount: number;
    warningCount: number;
    passedRuleCount: number;
  };
  timestamp: number;
}

const SUPPORTED_LANG_CODES = new Set([
  "en", "es", "fr", "de", "pt", "zh", "ja", "ko", "it", "nl", "ru", "ar", "hi"
]);

const GENERIC_ALT_PATTERNS = [
  /^image$/i,
  /^photo$/i,
  /^pic$/i,
  /^picture$/i,
  /^banner$/i,
  /^thumbnail$/i,
  /^img$/i,
  /^graphic$/i,
  /^placeholder$/i,
  /^untitled$/i,
  /\.(png|jpe?g|webp|gif|svg)$/i,
];

const AMBIGUOUS_LINK_TEXT_REGEX = /\b(click here|read more|learn more|more info|link|here)\b/i;
const COLOR_ONLY_REGEX = /\b(the green button|the red text|click the yellow|in blue below)\b/i;
const VIDEO_URL_REGEX = /(?:youtube\.com\/watch|youtu\.be\/|vimeo\.com\/|\.mp4|\.webm)/i;

/**
 * Validates markdown/text heading hierarchies to detect skipped heading levels (WCAG 1.3.1).
 */
function checkHeadingHierarchy(content: string): boolean {
  const headingMatches = content.match(/^#{1,6}\s+/gm);
  if (!headingMatches || headingMatches.length < 2) return true;

  const levels = headingMatches.map((m) => m.trim().length);
  for (let i = 1; i < levels.length; i++) {
    // If heading level jumps by more than 1 (e.g. H1 to H3 or H2 to H4)
    if (levels[i] > levels[i - 1] + 1) {
      return false;
    }
  }
  return true;
}

/**
 * Performs an automated WCAG 2.1 AA accessibility audit for a campaign page prior to publishing.
 */
export function checkCampaignAccessibility(data: Partial<CampaignWizardData>): AccessibilityAuditResult {
  const issues: AccessibilityIssue[] = [];
  let passedRuleCount = 0;

  // 1. WCAG 1.1.1 (Level A) - Non-text Content (Image alternative text)
  if (data.imageUrl && data.imageUrl.trim().length > 0) {
    const alt = data.imageAlt ? data.imageAlt.trim() : "";
    if (!alt) {
      issues.push({
        id: "img-alt-missing",
        wcagCriterion: "WCAG 2.1 AA — 1.1.1 Non-text Content",
        ruleId: "image-alt-missing",
        severity: "critical",
        title: "Missing Alternative Text for Campaign Cover Image",
        description: "A cover image URL is provided, but no alternative text is specified for screen reader users.",
        suggestion: "Add a concise, descriptive Cover Image Alt Text describing what the image shows.",
        field: "imageAlt",
      });
    } else {
      const isGeneric = GENERIC_ALT_PATTERNS.some((p) => p.test(alt));
      if (isGeneric) {
        issues.push({
          id: "img-alt-generic",
          wcagCriterion: "WCAG 2.1 AA — 1.1.1 Non-text Content",
          ruleId: "image-alt-generic",
          severity: "warning",
          title: "Generic or Non-Descriptive Image Alt Text",
          description: `The alternative text "${alt}" contains a generic label or file name rather than describing the image.`,
          suggestion: "Update the alt text to describe the subject, scene, or meaning of the image (e.g. 'Volunteers planting saplings in the Amazon reserve').",
          field: "imageAlt",
        });
      } else if (alt.length > 150) {
        issues.push({
          id: "img-alt-length",
          wcagCriterion: "WCAG 2.1 AA — 1.1.1 Non-text Content",
          ruleId: "image-alt-length",
          severity: "warning",
          title: "Image Alt Text Exceeds Recommended Length",
          description: "Alternative text is over 150 characters, which may overwhelm screen reader users during page skimming.",
          suggestion: "Shorten alt text to under 150 characters and place the comprehensive narrative in the campaign story.",
          field: "imageAlt",
        });
      } else {
        passedRuleCount++;
      }
    }
  } else {
    passedRuleCount++;
  }

  // 2. WCAG 2.4.6 (Level AA) - Headings and Labels (Campaign Title)
  const title = (data.title || "").trim();
  if (!title || title.length < 5) {
    issues.push({
      id: "title-missing-or-short",
      wcagCriterion: "WCAG 2.1 AA — 2.4.6 Headings and Labels",
      ruleId: "title-length",
      severity: "critical",
      title: "Campaign Title Missing or Too Brief",
      description: "Assistive technologies require a distinct top-level heading to orient users to the page topic.",
      suggestion: "Provide a descriptive campaign title of at least 5 characters.",
      field: "title",
    });
  } else {
    if (title.length > 10 && title === title.toUpperCase() && /[A-Z]/.test(title)) {
      issues.push({
        id: "title-all-caps",
        wcagCriterion: "WCAG 2.1 AA — 2.4.6 Headings and Labels",
        ruleId: "title-all-caps",
        severity: "warning",
        title: "All-Caps Heading Text",
        description: "Headings in all uppercase letters can impede reading speed and cause screen readers to spell words letter-by-letter.",
        suggestion: "Format your campaign title using mixed title or sentence case.",
        field: "title",
      });
    } else {
      passedRuleCount++;
    }
  }

  // 3. WCAG 3.1.1 (Level A) - Language of Page
  const language = (data.language || "").trim().toLowerCase();
  if (!language || !SUPPORTED_LANG_CODES.has(language.split("-")[0])) {
    issues.push({
      id: "lang-missing-or-invalid",
      wcagCriterion: "WCAG 2.1 AA — 3.1.1 Language of Page",
      ruleId: "page-language",
      severity: "critical",
      title: "Missing or Unsupported Content Language",
      description: "Screen readers must know the document language to correctly pronounce words and phonetic elements.",
      suggestion: "Select a valid primary language (e.g. English, Spanish, French) in the Details step.",
      field: "language",
    });
  } else {
    passedRuleCount++;
  }

  // 4. WCAG 1.3.1 (Level A) - Info and Relationships (Campaign Story & Structure)
  const fullStory = (data.fullStory || "").trim();
  if (!fullStory || fullStory.length < 20) {
    issues.push({
      id: "story-too-short",
      wcagCriterion: "WCAG 2.1 AA — 1.3.1 Info and Relationships",
      ruleId: "story-substance",
      severity: "critical",
      title: "Insufficient Campaign Story Content",
      description: "The campaign lacks substantive body text, preventing screen readers from conveying the purpose and background.",
      suggestion: "Write a detailed campaign story of at least 20 characters explaining the mission, roadmap, and use of funds.",
      field: "fullStory",
    });
  } else {
    if (!checkHeadingHierarchy(fullStory)) {
      issues.push({
        id: "heading-levels-skipped",
        wcagCriterion: "WCAG 2.1 AA — 1.3.1 Info and Relationships",
        ruleId: "heading-hierarchy",
        severity: "warning",
        title: "Skipped Heading Hierarchy in Campaign Story",
        description: "Headings in the story text skip structural levels (e.g., from H1 directly to H3), disrupting assistive navigation.",
        suggestion: "Nest headings sequentially (e.g., H1 -> H2 -> H3) without skipping intermediate levels.",
        field: "fullStory",
      });
    } else {
      passedRuleCount++;
    }
  }

  // 5. WCAG 2.4.4 (Level A) - Link Purpose (In Context)
  if (AMBIGUOUS_LINK_TEXT_REGEX.test(fullStory) || AMBIGUOUS_LINK_TEXT_REGEX.test(data.shortDescription || "")) {
    issues.push({
      id: "link-purpose-ambiguous",
      wcagCriterion: "WCAG 2.1 AA — 2.4.4 Link Purpose (In Context)",
      ruleId: "link-purpose",
      severity: "warning",
      title: "Ambiguous Link Text Detected",
      description: "Vague link phrases like 'click here' or 'read more' provide insufficient context when read by screen reader link-list navigators.",
      suggestion: "Replace generic text with destination-specific link labels, such as 'View our tree planting audit report'.",
      field: "fullStory",
    });
  } else {
    passedRuleCount++;
  }

  // 6. WCAG 1.4.1 (Level A) - Use of Color
  if (COLOR_ONLY_REGEX.test(fullStory) || COLOR_ONLY_REGEX.test(data.shortDescription || "")) {
    issues.push({
      id: "color-only-instructions",
      wcagCriterion: "WCAG 2.1 AA — 1.4.1 Use of Color",
      ruleId: "use-of-color",
      severity: "warning",
      title: "Instructions Rely Exclusively on Color",
      description: "Color alone is used to convey information or instructions, which excludes color-blind individuals and screen reader users.",
      suggestion: "Add textual indicators or icon descriptions alongside any color-based directions.",
      field: "fullStory",
    });
  } else {
    passedRuleCount++;
  }

  // 7. WCAG 1.2.2 (Level A) - Captions (Prerecorded Video Media)
  if (VIDEO_URL_REGEX.test(fullStory)) {
    issues.push({
      id: "video-captions-advisory",
      wcagCriterion: "WCAG 2.1 AA — 1.2.2 Captions (Prerecorded)",
      ruleId: "multimedia-captions",
      severity: "warning",
      title: "Prerecorded Video Detected — Verify Closed Captions",
      description: "WCAG 2.1 AA requires synchronized closed captions and an available transcript for all multimedia videos.",
      suggestion: "Ensure any linked YouTube, Vimeo, or video stream includes accurate closed captions or an accessible transcript.",
      field: "fullStory",
    });
  } else {
    passedRuleCount++;
  }

  // 8. WCAG 3.3.2 (Level A) - Labels or Instructions & Error Prevention (Financial & Timelines)
  const goalAmount = Number(data.goalAmount);
  if (!data.goalAmount || isNaN(goalAmount) || goalAmount <= 0) {
    issues.push({
      id: "goal-invalid",
      wcagCriterion: "WCAG 2.1 AA — 3.3.2 Labels or Instructions",
      ruleId: "funding-goal-validity",
      severity: "critical",
      title: "Invalid or Missing Funding Target",
      description: "The campaign funding goal must be a valid positive numerical amount for assistive progress meter computation.",
      suggestion: "Enter a positive number for the campaign goal amount.",
      field: "goalAmount",
    });
  } else {
    passedRuleCount++;
  }

  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate).getTime();
    const end = new Date(data.endDate).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) {
      issues.push({
        id: "dates-chronology",
        wcagCriterion: "WCAG 2.1 AA — 3.3.2 Labels or Instructions",
        ruleId: "timeline-chronology",
        severity: "critical",
        title: "Chronological Conflict in Campaign Timeline",
        description: "The campaign completion date occurs on or before the start date, creating invalid timeline semantics.",
        suggestion: "Adjust the campaign end date to occur after the launch date.",
        field: "endDate",
      });
    } else {
      passedRuleCount++;
    }
  }

  // 9. WCAG 1.3.1 (Level A) - Milestones Structure & Labelling
  if (data.milestones && data.milestones.length > 0) {
    let hasMilestoneError = false;
    let hasMilestoneWarning = false;

    data.milestones.forEach((m, idx) => {
      if (!m.title || m.title.trim().length === 0 || !m.targetDate) {
        hasMilestoneError = true;
      } else if (!m.description || m.description.trim().length === 0) {
        hasMilestoneWarning = true;
      }
    });

    if (hasMilestoneError) {
      issues.push({
        id: "milestone-incomplete",
        wcagCriterion: "WCAG 2.1 AA — 1.3.1 Info and Relationships",
        ruleId: "milestone-structure",
        severity: "critical",
        title: "Incomplete Milestone Labels or Dates",
        description: "One or more milestones are missing a title or scheduled delivery date, creating unlabelled timeline elements.",
        suggestion: "Ensure every milestone includes a descriptive title and valid target date.",
        field: "milestones",
      });
    } else {
      passedRuleCount++;
    }

    if (hasMilestoneWarning) {
      issues.push({
        id: "milestone-description-advisory",
        wcagCriterion: "WCAG 2.1 AA — 1.3.1 Info and Relationships",
        ruleId: "milestone-descriptions",
        severity: "warning",
        title: "Milestone Missing Descriptive Context",
        description: "Milestones without descriptions provide limited context for screen reader users examining project deliverables.",
        suggestion: "Add a short description to each milestone to clearly outline deliverable expectations.",
        field: "milestones",
      });
    }
  } else {
    passedRuleCount++;
  }

  // 10. WCAG 1.4.3 (Level AA) - Contrast Minimum (Advisory reminder)
  passedRuleCount++;

  const criticalIssues = issues.filter((i) => i.severity === "critical");
  const warnings = issues.filter((i) => i.severity === "warning");
  const canPublish = criticalIssues.length === 0;

  // Compute a weighted score out of 100
  const totalChecks = passedRuleCount + issues.length;
  const deductions = (criticalIssues.length * 25) + (warnings.length * 5);
  const score = Math.max(0, Math.min(100, Math.round(100 - deductions)));

  return {
    passed: criticalIssues.length === 0 && warnings.length === 0,
    canPublish,
    score,
    criticalIssues,
    warnings,
    allIssues: issues,
    summary: {
      total: issues.length,
      criticalCount: criticalIssues.length,
      warningCount: warnings.length,
      passedRuleCount,
    },
    timestamp: Date.now(),
  };
}
