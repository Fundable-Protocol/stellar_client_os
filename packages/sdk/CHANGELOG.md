# @fundable/sdk

## 0.2.0

### Minor Changes

- **Address Object Support**: All client methods now accept `@stellar/stellar-sdk` `Address` objects in addition to string addresses for better type safety and consistency with the Stellar SDK

## 0.1.0

### Minor Changes

- Initial release of the Fundable Stellar SDK
  - `PaymentStreamClient` — create, withdraw, pause, resume, and cancel payment streams
  - `DistributorClient` — equal and weighted token distribution to multiple recipients
  - `ContractDeployer` — deploy Fundable contracts to Stellar networks
  - Utility modules: batch distribution, event parsing, and contract error handling
  - Full TypeScript support with strict types and generated contract bindings
