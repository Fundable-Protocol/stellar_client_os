import {
  CampaignSurvey,
  CreateSurveyInput,
  InAppSurveyNotification,
  OptionMetric,
  QuestionAnalytics,
  RatingMetric,
  SendSurveyNotificationInput,
  SubmitSurveyResponseInput,
  SurveyAnalyticsSummary,
  SurveyQuestion,
  SurveyResponse,
} from "@/types/campaign-survey";
import { EmailService } from "./email.service";
import { backersService } from "./campaign-backers.service";
import { getCampaign } from "./campaign.service";
import { getPreferencesForCampaign } from "./notification-preferences.service";

/**
 * Campaign Survey Service
 *
 * Facilitates post-campaign structured survey creation, response collection,
 * multi-channel dispatch (email with in-app notification fallback), and analytics.
 */
export class CampaignSurveyService {
  private surveys: Map<string, CampaignSurvey> = new Map();
  private responses: Map<string, SurveyResponse[]> = new Map(); // surveyId -> SurveyResponse[]
  private inAppNotifications: Map<string, InAppSurveyNotification[]> = new Map(); // backerAddress -> notifications
  private emailService: EmailService;

  constructor(emailService?: EmailService) {
    this.emailService = emailService || new EmailService();
  }

  /**
   * Create a new structured survey for a campaign.
   */
  public async createSurvey(
    input: CreateSurveyInput,
    creatorAddress: string
  ): Promise<CampaignSurvey> {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error("Survey title is required.");
    }

    if (!input.questions || input.questions.length === 0) {
      throw new Error("A survey must contain at least one question.");
    }

    const questions: SurveyQuestion[] = input.questions.map((q, idx) => {
      if (!q.title || q.title.trim().length === 0) {
        throw new Error(`Question ${idx + 1} must have a title.`);
      }

      if (q.type === "multiple_choice") {
        if (!q.options || q.options.filter((o) => o.trim().length > 0).length < 2) {
          throw new Error(`Multiple choice question "${q.title}" must have at least 2 options.`);
        }
      }

      return {
        id: `q-${idx + 1}-${Date.now().toString(36)}`,
        type: q.type,
        title: q.title.trim(),
        description: q.description?.trim(),
        required: q.required ?? true,
        options: q.type === "multiple_choice" ? q.options?.map((o) => o.trim()).filter(Boolean) : undefined,
        minRating: q.type === "rating" ? (q.minRating ?? 1) : undefined,
        maxRating: q.type === "rating" ? (q.maxRating ?? 5) : undefined,
      };
    });

