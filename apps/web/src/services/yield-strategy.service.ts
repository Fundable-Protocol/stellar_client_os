/**
 * Yield Strategy Service
 *
 * Manages yield generation on milestone escrow funds via Stellar anchor protocols.
 * Supports deposits, accrual tracking, emergency withdrawals, and proportional
 * yield distribution.
 */

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type {
  YieldStrategy,
  CampaignYieldConfig,
  YieldDeposit,
  YieldTransaction,
  YieldStrategyStatus,
  YieldDistributionRule,
  MilestoneEscrowYield,
  LiquidityStressAlert,
} from "../types/yield-strategy";

export interface YieldStrategyServiceOptions {
  strategiesPath?: string;
  configsPath?: string;
  depositsPath?: string;
  transactionsPath?: string;
}

const DEFAULT_DISTRIBUTION_RULE: YieldDistributionRule = {
  creatorShare: 7000, // 70% to creator
  backerShare: 3000, // 30% to backers
  platformFee: 0, // 0% platform fee
};

export class YieldStrategyService {
  private readonly strategiesPath: string;
  private readonly configsPath: string;
  private readonly depositsPath: string;
  private readonly transactionsPath: string;

  constructor(options: YieldStrategyServiceOptions = {}) {
    this.strategiesPath =
      options.strategiesPath ?? path.join(process.cwd(), "data", "yield_strategies.json");
    this.configsPath =
      options.configsPath ?? path.join(process.cwd(), "data", "campaign_yield_configs.json");
    this.depositsPath =
      options.depositsPath ?? path.join(process.cwd(), "data", "yield_deposits.json");
    this.transactionsPath =
      options.transactionsPath ?? path.join(process.cwd(), "data", "yield_transactions.json");
  }

