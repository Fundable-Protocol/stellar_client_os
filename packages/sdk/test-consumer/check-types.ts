// TypeScript consumer check: verifies named exports are typed correctly.
import { PaymentStreamClient, DistributorClient, VERSION } from "@fundable/sdk";

// Type assertions — these fail at compile time if types are wrong.
const _v: string = VERSION;
const _p: typeof PaymentStreamClient = PaymentStreamClient;
const _d: typeof DistributorClient = DistributorClient;
