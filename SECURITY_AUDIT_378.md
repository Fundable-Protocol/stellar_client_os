# Security Audit: Issue #378 - Secret Key Parameter in Contract Deployer

## Issue Description
Issue #378 requested removal of secret key parameter from client-side deployer to prevent key exposure in client memory.

## Investigation Results

### Current State (apps/web/src/services/contract.deployer.ts)
The current implementation is **already secure**:

1. **No secret key parameter exists** - Lines 45-52 contain `buildUploadWasmTx(address, wasmBytes, fee)` with no secret key
2. **Non-custodial signing** - The deployer uses `signTransaction` from wallet provider (line 87 in DeployContract.tsx)
3. **Address-only authentication** - Only public addresses are used throughout the deployment flow

### Historical Context
The security fix was implemented in commit `8c022b2` (May 31, 2026):
- "Fix SDK security issues for RPC transport, batch sizing, and deploy salt"
- This commit addressed multiple security issues including proper non-custodial wallet integration

### Verification
- ✅ No secret key parameters in `buildUploadWasmTx` method
- ✅ No secret key parameters in `buildCreateContractTx` method  
- ✅ No secret key parameters in `submitSignedTransaction` method
- ✅ All methods use public address strings only
- ✅ Signing is delegated to wallet provider via `signTransaction` callback

## Conclusion
Issue #378 is **already resolved** in the current codebase. The client-side deployer properly enforces non-custodial wallet signers and does not accept secret key parameters.

## Acceptance Criteria Status
- ✅ Issue resolved in apps/web/src/services/contract.deployer.ts:45-52 (no secret key parameter exists)
- ✅ No regression introduced (implementation was already secure)
