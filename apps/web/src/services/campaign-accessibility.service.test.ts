import { describe, it, expect } from "vitest";
import { checkCampaignAccessibility } from "./campaign-accessibility.service";
import type { CampaignWizardData } from "@/components/modules/campaign/wizard/campaign-wizard-config";

const VALID_CAMPAIGN_DATA: CampaignWizardData = {
  title: "Reforest the Atlantic Woodland",
  category: "environmental",
  shortDescription: "Planting 10,000 indigenous trees to restore native biodiversity.",
  fullStory: "Our team collaborates with local arborists to plant resilient, native hardwood species across damaged watersheds. Support our mission on Stellar.",
  imageUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09",
  imageAlt: "Aerial view of young oak saplings flourishing along the riverbank",
  goalAmount: "50000",
  token: "XLM",
  targetBackers: "200",
  minContribution: "10",
  startDate: "2026-11-01",
  endDate: "2026-12-01",
  milestones: [
    {
      id: "m-1",
      title: "Phase 1: Seedling Nursery",
      targetDate: "2026-11-10",
      description: "Propagate first batch of 5,000 saplings in community greenhouses.",
    },
    {
      id: "m-2",
      title: "Phase 2: Watershed Outplanting",
      targetDate: "2026-11-25",
      description: "Community planting event with volunteer verification.",
    },
  ],
  stretchGoals: [],
  impactStatement: "Sequester 500 metric tons of carbon dioxide and restore critical bird habitats.",
  targetBeneficiaries: "1200",
  co2OffsetTons: "500",
  socialMetrics: "15 community jobs created",
  isDraft: false,
  language: "en",
  translations: {},
  autoTranslate: false,
};

