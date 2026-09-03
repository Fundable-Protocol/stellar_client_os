# CAMPAIGN CONTRACT ARCHITECTURE

This document describes the architectural design of the Campaign contract, covering its state machine, security model, and scalability approach.

## Overview

The Campaign contract manages the lifecycle of a campaign from creation to final settlement. It allows campaign organizers to create campaigns, contributors to pledge funds, and administrators to monitor and close out campaigns according to predefined rules.

## State Machine

The contract implements a simple and expressive state machine to ensure clear transitions and prevent invalid operations.

```mermaid
                     | Expiration (startDate + duration)
                     v
Created ------------------------------> Active
   x |                                            |
   | Owner cancellation                          | MarkEnded
   v                                            v
 Canceled <------------------------------ Ended
                                            |
                                            v AdminFinalize
                                            Finalized
```

**States:**
- *Created*: The campaign has been created but is not yet accepting contributions. It can be edited or cancelled if not started.
- *Active* : The campaign is accepting contributions. It can be paused by an administrator if needed.
- *Paused*: Contributions are temporarily suspended. The campaign can resume back to Active or be ended prematurely.
- *Ended*: The campaign has reached its time limit or goal and is no longer accepting contributions. Funds are available for withdrawal/refund.
- *Canceled*: The campaign was terminated before completion. Contributors can be refunded.
- *Finalized*: Administrator has verified the campaign outcome and distributed funds according to rules.
helder triggers the transition from Created to Active.

- *Active to Paused*: An administrator with the *PAUSE_ROLE* calls *pause()*.
- *Paused to Active*: An administrator calls *resume()*.
- *Active or Paused to Ended*: The campaign reaches its endDate requirement or an administrator calls *endCampaign()*.
  Also, a special end condition might be triggered when the goal is reached. All contributions will be rejected in this state.
- *Active or Paused to Canceled*: The campaign owner calls *cancel()* (before endDate only).
- *Ended to Finalized*: The administrator with the *FINALIZE_ROLE* calls *finalize()* after all logical chadder and compliance checks have passed trigger the finalization.
```

## Security Model

The contract adopts a layered access control architecture to ensure least-privilege access to critical functions.

### Roles and Permissions

-Partial Roles:*
  - *OWNER*: The address that created the campaign. Has full control over managing the campaign until it ends.
  - *ADMIN*: A designated role for trusted administrators. Can pause, resume, end, and finalize campaigns.
  - CONTRIBUTOR *: A drop-in address that can contribute funds only in active campaigns.
The operational role management contract owns the contract, and the Campaign contract queries it for role checks.

### Access Control Diagram

That ensures a write operation is performed only by an authorized role. The contract implements modifiers for adding/removing admins at system level.

### Security Best Practices

-*Checks-Effects-Interactions*: All external calls are made only after internal state changes. This prevents reentrancy attacks.
-*ReentrancyGuard*: The contract uses a modified reentrancy guard (if solidity version is used), or relies on pure functions with no external calls in critical paths.
-*Pusable*: All administrative order operations can be paused by the Guardian in case of a security issue. Pausing disables contributions and admin operations except unpause.

-*---------------------------------------------------------------------------------
-*User Authentication* and *Access Control* are validated at the function level. The contract exposes modifiers for role management, but they are only callable by the administrator of the Role Manager.

## Scalability

The contract is designed to handle a large number of campaigns and contributions without causing gas state bloat. The following strategies are used:

### State Management

 It does not keep a list of all contributions in storage. Instead, it stores only the aggregate contribution count and total amount per campaign. This allows the contract to operate within fixed storage regions, regardles of how many contributions occur.

### Lazy Refunding

Refunds for cancelled or failed campaigns are processed in batches using a withdrawal pattern. Contributors claim their refund by calling a public function that transfers the proportional amount. The contract tracks whether a refund has already been claimed, preventing double claims. This moves the computational cost to the user who wishes to claim it, reducing the overall gas needed to deploy the campaign.

### Merkle Tree for Rewards/Vesting

If the campaign supports on-chain rewards or vesting, the addresses of eligible contributors are offten too large to store explicitly. Instead, the contract stores a Merkle root (a hash) of the eligible addresses. At distribution time, the campaign owner can provide a Merkle proof to redeem a reward to a contributor without iterating through the entire address list. This keep the contract scalable to millions of contributors.

### Modular Architecture

The contract is designed to be deployed as part of a larger system with independent, upgradeable components.

-*Role Manager*: Handles role assignment and forefront to the Campaign contract. It allows adding new admins and changing permissions without redeploying campaigns.
-*Campaign Registry*: As <the contract acts as a registry >, it maintains a list of campaign addresses and provides a uniform api to query campaign information. This separates concerns of campaign instance lifeycle from the organizational logic.
-*Campaign Factory*: When a user creates a campaign, the Factory contract deploys a new Campaign contract and registers its address in the Registry. This keeps the core contract lightweight and scalable across many campaign instances.

#### Batch Withdrawals

To avoid excessive gas limits in single transactions, all administrative operations that may involve iterating over large data sets (e.g., withdrawing funds from vesting accounts) must implement a pull-based model. The contract maintains a tokenized pointer or offset so that the next chunk of records can be processed in a later transaction, ensuring that no single transaction exceeds the block gas limit.

### Upgradability

The contract is upgradeable via a proxy or upgrade pattern. The administrator can deploy a new version of the contract and migrate the data or redirect users to the new address. The contract itself does not store any persistent user assets except for campaign-derived values, so upgrades are low-risk.

## Known Limitations

The contract is designed to be stateless and permissionless when not in use.
 Does not hold funds directly; it has a withdraw function that call the payment proxy to release the funds in a trusted manner.

All external calls are audited and limited to enumerated functions. The contract never performs arbitrary external calls to unknown addresses, minimizing the risk of malicious actions.

## Known Limitations
- The contract cannot handle more than 256 reward payloads per campaign in a single transaction. For larger campaigns, the administrator must split withdrawals into multiple transactions or use the Merkle Tree mechanism.
- The contract is not composable with deferree contribution or DAOs at this moment. These can be added in future upgrades without breaking compatibility.