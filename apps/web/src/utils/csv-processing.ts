import { Recipient, DistributionType, CSVError, CSVWarning, CSVValidationResult } from '@/types/distribution';
import { isValidStellarAddress, validateStellarAddress } from './stellar-validation';
import { validateAmount } from './amount-validation';

/**
 * Result of CSV processing, alias for CSVValidationResult
 */
export type CSVProcessingResult = CSVValidationResult;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_RECIPIENTS = 1000;

/**
 * Process CSV file with streaming for large files
 */
export async function processCSVFile(
  file: File,
  distributionType: DistributionType
): Promise<CSVProcessingResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const text = await file.text();
  return processCSVText(text, distributionType);
}

/**
 * Process CSV text content
 */
export function processCSVText(
  text: string,
  distributionType: DistributionType
): CSVProcessingResult {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  const recipients: Recipient[] = [];
  const errors: CSVError[] = [];
  const warnings: CSVWarning[] = [];

  if (lines.length === 0) {
    errors.push({
      line: 0,
      message: 'CSV file is empty',
    });
    return { recipients, errors, warnings, isValid: false };
  }

  // Check for header row
  const hasHeader = detectHeader(lines[0], distributionType);
  const startLine = hasHeader ? 1 : 0;

  if (lines.length - startLine > MAX_RECIPIENTS) {
    warnings.push({
      line: 0,
      message: `File contains ${lines.length - startLine} recipients. Only the first ${MAX_RECIPIENTS} will be processed.`
    });
  }

  // Process each line
  for (let i = startLine; i < Math.min(lines.length, startLine + MAX_RECIPIENTS); i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    try {
      const recipient = parseLine(line, distributionType, lineNumber);
      if (recipient) {
        recipients.push(recipient);
      }
    } catch (error) {
      errors.push({
        line: lineNumber,
        message: error instanceof Error ? error.message : 'Unknown error',
        value: line,
      });
    }
  }

  // Check for duplicate addresses
  const addressMap = new Map<string, number[]>();
  recipients.forEach((recipient, index) => {
    const existing = addressMap.get(recipient.address);
    if (existing) {
      existing.push(index);
    } else {
      addressMap.set(recipient.address, [index]);
    }
  });

  // Report duplicates
  addressMap.forEach((indices, address) => {
    if (indices.length > 1) {
      errors.push({
        line: 0,
        message: `Duplicate address found: ${address} (lines: ${indices.map(i => i + startLine + 1).join(', ')})`,
        value: address,
      });
    }
  });

  return {
    recipients,
    errors,
    warnings,
    isValid: errors.length === 0
  };
}

/**
 * Detect if the first line is a header
 */
function detectHeader(firstLine: string, distributionType: DistributionType): boolean {
  const columns = firstLine.split(',').map(col => col.trim().toLowerCase());

  if (distributionType === 'equal') {
    return columns.includes('address') || columns.includes('recipient');
  } else {
    return (columns.includes('address') || columns.includes('recipient')) &&
      (columns.includes('amount') || columns.includes('value'));
  }
}

/**
 * Parse a single CSV line
 */
function parseLine(
  line: string,
  distributionType: DistributionType,
  lineNumber: number
): Recipient | null {
  const columns = line.split(',').map(col => col.trim());

  if (columns.length === 0 || (columns.length === 1 && !columns[0])) {
    return null; // Skip empty lines
  }

  const address = columns[0];
  if (!address) {
    throw new Error('Address is required');
  }

  // Validate address
  const addressError = validateStellarAddress(address);
  if (addressError) {
    throw new Error(`Invalid address: ${addressError}`);
  }

  let amount: string | undefined;

  if (distributionType === 'weighted') {
    if (columns.length < 2) {
      throw new Error('Amount is required for weighted distribution');
    }

    amount = columns[1];
    if (!amount) {
      throw new Error('Amount cannot be empty');
    }

    // Validate amount
    const amountError = validateAmount(amount);
    if (amountError) {
      throw new Error(`Invalid amount: ${amountError}`);
    }
  }

  return {
    id: `csv-${lineNumber}-${Date.now()}`,
    address,
    amount,
    isValid: isValidStellarAddress(address),
  };
}

/**
 * Generate CSV template for download
 */
export function generateCSVTemplate(distributionType: DistributionType): string {
  if (distributionType === 'equal') {
    return 'address\nGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\nGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';
  } else {
    return 'address,amount\nGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX,100.0000000\nGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY,250.0000000';
  }
}

/**
 * Validate CSV file before processing
 */
export function validateCSVFile(file: File): string | null {
  // Check file type
  const validTypes = ['text/csv', 'application/csv', 'text/plain'];
  if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.csv')) {
    return 'Please select a valid CSV file';
  }

  // Check file size (1MB limit)
  const maxSize = 1024 * 1024; // 1MB
  if (file.size > maxSize) {
    return `File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB`;
  }

  // Check if file is empty
  if (file.size === 0) {
    return 'The selected file is empty';
  }

  return null; // No errors
}

/**
 * Download CSV template
 */
export function downloadCSVTemplate(distributionType: DistributionType): void {
  const template = generateCSVTemplate(distributionType);
  const blob = new Blob([template], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${distributionType}-distribution-template.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