describe("Campaign Accessibility Service (WCAG 2.1 AA)", () => {
  it("passes audit when campaign data meets all WCAG 2.1 AA requirements", () => {
    const result = checkCampaignAccessibility(VALID_CAMPAIGN_DATA);

    expect(result.passed).toBe(true);
    expect(result.canPublish).toBe(true);
    expect(result.criticalIssues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  describe("Critical issues block publishing", () => {
    it("flags missing alt text for cover image as a critical blocking issue", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        imageUrl: "https://example.com/banner.jpg",
        imageAlt: "",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(false);
      expect(result.passed).toBe(false);
      const altIssue = result.criticalIssues.find((i) => i.id === "img-alt-missing");
      expect(altIssue).toBeDefined();
      expect(altIssue?.severity).toBe("critical");
      expect(altIssue?.wcagCriterion).toContain("1.1.1 Non-text Content");
      expect(altIssue?.suggestion).toContain("Cover Image Alt Text");
    });

    it("flags missing or short title as a critical blocking issue", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        title: "Tree",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(false);
      const titleIssue = result.criticalIssues.find((i) => i.id === "title-missing-or-short");
      expect(titleIssue).toBeDefined();
      expect(titleIssue?.severity).toBe("critical");
      expect(titleIssue?.wcagCriterion).toContain("2.4.6 Headings and Labels");
      expect(titleIssue?.suggestion).toBeDefined();
    });

    it("flags missing or invalid language code as a critical blocking issue", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        language: "",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(false);
      const langIssue = result.criticalIssues.find((i) => i.id === "lang-missing-or-invalid");
      expect(langIssue).toBeDefined();
      expect(langIssue?.severity).toBe("critical");
      expect(langIssue?.wcagCriterion).toContain("3.1.1 Language of Page");
    });

    it("flags insufficient campaign story content as a critical blocking issue", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        fullStory: "Too short",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(false);
      const storyIssue = result.criticalIssues.find((i) => i.id === "story-too-short");
      expect(storyIssue).toBeDefined();
      expect(storyIssue?.severity).toBe("critical");
      expect(storyIssue?.suggestion).toContain("20 characters");
    });

    it("flags invalid funding goal as a critical blocking issue", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        goalAmount: "0",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(false);
      const goalIssue = result.criticalIssues.find((i) => i.id === "goal-invalid");
      expect(goalIssue).toBeDefined();
      expect(goalIssue?.severity).toBe("critical");
    });

    it("flags chronological conflict where end date is before start date as critical", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        startDate: "2026-12-01",
        endDate: "2026-11-01",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(false);
      const dateIssue = result.criticalIssues.find((i) => i.id === "dates-chronology");
      expect(dateIssue).toBeDefined();
      expect(dateIssue?.severity).toBe("critical");
      expect(dateIssue?.suggestion).toContain("end date to occur after the launch date");
    });

    it("flags incomplete milestone titles as critical", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        milestones: [
          {
            id: "m-1",
            title: "",
            targetDate: "2026-11-15",
            description: "Some description",
          },
        ],
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(false);
      const milestoneIssue = result.criticalIssues.find((i) => i.id === "milestone-incomplete");
      expect(milestoneIssue).toBeDefined();
      expect(milestoneIssue?.severity).toBe("critical");
    });
  });

  describe("Warnings are advisory and do not block publishing", () => {
    it("flags generic alt text as an advisory warning and allows publishing", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        imageUrl: "https://example.com/tree.jpg",
        imageAlt: "photo",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(true);
      expect(result.criticalIssues).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      const warning = result.warnings.find((i) => i.id === "img-alt-generic");
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
      expect(warning?.suggestion).toContain("Update the alt text");
    });

    it("flags excessively long alt text as advisory warning", () => {
      const longAlt = "A".repeat(160);
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        imageUrl: "https://example.com/tree.jpg",
        imageAlt: longAlt,
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(true);
      const warning = result.warnings.find((i) => i.id === "img-alt-length");
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
    });

    it("flags ALL CAPS title as advisory warning", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        title: "REFOREST THE AMAZON RESERVE NOW",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(true);
      const warning = result.warnings.find((i) => i.id === "title-all-caps");
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
      expect(warning?.suggestion).toContain("title or sentence case");
    });

    it("flags skipped heading hierarchy in story as advisory warning", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        fullStory: "# Top Heading\n\n### Skipped Subsection\n\nHere is our detailed content for the community.",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(true);
      const warning = result.warnings.find((i) => i.id === "heading-levels-skipped");
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
      expect(warning?.suggestion).toContain("H1 -> H2 -> H3");
    });

    it("flags ambiguous link text as advisory warning", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        fullStory: "Our team has completed the research. To see the report, click here to download.",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(true);
      const warning = result.warnings.find((i) => i.id === "link-purpose-ambiguous");
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
      expect(warning?.suggestion).toContain("destination-specific link labels");
    });

    it("flags color-only instructions as advisory warning", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        fullStory: "Please inspect the green button on our portal to confirm tree verification coordinates.",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(true);
      const warning = result.warnings.find((i) => i.id === "color-only-instructions");
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
    });

    it("flags embedded video URL as advisory caption reminder", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        fullStory: "Watch our planting drone overview at https://youtube.com/watch?v=abcd1234efg to see progress.",
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(true);
      const warning = result.warnings.find((i) => i.id === "video-captions-advisory");
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
      expect(warning?.wcagCriterion).toContain("1.2.2 Captions");
    });

    it("flags milestone missing description as advisory warning", () => {
      const data: CampaignWizardData = {
        ...VALID_CAMPAIGN_DATA,
        milestones: [
          {
            id: "m-1",
            title: "First Planting Batch",
            targetDate: "2026-11-20",
            description: "",
          },
        ],
      };

      const result = checkCampaignAccessibility(data);

      expect(result.canPublish).toBe(true);
      const warning = result.warnings.find((i) => i.id === "milestone-description-advisory");
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
    });
  });

  describe("All issues provide fix suggestions", () => {
    it("ensures every generated issue has a non-empty actionable fix suggestion", () => {
      const emptyData: Partial<CampaignWizardData> = {
        imageUrl: "https://example.com/photo.png",
        imageAlt: "",
        title: "",
        language: "",
        fullStory: "",
        goalAmount: "-10",
      };

      const result = checkCampaignAccessibility(emptyData);

      expect(result.allIssues.length).toBeGreaterThan(0);
      result.allIssues.forEach((issue) => {
        expect(issue.suggestion).toBeDefined();
        expect(issue.suggestion.trim().length).toBeGreaterThan(10);
      });
    });
  });
});
