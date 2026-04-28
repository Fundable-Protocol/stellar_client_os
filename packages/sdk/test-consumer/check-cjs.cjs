// CJS consumer check: verifies the package is importable via the `require` condition.
const { PaymentStreamClient, DistributorClient, VERSION } = require("@fundable/sdk");

if (typeof PaymentStreamClient !== "function") throw new Error("PaymentStreamClient is not a constructor");
if (typeof DistributorClient !== "function") throw new Error("DistributorClient is not a constructor");
if (typeof VERSION !== "string") throw new Error("VERSION is not a string");

console.log(`CJS require OK — @fundable/sdk@${VERSION}`);
