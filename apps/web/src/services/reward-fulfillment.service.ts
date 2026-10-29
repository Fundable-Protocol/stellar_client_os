/**
 * Service for Managing Campaign Physical Reward Fulfillment & Shipping Addresses.
 *
 * Implements:
 * - Structured CSV template generation and client-side download
 * - CSV parsing with robust RFC 4180 quote support
 * - Address validation and granular error/warning flagging before saving
 * - In-memory and localStorage persistence for fulfillment records
 * - Per-backer row editing and update validation
 */

import {
  CSVColumnDefinition,
  CSVImportResult,
  CSVValidationError,
  CSVValidationWarning,
  ParsedFulfillmentRow,
  RewardFulfillmentInput,
  RewardFulfillmentRecord,
  ShippingStatus,
  isShippingStatus,
} from "@/types/reward-fulfillment";
import { safeGetItem, safeSetItem } from "@/utils/safe-storage";

export const FULFILLMENT_CSV_COLUMNS: CSVColumnDefinition[] = [
  {
    key: "backerAddress",
    header: "Backer Address",
    aliases: ["backeraddress", "backer address", "backer", "stellar address", "backer_address", "wallet", "address"],
    required: true,
    description: "Stellar account address (G...) or backer account ID",
  },
  {
    key: "recipientName",
    header: "Recipient Name",
    aliases: ["recipientname", "recipient name", "name", "full name", "recipient_name", "backer name", "fullname"],
    required: true,
    description: "Full legal or delivery name of the recipient",
  },
  {
    key: "rewardTier",
    header: "Reward Tier",
    aliases: ["rewardtier", "reward tier", "reward", "tier", "item", "physical reward", "reward_tier", "product"],
    required: false,
    description: "Physical reward tier title (e.g. Eco T-Shirt, Planting Kit)",
  },
  {
    key: "addressLine1",
    header: "Address Line 1",
    aliases: ["addressline1", "address line 1", "address 1", "street address", "street", "street 1", "address_line_1", "line 1"],
    required: true,
    description: "Street number and street name or P.O. Box",
  },
  {
    key: "addressLine2",
    header: "Address Line 2",
    aliases: ["addressline2", "address line 2", "address 2", "apt", "suite", "unit", "building", "address_line_2", "line 2"],
    required: false,
    description: "Apartment, suite, unit, building, floor, etc. (optional)",
  },
  {
    key: "city",
    header: "City",
    aliases: ["city", "town", "municipality", "locality"],
    required: true,
    description: "City or town name",
  },
  {
    key: "state",
    header: "State/Province",
    aliases: ["state", "province", "region", "state/province", "territory", "prefecture", "state_province"],
    required: false,
    description: "State, province, prefecture or administrative region",
  },
  {
    key: "postalCode",
    header: "Postal Code",
    aliases: ["postalcode", "postal code", "zip", "zip code", "zipcode", "postcode", "postal_code"],
    required: true,
    description: "Postal code or ZIP code",
  },
  {
    key: "country",
    header: "Country",
    aliases: ["country", "nation", "country code", "country_code"],
    required: true,
    description: "Country name or ISO country code",
  },
  {
    key: "phone",
    header: "Phone",
    aliases: ["phone", "phone number", "tel", "telephone", "contact phone", "phone_number", "mobile"],
    required: false,
    description: "Recipient phone number for courier delivery contact",
  },
  {
    key: "shippingStatus",
    header: "Shipping Status",
    aliases: ["shippingstatus", "shipping status", "status", "delivery status", "shipping_status"],
    required: false,
    description: "pending | processing | shipped | delivered | cancelled",
  },
  {
    key: "trackingNumber",
    header: "Tracking Number",
    aliases: ["trackingnumber", "tracking number", "tracking", "tracking #", "waybill", "tracking_number"],
    required: false,
    description: "Postal carrier tracking number or URL",
  },
  {
    key: "notes",
    header: "Notes",
    aliases: ["notes", "note", "comment", "instructions", "delivery instructions"],
    required: false,
    description: "Special packaging or delivery instructions",
  },
];

/**
 * Generate standard CSV template content for campaign creators to fill out.
 */
