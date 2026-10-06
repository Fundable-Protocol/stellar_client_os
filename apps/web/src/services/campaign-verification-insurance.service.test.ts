import { describe, expect, it } from "vitest";
import {
  CampaignVerificationInsuranceService,
  QUOTE_TTL_MS,
  RateTableUnderwriterClient,
  VerificationInsuranceError,
  type QuoteRequest,
  type UnderwriterClient,
} from "./campaign-verification-insurance.service";

const SPONSOR = "GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW";
const DAY = 24 * 60 * 60 * 1000;

function clock(start = Date.parse("2026-01-01T00:00:00Z")) {
  let current = start;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    campaignId: "camp-1",
    co2TargetTonnes: 100,
    coverageAmount: "10000",
    asset: "USDC",
    verificationStandard: "verra_vcs",
    verificationWindowDays: 365,
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof VerificationInsuranceError && e.code === code,
  );
}

describe("CampaignVerificationInsuranceService", () => {
  it("quotes every eligible underwriter, cheapest first", async () => {
    const service = new CampaignVerificationInsuranceService();
    const quotes = await service.requestQuotes(request());

    expect(quotes.map((q) => q.underwriterId)).toEqual(["terra-assure", "canopy-re"]);
    expect(quotes[0]).toMatchObject({ premiumRateBps: 400, premium: "400" });
    expect(quotes[1]).toMatchObject({ premiumRateBps: 550, premium: "550" });
  });

  it("loads the premium for weaker standards and longer windows", async () => {
    const service = new CampaignVerificationInsuranceService();
    const [quote] = await service.requestQuotes(
      request({ verificationStandard: "fundable_mrv", verificationWindowDays: 730 }),
    );
    // Only canopy-re accepts fundable_mrv: 550 base + 150 standard + 50 extra year.
    expect(quote).toMatchObject({ underwriterId: "canopy-re", premiumRateBps: 750, premium: "750" });
  });

  it("skips underwriters whose coverage limit is exceeded", async () => {
    const service = new CampaignVerificationInsuranceService();
    const quotes = await service.requestQuotes(request({ coverageAmount: "500000" }));
    expect(quotes.map((q) => q.underwriterId)).toEqual(["terra-assure"]);
  });

  it("rejects when no underwriter will take the risk", async () => {
    const service = new CampaignVerificationInsuranceService();
    await expectCode(
      service.requestQuotes(request({ coverageAmount: "5000000" })),
      "NO_UNDERWRITER",
    );
  });

  it("validates quote input", async () => {
    const service = new CampaignVerificationInsuranceService();
    await expectCode(service.requestQuotes(request({ co2TargetTonnes: 0 })), "INVALID_INPUT");
    await expectCode(service.requestQuotes(request({ coverageAmount: "0" })), "INVALID_INPUT");
    await expectCode(service.requestQuotes(request({ coverageAmount: "1.123456789" })), "INVALID_INPUT");
    await expectCode(service.requestQuotes(request({ verificationWindowDays: 7 })), "INVALID_INPUT");
  });

  it("binds a quote once and registers it with the underwriter", async () => {
    const service = new CampaignVerificationInsuranceService();
    const [quote] = await service.requestQuotes(request());
    const policy = await service.bindPolicy("camp-1", quote.id, SPONSOR);

    expect(policy).toMatchObject({
      status: "active",
      underwriterId: "terra-assure",
      coverageAmount: "10000",
      premium: "400",
      sponsorAddress: SPONSOR,
    });
    expect(policy.externalPolicyRef).toMatch(/^terra-assure-pol-/);
    expect(service.listPolicies("camp-1")).toHaveLength(1);
    await expectCode(service.bindPolicy("camp-1", quote.id, SPONSOR), "QUOTE_ALREADY_BOUND");
  });

  it("refuses to bind a quote for another campaign or after expiry", async () => {
    const time = clock();
    const service = new CampaignVerificationInsuranceService(undefined, time.now);
    const [quote] = await service.requestQuotes(request());

    await expectCode(service.bindPolicy("camp-2", quote.id, SPONSOR), "QUOTE_NOT_FOUND");
    time.advance(QUOTE_TTL_MS + 1);
    await expectCode(service.bindPolicy("camp-1", quote.id, SPONSOR), "QUOTE_EXPIRED");
  });

  it("releases the quote when the underwriter rejects the bind", async () => {
    const base = new RateTableUnderwriterClient({
      id: "flaky",
      name: "Flaky Re",
      baseRateBps: 300,
      supportedStandards: ["verra_vcs"],
      maxCoverage: "100000",
      active: true,
    });
    let fail = true;
    const flaky: UnderwriterClient = {
      underwriter: base.underwriter,
      quote: (r) => base.quote(r),
      bind: async (p) => {
        if (fail) throw new Error("underwriter offline");
        return base.bind(p);
      },
      fileClaim: (p) => base.fileClaim(p),
    };
    const service = new CampaignVerificationInsuranceService([flaky]);
    const [quote] = await service.requestQuotes(request());

    await expect(service.bindPolicy("camp-1", quote.id, SPONSOR)).rejects.toThrow("underwriter offline");
    fail = false;
    await expect(service.bindPolicy("camp-1", quote.id, SPONSOR)).resolves.toMatchObject({ status: "active" });
  });

  it("settles as fulfilled as soon as the target is verified", async () => {
    const service = new CampaignVerificationInsuranceService();
    const [quote] = await service.requestQuotes(request());
    const policy = await service.bindPolicy("camp-1", quote.id, SPONSOR);

    const settled = await service.settlePolicy("camp-1", policy.id, 104.5);
    expect(settled.status).toBe("fulfilled");
    expect(settled.settlement).toMatchObject({ payout: "0", shortfallTonnes: 0, claimRef: null });
    await expectCode(service.settlePolicy("camp-1", policy.id, 200), "POLICY_NOT_ACTIVE");
  });

  it("holds shortfall claims until the verification deadline, then pays pro rata", async () => {
    const time = clock();
    const service = new CampaignVerificationInsuranceService(undefined, time.now);
    const [quote] = await service.requestQuotes(request({ verificationWindowDays: 90 }));
    const policy = await service.bindPolicy("camp-1", quote.id, SPONSOR);

    await expectCode(service.settlePolicy("camp-1", policy.id, 60), "VERIFICATION_WINDOW_OPEN");

    time.advance(90 * DAY);
    const settled = await service.settlePolicy("camp-1", policy.id, 62.25);
    expect(settled.status).toBe("claim_paid");
    // 37.75 of 100 tonnes short -> 37.75% of 10,000 coverage.
    expect(settled.settlement).toMatchObject({ shortfallTonnes: 37.75, payout: "3775" });
    expect(settled.settlement?.claimRef).toMatch(/^terra-assure-clm-/);
  });

  it("pays full coverage when nothing is verified", async () => {
    const time = clock();
    const service = new CampaignVerificationInsuranceService(undefined, time.now);
    const [quote] = await service.requestQuotes(request({ coverageAmount: "1234.5678901" }));
    const policy = await service.bindPolicy("camp-1", quote.id, SPONSOR);
    time.advance(366 * DAY);

    const settled = await service.settlePolicy("camp-1", policy.id, 0);
    expect(settled.settlement?.payout).toBe("1234.5678901");
  });
});
