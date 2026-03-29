import { getEnv } from "./env-validation";

export {
  getEnv,
  getEnvValidationResult,
  validateEnv,
  formatEnvValidationError,
  EnvValidationError,
  publicEnvSchema,
} from "./env-validation";

export type { Env, EnvValidationIssue } from "./env-validation";

export const env = getEnv();
