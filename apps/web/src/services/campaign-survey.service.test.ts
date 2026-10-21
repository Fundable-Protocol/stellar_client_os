import { describe, it, expect, beforeEach } from "vitest";
import { CampaignSurveyService } from "./campaign-survey.service";
import { EmailService } from "./email.service";
import { backersService } from "./campaign-backers.service";

describe("CampaignSurveyService", () => {
  let surveyService: CampaignSurveyService;
  let mockEmailService: EmailService;
  const creator = "GCREATOR123";
  const backer1 = "GBACKER111";
  const backer2 = "GBACKER222";
  const campaignId = "camp-survey-test-1";

  beforeEach(() => {
    mockEmailService = new EmailService();
    surveyService = new CampaignSurveyService(mockEmailService);

    // Seed mock backers
    backersService.recordContribution({
      campaignId,
      backerAddress: backer1,
      amount: "100",
      token: "XLM",
    });
    backersService.recordContribution({
      campaignId,
      backerAddress: backer2,
      amount: "250",
      token: "XLM",
    });
  });

  describe("createSurvey", () => {
    it("should successfully create a structured survey with multiple question types", async () => {
      const survey = await surveyService.createSurvey(
        {
          campaignId,
          title: "Post-Campaign Product Feedback",
          description: "Help us understand your expectations and experience",
          questions: [
            {
              type: "multiple_choice",
              title: "How did you hear about this campaign?",
              options: ["Social Media", "Community Forum", "Friend Referral"],
              required: true,
            },
            {
              type: "rating",
              title: "How satisfied are you with campaign communications?",
              minRating: 1,
              maxRating: 5,
              required: true,
            },
            {
              type: "text",
              title: "What features or impact updates are you most eager to see?",
              required: false,
            },
          ],
        },
        creator
      );

      expect(survey.id).toBeDefined();
      expect(survey.title).toBe("Post-Campaign Product Feedback");
      expect(survey.creatorAddress).toBe(creator);
      expect(survey.status).toBe("published");
      expect(survey.questions).toHaveLength(3);
      expect(survey.questions[0].type).toBe("multiple_choice");
      expect(survey.questions[0].options).toHaveLength(3);
      expect(survey.questions[1].type).toBe("rating");
      expect(survey.questions[2].type).toBe("text");
    });

    it("should reject survey without a title", async () => {
      await expect(
        surveyService.createSurvey(
          {
            campaignId,
            title: "  ",
            questions: [{ type: "text", title: "Feedback?" }],
          },
          creator
        )
      ).rejects.toThrow("Survey title is required.");
    });

    it("should reject multiple choice question with fewer than 2 options", async () => {
      await expect(
        surveyService.createSurvey(
          {
            campaignId,
            title: "Invalid Question Survey",
            questions: [
              {
                type: "multiple_choice",
                title: "Choose one",
                options: ["Only one"],
              },
            ],
          },
          creator
        )
      ).rejects.toThrow('Multiple choice question "Choose one" must have at least 2 options.');
    });
  });

  describe("submitResponse", () => {
    it("should accept valid answers and prevent duplicate submissions", async () => {
      const survey = await surveyService.createSurvey(
        {
          campaignId,
          title: "Quick Survey",
          questions: [
            {
              type: "rating",
              title: "Rate your experience",
              required: true,
            },
            {
              type: "text",
              title: "Any comments?",
              required: false,
            },
          ],
        },
        creator
      );

      const qRating = survey.questions[0].id;
      const qText = survey.questions[1].id;

      const response = await surveyService.submitResponse({
        surveyId: survey.id,
        backerAddress: backer1,
        answers: [
          { questionId: qRating, value: 5 },
          { questionId: qText, value: "Great project!" },
        ],
      });

      expect(response.id).toBeDefined();
      expect(response.backerAddress).toBe(backer1);
      expect(surveyService.hasBackerResponded(survey.id, backer1)).toBe(true);

      // Duplicate submission should fail
      await expect(
        surveyService.submitResponse({
          surveyId: survey.id,
          backerAddress: backer1,
          answers: [{ questionId: qRating, value: 4 }],
        })
      ).rejects.toThrow("You have already submitted a response for this survey.");
    });

    it("should enforce required questions", async () => {
      const survey = await surveyService.createSurvey(
        {
          campaignId,
          title: "Required Survey",
          questions: [
            {
              type: "rating",
              title: "Mandatory Rating",
              required: true,
            },
          ],
        },
        creator
      );

      await expect(
        surveyService.submitResponse({
          surveyId: survey.id,
          backerAddress: backer2,
          answers: [],
        })
      ).rejects.toThrow('Question "Mandatory Rating" is required.');
    });
  });

  describe("sendSurveyToBackers & In-app fallback", () => {
    it("should generate in-app notifications as fallback and send emails where applicable", async () => {
      const survey = await surveyService.createSurvey(
        {
          campaignId,
          title: "Backer Satisfaction Survey",
          questions: [{ type: "rating", title: "Score" }],
        },
        creator
      );

      const result = await surveyService.sendSurveyToBackers({
        surveyId: survey.id,
        campaignId,
        creatorAddress: creator,
        subject: "We need your feedback!",
      });

      expect(result.totalBackers).toBeGreaterThanOrEqual(2);
      expect(result.inAppCount).toBeGreaterThanOrEqual(2);

      // Verify in-app notifications exist for backer1
      const backer1Notifs = surveyService.getInAppNotifications(backer1);
      expect(backer1Notifs.length).toBeGreaterThan(0);
      expect(backer1Notifs[0].surveyId).toBe(survey.id);
      expect(backer1Notifs[0].read).toBe(false);

      // Mark notification as read
      const markSuccess = surveyService.markInAppNotificationRead(backer1Notifs[0].id, backer1);
      expect(markSuccess).toBe(true);
      expect(surveyService.getInAppNotifications(backer1)[0].read).toBe(true);
    });

    it("should disallow non-creator from sending survey", async () => {
      const survey = await surveyService.createSurvey(
        {
          campaignId,
          title: "Survey",
          questions: [{ type: "rating", title: "Score" }],
        },
        creator
      );

      await expect(
        surveyService.sendSurveyToBackers({
          surveyId: survey.id,
          campaignId,
          creatorAddress: "GIMPOSTER999",
        })
      ).rejects.toThrow("Only the creator can send survey invitations.");
    });
  });

  describe("getSurveyAnalytics", () => {
    it("should compute accurate statistics for multiple question types for dashboard charts", async () => {
      const survey = await surveyService.createSurvey(
        {
          campaignId,
          title: "Post-Close Survey",
          questions: [
            {
              type: "multiple_choice",
              title: "Product expectation",
              options: ["Speed", "Sustainability", "Community"],
            },
            {
              type: "rating",
              title: "Experience rating",
            },
            {
              type: "text",
              title: "Additional suggestions",
            },
          ],
        },
        creator
      );

      const [qChoice, qRating, qText] = survey.questions;

      // Submit backer1 response
      await surveyService.submitResponse({
        surveyId: survey.id,
        backerAddress: backer1,
        answers: [
          { questionId: qChoice.id, value: "Sustainability" },
          { questionId: qRating.id, value: 5 },
          { questionId: qText.id, value: "Great job so far" },
        ],
      });

      // Submit backer2 response
      await surveyService.submitResponse({
        surveyId: survey.id,
        backerAddress: backer2,
        answers: [
          { questionId: qChoice.id, value: "Sustainability" },
          { questionId: qRating.id, value: 3 },
          { questionId: qText.id, value: "Keep transparency high" },
        ],
      });

      const analytics = await surveyService.getSurveyAnalytics(survey.id);

      expect(analytics.totalResponses).toBe(2);
      expect(analytics.responseRatePct).toBeGreaterThan(0);

      // Check choice metrics
      const choiceMetrics = analytics.questions.find((q) => q.questionId === qChoice.id)?.optionMetrics;
      expect(choiceMetrics).toBeDefined();
      const sustainOption = choiceMetrics?.find((o) => o.option === "Sustainability");
      expect(sustainOption?.count).toBe(2);
      expect(sustainOption?.percentage).toBe(100);

      // Check rating metrics
      const ratingMetrics = analytics.questions.find((q) => q.questionId === qRating.id)?.ratingMetric;
      expect(ratingMetrics).toBeDefined();
      expect(ratingMetrics?.count).toBe(2);
      expect(ratingMetrics?.average).toBe(4); // (5 + 3) / 2 = 4.0
      expect(ratingMetrics?.distribution[5]).toBe(1);
      expect(ratingMetrics?.distribution[3]).toBe(1);

      // Check text metrics
      const textResponses = analytics.questions.find((q) => q.questionId === qText.id)?.textResponses;
      expect(textResponses).toHaveLength(2);
    });
  });
});
