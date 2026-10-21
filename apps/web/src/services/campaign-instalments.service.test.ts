import { describe, it, expect, beforeEach } from "vitest";
import { CampaignInstalmentsService } from "./campaign-instalments.service";
import { calculateInstalmentSchedule } from "@/types/campaign-instalments";

describe("CampaignInstalmentsService", () => {
  let service: CampaignInstalmentsService;
  const campaignId = "camp-instalment-test-1";
  const creatorAddress = "GCREATOR_INSTALMENT_TEST";
  const backerAddress = "GBACKER_INSTALMENT_TEST";

  beforeEach(() => {
    service = new CampaignInstalmentsService();
    service.clearAll();
  });

  describe("Acceptance Criterion 1: Creator enables instalment option per reward tier", () => {
    it("should allow creator to configure a reward tier with instalments enabled", async () => {
      const tier = await service.configureRewardTier(campaignId, creatorAddress, {
        name: "Exclusive Producer Package",
        description: "Full production credits & tree planting ceremony VIP pass",
        amount: "1200",
        token: "USDC",
        instalmentEnabled: true,
        allowedPlanMonths: [2, 3, 6],
        limit: 10,
      });

      expect(tier.id).toBeDefined();
      expect(tier.instalmentEnabled).toBe(true);
      expect(tier.allowedPlanMonths).toEqual([2, 3, 6]);
      expect(tier.amount).toBe("1200.00");
    });

    it("should allow creator to configure a reward tier with instalments disabled", async () => {
      const tier = await service.configureRewardTier(campaignId, creatorAddress, {
        name: "Early Bird Seedling",
        amount: "50",
        instalmentEnabled: false,
      });

      expect(tier.instalmentEnabled).toBe(false);
      expect(tier.allowedPlanMonths).toEqual([]);
    });

    it("should reject invalid tier amounts or unsupported plans", async () => {
      await expect(
        service.configureRewardTier(campaignId, creatorAddress, {
          name: "Invalid Tier",
          amount: "0",
          instalmentEnabled: true,
        }),
      ).rejects.toThrow("Tier amount must be a positive number");

      await expect(
        service.configureRewardTier(campaignId, creatorAddress, {
          name: "Invalid Duration Tier",
          amount: "500",
          instalmentEnabled: true,
          // @ts-expect-error - testing invalid plan months
          allowedPlanMonths: [4, 5],
        }),
      ).rejects.toThrow(/Unsupported plan duration/);
    });
  });

  describe("Acceptance Criterion 2: Backers choose 2, 3, or 6 month plans at checkout", () => {
    let tierId: string;

    beforeEach(async () => {
      const tier = await service.configureRewardTier(campaignId, creatorAddress, {
        name: "Diamond Founder Tier",
        amount: "600",
        token: "USDC",
        instalmentEnabled: true,
        allowedPlanMonths: [2, 3, 6],
      });
      tierId = tier.id;
    });

    it("should provide exact breakdown for 2-month plan", async () => {
      const campaignClose = 1750000000000;
      const breakdown = await service.getInstalmentPlanBreakdown(campaignId, tierId, 2, campaignClose);

      expect(breakdown.months).toBe(2);
      expect(breakdown.totalAmount).toBe("600.00");
      expect(breakdown.monthlyAmount).toBe("300.00");
      expect(breakdown.schedule).toHaveLength(2);
      expect(breakdown.schedule[0].amount).toBe("300.00");
      expect(breakdown.schedule[1].amount).toBe("300.00");
    });

    it("should provide exact breakdown for 3-month plan", async () => {
      const campaignClose = 1750000000000;
      const breakdown = await service.getInstalmentPlanBreakdown(campaignId, tierId, 3, campaignClose);

      expect(breakdown.months).toBe(3);
      expect(breakdown.totalAmount).toBe("600.00");
      expect(breakdown.monthlyAmount).toBe("200.00");
      expect(breakdown.schedule).toHaveLength(3);
      expect(breakdown.schedule[0].amount).toBe("200.00");
      expect(breakdown.schedule[1].amount).toBe("200.00");
      expect(breakdown.schedule[2].amount).toBe("200.00");
    });

    it("should provide exact breakdown for 6-month plan", async () => {
      const campaignClose = 1750000000000;
      const breakdown = await service.getInstalmentPlanBreakdown(campaignId, tierId, 6, campaignClose);

      expect(breakdown.months).toBe(6);
      expect(breakdown.totalAmount).toBe("600.00");
      expect(breakdown.monthlyAmount).toBe("100.00");
      expect(breakdown.schedule).toHaveLength(6);
      expect(breakdown.schedule[0].amount).toBe("100.00");
      expect(breakdown.schedule[5].amount).toBe("100.00");
    });

    it("should reject checkout when choosing an unsupported plan duration", async () => {
      await expect(
        service.checkoutWithInstalments({
          campaignId,
          tierId,
          backerAddress,
          // @ts-expect-error - testing invalid plan months
          planMonths: 5,
        }),
      ).rejects.toThrow(/Invalid plan duration/);
    });

    it("should reject checkout for tiers where instalments are disabled", async () => {
      const standardTier = await service.configureRewardTier(campaignId, creatorAddress, {
        name: "Standard Tier",
        amount: "100",
        instalmentEnabled: false,
      });

      await expect(
        service.checkoutWithInstalments({
          campaignId,
          tierId: standardTier.id,
          backerAddress,
          planMonths: 3,
        }),
      ).rejects.toThrow(/Instalments are not enabled/);
    });

    it("should successfully checkout with a 3-month plan", async () => {
      const closeDate = 1750000000000;
      const pledge = await service.checkoutWithInstalments({
        campaignId,
        tierId,
        backerAddress,
        backerEmail: "backer@example.com",
        planMonths: 3,
        customCampaignCloseDate: closeDate,
      });

      expect(pledge.id).toBeDefined();
      expect(pledge.planMonths).toBe(3);
      expect(pledge.totalAmount).toBe("600.00");
      expect(pledge.status).toBe("ACTIVE");
      expect(pledge.schedule).toHaveLength(3);
      expect(pledge.schedule.every((s) => s.status === "PENDING")).toBe(true);
    });
  });

  describe("Acceptance Criterion 3: First instalment charged at campaign close; subsequent on monthly schedule", () => {
    it("should set first instalment due at campaign close and subsequent ones 30 days apart", () => {
      const campaignClose = 1750000000000;
      const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

      const { schedule } = calculateInstalmentSchedule("1000", 3, campaignClose);

      expect(schedule[0].instalmentNumber).toBe(1);
      expect(schedule[0].dueDate).toBe(campaignClose); // First instalment at campaign close

      expect(schedule[1].instalmentNumber).toBe(2);
      expect(schedule[1].dueDate).toBe(campaignClose + MS_30_DAYS); // 1 month after close

      expect(schedule[2].instalmentNumber).toBe(3);
      expect(schedule[2].dueDate).toBe(campaignClose + 2 * MS_30_DAYS); // 2 months after close

      // Check remainder handling: 1000 / 3 = 333.33 x 3 = 999.99 + 0.01 remainder on 1st
      expect(schedule[0].amount).toBe("333.34");
      expect(schedule[1].amount).toBe("333.33");
      expect(schedule[2].amount).toBe("333.33");
    });

    it("should process charges as dates pass: charge 1st at campaign close, and subsequent on their due dates", async () => {
      const campaignClose = 1750000000000;
      const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

      const tier = await service.configureRewardTier(campaignId, creatorAddress, {
        name: "High Value Tier",
        amount: "300",
        instalmentEnabled: true,
      });

      const pledge = await service.checkoutWithInstalments({
        campaignId,
        tierId: tier.id,
        backerAddress,
        planMonths: 3,
        customCampaignCloseDate: campaignClose,
      });

      // 1. Before campaign close: no instalments charged yet
      const beforeCloseResult = await service.processDueInstalments(campaignClose - 1000);
      expect(beforeCloseResult.processedCount).toBe(0);
      expect(pledge.schedule[0].status).toBe("PENDING");

      // 2. At campaign close: first instalment is charged
      const atCloseResult = await service.processDueInstalments(campaignClose);
      expect(atCloseResult.processedCount).toBe(1);
      expect(atCloseResult.chargedInstalments[0].instalmentNumber).toBe(1);
      expect(pledge.schedule[0].status).toBe("CHARGED");
      expect(pledge.schedule[1].status).toBe("PENDING");
      expect(pledge.status).toBe("ACTIVE");

      // 3. One month after close: second instalment is charged
      const month1Result = await service.processDueInstalments(campaignClose + MS_30_DAYS);
      expect(month1Result.processedCount).toBe(1);
      expect(month1Result.chargedInstalments[0].instalmentNumber).toBe(2);
      expect(pledge.schedule[1].status).toBe("CHARGED");
      expect(pledge.schedule[2].status).toBe("PENDING");
      expect(pledge.status).toBe("ACTIVE");

      // 4. Two months after close: third (and final) instalment is charged; pledge completed
      const month2Result = await service.processDueInstalments(campaignClose + 2 * MS_30_DAYS);
      expect(month2Result.processedCount).toBe(1);
      expect(month2Result.chargedInstalments[0].instalmentNumber).toBe(3);
      expect(pledge.schedule[2].status).toBe("CHARGED");
      expect(pledge.status).toBe("COMPLETED");
    });
  });

  describe("Idempotency and retrieval", () => {
    it("should safely handle repeat checkout requests with idempotencyKey", async () => {
      const tier = await service.configureRewardTier(campaignId, creatorAddress, {
        name: "Idempotent Tier",
        amount: "500",
        instalmentEnabled: true,
      });

      const p1 = await service.checkoutWithInstalments({
        campaignId,
        tierId: tier.id,
        backerAddress,
        planMonths: 2,
        idempotencyKey: "unique-key-12345",
      });

      const p2 = await service.checkoutWithInstalments({
        campaignId,
        tierId: tier.id,
        backerAddress,
        planMonths: 2,
        idempotencyKey: "unique-key-12345",
      });

      expect(p1.id).toBe(p2.id);
      expect(tier.claimed).toBe(1); // Not incremented twice
    });

    it("should retrieve backer instalments by backer address", async () => {
      const tier = await service.configureRewardTier(campaignId, creatorAddress, {
        name: "Backer Tier",
        amount: "400",
        instalmentEnabled: true,
      });

      await service.checkoutWithInstalments({
        campaignId,
        tierId: tier.id,
        backerAddress,
        planMonths: 2,
      });

      const list = service.getBackerInstalments(backerAddress);
      expect(list).toHaveLength(1);
      expect(list[0].tierName).toBe("Backer Tier");
    });
  });
});
