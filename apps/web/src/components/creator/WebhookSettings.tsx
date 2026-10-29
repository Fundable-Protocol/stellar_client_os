"use client";

import { useState, useEffect } from "react";
import type {
  ExternalWebhookConfig,
  ExternalWebhookPlatform,
  ExternalWebhookEvent,
} from "@/types/external-webhook";

interface WebhookSettingsProps {
  campaignId: string;
}

export function WebhookSettings({ campaignId }: WebhookSettingsProps) {
  const [webhooks, setWebhooks] = useState<ExternalWebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
  
  // Form state
  const [platform, setPlatform] = useState<ExternalWebhookPlatform>("discord");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [botToken, setBotToken] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<ExternalWebhookEvent[]>([
    "pledge.created",
    "milestone.reached",
  ]);

  const availableEvents: { value: ExternalWebhookEvent; label: string; description: string }[] = [
    {
      value: "pledge.created",
      label: "New Pledge",
      description: "Triggered when a backer pledges to your campaign",
    },
    {
      value: "milestone.reached",
      label: "Milestone Reached",
      description: "Triggered when your campaign reaches 25%, 50%, 75%, or 100% funding",
    },
    {
      value: "stretch_goal.unlocked",
      label: "Stretch Goal Unlocked",
      description: "Triggered when a stretch goal is achieved",
    },
    {
      value: "refund.requested",
      label: "Refund Requested",
      description: "Triggered when a backer requests a refund",
    },
    {
      value: "campaign.completed",
      label: "Campaign Completed",
      description: "Triggered when your campaign ends successfully",
    },
  ];

  useEffect(() => {
    loadWebhooks();
  }, [campaignId]);

  async function loadWebhooks() {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/webhooks`);
      if (response.ok) {
        const data = await response.json();
        setWebhooks(data);
      }
    } catch (error) {
      console.error("Failed to load webhooks:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateWebhook(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          webhookUrl,
          botToken: platform === "telegram" ? botToken : undefined,
          events: selectedEvents,
        }),
      });

      if (response.ok) {
        const newWebhook = await response.json();
        setWebhooks([...webhooks, newWebhook]);
        setShowForm(false);
        setWebhookUrl("");
        setBotToken("");
        setSelectedEvents(["pledge.created", "milestone.reached"]);
      } else {
        const error = await response.json();
        alert(`Failed to create webhook: ${error.error}`);
      }
    } catch (error) {
      alert("Failed to create webhook");
    } finally {
      setLoading(false);
    }
  }

  async function handleTestWebhook(webhookId: string) {
    setTestingWebhook(webhookId);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/webhooks/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId }),
      });

      if (response.ok) {
        alert("Test event sent successfully! Check your channel.");
      } else {
        const error = await response.json();
        alert(`Test failed: ${error.error}`);
      }
    } catch (error) {
      alert("Failed to send test event");
    } finally {
      setTestingWebhook(null);
    }
  }

  async function handleToggleWebhook(webhookId: string, enabled: boolean) {
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/webhooks?webhookId=${webhookId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        }
      );

      if (response.ok) {
        const updated = await response.json();
        setWebhooks(webhooks.map((w) => (w.id === webhookId ? updated : w)));
      }
    } catch (error) {
      alert("Failed to update webhook");
    }
  }

  async function handleDeleteWebhook(webhookId: string) {
    if (!confirm("Are you sure you want to delete this webhook?")) return;

    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/webhooks?webhookId=${webhookId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        setWebhooks(webhooks.filter((w) => w.id !== webhookId));
      }
    } catch (error) {
      alert("Failed to delete webhook");
    }
  }

  function handleEventToggle(event: ExternalWebhookEvent) {
    if (selectedEvents.includes(event)) {
      setSelectedEvents(selectedEvents.filter((e) => e !== event));
    } else {
      setSelectedEvents([...selectedEvents, event]);
    }
  }

  if (loading && webhooks.length === 0) {
    return <div className="p-4">Loading webhooks...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Webhook Integrations</h3>
          <p className="text-sm text-gray-600">
            Receive real-time notifications in your Discord or Telegram channels
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {showForm ? "Cancel" : "+ Add Webhook"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateWebhook} className="bg-gray-50 p-6 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Platform</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="discord"
                  checked={platform === "discord"}
                  onChange={(e) => setPlatform(e.target.value as ExternalWebhookPlatform)}
                  className="mr-2"
                />
                Discord
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="telegram"
                  checked={platform === "telegram"}
                  onChange={(e) => setPlatform(e.target.value as ExternalWebhookPlatform)}
                  className="mr-2"
                />
                Telegram
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {platform === "discord" ? "Discord Webhook URL" : "Telegram Chat ID"}
            </label>
            <input
              type="text"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder={
                platform === "discord"
                  ? "https://discord.com/api/webhooks/..."
                  : "Chat ID or @channel_name"
              }
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {platform === "discord"
                ? "Create a webhook in your Discord channel settings"
                : "Get your chat ID from @userinfobot"}
            </p>
          </div>

          {platform === "telegram" && (
            <div>
              <label className="block text-sm font-medium mb-2">Telegram Bot Token</label>
              <input
                type="text"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Get your bot token from @BotFather
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Event Triggers</label>
            <div className="space-y-2">
              {availableEvents.map((event) => (
                <label key={event.value} className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-white">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event.value)}
                    onChange={() => handleEventToggle(event.value)}
                    className="mt-1 mr-3"
                  />
                  <div>
                    <div className="font-medium">{event.label}</div>
                    <div className="text-sm text-gray-600">{event.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {loading ? "Creating..." : "Create Webhook"}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {webhooks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No webhooks configured yet. Add one to get started!
          </div>
        ) : (
          webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="border rounded-lg p-4 flex items-start justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium capitalize">{webhook.platform}</span>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      webhook.enabled
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {webhook.enabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  {webhook.webhookUrl.slice(0, 50)}...
                </div>
                <div className="text-xs text-gray-500">
                  Events: {webhook.events.join(", ")}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleTestWebhook(webhook.id)}
                  disabled={testingWebhook === webhook.id}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  {testingWebhook === webhook.id ? "Testing..." : "Test"}
                </button>
                <button
                  onClick={() => handleToggleWebhook(webhook.id, !webhook.enabled)}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                >
                  {webhook.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => handleDeleteWebhook(webhook.id)}
                  className="px-3 py-1 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
