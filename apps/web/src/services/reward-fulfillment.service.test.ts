import { describe, expect, it, beforeEach } from "vitest";
import {
  generateFulfillmentCSVTemplate,
  parseFulfillmentCSV,
  validateFulfillmentRecord,
  rewardFulfillmentService,
  parseCSVLine,
  escapeCSVField,
  isValidBackerIdentifier,
} from "./reward-fulfillment.service";
import { RewardFulfillmentInput } from "@/types/reward-fulfillment";

describe("reward-fulfillment CSV template & utilities", () => {
  it("generates a structured CSV template with all required headers", () => {
    const template = generateFulfillmentCSVTemplate();
    expect(template).toContain("Backer Address");
    expect(template).toContain("Recipient Name");
    expect(template).toContain("Reward Tier");
    expect(template).toContain("Address Line 1");
    expect(template).toContain("Address Line 2");
    expect(template).toContain("City");
    expect(template).toContain("State/Province");
    expect(template).toContain("Postal Code");
    expect(template).toContain("Country");
    expect(template).toContain("Phone");
    expect(template).toContain("Shipping Status");
    expect(template).toContain("Tracking Number");
    expect(template).toContain("Notes");
  });

  it("escapes fields containing commas or quotes correctly", () => {
    expect(escapeCSVField("Simple")).toBe("Simple");
    expect(escapeCSVField("Hello, World")).toBe('"Hello, World"');
    expect(escapeCSVField('He said "Hi"')).toBe('"He said ""Hi"""');
  });

  it("parses CSV lines respecting quoted commas", () => {
    const line = 'GB44...R771,"Doe, Jane",Tier 1,"123 Main St, Apt 2",,Portland,OR,97201,US';
    const parsed = parseCSVLine(line);
    expect(parsed[0]).toBe("GB44...R771");
    expect(parsed[1]).toBe("Doe, Jane");
    expect(parsed[2]).toBe("Tier 1");
    expect(parsed[3]).toBe("123 Main St, Apt 2");
    expect(parsed[4]).toBe("");
    expect(parsed[5]).toBe("Portland");
    expect(parsed[6]).toBe("OR");
    expect(parsed[7]).toBe("97201");
    expect(parsed[8]).toBe("US");
  });

  it("validates backer identifiers correctly", () => {
    expect(isValidBackerIdentifier("GB44R771SAMPLEADDRESS992817264819273648192837481928")).toBe(true);
    expect(isValidBackerIdentifier("GB44...R771")).toBe(true);
    expect(isValidBackerIdentifier("CB44...R771")).toBe(true);
    expect(isValidBackerIdentifier("backer_12345")).toBe(true);
    expect(isValidBackerIdentifier("")).toBe(false);
    expect(isValidBackerIdentifier("abc")).toBe(false);
  });
});

