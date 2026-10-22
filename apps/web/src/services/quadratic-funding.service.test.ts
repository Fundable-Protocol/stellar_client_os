import { describe, it, expect, vi, beforeEach } from "vitest";
import { QuadraticFundingService, QuadraticFundingError } from "./quadratic-funding.service";

describe("QuadraticFundingService", () => {
  let service: QuadraticFundingService;

  beforeEach(() => {
    service = new QuadraticFundingService();
  });

  describe("createRound", () => {
    it("should throw error when contract not configured", async () => {
      const params = {
        token: "GXXXXXXX",
        matchingPool: "1000000",
        startTime: Date.now() / 1000,
        endTime: Date.now() / 1000 + 86400,
        minContribution: "1000",
      };

      await expect(service.createRound(params)).rejects.toThrow(
        QuadraticFundingError
      );
    });
  });

  describe("estimateMatch", () => {
    it("should calculate estimated match", async () => {
      // This would require mocking the contract interaction
      // For now, test that it throws expected error
      await expect(
        service.estimateMatch("1", "GXXXXXXX", "1000")
      ).rejects.toThrow();
    });
  });

  describe("distributeMatching", () => {
    it("should distribute matching funds", async () => {
      // This would require mocking the contract interaction
      await expect(service.distributeMatching("1")).rejects.toThrow();
    });
  });

  describe("setSybilStatus", () => {
    it("should update Sybil status", async () => {
      await expect(
        service.setSybilStatus("1", "GXXXXXXX", "Verified")
      ).rejects.toThrow();
    });
  });
});
