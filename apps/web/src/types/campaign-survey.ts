/**
 * Campaign Backer Survey Types
 * Feature: Structured post-campaign backer survey
 */

export type SurveyQuestionType = "multiple_choice" | "text" | "rating";

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  title: string;
  description?: string;
  required: boolean;
  /** Available choices for multiple_choice question type */
  options?: string[];
  /** Min rating (default 1) */
  minRating?: number;
  /** Max rating (default 5) */
  maxRating?: number;
}

export type SurveyStatus = "draft" | "published" | "closed";

export interface CampaignSurvey {
  id: string;
  campaignId: string;
  title: string;
  description: string;
  creatorAddress: string;
  questions: SurveyQuestion[];
  status: SurveyStatus;
  createdAt: number; // Unix timestamp ms
  updatedAt: number; // Unix timestamp ms
  publishedAt?: number;
  closedAt?: number;
}

export interface SurveyAnswer {
  questionId: string;
  /** Selected option text for multiple choice, text response for text, or numeric string for rating */
  value: string | number;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  campaignId: string;
  backerAddress: string;
  answers: SurveyAnswer[];
  submittedAt: number; // Unix timestamp ms
}

export interface RatingMetric {
  average: number;
  count: number;
  distribution: Record<number, number>; // rating -> count
}

export interface OptionMetric {
  option: string;
  count: number;
  percentage: number;
}

export interface QuestionAnalytics {
  questionId: string;
  title: string;
  type: SurveyQuestionType;
  totalAnswers: number;
  /** Populated for rating questions */
  ratingMetric?: RatingMetric;
  /** Populated for multiple_choice questions */
  optionMetrics?: OptionMetric[];
  /** Populated for text questions */
  textResponses?: Array<{ backerAddress: string; text: string; submittedAt: number }>;
}

export interface SurveyAnalyticsSummary {
  surveyId: string;
  campaignId: string;
  title: string;
  status: SurveyStatus;
  totalResponses: number;
  totalEligibleBackers: number;
  responseRatePct: number;
  questions: QuestionAnalytics[];
}

export interface CreateSurveyInput {
  campaignId: string;
  title: string;
  description?: string;
  questions: Array<{
    type: SurveyQuestionType;
    title: string;
    description?: string;
    required?: boolean;
    options?: string[];
    minRating?: number;
    maxRating?: number;
  }>;
}

export interface SubmitSurveyResponseInput {
  surveyId: string;
  backerAddress: string;
  answers: Array<{
    questionId: string;
    value: string | number;
  }>;
}

export interface SendSurveyNotificationInput {
  surveyId: string;
  campaignId: string;
  creatorAddress: string;
  subject?: string;
  message?: string;
}

export interface InAppSurveyNotification {
  id: string;
  surveyId: string;
  campaignId: string;
  backerAddress: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
}
