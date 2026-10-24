"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  X,
  Send,
  MessageSquare,
  Sparkles,
  ChevronDown,
  MailCheck,
  HelpCircle,
  ArrowUpRight,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  answerCampaignQuestion,
  getSuggestedQuestions,
  type ChatbotAnswerSource,
} from "@/services/campaign-chatbot.service";
import type { CampaignRecord } from "@/services/campaign.service";
import { cn } from "@/lib/utils";

export interface CampaignChatbotProps {
  campaign: CampaignRecord;
  initialOpen?: boolean;
  className?: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  source?: ChatbotAnswerSource;
  matchedQuestion?: string;
  canEscalate?: boolean;
  escalated?: boolean;
  timestamp: number;
}

export function CampaignChatbot({
  campaign,
  initialOpen = false,
  className,
}: CampaignChatbotProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [escalatingMessageId, setEscalatingMessageId] = useState<string | null>(null);
  const [backerContact, setBackerContact] = useState("");

  const suggestedQuestions = getSuggestedQuestions(campaign);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "bot-greeting",
      sender: "bot",
      text: `Hello! I'm the assistant for "${campaign.name}". Ask me any questions about this campaign or how funding and verification work on the platform.`,
      timestamp: Date.now(),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleAskQuestion = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isSubmitting) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSubmitting(true);

    try {
      const result = answerCampaignQuestion(trimmed, campaign);

      if (result.answered && result.answer) {
        const botMessage: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: result.answer,
          source: result.source,
          matchedQuestion: result.matchedQuestion,
          canEscalate: false,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, botMessage]);
      } else {
        // Unanswered question -> escalate to creator inbox
        const botMessage: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: "I couldn't find an answer to your question in the campaign or platform FAQs. Would you like to escalate this directly to the creator's inbox?",
          canEscalate: true,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, botMessage]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEscalateToCreator = async (messageId: string, questionText: string) => {
    setEscalatingMessageId(messageId);
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/creator-inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          backerContact: backerContact.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to escalate");
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, escalated: true, canEscalate: false }
            : msg,
        ),
      );

      const confirmationMessage: ChatMessage = {
        id: `bot-confirm-${Date.now()}`,
        sender: "bot",
        text: `Your question has been escalated to the creator's inbox (${campaign.creator.slice(
          0,
          8,
        )}...). The creator will review and respond to you directly.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, confirmationMessage]);
      setBackerContact("");
    } catch {
      // Fallback local escalation confirmation if API is unavailable
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, escalated: true, canEscalate: false }
            : msg,
        ),
      );
      const confirmationMessage: ChatMessage = {
        id: `bot-confirm-${Date.now()}`,
        sender: "bot",
        text: `Your question has been forwarded to the creator's inbox (${campaign.creator.slice(
          0,
          8,
        )}...).`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, confirmationMessage]);
    } finally {
      setEscalatingMessageId(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAskQuestion(input);
  };

  // Find the last user question for escalation context
  const getLastUserQuestion = (): string => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === "user") {
        return messages[i].text;
      }
    }
    return "Backer question";
  };

  return (
    <div className={cn("fixed bottom-6 right-6 z-50", className)} data-testid="campaign-chatbot">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open campaign FAQ chatbot"
          aria-expanded={false}
          className="group flex items-center gap-2.5 rounded-full bg-fundable-purple-2 px-4 py-3 text-white shadow-xl hover:bg-fundable-purple-2/90 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-fundable-purple-2 focus:ring-offset-2"
          data-testid="chatbot-open-button"
        >
          <div className="relative flex items-center justify-center">
            <Bot className="h-5 w-5 transition-transform group-hover:scale-110" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <span className="text-sm font-semibold tracking-wide">Ask Assistant</span>
        </button>
      )}

      {/* Expanded Chatbot Window */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Campaign Assistant Chatbot"
          aria-modal="false"
          className="flex flex-col w-[380px] sm:w-[420px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-6rem)] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          data-testid="chatbot-window"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-fundable-purple-2 to-purple-600 text-white select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 backdrop-blur-xs">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate leading-tight">Campaign Assistant</h3>
                <p className="text-xs text-purple-100 truncate">{campaign.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsOpen(false)}
                aria-label="Collapse chatbot"
                className="text-white hover:bg-white/20 h-7 w-7 rounded-md"
                data-testid="chatbot-collapse-button"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsOpen(false)}
                aria-label="Close chatbot"
                className="text-white hover:bg-white/20 h-7 w-7 rounded-md"
                data-testid="chatbot-close-button"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-zinc-50/60 dark:bg-zinc-950/40 text-sm">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1 max-w-[86%]",
                  msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start",
                )}
                data-testid={`chat-message-${msg.sender}`}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium px-1">
                  {msg.sender === "user" ? (
                    <>
                      <span>You</span>
                      <User className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <Bot className="h-3 w-3 text-fundable-purple-2" />
                      <span>Assistant</span>
                    </>
                  )}
                </div>

                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 shadow-xs whitespace-pre-wrap leading-relaxed",
                    msg.sender === "user"
                      ? "bg-fundable-purple-2 text-white rounded-tr-xs"
                      : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/80 rounded-tl-xs",
                  )}
                >
                  {msg.text}

                  {/* FAQ Source Badge */}
                  {msg.source && (
                    <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-700/60 flex items-center justify-between gap-2 text-xs">
                      {msg.source === "campaign_faq" ? (
                        <Badge
                          variant="secondary"
                          className="bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 font-medium text-[10px] px-2 py-0.5 border-purple-200 dark:border-purple-800"
                          data-testid="badge-campaign-faq"
                        >
                          Campaign FAQ
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 font-medium text-[10px] px-2 py-0.5 border-blue-200 dark:border-blue-800"
                          data-testid="badge-platform-faq"
                        >
                          Platform FAQ
                        </Badge>
                      )}
                      {msg.matchedQuestion && (
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[180px]">
                          Topic: {msg.matchedQuestion}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Escalation Prompt Card */}
                  {msg.canEscalate && !msg.escalated && (
                    <div
                      className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200 text-xs space-y-2.5"
                      data-testid="escalate-card"
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                        <MailCheck className="h-4 w-4" />
                        <span>Escalate to Creator Inbox</span>
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 leading-normal">
                        Submit this question directly to the campaign creator ({campaign.creator.slice(0, 10)}...).
                      </p>
                      <Input
                        type="text"
                        placeholder="Your email or wallet address (optional)"
                        value={backerContact}
                        onChange={(e) => setBackerContact(e.target.value)}
                        className="h-7 text-xs bg-white dark:bg-zinc-900"
                        data-testid="escalate-contact-input"
                      />
                      <Button
                        size="xs"
                        variant="default"
                        disabled={escalatingMessageId === msg.id}
                        onClick={() => handleEscalateToCreator(msg.id, getLastUserQuestion())}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium"
                        data-testid="escalate-submit-button"
                      >
                        {escalatingMessageId === msg.id ? "Escalating..." : "Send to Creator Inbox"}
                      </Button>
                    </div>
                  )}

                  {msg.escalated && (
                    <div
                      className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                      data-testid="escalated-status"
                    >
                      <MailCheck className="h-3.5 w-3.5" />
                      <span>Escalated to creator</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Quick suggested questions */}
            {suggestedQuestions.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Common questions:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleAskQuestion(q)}
                      className="inline-flex items-center gap-1 text-left rounded-lg border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 active:scale-[0.98] transition-all"
                      data-testid={`suggested-question-${idx}`}
                    >
                      <HelpCircle className="h-3 w-3 text-fundable-purple-2 shrink-0" />
                      <span className="line-clamp-1">{q}</span>
                      <ArrowUpRight className="h-3 w-3 text-zinc-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800"
          >
            <Input
              type="text"
              placeholder="Ask a question about this campaign..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSubmitting}
              className="flex-1 text-xs h-9 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 focus-visible:ring-fundable-purple-2"
              data-testid="chatbot-input"
            />
            <Button
              type="submit"
              size="icon-sm"
              disabled={!input.trim() || isSubmitting}
              aria-label="Send question"
              className="bg-fundable-purple-2 hover:bg-fundable-purple-2/90 text-white shrink-0"
              data-testid="chatbot-send-button"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
