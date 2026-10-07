import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryPartnershipDataSource,
  PartnershipError,
  listNGOs,
  listPartnerships,
  registerNGO,
  requestPartnership,
  reviewNGO,
  setPartnershipDataSource,
  updatePartnershipStatus,
} from "./campaign-partnership.service";

describe("campaign-partnership.service", () => {
  beforeEach(() => {
    setPartnershipDataSource(new InMemoryPartnershipDataSource());
  });

  describe("listNGOs", () => {
    it("returns verified NGOs by default", async () => {
      const ngos = await listNGOs();
      expect(ngos.every((ngo) => ngo.isVerified)).toBe(true);
      expect(ngos.map((ngo) => ngo.id).sort()).toEqual(["ngo-1", "ngo-2"]);
    });

    it("filters by service, country and free-text query", async () => {
      const labor = await listNGOs({ service: "PLANTING_LABOR" });
      expect(labor.map((ngo) => ngo.id)).toEqual(["ngo-1"]);

      const ghana = await listNGOs({ country: "ghana" });
      expect(ghana.map((ngo) => ngo.id)).toEqual(["ngo-2"]);

      const search = await listNGOs({ q: "Kenya" });
      expect(search.map((ngo) => ngo.id)).toEqual(["ngo-1"]);
    });

    it("includes every status when ALL is passed", async () => {
      const all = await listNGOs({ status: "ALL" });
      expect(all).toHaveLength(3);
      expect(all.some((ngo) => ngo.verificationStatus === "PENDING")).toBe(true);
    });

    it("filters by explicit verification status", async () => {
      const pending = await listNGOs({ status: "PENDING" });
      expect(pending.map((ngo) => ngo.id)).toEqual(["ngo-3"]);
    });

    it("sorts newest first", async () => {
      const all = await listNGOs({ status: "ALL" });
      for (let i = 1; i < all.length; i += 1) {
        expect(all[i]!.createdAt).toBeLessThanOrEqual(all[i - 1]!.createdAt);
      }
    });
  });

  describe("registerNGO", () => {
    it("creates a pending profile that is not yet partnerable", async () => {
      const ngo = await registerNGO({
        name: "New Forests",
        description: "Reforestation crew",
        services: ["LAND_ACCESS", "PLANTING_LABOR"],
        country: "Rwanda",
      });
      expect(ngo).toMatchObject({
        name: "New Forests",
        verificationStatus: "PENDING",
        isVerified: false,
        services: ["LAND_ACCESS", "PLANTING_LABOR"],
      });
      expect(ngo.id).toMatch(/^ngo-/);
    });

    it("rejects invalid registration input", async () => {
      await expect(
        registerNGO({ name: "", description: "x", services: ["PLANTING_LABOR"] }),
      ).rejects.toMatchObject({ code: "INVALID_SERVICES" });
      await expect(
        registerNGO({ name: "X", description: "x", services: [] }),
      ).rejects.toMatchObject({ code: "INVALID_SERVICES" });
      await expect(
        registerNGO({ name: "X", description: "x", services: ["UNKNOWN" as never] }),
      ).rejects.toMatchObject({ code: "INVALID_SERVICES" });
    });
  });

  describe("reviewNGO", () => {
    it("verifies a pending NGO", async () => {
      const ngo = await reviewNGO("ngo-3", "VERIFIED", "reviewer-1");
      expect(ngo).toMatchObject({
        verificationStatus: "VERIFIED",
        isVerified: true,
        reviewedBy: "reviewer-1",
      });
    });

    it("rejects an NGO and flips isVerified off", async () => {
      const ngo = await reviewNGO("ngo-1", "REJECTED", "reviewer-1");
      expect(ngo.verificationStatus).toBe("REJECTED");
      expect(ngo.isVerified).toBe(false);
    });

    it("allows re-review", async () => {
      await reviewNGO("ngo-3", "VERIFIED", "r1");
      const reverted = await reviewNGO("ngo-3", "REJECTED", "r2");
      expect(reverted.verificationStatus).toBe("REJECTED");
    });

    it("rejects an invalid verdict and unknown NGOs", async () => {
      await expect(reviewNGO("ngo-1", "PENDING" as never, "r")).rejects.toMatchObject({
        code: "INVALID_VERDICT",
      });
      await expect(reviewNGO("ngo-missing", "VERIFIED", "r")).rejects.toMatchObject({
        code: "NGO_NOT_FOUND",
      });
    });
  });

  describe("requestPartnership", () => {
    it("creates a pending request for a verified NGO", async () => {
      const req = await requestPartnership("camp-1", "ngo-1", ["PLANTING_LABOR"], "50 trees/week", "wallet-1");
      expect(req).toMatchObject({
        campaignId: "camp-1",
        ngoId: "ngo-1",
        ngoName: "Global Tree Planters",
        servicesRequested: ["PLANTING_LABOR"],
        status: "PENDING",
        proposedTerms: "50 trees/week",
        initiatedBy: "wallet-1",
      });
      expect(req.id).toMatch(/^req-/);
    });

    it("rejects unverified NGOs", async () => {
      await expect(requestPartnership("camp-1", "ngo-3", ["PLANTING_LABOR"])).rejects.toMatchObject({
        code: "NGO_NOT_VERIFIED",
      });
    });

    it("rejects NGOs that do not offer the requested service", async () => {
      await expect(requestPartnership("camp-1", "ngo-1", ["LAND_ACCESS"])).rejects.toMatchObject({
        code: "SERVICE_NOT_OFFERED",
      });
    });

    it("rejects unknown NGOs", async () => {
      await expect(requestPartnership("camp-1", "ngo-missing", ["PLANTING_LABOR"])).rejects.toMatchObject({
        code: "NGO_NOT_FOUND",
      });
    });

    it("rejects invalid service lists", async () => {
      await expect(requestPartnership("camp-1", "ngo-1", [])).rejects.toMatchObject({
        code: "INVALID_SERVICES",
      });
    });

    it("blocks duplicate active requests between the same campaign and NGO", async () => {
      await requestPartnership("camp-1", "ngo-1", ["PLANTING_LABOR"]);
      await expect(requestPartnership("camp-1", "ngo-1", ["PLANTING_LABOR"])).rejects.toMatchObject({
        code: "DUPLICATE_ACTIVE_PARTNERSHIP",
      });
    });

    it("allows a new request once the active one is canceled", async () => {
      const first = await requestPartnership("camp-1", "ngo-1", ["PLANTING_LABOR"]);
      await updatePartnershipStatus(first.id, "CANCELED");
      const second = await requestPartnership("camp-1", "ngo-1", ["PLANTING_LABOR"]);
      expect(second.status).toBe("PENDING");
    });
  });

  describe("updatePartnershipStatus", () => {
    const createPending = () =>
      requestPartnership("camp-1", "ngo-1", ["PLANTING_LABOR"], undefined, "wallet-1");

    it("walks the lifecycle forward", async () => {
      const pending = await createPending();
      const accepted = await updatePartnershipStatus(pending.id, "ACCEPTED", undefined, "ngo-1");
      expect(accepted.status).toBe("ACCEPTED");
      expect(accepted.updatedBy).toBe("ngo-1");

      const completed = await updatePartnershipStatus(pending.id, "COMPLETED");
      expect(completed.status).toBe("COMPLETED");
    });

    it("rejects invalid transitions", async () => {
      const pending = await createPending();
      await expect(updatePartnershipStatus(pending.id, "COMPLETED")).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
      });
      await updatePartnershipStatus(pending.id, "CANCELED");
      await expect(updatePartnershipStatus(pending.id, "ACCEPTED")).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
      });
    });

    it("rejects unknown requests and invalid status values", async () => {
      await expect(updatePartnershipStatus("req-missing", "ACCEPTED")).rejects.toMatchObject({
        code: "PARTNERSHIP_NOT_FOUND",
      });
      const pending = await createPending();
      await expect(updatePartnershipStatus(pending.id, "FROZEN" as never)).rejects.toMatchObject({
        code: "INVALID_STATUS",
      });
    });
  });

  describe("listPartnerships", () => {
    it("filters by campaign, NGO and status", async () => {
      await requestPartnership("camp-1", "ngo-1", ["PLANTING_LABOR"]);
      await requestPartnership("camp-1", "ngo-2", ["LAND_ACCESS"]);
      await requestPartnership("camp-2", "ngo-1", ["VERIFICATION"]);

      expect(await listPartnerships({ campaignId: "camp-1" })).toHaveLength(2);
      expect(await listPartnerships({ ngoId: "ngo-1" })).toHaveLength(2);
      expect(await listPartnerships({ campaignId: "camp-2", ngoId: "ngo-1" })).toHaveLength(1);
      expect(await listPartnerships({ status: "PENDING" })).toHaveLength(3);
      expect(await listPartnerships({ campaignId: "camp-1", status: "ACCEPTED" })).toHaveLength(0);
    });
  });

  it("exposes typed errors as PartnershipError", async () => {
    try {
      await requestPartnership("camp-1", "ngo-missing", ["PLANTING_LABOR"]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PartnershipError);
      expect((error as PartnershipError).code).toBe("NGO_NOT_FOUND");
    }
  });
});