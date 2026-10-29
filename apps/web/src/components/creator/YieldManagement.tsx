"use client";

import { useState, useEffect } from "react";
import type {
  YieldStrategy,
  CampaignYieldConfig,
  MilestoneEscrowYield,
  YieldTransaction,
  LiquidityStressAlert,
} from "@/types/yield-strategy";

interface YieldManagementProps {
  campaignId: string;
}

export function YieldManagement({ campaignId }: YieldManagementProps) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<CampaignYieldConfig | null>(null);
  const [strategies, setStrategies] = useState<YieldStrategy[]>([]);
  const [milestoneYield, setMilestoneYield] = useState<MilestoneEscrowYield[]>([]);
  const [transactions, setTransactions] = useState<YieldTransaction[]>([]);
  const [liquidityAlert, setLiquidityAlert] = useState<LiquidityStressAlert | null>(null);
  const [showEnableForm, setShowEnableForm] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [emergencyReason, setEmergencyReason] = useState("");
  const [showEmergencyForm, setShowEmergencyForm] = useState(false);

  useEffect(() => {
    loadData();
    loadStrategies();
  }, [campaignId]);

  async function loadData() {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/yield`);
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setMilestoneYield(data.milestoneYield || []);
        setTransactions(data.transactions || []);
        setLiquidityAlert(data.liquidityAlert);
      }
    } catch (error) {
      console.error("Failed to load yield data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStrategies() {
    try {
      const response = await fetch("/api/yield/strategies");
      if (response.ok) {
        const data = await response.json();
        setStrategies(data.filter((s: YieldStrategy) => s.isActive));
      }
    } catch (error) {
      console.error("Failed to load strategies:", error);
    }
  }

  async function handleEnableYield(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/yield/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId: selectedStrategy }),
      });

      if (response.ok) {
        const newConfig = await response.json();
        setConfig(newConfig);
        setShowEnableForm(false);
        alert("Yield generation enabled successfully!");
        await loadData();
      } else {
        const error = await response.json();
        alert(`Failed to enable yield: ${error.error}`);
      }
    } catch (error) {
      alert("Failed to enable yield generation");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisableYield() {
    if (!confirm("Are you sure you want to disable yield generation? This will stop earning interest on future escrow deposits.")) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/yield`, {
        method: "DELETE",
      });

      if (response.ok) {
        alert("Yield generation disabled successfully");
        await loadData();
      }
    } catch (error) {
      alert("Failed to disable yield generation");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmergencyWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm("EMERGENCY WITHDRAWAL: This will immediately withdraw all funds from the yield strategy. Are you absolutely sure?")) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/yield?action=emergency_withdraw`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: emergencyReason }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Emergency withdrawal successful. Withdrawn: ${formatAmount(result.withdrawnAmount)}, Yield: ${formatAmount(result.accruedYield)}`);
        setShowEmergencyForm(false);
        await loadData();
      } else {
        const error = await response.json();
        alert(`Emergency withdrawal failed: ${error.error}`);
      }
    } catch (error) {
      alert("Emergency withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  function formatAmount(amount: string): string {
    const num = Number(amount) / 10000000;
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " XLM";
  }

  function formatAPY(bps: number): string {
    return (bps / 100).toFixed(2) + "%";
  }

  if (loading && !config) {
    return <div className="p-4">Loading yield management...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Liquidity Alert */}
      {liquidityAlert && (
        <div
          className={`p-4 rounded-lg border-2 ${
            liquidityAlert.severity === "critical"
              ? "bg-red-50 border-red-300"
              : "bg-yellow-50 border-yellow-300"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl">
              {liquidityAlert.severity === "critical" ? "🚨" : "⚠️"}
            </span>
            <div className="flex-1">
              <h4 className="font-semibold text-lg mb-1">Liquidity Stress Alert</h4>
              <p className="text-sm mb-2">{liquidityAlert.message}</p>
              <p className="text-sm font-medium">
                Recommended: {liquidityAlert.recommendedAction}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Yield Generation on Escrow Funds</h3>
          <p className="text-sm text-gray-600">
            Earn interest on milestone escrow balances while awaiting future release dates
          </p>
        </div>
        {config && config.enabled ? (
          <div className="flex gap-2">
            <button
              onClick={() => setShowEmergencyForm(!showEmergencyForm)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Emergency Withdraw
            </button>
            <button
              onClick={handleDisableYield}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Disable Yield
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowEnableForm(!showEnableForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            {showEnableForm ? "Cancel" : "Enable Yield"}
          </button>
        )}
      </div>

      {/* Enable Form */}
      {showEnableForm && (
        <form onSubmit={handleEnableYield} className="bg-gray-50 p-6 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Select Yield Strategy</label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">-- Choose a strategy --</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name} ({formatAPY(strategy.estimatedAPY)} APY) - Risk: {strategy.liquidityRisk}
                </option>
              ))}
            </select>
          </div>

          {selectedStrategy && (
            <div className="bg-white p-4 rounded border">
              {(() => {
                const strategy = strategies.find((s) => s.id === selectedStrategy);
                if (!strategy) return null;

                return (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">Strategy:</span>
                      <span>{strategy.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Type:</span>
                      <span className="capitalize">{strategy.type.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Estimated APY:</span>
                      <span className="text-green-600 font-semibold">{formatAPY(strategy.estimatedAPY)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Minimum Lock Period:</span>
                      <span>{strategy.minimumLockPeriod} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Liquidity Risk:</span>
                      <span className="capitalize">{strategy.liquidityRisk}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Anchor Domain:</span>
                      <span className="text-xs">{strategy.anchorDomain}</span>
                    </div>
                    {strategy.isVerified && (
                      <div className="flex items-center gap-2 text-green-600 mt-2">
                        <span>✓</span>
                        <span className="font-medium">Verified Strategy</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !selectedStrategy}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {loading ? "Enabling..." : "Enable Yield Generation"}
          </button>
        </form>
      )}

      {/* Emergency Withdrawal Form */}
      {showEmergencyForm && config && (
        <form onSubmit={handleEmergencyWithdraw} className="bg-red-50 p-6 rounded-lg border-2 border-red-300 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h4 className="font-semibold text-lg mb-2">Emergency Withdrawal</h4>
              <p className="text-sm text-red-700 mb-4">
                This will immediately withdraw all funds from the yield strategy. This action should only be used
                in case of liquidity stress or security concerns. All accrued yield will be preserved.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Reason for Emergency Withdrawal</label>
            <textarea
              value={emergencyReason}
              onChange={(e) => setEmergencyReason(e.target.value)}
              placeholder="Explain the reason for emergency withdrawal (minimum 10 characters)"
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              required
              minLength={10}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition font-semibold"
            >
              {loading ? "Withdrawing..." : "Confirm Emergency Withdrawal"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowEmergencyForm(false);
                setEmergencyReason("");
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Yield Summary */}
      {config && config.enabled && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-lg border">
          <h4 className="font-semibold mb-4">Yield Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total Deposited</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatAmount(config.totalDeposited)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Accrued Yield</div>
              <div className="text-2xl font-bold text-green-600">
                {formatAmount(config.accruedYield)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Status</div>
              <div className="text-lg font-semibold capitalize">{config.status.replace(/_/g, " ")}</div>
            </div>
          </div>
        </div>
      )}

      {/* Milestone Yield Breakdown */}
      {milestoneYield.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">Milestone Escrow Yield</h4>
          <div className="space-y-3">
            {milestoneYield.map((milestone, index) => (
              <div key={milestone.milestoneId} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium">Milestone {index + 1}</div>
                    <div className="text-sm text-gray-600">
                      Release Date: {new Date(milestone.releaseDate * 1000).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      milestone.isReleased
                        ? "bg-gray-100 text-gray-600"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {milestone.isReleased ? "Released" : `${milestone.daysPending} days pending`}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">Escrow Amount</div>
                    <div className="font-semibold">{formatAmount(milestone.escrowAmount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Accrued Yield</div>
                    <div className="font-semibold text-green-600">
                      {formatAmount(milestone.actualYield)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Estimated Final</div>
                    <div className="font-semibold text-blue-600">
                      {formatAmount(milestone.estimatedYield)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">Transaction History</h4>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map((tx) => (
                  <tr key={tx.id} className="border-t">
                    <td className="px-4 py-2 capitalize">{tx.type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2 font-medium">{formatAmount(tx.amount)}</td>
                    <td className="px-4 py-2">{new Date(tx.timestamp * 1000).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          tx.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : tx.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
