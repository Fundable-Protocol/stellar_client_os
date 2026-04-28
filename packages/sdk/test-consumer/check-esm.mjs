// ESM consumer check: verifies the package is importable via the `import` condition.
import { PaymentStreamClient, DistributorClient, VERSION } from "@fundable/sdk";

if (typeof PaymentStreamClient !== "function") throw new Error("PaymentStreamClient is not a constructor");
if (typeof DistributorClient !== "function") throw new Error("DistributorClient is not a constructor");
if (typeof VERSION !== "string") throw new Error("VERSION is not a string");

console.log(`ESM import OK — @fundable/sdk@${VERSION}`);