describe("reward-fulfillment CSV validation", () => {
  it("flags empty CSV file", () => {
    const res = parseFulfillmentCSV("");
    expect(res.isValid).toBe(false);
    expect(res.errorCount).toBeGreaterThan(0);
    expect(res.errors[0]?.message).toMatch(/empty/i);
  });

  it("flags missing required headers", () => {
    const invalidCSV = "RandomHeader1,RandomHeader2\nvalue1,value2";
    const res = parseFulfillmentCSV(invalidCSV);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes("Backer Address"))).toBe(true);
    expect(res.errors.some((e) => e.message.includes("Recipient Name"))).toBe(true);
  });

  it("parses valid CSV rows successfully", () => {
    const csv = [
      "Backer Address,Recipient Name,Reward Tier,Address Line 1,Address Line 2,City,State,Postal Code,Country,Phone,Shipping Status",
      "GB44...R771,Jane Doe,Planting Kit,123 Pine St,Apt 1,Portland,OR,97201,United States,+1-555-0100,pending",
      "GD99...Z100,Alex Smith,Apparel,456 Oak Rd,,Seattle,WA,98101,United States,,processing",
    ].join("\n");

    const res = parseFulfillmentCSV(csv);
    expect(res.isValid).toBe(true);
    expect(res.totalRows).toBe(2);
    expect(res.validCount).toBe(2);
    expect(res.errorCount).toBe(0);
    expect(res.rows[0]?.record?.recipientName).toBe("Jane Doe");
    expect(res.rows[1]?.record?.recipientName).toBe("Alex Smith");
  });

  it("flags row-level errors for missing required fields before saving", () => {
    const csvWithErrors = [
      "Backer Address,Recipient Name,Address Line 1,City,Postal Code,Country",
      "GB44...R771,Jane Doe,123 Pine St,Portland,97201,United States",
      "GD99...Z100,,456 Oak Rd,Seattle,98101,United States",
      "123,Bob Vance,789 Maple Dr,Austin,78701,United States",
      "GA7B...M221,Charlie Day,100 Ocean Ave,Miami,,United States",
      "GC11...P443,Dennis Reynolds,200 High St,,19104,United States",
      "GB88...K992,Dee Reynolds,,Philadelphia,19104,United States",
    ].join("\n");

    const res = parseFulfillmentCSV(csvWithErrors);
    expect(res.isValid).toBe(false);
    expect(res.totalRows).toBe(6);
    expect(res.validCount).toBe(1);
    expect(res.errorCount).toBe(5);

    const row3Error = res.errors.find((e) => e.row === 3 && e.field === "recipientName");
    expect(row3Error).toBeDefined();

    const row4Error = res.errors.find((e) => e.row === 4 && e.field === "backerAddress");
    expect(row4Error).toBeDefined();

    const row5Error = res.errors.find((e) => e.row === 5 && e.field === "postalCode");
    expect(row5Error).toBeDefined();

    const row6Error = res.errors.find((e) => e.row === 6 && e.field === "city");
    expect(row6Error).toBeDefined();

    const row7Error = res.errors.find((e) => e.row === 7 && e.field === "addressLine1");
    expect(row7Error).toBeDefined();
  });

  it("detects and warns on duplicate backer addresses in CSV", () => {
    const csvWithDuplicates = [
      "Backer Address,Recipient Name,Address Line 1,City,Postal Code,Country",
      "GB44...R771,Jane Doe,123 Pine St,Portland,97201,United States",
      "GB44...R771,Jane Doe Second Address,456 Elm St,Eugene,97401,United States",
    ].join("\n");

    const res = parseFulfillmentCSV(csvWithDuplicates);
    expect(res.warningCount).toBeGreaterThan(0);
    expect(res.warnings[0]?.message).toMatch(/duplicate/i);
  });
});