  // ============================================
  // Storage Helpers
  // ============================================

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
      await fs.rename(tempPath, filePath);
    } catch (err) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw err;
    }
  }

  private async readJson<T>(filePath: string, defaultValue: T): Promise<T> {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as T;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "ENOENT") {
        return defaultValue;
      }
      throw err;
    }
  }

  // ============================================
  // Yield Strategy Management
  // ============================================

  async getStrategies(): Promise<YieldStrategy[]> {
    return this.readJson(this.strategiesPath, []);
  }

  async getStrategy(strategyId: string): Promise<YieldStrategy | null> {
    const strategies = await this.getStrategies();
    return strategies.find((s) => s.id === strategyId) ?? null;
  }

  async createStrategy(strategy: Omit<YieldStrategy, "id">): Promise<YieldStrategy> {
    const strategies = await this.getStrategies();
    const newStrategy: YieldStrategy = {
      id: "ys_" + randomUUID().replace(/-/g, "").slice(0, 16),
      ...strategy,
    };
    strategies.push(newStrategy);
    await this.writeJsonAtomic(this.strategiesPath, strategies);
    return newStrategy;
  }

  // ============================================
  // Campaign Yield Configuration
  // ============================================

  async getCampaignConfig(campaignId: string): Promise<CampaignYieldConfig | null> {
    const configs = await this.readJson<CampaignYieldConfig[]>(this.configsPath, []);
    return configs.find((c) => c.campaignId === campaignId) ?? null;
  }

  async enableYieldForCampaign(
    campaignId: string,
    strategyId: string
  ): Promise<CampaignYieldConfig> {
    const configs = await this.readJson<CampaignYieldConfig[]>(this.configsPath, []);
    const existing = configs.find((c) => c.campaignId === campaignId);

    if (existing) {
      existing.enabled = true;
      existing.strategyId = strategyId;
      existing.status = "active";
      existing.updatedAt = new Date().toISOString();
      await this.writeJsonAtomic(this.configsPath, configs);
      return existing;
    }

    const newConfig: CampaignYieldConfig = {
      id: "cyc_" + randomUUID().replace(/-/g, "").slice(0, 16),
      campaignId,
      enabled: true,
      strategyId,
      status: "active",
      totalDeposited: "0",
      accruedYield: "0",
      createdAt: new Date().toISOString(),
    };

    configs.push(newConfig);
    await this.writeJsonAtomic(this.configsPath, configs);
    return newConfig;
  }

  async disableYieldForCampaign(campaignId: string): Promise<boolean> {
    const configs = await this.readJson<CampaignYieldConfig[]>(this.configsPath, []);
    const config = configs.find((c) => c.campaignId === campaignId);

    if (!config) return false;

    config.enabled = false;
    config.status = "disabled";
    config.updatedAt = new Date().toISOString();
    await this.writeJsonAtomic(this.configsPath, configs);
    return true;
  }

  // ============================================
  // Yield Deposits
  // ============================================

  async depositToYieldStrategy(
    campaignId: string,
    milestoneId: string,
    amount: string,
    releaseDate: number
  ): Promise<YieldDeposit> {
    const config = await this.getCampaignConfig(campaignId);
    if (!config || !config.enabled) {
      throw new Error("Yield generation not enabled for this campaign");
    }

    const strategy = await this.getStrategy(config.strategyId);
    if (!strategy || !strategy.isActive) {
      throw new Error("Selected yield strategy is not available");
    }

    const deposits = await this.readJson<YieldDeposit[]>(this.depositsPath, []);
    const deposit: YieldDeposit = {
      id: "yd_" + randomUUID().replace(/-/g, "").slice(0, 16),
      campaignId,
      milestoneId,
      amount,
      strategyId: config.strategyId,
      depositedAt: Math.floor(Date.now() / 1000),
      releaseDate,
      accruedYield: "0",
      yieldDistributed: false,
    };

    deposits.push(deposit);
    await this.writeJsonAtomic(this.depositsPath, deposits);

    // Update campaign config
    const configs = await this.readJson<CampaignYieldConfig[]>(this.configsPath, []);
    const configIndex = configs.findIndex((c) => c.campaignId === campaignId);
    if (configIndex !== -1) {
      const currentDeposited = BigInt(configs[configIndex].totalDeposited);
      const newAmount = BigInt(amount);
      configs[configIndex].totalDeposited = (currentDeposited + newAmount).toString();
      configs[configIndex].depositedAt = deposit.depositedAt;
      configs[configIndex].updatedAt = new Date().toISOString();
      await this.writeJsonAtomic(this.configsPath, configs);
    }

    // Record transaction
    await this.recordTransaction({
      campaignId,
      type: "deposit",
      amount,
      strategyId: config.strategyId,
      timestamp: deposit.depositedAt,
      status: "completed",
    });

    return deposit;
  }

  async getCampaignDeposits(campaignId: string): Promise<YieldDeposit[]> {
    const deposits = await this.readJson<YieldDeposit[]>(this.depositsPath, []);
    return deposits.filter((d) => d.campaignId === campaignId);
  }

  async getMilestoneDeposit(
    campaignId: string,
    milestoneId: string
  ): Promise<YieldDeposit | null> {
    const deposits = await this.readJson<YieldDeposit[]>(this.depositsPath, []);
    return (
      deposits.find((d) => d.campaignId === campaignId && d.milestoneId === milestoneId) ?? null
    );
  }

  // ============================================
  // Yield Accrual
  // ============================================

  /**
   * Calculate accrued yield for a deposit based on time elapsed and strategy APY.
   * Uses simple interest formula: Interest = Principal × Rate × Time
   */
  calculateAccruedYield(
    principal: string,
    apyBps: number,
    daysElapsed: number
  ): string {
    const principalBigInt = BigInt(principal);
    const apyDecimal = apyBps / 10000; // Convert basis points to decimal
    const dailyRate = apyDecimal / 365;
    
    // Calculate yield using BigInt arithmetic to avoid precision loss
    const yieldBigInt = (principalBigInt * BigInt(Math.floor(dailyRate * daysElapsed * 10000))) / 10000n;
    
    return yieldBigInt.toString();
  }

  async updateYieldAccrual(campaignId: string): Promise<void> {
    const config = await this.getCampaignConfig(campaignId);
    if (!config || !config.enabled) return;

    const strategy = await this.getStrategy(config.strategyId);
    if (!strategy) return;

    const deposits = await this.getCampaignDeposits(campaignId);
    const now = Math.floor(Date.now() / 1000);
    let totalYield = BigInt(0);

    for (const deposit of deposits) {
      if (deposit.yieldDistributed) continue;

      const daysElapsed = (now - deposit.depositedAt) / 86400;
      const accruedYield = this.calculateAccruedYield(
        deposit.amount,
        strategy.estimatedAPY,
        Math.floor(daysElapsed)
      );

      deposit.accruedYield = accruedYield;
      totalYield += BigInt(accruedYield);
    }

    // Update deposits
    const allDeposits = await this.readJson<YieldDeposit[]>(this.depositsPath, []);
    const updatedDeposits = allDeposits.map((d) => {
      const updated = deposits.find((ud) => ud.id === d.id);
      return updated ?? d;
    });
    await this.writeJsonAtomic(this.depositsPath, updatedDeposits);

    // Update campaign config
    const configs = await this.readJson<CampaignYieldConfig[]>(this.configsPath, []);
    const configIndex = configs.findIndex((c) => c.campaignId === campaignId);
    if (configIndex !== -1) {
      configs[configIndex].accruedYield = totalYield.toString();
      configs[configIndex].lastYieldCheckAt = now;
      configs[configIndex].updatedAt = new Date().toISOString();
      await this.writeJsonAtomic(this.configsPath, configs);
    }

    // Record yield accrual transaction
    if (totalYield > 0n) {
      await this.recordTransaction({
        campaignId,
        type: "yield_accrual",
        amount: totalYield.toString(),
        strategyId: config.strategyId,
        timestamp: now,
        status: "completed",
      });
    }
  }

  // ============================================
  // Yield Distribution
  // ============================================

  async distributeYield(
    campaignId: string,
    milestoneId: string,
    distributionRule: YieldDistributionRule = DEFAULT_DISTRIBUTION_RULE
  ): Promise<{
    creatorAmount: string;
    backerAmount: string;
    platformFee: string;
    totalDistributed: string;
  }> {
    const deposit = await this.getMilestoneDeposit(campaignId, milestoneId);
    if (!deposit) {
      throw new Error("Milestone deposit not found");
    }

    if (deposit.yieldDistributed) {
      throw new Error("Yield already distributed for this milestone");
    }

    // Update yield before distribution
    await this.updateYieldAccrual(campaignId);

    // Reload deposit to get updated yield
    const updatedDeposit = await this.getMilestoneDeposit(campaignId, milestoneId);
    if (!updatedDeposit) throw new Error("Deposit not found");

    const totalYield = BigInt(updatedDeposit.accruedYield);
    const creatorAmount = (totalYield * BigInt(distributionRule.creatorShare)) / 10000n;
    const backerAmount = (totalYield * BigInt(distributionRule.backerShare)) / 10000n;
    const platformFee = (totalYield * BigInt(distributionRule.platformFee)) / 10000n;

    // Mark as distributed
    const deposits = await this.readJson<YieldDeposit[]>(this.depositsPath, []);
    const depositIndex = deposits.findIndex((d) => d.id === updatedDeposit.id);
    if (depositIndex !== -1) {
      deposits[depositIndex].yieldDistributed = true;
      await this.writeJsonAtomic(this.depositsPath, deposits);
    }

    return {
      creatorAmount: creatorAmount.toString(),
      backerAmount: backerAmount.toString(),
      platformFee: platformFee.toString(),
      totalDistributed: totalYield.toString(),
    };
  }

  // ============================================
  // Emergency Withdrawal
  // ============================================

  async emergencyWithdraw(
    campaignId: string,
    reason: string
  ): Promise<{ withdrawnAmount: string; accruedYield: string }> {
    const config = await this.getCampaignConfig(campaignId);
    if (!config) {
      throw new Error("Campaign yield config not found");
    }

    if (config.status === "emergency_withdrawn") {
      throw new Error("Emergency withdrawal already executed");
    }

    // Update yield before withdrawal
    await this.updateYieldAccrual(campaignId);

    // Get all deposits
    const deposits = await this.getCampaignDeposits(campaignId);
    let totalWithdrawn = BigInt(0);
    let totalYield = BigInt(0);

    for (const deposit of deposits) {
      if (!deposit.yieldDistributed) {
        totalWithdrawn += BigInt(deposit.amount);
        totalYield += BigInt(deposit.accruedYield);
        deposit.withdrawnAt = Math.floor(Date.now() / 1000);
      }
    }

    // Update deposits
    const allDeposits = await this.readJson<YieldDeposit[]>(this.depositsPath, []);
    const updatedDeposits = allDeposits.map((d) => {
      const updated = deposits.find((ud) => ud.id === d.id);
      return updated ?? d;
    });
    await this.writeJsonAtomic(this.depositsPath, updatedDeposits);

    // Update config
    const configs = await this.readJson<CampaignYieldConfig[]>(this.configsPath, []);
    const configIndex = configs.findIndex((c) => c.campaignId === campaignId);
    if (configIndex !== -1) {
      configs[configIndex].status = "emergency_withdrawn";
      configs[configIndex].emergencyWithdrawalReason = reason;
      configs[configIndex].updatedAt = new Date().toISOString();
      await this.writeJsonAtomic(this.configsPath, configs);
    }

    // Record transaction
    await this.recordTransaction({
      campaignId,
      type: "emergency_withdrawal",
      amount: totalWithdrawn.toString(),
      strategyId: config.strategyId,
      timestamp: Math.floor(Date.now() / 1000),
      status: "completed",
    });

    return {
      withdrawnAmount: totalWithdrawn.toString(),
      accruedYield: totalYield.toString(),
    };
  }

  // ============================================
  // Milestone Escrow Yield Summary
  // ============================================

  async getMilestoneYieldSummary(campaignId: string): Promise<MilestoneEscrowYield[]> {
    const deposits = await this.getCampaignDeposits(campaignId);
    const config = await this.getCampaignConfig(campaignId);
    const strategy = config ? await this.getStrategy(config.strategyId) : null;

    const now = Math.floor(Date.now() / 1000);

    return deposits.map((deposit) => {
      const daysElapsed = (now - deposit.depositedAt) / 86400;
      const daysPending = Math.max(0, (deposit.releaseDate - now) / 86400);

      return {
        milestoneId: deposit.milestoneId,
        milestonePercentage: 0, // To be filled by caller
        escrowAmount: deposit.amount,
        releaseDate: deposit.releaseDate,
        daysPending: Math.floor(daysPending),
        estimatedYield: strategy
          ? this.calculateAccruedYield(deposit.amount, strategy.estimatedAPY, Math.floor(daysElapsed))
          : "0",
        actualYield: deposit.accruedYield,
        isReleased: deposit.yieldDistributed,
      };
    });
  }

  // ============================================
  // Liquidity Monitoring
  // ============================================

  async checkLiquidityStress(campaignId: string): Promise<LiquidityStressAlert | null> {
    const config = await this.getCampaignConfig(campaignId);
    if (!config || !config.enabled) return null;

    const strategy = await this.getStrategy(config.strategyId);
    if (!strategy) return null;

    // Simulate liquidity check (in production, this would query the actual protocol)
    if (strategy.liquidityRisk === "high") {
      return {
        strategyId: strategy.id,
        strategyName: strategy.name,
        campaignId,
        severity: "warning",
        message: "High liquidity risk detected in yield strategy",
        recommendedAction: "Consider emergency withdrawal or switching to lower-risk strategy",
        triggeredAt: Math.floor(Date.now() / 1000),
      };
    }

    return null;
  }

  // ============================================
  // Transaction History
  // ============================================

  private async recordTransaction(
    tx: Omit<YieldTransaction, "id">
  ): Promise<YieldTransaction> {
    const transactions = await this.readJson<YieldTransaction[]>(this.transactionsPath, []);
    const newTx: YieldTransaction = {
      id: "yt_" + randomUUID().replace(/-/g, "").slice(0, 16),
      ...tx,
    };
    transactions.push(newTx);
    await this.writeJsonAtomic(this.transactionsPath, transactions);
    return newTx;
  }

  async getCampaignTransactions(campaignId: string): Promise<YieldTransaction[]> {
    const transactions = await this.readJson<YieldTransaction[]>(this.transactionsPath, []);
    return transactions.filter((t) => t.campaignId === campaignId);
  }
}

// Singleton instance
export const yieldStrategyService = new YieldStrategyService();
