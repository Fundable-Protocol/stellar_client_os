export interface CampaignLiveQAAnswer {
  content: string;
  authorAddress: string;
  createdAt: number;
}

export interface CampaignLiveQuestion {
  id: string;
  content: string;
  authorAddress: string;
  createdAt: number;
  upvotes: number;
  upvotedBy: string[];
  answer?: CampaignLiveQAAnswer;
}

export interface CampaignLiveQASession {
  id: string;
  campaignId: string;
  topic: string;
  scheduledAt: string;
  createdAt: number;
  createdBy: string;
  questions: CampaignLiveQuestion[];
}

const SESSION_DURATION_MS = 60 * 60 * 1000;
const sessions = new Map<string, CampaignLiveQASession>();

export function getCampaignLiveQASession(campaignId: string): CampaignLiveQASession | null {
  return sessions.get(campaignId) ?? null;
}

export function scheduleCampaignLiveQA(input: {
  campaignId: string;
  topic: string;
  scheduledAt: string;
  actorAddress: string;
}): CampaignLiveQASession {
  const topic = input.topic.trim();
  const scheduledTime = Date.parse(input.scheduledAt);
  if (!topic || topic.length > 160) throw new Error("Topic must be between 1 and 160 characters.");
  if (!Number.isFinite(scheduledTime)) throw new Error("A valid session date and time are required.");
  if (!input.actorAddress.trim()) throw new Error("Creator address is required.");

  const previous = sessions.get(input.campaignId);
  if (previous && previous.createdBy !== input.actorAddress) {
    throw new Error("Only the session creator can update this session.");
  }

  const session: CampaignLiveQASession = {
    id: previous?.id ?? `live-qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    campaignId: input.campaignId,
    topic,
    scheduledAt: new Date(scheduledTime).toISOString(),
    createdAt: previous?.createdAt ?? Date.now(),
    createdBy: previous?.createdBy ?? input.actorAddress,
    questions: previous?.questions ?? [],
  };
  sessions.set(input.campaignId, session);
  return session;
}

export function addCampaignLiveQuestion(input: {
  campaignId: string;
  content: string;
  actorAddress: string;
}): CampaignLiveQuestion {
  const session = sessions.get(input.campaignId);
  if (!session) throw new Error("Schedule a Q&A session before submitting questions.");
  const content = input.content.trim();
  if (!content || content.length > 500) throw new Error("Question must be between 1 and 500 characters.");
  if (!input.actorAddress.trim()) throw new Error("Backer address is required.");
  if (Date.now() >= Date.parse(session.scheduledAt) + SESSION_DURATION_MS) {
    throw new Error("This Q&A session has ended.");
  }

  const question: CampaignLiveQuestion = {
    id: `live-question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    authorAddress: input.actorAddress,
    createdAt: Date.now(),
    upvotes: 0,
    upvotedBy: [],
  };
  session.questions.unshift(question);
  return question;
}

export function upvoteCampaignLiveQuestion(input: {
  campaignId: string;
  questionId: string;
  actorAddress: string;
}): CampaignLiveQuestion {
  const session = sessions.get(input.campaignId);
  const question = session?.questions.find((item) => item.id === input.questionId);
  if (!session || !question) throw new Error("Question not found.");
  if (!input.actorAddress.trim()) throw new Error("Backer address is required.");
  if (Date.now() >= Date.parse(session.scheduledAt) + SESSION_DURATION_MS) {
    throw new Error("This Q&A session has ended.");
  }
  if (!question.upvotedBy.includes(input.actorAddress)) {
    question.upvotedBy.push(input.actorAddress);
    question.upvotes += 1;
  }
  return question;
}

export function answerCampaignLiveQuestion(input: {
  campaignId: string;
  questionId: string;
  content: string;
  actorAddress: string;
}): CampaignLiveQuestion {
  const session = sessions.get(input.campaignId);
  const question = session?.questions.find((item) => item.id === input.questionId);
  if (!session || !question) throw new Error("Question not found.");
  if (session.createdBy !== input.actorAddress) throw new Error("Only the creator can answer questions.");
  if (!input.content.trim() || input.content.trim().length > 1000) {
    throw new Error("Answer must be between 1 and 1000 characters.");
  }
  const scheduledTime = Date.parse(session.scheduledAt);
  if (Date.now() < scheduledTime || Date.now() >= scheduledTime + SESSION_DURATION_MS) {
    throw new Error("Questions can only be answered during the live session.");
  }
  question.answer = {
    content: input.content.trim(),
    authorAddress: input.actorAddress,
    createdAt: Date.now(),
  };
  return question;
}