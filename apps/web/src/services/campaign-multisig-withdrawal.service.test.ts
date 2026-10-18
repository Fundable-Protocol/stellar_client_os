import { beforeEach, describe, expect, it } from "vitest";
import { getCampaignDataSource } from "./campaign.service";
import {
  CampaignMultisigWithdrawalService,
  MultisigError,
} from "./campaign-multisig-withdrawal.service";

const campaign = (id: string, goalAmount: string) => ({
  id,
  creator: "GCREATOR",
  name: id,
  goalAmount,
  raisedAmount: "0",
  sponsorCount: 0,
  treeCount: 0,
  status: "ACTIVE" as const,
  createdAt: 1,
  updatedAt: 1,
  statusChangedAt: 1,
  sponsors: [],
  statusHistory: [],
});

describe("CampaignMultisigWithdrawalService", () => {
  let svc: CampaignMultisigWithdrawalService;

  beforeEach(async () => {
    svc = new CampaignMultisigWithdrawalService();
    svc.setThreshold("1000");
    svc.setTrustees(["GTRUSTEE"]);
    const ds = getCampaignDataSource();
    await ds.saveCampaign(campaign("ms-big", "5000"));
    await ds.saveCampaign(campaign("ms-small", "10"));
  });

  it("flags only campaigns at or above the threshold", async () => {
    expect((await svc.checkQualification("ms-big")).requiresMultisig).toBe(true);
    expect((await svc.checkQualification("ms-small")).requiresMultisig).toBe(false);
    await expect(svc.setupMultisig({ campaignId: "ms-small", callerAddress: "GCREATOR", trustee: "GTRUSTEE" })).rejects.toMatchObject({ code: "NOT_QUALIFYING" });
  });

  it("rejects invalid thresholds", () => {
    expect(() => svc.setThreshold("-5")).toThrow(MultisigError);
    expect(() => svc.setThreshold("0")).toThrow(MultisigError);
  });

  it("requires setup, creator and trustee signatures before release", async () => {
    const w = { campaignId: "ms-big", callerAddress: "GCREATOR", amount: "100", destination: "GDEST" };
    await expect(svc.requestWithdrawal(w)).rejects.toMatchObject({ code: "SETUP_REQUIRED" });

    await expect(svc.setupMultisig({ campaignId: "ms-big", callerAddress: "GOTHER", trustee: "GTRUSTEE" })).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
    await svc.setupMultisig({ campaignId: "ms-big", callerAddress: "GCREATOR", trustee: "GTRUSTEE" });

    const req = await svc.requestWithdrawal(w);
    expect(req.status).toBe("PENDING");
    expect(() => svc.release(req.id, "GCREATOR")).toThrow(MultisigError);
    expect(svc.listForTrustee("GTRUSTEE")).toHaveLength(1);

    expect(() => svc.coSign(req.id, "GCREATOR")).toThrow(MultisigError);
    expect(svc.coSign(req.id, "GTRUSTEE").status).toBe("APPROVED");
    expect(() => svc.release(req.id, "GOTHER")).toThrow(MultisigError);
    expect(svc.release(req.id, "GCREATOR").status).toBe("RELEASED");
  });

  it("lets the trustee reject a request", async () => {
    await svc.setupMultisig({ campaignId: "ms-big", callerAddress: "GCREATOR", trustee: "GTRUSTEE" });
    const req = await svc.requestWithdrawal({ campaignId: "ms-big", callerAddress: "GCREATOR", amount: "1", destination: "GD" });
    expect(svc.reject(req.id, "GTRUSTEE").status).toBe("REJECTED");
    expect(() => svc.release(req.id, "GCREATOR")).toThrow(MultisigError);
  });
});