describe("reward-fulfillment single record validation", () => {
  it("validates complete record successfully", () => {
    const result = validateFulfillmentRecord({
      backerAddress: "GB44...R771",
      recipientName: "Jane Doe",
      addressLine1: "123 Main St",
      city: "Portland",
      postalCode: "97201",
      country: "US",
    });
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("catches empty required fields in row edits", () => {
    const result = validateFulfillmentRecord({
      backerAddress: "GB44...R771",
      recipientName: "",
      addressLine1: "123 Main St",
      city: "Portland",
      postalCode: "97201",
      country: "US",
    });
    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.field).toBe("recipientName");
  });
});

describe("RewardFulfillmentService CRUD & persistence", () => {
  const campaignId = "test-camp-101";

  beforeEach(() => {
    rewardFulfillmentService.reset();
  });

  it("saves validated fulfillments and assigns IDs", () => {
    const inputs: RewardFulfillmentInput[] = [
      {
        backerAddress: "GB44...R771",
        recipientName: "Jane Doe",
        rewardTier: "Tier 1",
        addressLine1: "123 Pine St",
        city: "Portland",
        state: "OR",
        postalCode: "97201",
        country: "US",
        shippingStatus: "pending",
      },
      {
        backerAddress: "GD99...Z100",
        recipientName: "Alex Smith",
        rewardTier: "Tier 2",
        addressLine1: "456 Oak St",
        city: "Seattle",
        state: "WA",
        postalCode: "98101",
        country: "US",
        shippingStatus: "pending",
      },
    ];

    const saved = rewardFulfillmentService.saveFulfillments(campaignId, inputs);
    expect(saved).toHaveLength(2);
    expect(saved[0]?.id).toBeDefined();
    expect(saved[0]?.campaignId).toBe(campaignId);
    expect(saved[0]?.recipientName).toBe("Jane Doe");

    const retrieved = rewardFulfillmentService.getFulfillments(campaignId);
    expect(retrieved).toHaveLength(2);
  });

  it("refuses to save invalid records", () => {
    const invalidInputs: RewardFulfillmentInput[] = [
      {
        backerAddress: "",
        recipientName: "Jane Doe",
        rewardTier: "Tier 1",
        addressLine1: "123 Pine St",
        city: "Portland",
        postalCode: "97201",
        country: "US",
        shippingStatus: "pending",
      },
    ];

    expect(() => rewardFulfillmentService.saveFulfillments(campaignId, invalidInputs)).toThrow();
  });

  it("allows updating shipping address per backer row", () => {
    const [initial] = rewardFulfillmentService.saveFulfillments(campaignId, [
      {
        backerAddress: "GB44...R771",
        recipientName: "Jane Doe",
        rewardTier: "Tier 1",
        addressLine1: "123 Pine St",
        city: "Portland",
        postalCode: "97201",
        country: "US",
        shippingStatus: "pending",
      },
    ]);

    expect(initial).toBeDefined();
    if (!initial) return;

    const updated = rewardFulfillmentService.updateFulfillment(campaignId, initial.id, {
      recipientName: "Jane M. Doe",
      addressLine1: "999 New Forest Rd",
      addressLine2: "Suite 400",
      city: "Beaverton",
      shippingStatus: "shipped",
      trackingNumber: "TRK-123456789",
    });

    expect(updated.recipientName).toBe("Jane M. Doe");
    expect(updated.addressLine1).toBe("999 New Forest Rd");
    expect(updated.addressLine2).toBe("Suite 400");
    expect(updated.city).toBe("Beaverton");
    expect(updated.shippingStatus).toBe("shipped");
    expect(updated.trackingNumber).toBe("TRK-123456789");

    const retrieved = rewardFulfillmentService.getFulfillments(campaignId);
    expect(retrieved[0]?.recipientName).toBe("Jane M. Doe");
    expect(retrieved[0]?.shippingStatus).toBe("shipped");
  });

  it("deletes a fulfillment record", () => {
    const [saved] = rewardFulfillmentService.saveFulfillments(campaignId, [
      {
        backerAddress: "GB44...R771",
        recipientName: "Jane Doe",
        rewardTier: "Tier 1",
        addressLine1: "123 Pine St",
        city: "Portland",
        postalCode: "97201",
        country: "US",
        shippingStatus: "pending",
      },
    ]);

    if (!saved) return;
    expect(rewardFulfillmentService.getFulfillments(campaignId)).toHaveLength(1);

    const deleted = rewardFulfillmentService.deleteFulfillment(campaignId, saved.id);
    expect(deleted).toBe(true);
    expect(rewardFulfillmentService.getFulfillments(campaignId)).toHaveLength(0);
  });

  it("exports fulfillments to CSV matching template schema", () => {
    rewardFulfillmentService.saveFulfillments(campaignId, [
      {
        backerAddress: "GB44...R771",
        recipientName: "Jane Doe",
        rewardTier: "Tier 1",
        addressLine1: "123 Pine St",
        city: "Portland",
        state: "OR",
        postalCode: "97201",
        country: "US",
        shippingStatus: "pending",
      },
    ]);

    const csvOutput = rewardFulfillmentService.exportFulfillmentsToCSV(campaignId);
    expect(csvOutput).toContain("Backer Address");
    expect(csvOutput).toContain("GB44...R771");
    expect(csvOutput).toContain("Jane Doe");
    expect(csvOutput).toContain("Portland");
  });
});
