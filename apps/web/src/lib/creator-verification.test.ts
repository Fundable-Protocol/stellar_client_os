import { describe, expect, it } from "vitest";
import {
  CREATOR_VERIFICATION_STEPS,
  describeVerification,
  getVerificationSummaryFor,
  maskEmail,
  maskPhone,
  summarizeCreatorVerification,
  verificationRank,
} from "./creator-verification";

describe("creator verification summary", () => {
  it("defines the three optional steps in order: email, phone, government ID", () => {
    expect(CREATOR_VERIFICATION_STEPS).toEqual(["email", "phone", "government_id"]);
  });

  it("treats creators without data as unverified (verification is optional)", () => {
    const summary = summarizeCreatorVerification();
    expect(summary).toMatchObject({ status: "unverified", isVerified: false, verifiedCount: 0, totalCount: 3, badges: [] });
    expect(getVerificationSummaryFor(undefined).status).toBe("unverified");
    expect(getVerificationSummaryFor({}).status).toBe("unverified");
  });

  it("reports partial verification with the completed steps as badges", () => {
    const summary = summarizeCreatorVerification({ emailVerified: true, governmentIdVerified: true });
    expect(summary.status).toBe("partial");
    expect(summary.isVerified).toBe(false);
    expect(summary.badges).toEqual(["email", "government_id"]);
    expect(describeVerification(summary)).toBe("2 of 3 identity checks");
  });

  it("earns the Verified Creator badge only when email, phone and government ID are all verified", () => {
    const summary = summarizeCreatorVerification({ emailVerified: true, phoneVerified: true, governmentIdVerified: true, verifiedAt: 42 });
    expect(summary).toMatchObject({ status: "verified", isVerified: true, verifiedCount: 3, verifiedAt: 42 });
    expect(summary.badges).toEqual(["email", "phone", "government_id"]);
    expect(describeVerification(summary)).toBe("Verified Creator");
  });

  it("no longer counts legacy postal address verification", () => {
    const summary = summarizeCreatorVerification({ emailVerified: true, phoneVerified: true, addressVerified: true });
    expect(summary.status).toBe("partial");
    expect(summary.addressVerified).toBe(true);
    expect(summary.isVerified).toBe(false);
  });

  it("prefers creatorVerification over the legacy verification field", () => {
    const summary = getVerificationSummaryFor({
      creatorVerification: { emailVerified: true, phoneVerified: true, governmentIdVerified: true },
      verification: { emailVerified: false },
    });
    expect(summary.isVerified).toBe(true);
  });

  it("ranks verified above partial above unverified", () => {
    expect(verificationRank({ status: "verified" })).toBeGreaterThan(verificationRank({ status: "partial" }));
    expect(verificationRank({ status: "partial" })).toBeGreaterThan(verificationRank({ status: "unverified" }));
  });

  it("masks contact details", () => {
    expect(maskEmail("jane.doe@example.org")).toBe("j•••e@example.org");
    expect(maskEmail("jo@example.org")).toBe("j•••@example.org");
    expect(maskPhone("+2348012345678")).toBe("+•••5678");
  });
});