    const surveyId = `survey-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const survey: CampaignSurvey = {
      id: surveyId,
      campaignId: input.campaignId,
      title: input.title.trim(),
      description: input.description?.trim() || "",
      creatorAddress: creatorAddress.trim(),
      questions,
      status: "published",
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    };

    this.surveys.set(surveyId, survey);
    this.responses.set(surveyId, []);

    return survey;
  }

  /**
   * Get all surveys for a given campaign.
   */
  public async getSurveysForCampaign(campaignId: string): Promise<CampaignSurvey[]> {
    return Array.from(this.surveys.values()).filter((s) => s.campaignId === campaignId);
  }

  /**
   * Get a survey by ID.
   */
  public async getSurveyById(surveyId: string): Promise<CampaignSurvey | null> {
    return this.surveys.get(surveyId) || null;
  }

  /**
   * Close a survey to prevent new responses.
   */
  public async closeSurvey(surveyId: string, creatorAddress: string): Promise<CampaignSurvey> {
    const survey = this.surveys.get(surveyId);
    if (!survey) {
      throw new Error(`Survey ${surveyId} not found.`);
    }

    if (survey.creatorAddress.toLowerCase() !== creatorAddress.trim().toLowerCase()) {
      throw new Error("Only the campaign creator can close this survey.");
    }

    survey.status = "closed";
    survey.closedAt = Date.now();
    survey.updatedAt = Date.now();
    return survey;
  }

  /**
   * Submit backer response to a survey.
   */
  public async submitResponse(input: SubmitSurveyResponseInput): Promise<SurveyResponse> {
    const survey = this.surveys.get(input.surveyId);
    if (!survey) {
      throw new Error(`Survey ${input.surveyId} not found.`);
    }

    if (survey.status !== "published") {
      throw new Error("This survey is closed or not published.");
    }

    const backerAddr = input.backerAddress.trim();
    if (!backerAddr) {
      throw new Error("backerAddress is required.");
    }

    const existingResponses = this.responses.get(input.surveyId) || [];
    const alreadyAnswered = existingResponses.some(
      (r) => r.backerAddress.toLowerCase() === backerAddr.toLowerCase()
    );

    if (alreadyAnswered) {
      throw new Error("You have already submitted a response for this survey.");
    }

    // Validate required answers
    for (const q of survey.questions) {
      if (q.required) {
        const ans = input.answers.find((a) => a.questionId === q.id);
        if (
          !ans ||
          ans.value === undefined ||
          ans.value === null ||
          (typeof ans.value === "string" && ans.value.trim().length === 0)
        ) {
          throw new Error(`Question "${q.title}" is required.`);
        }
      }
    }

    const response: SurveyResponse = {
      id: `resp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      surveyId: input.surveyId,
      campaignId: survey.campaignId,
      backerAddress: backerAddr,
      answers: input.answers.map((a) => ({
        questionId: a.questionId,
        value: typeof a.value === "string" ? a.value.trim() : a.value,
      })),
      submittedAt: Date.now(),
    };

    existingResponses.push(response);
    this.responses.set(input.surveyId, existingResponses);

    return response;
  }

  /**
   * Check if a backer has responded to a survey.
   */
  public hasBackerResponded(surveyId: string, backerAddress: string): boolean {
    const responses = this.responses.get(surveyId) || [];
    return responses.some(
      (r) => r.backerAddress.toLowerCase() === backerAddress.trim().toLowerCase()
    );
  }

  /**
   * Get all responses for a survey.
   */
  public getResponsesForSurvey(surveyId: string): SurveyResponse[] {
    return this.responses.get(surveyId) || [];
  }

  /**
   * Distribute survey notifications to backers:
   * 1. Sends email if backer has registered email preference.
   * 2. Always provisions in-app notification as fallback / persistent notification.
   */
  public async sendSurveyToBackers(input: SendSurveyNotificationInput): Promise<{
    emailCount: number;
    inAppCount: number;
    totalBackers: number;
  }> {
    const survey = this.surveys.get(input.surveyId);
    if (!survey) {
      throw new Error(`Survey ${input.surveyId} not found.`);
    }

    if (survey.creatorAddress.toLowerCase() !== input.creatorAddress.trim().toLowerCase()) {
      throw new Error("Only the creator can send survey invitations.");
    }

    // Get campaign details
    const campaign = await getCampaign(input.campaignId);
    const campaignTitle = campaign?.name || "Campaign";

    // Get all contributions for this campaign to find distinct backers
    const contributions = backersService.getContributions(input.campaignId);
    const distinctBackerMap = new Map<string, string>(); // backerAddress -> backerAddress
    for (const c of contributions) {
      if (c.backerAddress) {
        distinctBackerMap.set(c.backerAddress.toLowerCase(), c.backerAddress);
      }
    }

    const backerAddresses = Array.from(distinctBackerMap.values());
    const totalBackers = backerAddresses.length;

    // Get notification preferences for campaign to discover verified email addresses
    let campaignPrefs: Array<{ sponsorId: string; email?: string; channel: string }> = [];
    try {
      campaignPrefs = await getPreferencesForCampaign(input.campaignId);
    } catch {
      campaignPrefs = [];
    }

    const emailMap = new Map<string, string>();
    for (const pref of campaignPrefs) {
      if (pref.email && pref.email.trim().length > 0) {
        emailMap.set(pref.sponsorId.toLowerCase(), pref.email.trim());
      }
    }

    let emailCount = 0;
    let inAppCount = 0;

    const subject =
      input.subject || `Feedback Request: Help shape future milestones for ${campaignTitle}`;
    const surveyUrl = `/campaigns/${input.campaignId}/surveys/${survey.id}`;

    for (const backer of backerAddresses) {
      const email = emailMap.get(backer.toLowerCase());

      // 1. Try sending email if backer email is known
      let emailSent = false;
      if (email) {
        try {
          const htmlContent = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>We'd love your feedback on ${campaignTitle}!</h2>
              <p>Thank you for backing our campaign. Now that this stage has wrapped up, please share your thoughts and product expectations.</p>
              <div style="margin: 24px 0;">
                <a href="${surveyUrl}" style="background-color: #7c3aed; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Take the Survey
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If you can't click the button, visit: ${surveyUrl}</p>
            </div>
          `;
          await this.emailService.sendEmail({
            to: email,
            subject,
            html: htmlContent,
          });
          emailSent = true;
          emailCount++;
        } catch (err) {
          console.error(`Failed to send email to ${email}:`, err);
        }
      }

      // 2. Always create in-app notification (serves as fallback or in-app prompt)
      const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const inAppNotif: InAppSurveyNotification = {
        id: notifId,
        surveyId: survey.id,
        campaignId: input.campaignId,
        backerAddress: backer,
        title: `Survey: ${survey.title}`,
        message: input.message || `Please provide your feedback on ${campaignTitle}.`,
        read: false,
        createdAt: Date.now(),
      };

      const userNotifs = this.inAppNotifications.get(backer.toLowerCase()) || [];
      userNotifs.push(inAppNotif);
      this.inAppNotifications.set(backer.toLowerCase(), userNotifs);
      inAppCount++;
    }

    return {
      emailCount,
      inAppCount,
      totalBackers,
    };
  }

  /**
   * Fetch in-app notifications for a backer.
   */
  public getInAppNotifications(backerAddress: string): InAppSurveyNotification[] {
    return this.inAppNotifications.get(backerAddress.trim().toLowerCase()) || [];
  }

  /**
   * Mark in-app survey notification as read.
   */
  public markInAppNotificationRead(notificationId: string, backerAddress: string): boolean {
    const list = this.inAppNotifications.get(backerAddress.trim().toLowerCase()) || [];
    const notif = list.find((n) => n.id === notificationId);
    if (notif) {
      notif.read = true;
      return true;
    }
    return false;
  }

  /**
   * Aggregate survey analytics for visual dashboard charts.
   */
  public async getSurveyAnalytics(surveyId: string): Promise<SurveyAnalyticsSummary> {
    const survey = this.surveys.get(surveyId);
    if (!survey) {
      throw new Error(`Survey ${surveyId} not found.`);
    }

    const responses = this.responses.get(surveyId) || [];
    const totalResponses = responses.length;

    // Calculate eligible backers from contributions
    const contributions = backersService.getContributions(survey.campaignId);
    const backerSet = new Set<string>();
    for (const c of contributions) {
      if (c.backerAddress) backerSet.add(c.backerAddress.toLowerCase());
    }
    const totalEligibleBackers = Math.max(backerSet.size, totalResponses);
    const responseRatePct =
      totalEligibleBackers > 0
        ? Number(((totalResponses / totalEligibleBackers) * 100).toFixed(1))
        : 0;

    const questionAnalytics: QuestionAnalytics[] = survey.questions.map((question) => {
      const answersForQ = responses
        .map((r) => r.answers.find((a) => a.questionId === question.id))
        .filter((a): a is { questionId: string; value: string | number } => a !== undefined);

      const totalAnswers = answersForQ.length;

      if (question.type === "rating") {
        const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let sum = 0;
        let count = 0;

        for (const ans of answersForQ) {
          const num = Number(ans.value);
          if (!Number.isNaN(num) && num >= 1 && num <= 5) {
            distribution[num] = (distribution[num] || 0) + 1;
            sum += num;
            count++;
          }
        }

        const average = count > 0 ? Number((sum / count).toFixed(2)) : 0;

        return {
          questionId: question.id,
          title: question.title,
          type: question.type,
          totalAnswers,
          ratingMetric: {
            average,
            count,
            distribution,
          },
        };
      }

      if (question.type === "multiple_choice") {
        const counts: Record<string, number> = {};
        for (const opt of question.options || []) {
          counts[opt] = 0;
        }

        for (const ans of answersForQ) {
          const val = String(ans.value);
          counts[val] = (counts[val] || 0) + 1;
        }

        const optionMetrics: OptionMetric[] = Object.entries(counts).map(([option, count]) => ({
          option,
          count,
          percentage: totalAnswers > 0 ? Number(((count / totalAnswers) * 100).toFixed(1)) : 0,
        }));

        return {
          questionId: question.id,
          title: question.title,
          type: question.type,
          totalAnswers,
          optionMetrics,
        };
      }

      // Text question type
      const textResponses = responses
        .map((r) => {
          const ans = r.answers.find((a) => a.questionId === question.id);
          if (ans && String(ans.value).trim().length > 0) {
            return {
              backerAddress: r.backerAddress,
              text: String(ans.value),
              submittedAt: r.submittedAt,
            };
          }
          return null;
        })
        .filter((item): item is { backerAddress: string; text: string; submittedAt: number } => item !== null);

      return {
        questionId: question.id,
        title: question.title,
        type: question.type,
        totalAnswers,
        textResponses,
      };
    });

    return {
      surveyId: survey.id,
      campaignId: survey.campaignId,
      title: survey.title,
      status: survey.status,
      totalResponses,
      totalEligibleBackers,
      responseRatePct,
      questions: questionAnalytics,
    };
  }

  /**
   * Helper to reset in-memory state for testing.
   */
  public clearAll() {
    this.surveys.clear();
    this.responses.clear();
    this.inAppNotifications.clear();
  }
}

export const campaignSurveyService = new CampaignSurveyService();
