import { describe, it, expect } from "vitest";
import { performSybilCheck } from "./quadratic-funding-sybil";

describe("Anti-Sybil Protection", () => {
  describe("performSybilCheck", () => {
    it("should return Verified status for legitimate contributors", async () => {
      const result = await performSybilCheck(
        "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "1000000"
      );

      expect(result.status).toBe("Verified");
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it("should include check reasons", async () => {
      const result = await performSybilCheck(
        "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "1000000"
      );

      expect(result.reasons).toBeDefined();
      expect(Array.isArray(result.reasons)).toBe(true);
    });

    it("should calculate score between 0 and 100", async () => {
      const result = await performSybilCheck(
        "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "1000000"
      );

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});
