import { z } from "zod";

const CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional()
);

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);

const contractIdSchema = z
  .string({ required_error: "This variable is required" })
  .trim()
  .regex(
    CONTRACT_ID_REGEX,
    "Must be a valid Stellar contract ID: 56 characters, starting with C"
  );

const requiredUrl = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .url(`${label} must be a valid URL`);

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID: contractIdSchema,
  NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID: contractIdSchema,
  NEXT_PUBLIC_STELLAR_RPC_URL: requiredUrl("NEXT_PUBLIC_STELLAR_RPC_URL"),
  NEXT_PUBLIC_STELLAR_HORIZON_URL: requiredUrl("NEXT_PUBLIC_STELLAR_HORIZON_URL"),
  NEXT_PUBLIC_NETWORK_PASSPHRASE: z
    .string({ required_error: "NEXT_PUBLIC_NETWORK_PASSPHRASE is required" })
    .trim()
    .min(1, "NEXT_PUBLIC_NETWORK_PASSPHRASE is required"),
  NEXT_PUBLIC_STELLAR_NETWORK: z.enum(["testnet", "mainnet"], {
    errorMap: () => ({
      message: "NEXT_PUBLIC_STELLAR_NETWORK must be either 'testnet' or 'mainnet'",
    }),
  }),
  NEXT_PUBLIC_URL: optionalUrl,
  NEXT_PUBLIC_APP_NAME: optionalString,
  NEXT_PUBLIC_APP_DESCRIPTION: optionalString,
  NEXT_PUBLIC_API_URL: optionalUrl,
  NEXT_PUBLIC_BACKEND_BASE_URL: optionalUrl,
  NEXT_PUBLIC_POLYGON_RPC_URL: optionalUrl,
  NEXT_PUBLIC_OFFRAMP_MOCK: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export type Env = z.infer<typeof publicEnvSchema>;

export type EnvValidationIssue = {
  key: string;
  message: string;
};

export class EnvValidationError extends Error {
  issues: EnvValidationIssue[];

  constructor(issues: EnvValidationIssue[]) {
    super(formatEnvValidationError(issues));
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

function collectRawEnv(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID: source.NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID,
    NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID: source.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID,
    NEXT_PUBLIC_STELLAR_RPC_URL: source.NEXT_PUBLIC_STELLAR_RPC_URL,
    NEXT_PUBLIC_STELLAR_HORIZON_URL: source.NEXT_PUBLIC_STELLAR_HORIZON_URL,
    NEXT_PUBLIC_NETWORK_PASSPHRASE: source.NEXT_PUBLIC_NETWORK_PASSPHRASE,
    NEXT_PUBLIC_STELLAR_NETWORK: source.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_URL: source.NEXT_PUBLIC_URL,
    NEXT_PUBLIC_APP_NAME: source.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_DESCRIPTION: source.NEXT_PUBLIC_APP_DESCRIPTION,
    NEXT_PUBLIC_API_URL: source.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_BACKEND_BASE_URL: source.NEXT_PUBLIC_BACKEND_BASE_URL,
    NEXT_PUBLIC_POLYGON_RPC_URL: source.NEXT_PUBLIC_POLYGON_RPC_URL,
    NEXT_PUBLIC_OFFRAMP_MOCK: source.NEXT_PUBLIC_OFFRAMP_MOCK,
  };
}

function normalizeIssues(error: z.ZodError): EnvValidationIssue[] {
  return error.issues.map((issue) => ({
    key: issue.path.join("."),
    message: issue.message,
  }));
}

export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = publicEnvSchema.safeParse(collectRawEnv(source));

  if (!result.success) {
    throw new EnvValidationError(normalizeIssues(result.error));
  }

  return result.data;
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }

  return cachedEnv;
}

export function getEnvValidationResult(source: NodeJS.ProcessEnv = process.env):
  | { success: true; env: Env }
  | { success: false; error: EnvValidationError } {
  try {
    return {
      success: true,
      env: validateEnv(source),
    };
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return {
        success: false,
        error,
      };
    }

    throw error;
  }
}

export function formatEnvValidationError(issues: EnvValidationIssue[]): string {
  return [
    "Environment variable validation failed.",
    ...issues.map(({ key, message }) => `- ${key}: ${message}`),
    "See .env.example for the required setup.",
  ].join("\n");
}