export function generateFulfillmentCSVTemplate(): string {
  const headers = FULFILLMENT_CSV_COLUMNS.map((col) => col.header).join(",");
  const sampleRow1 = [
    "GB44R771XMPL4400SAMPLEADDRESS992817264819273648192837481928",
    "Jane Doe",
    "Tree Planting Kit & Seeds",
    "123 Evergreen Forest Way",
    "Apt 4B",
    "Portland",
    "OR",
    "97201",
    "United States",
    "+1-555-0199",
    "pending",
    "",
    "Leave package at front porch if absent",
  ]
    .map(escapeCSVField)
    .join(",");

  const sampleRow2 = [
    "GD99Z100ECO7700SAMPLEADDRESS883918273645192837465192837465",
    "Alex Chen",
    "Organic Cotton Supporter Hoodie",
    "456 Pacific Pine Ave",
    "",
    "Vancouver",
    "BC",
    "V6B 2T9",
    "Canada",
    "+1-604-555-0144",
    "pending",
    "",
    "Size L",
  ]
    .map(escapeCSVField)
    .join(",");

  return `${headers}\r\n${sampleRow1}\r\n${sampleRow2}\r\n`;
}

/**
 * Trigger client-side download of the CSV template.
 */
export function downloadFulfillmentCSVTemplate(filename = "reward-fulfillment-template.csv"): void {
  if (typeof window === "undefined") return;

  const content = generateFulfillmentCSVTemplate();
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escape a CSV field if it contains commas, double quotes, or line breaks.
 */
export function escapeCSVField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Parse an RFC 4180 CSV line into an array of cell strings.
 */
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Stellar backer address check: must be a non-empty string starting with 'G' or 'C'
 * (allows abbreviated demo addresses like 'GB44...R771' or full 56-char Stellar keys).
 */
export function isValidBackerIdentifier(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length < 6) return false;
  // Standard Stellar address or truncated demo format (e.g. GB44...R771)
  if (/^[GC][A-Za-z0-9.]{5,55}$/.test(trimmed)) return true;
  // Also accept clean alphanumeric identifiers
  return /^[A-Za-z0-9_-]{6,64}$/.test(trimmed);
}

/**
 * Validate an individual fulfillment record against business rules.
 */
export function validateFulfillmentRecord(
  record: Partial<RewardFulfillmentRecord>,
  rowNumber = 1,
): { isValid: boolean; errors: CSVValidationError[] } {
  const errors: CSVValidationError[] = [];

  // Required: backer address
  if (!record.backerAddress?.trim()) {
    errors.push({
      row: rowNumber,
      field: "backerAddress",
      message: "Backer address is required",
    });
  } else if (!isValidBackerIdentifier(record.backerAddress)) {
    errors.push({
      row: rowNumber,
      field: "backerAddress",
      message: "Invalid Stellar backer address format (expected public key starting with G or valid backer ID)",
      value: record.backerAddress,
    });
  }

  // Required: recipient name
  if (!record.recipientName?.trim()) {
    errors.push({
      row: rowNumber,
      field: "recipientName",
      message: "Recipient name is required",
    });
  }

  // Required: addressLine1
  if (!record.addressLine1?.trim()) {
    errors.push({
      row: rowNumber,
      field: "addressLine1",
      message: "Street address (Address Line 1) is required",
    });
  }

  // Required: city
  if (!record.city?.trim()) {
    errors.push({
      row: rowNumber,
      field: "city",
      message: "City is required",
    });
  }

  // Required: postalCode
  if (!record.postalCode?.trim()) {
    errors.push({
      row: rowNumber,
      field: "postalCode",
      message: "Postal code is required",
    });
  } else if (record.postalCode.trim().length < 2) {
    errors.push({
      row: rowNumber,
      field: "postalCode",
      message: "Postal code is too short (must be at least 2 characters)",
      value: record.postalCode,
    });
  }

  // Required: country
  if (!record.country?.trim()) {
    errors.push({
      row: rowNumber,
      field: "country",
      message: "Country is required",
    });
  } else if (record.country.trim().length < 2) {
    errors.push({
      row: rowNumber,
      field: "country",
      message: "Country must be at least 2 characters",
      value: record.country,
    });
  }

  // Optional: shippingStatus
  if (record.shippingStatus && !isShippingStatus(record.shippingStatus.toLowerCase())) {
    errors.push({
      row: rowNumber,
      field: "shippingStatus",
      message: `Invalid shipping status '${record.shippingStatus}'. Allowed: pending, processing, shipped, delivered, cancelled`,
      value: record.shippingStatus,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Parse and validate a full CSV string into structured fulfillment rows.
 */
export function parseFulfillmentCSV(csvText: string): CSVImportResult {
  const errors: CSVValidationError[] = [];
  const warnings: CSVValidationWarning[] = [];
  const parsedRows: ParsedFulfillmentRow[] = [];

  if (!csvText || !csvText.trim()) {
    errors.push({
      row: 0,
      field: "file",
      message: "CSV file is empty. Please upload a file with data.",
    });
    return {
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
      warningCount: 0,
      rows: [],
      errors,
      warnings,
      isValid: false,
    };
  }

  // Normalize newlines (handle CRLF and LF)
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.split("\n").filter((l) => l.trim().length > 0);

  if (rawLines.length === 0) {
    errors.push({
      row: 0,
      field: "file",
      message: "CSV file contains no data rows.",
    });
    return {
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
      warningCount: 0,
      rows: [],
      errors,
      warnings,
      isValid: false,
    };
  }

  // Parse header line
  const headerCells = parseCSVLine(rawLines[0]);
  const columnMap: Record<number, keyof RewardFulfillmentInput> = {};
  const recognizedKeys = new Set<string>();

  headerCells.forEach((headerText, index) => {
    const cleanHeader = headerText.toLowerCase().replace(/[^a-z0-9]/g, "");
    const matchedCol = FULFILLMENT_CSV_COLUMNS.find((col) => {
      const colHeaderClean = col.header.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanHeader === colHeaderClean) return true;
      return col.aliases.some((alias) => alias.replace(/[^a-z0-9]/g, "") === cleanHeader);
    });

    if (matchedCol) {
      columnMap[index] = matchedCol.key;
      recognizedKeys.add(matchedCol.key);
    }
  });

  // Verify that essential required columns are detected
  const requiredCols = FULFILLMENT_CSV_COLUMNS.filter((c) => c.required);
  for (const req of requiredCols) {
    if (!recognizedKeys.has(req.key)) {
      errors.push({
        row: 1,
        field: req.key,
        message: `Missing required column '${req.header}'. Please check your header row.`,
      });
    }
  }

  // If header lacks required columns, fail early
  if (errors.length > 0) {
    return {
      totalRows: 0,
      validCount: 0,
      errorCount: errors.length,
      warningCount: 0,
      rows: [],
      errors,
      warnings,
      isValid: false,
    };
  }

  // Track duplicate backer addresses in the CSV
  const backerAddressMap = new Map<string, number[]>();

  // Process data lines
  for (let i = 1; i < rawLines.length; i++) {
    const rowNum = i + 1; // 1-based row in sheet
    const line = rawLines[i];
    const cells = parseCSVLine(line);

    const rawData: Record<string, string> = {};
    const recordPartial: Partial<RewardFulfillmentInput> = {
      rewardTier: "Standard Physical Reward",
      shippingStatus: "pending",
    };

    headerCells.forEach((header, idx) => {
      const val = cells[idx] ?? "";
      rawData[header] = val;
      const mappedKey = columnMap[idx];
      if (mappedKey) {
        if (mappedKey === "shippingStatus") {
          const lowerStatus = val.toLowerCase().trim();
          recordPartial.shippingStatus = isShippingStatus(lowerStatus)
            ? (lowerStatus as ShippingStatus)
            : ("pending" as ShippingStatus);
        } else {
          (recordPartial as Record<string, unknown>)[mappedKey] = val.trim();
        }
      }
    });

    // Validate the parsed row
    const rowValidation = validateFulfillmentRecord(recordPartial, rowNum);
    const rowErrors = [...rowValidation.errors];
    const rowWarnings: CSVValidationWarning[] = [];

    // Track duplicate backer addresses
    const backerKey = recordPartial.backerAddress?.trim().toLowerCase();
    if (backerKey) {
      const existing = backerAddressMap.get(backerKey) ?? [];
      existing.push(rowNum);
      backerAddressMap.set(backerKey, existing);
    }

    const isValid = rowErrors.length === 0;

    parsedRows.push({
      rowNumber: rowNum,
      rawData,
      record: isValid ? (recordPartial as RewardFulfillmentInput) : undefined,
      errors: rowErrors,
      warnings: rowWarnings,
      isValid,
    });

    errors.push(...rowErrors);
  }

  // Check for duplicate addresses and generate warnings
  backerAddressMap.forEach((rows, address) => {
    if (rows.length > 1) {
      const warnMsg = `Duplicate backer address '${address}' found on rows ${rows.join(", ")}`;
      warnings.push({
        row: rows[0],
        field: "backerAddress",
        message: warnMsg,
        value: address,
      });

      // Attach duplicate warning to affected parsed rows
      for (const rowNum of rows) {
        const found = parsedRows.find((r) => r.rowNumber === rowNum);
        if (found) {
          found.warnings.push({
            row: rowNum,
            field: "backerAddress",
            message: `Backer address '${address}' is also listed on rows ${rows.filter((r) => r !== rowNum).join(", ")}`,
            value: address,
          });
        }
      }
    }
  });

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const errorCount = errors.length;

  return {
    totalRows: parsedRows.length,
    validCount,
    errorCount,
    warningCount: warnings.length,
    rows: parsedRows,
    errors,
    warnings,
    isValid: errorCount === 0 && parsedRows.length > 0,
  };
}

/**
 * Storage key helper for persistence in localStorage.
 */
function getStorageKey(campaignId: string): string {
  return `fundable:fulfillment:${campaignId.trim().toLowerCase()}`;
}

/**
 * Demo seed records for demo campaign (e.g. camp-101) so creators can test immediately.
 */
export const DEMO_FULFILLMENTS: RewardFulfillmentInput[] = [
  {
    backerAddress: "GB44...R771",
    recipientName: "Satoshi Forestry Fund (Care of A. Vance)",
    rewardTier: "Executive Oak Sapling & Commemorative Plaque",
    addressLine1: "742 Evergreen Terrace",
    addressLine2: "Suite 100",
    city: "Springfield",
    state: "OR",
    postalCode: "97477",
    country: "United States",
    phone: "+1-541-555-0199",
    shippingStatus: "shipped",
    trackingNumber: "USPS-940011189922334455",
    notes: "Requires direct signature",
  },
  {
    backerAddress: "GD99...Z100",
    recipientName: "GreenFuture Capital Ops",
    rewardTier: "Restoration Seed Pack & Recycled Canvas Tote",
    addressLine1: "100 Innovation Way",
    addressLine2: "",
    city: "Seattle",
    state: "WA",
    postalCode: "98101",
    country: "United States",
    phone: "+1-206-555-0123",
    shippingStatus: "processing",
    trackingNumber: "",
    notes: "Deliver to mailroom during business hours",
  },
  {
    backerAddress: "GA7B...M221",
    recipientName: "EcoDAO Foundation",
    rewardTier: "Certified Reclaimed Wood Desk Model",
    addressLine1: "12 Marina Boulevard",
    addressLine2: "#18-01",
    city: "Singapore",
    state: "Central",
    postalCode: "018982",
    country: "Singapore",
    phone: "+65-6789-0123",
    shippingStatus: "pending",
    trackingNumber: "",
    notes: "International express shipping requested",
  },
  {
    backerAddress: "GC11...P443",
    recipientName: "Terra Restora Lab",
    rewardTier: "Amazon Biochar Sample Jar + Tree Tag",
    addressLine1: "42 Bio Way",
    addressLine2: "Building C",
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "United States",
    phone: "+1-512-555-0188",
    shippingStatus: "delivered",
    trackingNumber: "FEDEX-781928374619",
    notes: "Delivered to reception",
  },
];

/**
 * Singleton service for managing reward fulfillments for campaigns.
 */
class RewardFulfillmentService {
  private fulfillments = new Map<string, RewardFulfillmentRecord[]>();

  /**
   * Retrieve all fulfillment records for a given campaign.
   */
  getFulfillments(campaignId: string): RewardFulfillmentRecord[] {
    const id = campaignId?.trim();
    if (!id) return [];

    // Check in-memory store first
    if (!this.fulfillments.has(id)) {
      // Try to load from safeStorage
      const stored = safeGetItem(getStorageKey(id));
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as RewardFulfillmentRecord[];
          if (Array.isArray(parsed)) {
            this.fulfillments.set(id, parsed);
          }
        } catch (e) {
          console.warn("[RewardFulfillmentService] Failed to parse stored fulfillments:", e);
        }
      }
    }

    return [...(this.fulfillments.get(id) ?? [])];
  }

  /**
   * Save newly imported or added fulfillment records.
   * If a backer address already exists, it updates the shipping details;
   * otherwise, it adds a new record.
   */
  saveFulfillments(campaignId: string, inputs: RewardFulfillmentInput[]): RewardFulfillmentRecord[] {
    const id = campaignId?.trim();
    if (!id) throw new Error("campaignId is required");

    const existing = this.getFulfillments(id);
    const now = Date.now();
    const updatedList = [...existing];

    for (const input of inputs) {
      // Validate before saving
      const validation = validateFulfillmentRecord(input);
      if (!validation.isValid) {
        throw new Error(
          `Cannot save invalid fulfillment record for backer '${input.backerAddress}': ${validation.errors.map((e) => e.message).join(", ")}`,
        );
      }

      const existingIndex = updatedList.findIndex(
        (r) => r.backerAddress.toLowerCase() === input.backerAddress.toLowerCase(),
      );

      if (existingIndex >= 0) {
        // Update existing record
        const old = updatedList[existingIndex];
        updatedList[existingIndex] = {
          ...old,
          ...input,
          updatedAt: now,
        };
      } else {
        // Insert new record
        const newRecord: RewardFulfillmentRecord = {
          ...input,
          id: `ful-${id}-${now}-${Math.random().toString(36).substring(2, 8)}`,
          campaignId: id,
          importedAt: now,
          updatedAt: now,
        };
        updatedList.push(newRecord);
      }
    }

    this.fulfillments.set(id, updatedList);
    safeSetItem(getStorageKey(id), JSON.stringify(updatedList));

    return [...updatedList];
  }

  /**
   * Update a single backer's fulfillment record (editable per backer row).
   */
  updateFulfillment(
    campaignId: string,
    id: string,
    update: Partial<RewardFulfillmentRecord>,
  ): RewardFulfillmentRecord {
    const campId = campaignId?.trim();
    if (!campId) throw new Error("campaignId is required");

    const list = this.getFulfillments(campId);
    const index = list.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Fulfillment record with id '${id}' not found`);
    }

    const current = list[index];
    const candidate: RewardFulfillmentRecord = {
      ...current,
      ...update,
      updatedAt: Date.now(),
    };

    // Validate update
    const validation = validateFulfillmentRecord(candidate);
    if (!validation.isValid) {
      throw new Error(`Invalid record update: ${validation.errors.map((e) => e.message).join(", ")}`);
    }

    list[index] = candidate;
    this.fulfillments.set(campId, list);
    safeSetItem(getStorageKey(campId), JSON.stringify(list));

    return candidate;
  }

  /**
   * Delete a single fulfillment record.
   */
  deleteFulfillment(campaignId: string, id: string): boolean {
    const campId = campaignId?.trim();
    if (!campId) return false;

    const list = this.getFulfillments(campId);
    const filtered = list.filter((r) => r.id !== id);
    if (filtered.length === list.length) return false;

    this.fulfillments.set(campId, filtered);
    safeSetItem(getStorageKey(campId), JSON.stringify(filtered));
    return true;
  }

  /**
   * Export all fulfillment records for a campaign back into structured CSV format.
   */
  exportFulfillmentsToCSV(campaignId: string): string {
    const records = this.getFulfillments(campaignId);
    const headers = FULFILLMENT_CSV_COLUMNS.map((col) => col.header).join(",");

    const rows = records.map((rec) => {
      return [
        rec.backerAddress,
        rec.recipientName,
        rec.rewardTier,
        rec.addressLine1,
        rec.addressLine2 || "",
        rec.city,
        rec.state || "",
        rec.postalCode,
        rec.country,
        rec.phone || "",
        rec.shippingStatus,
        rec.trackingNumber || "",
        rec.notes || "",
      ]
        .map(escapeCSVField)
        .join(",");
    });

    return [headers, ...rows].join("\r\n");
  }

  /**
   * Seed demo records for a campaign if none currently exist.
   */
  seedDemoFulfillments(campaignId: string): void {
    const id = campaignId?.trim();
    if (!id) return;
    if (this.getFulfillments(id).length === 0) {
      this.saveFulfillments(id, DEMO_FULFILLMENTS);
    }
  }

  /**
   * Test helper: clear in-memory and local storage state.
   */
  reset(): void {
    this.fulfillments.clear();
  }
}

export const rewardFulfillmentService = new RewardFulfillmentService();
