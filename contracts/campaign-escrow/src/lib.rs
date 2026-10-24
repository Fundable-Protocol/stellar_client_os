#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

/// Escrow lifecycle states.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    /// Campaign is active and accepting funds.
    Active,
    /// Campaign closed successfully; funds held in escrow.
    Closed,
    /// A dispute has been filed; funds are frozen pending resolution.
    Disputed,
    /// Funds have been refunded (partially or fully).
    Refunded,
    /// Funds have been released to the creator.
    Released,
}

/// Type of refund issued by a mediator.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RefundType {
    /// Only a portion of the escrow is refunded.
    Partial,
    /// The entire remaining escrow is refunded.
    Full,
}

/// Errors returned by the escrow contract.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    /// The campaign does not exist.
    CampaignNotFound = 1,
    /// The caller is not authorized to perform this action.
    Unauthorized = 2,
    /// The escrow is not in the required state for this action.
    InvalidState = 3,
    /// The requested refund amount exceeds the remaining escrow balance.
    InsufficientEscrow = 4,
    /// The refund amount is invalid (zero or negative).
    InvalidAmount = 5,
}

/// Storage keys used by the contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Address of the platform mediator/admin.
    Mediator,
    /// Address of the campaign creator.
    Creator,
    /// Address of the token held in escrow.
    Token,
    /// Current escrow status for a campaign.
    Status(u64),
    /// Remaining escrow balance for a campaign.
    Balance(u64),
}

/// Event emitted when a refund is issued.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RefundIssued {
    #[topic]
    pub campaign_id: u64,
    pub refund_amount: i128,
    pub refund_type: RefundType,
    pub remaining_balance: i128,
}

#[contract]
pub struct CampaignEscrow;

#[contractimpl]
impl CampaignEscrow {
    /// Initialize the contract with the platform mediator and token.
    pub fn initialize(env: Env, mediator: Address, token: Address) -> Result<(), EscrowError> {
        env.storage().instance().set(&DataKey::Mediator, &mediator);
        env.storage().instance().set(&DataKey::Token, &token);
        Ok(())
    }

    /// Register a new campaign escrow.
    pub fn create_campaign(
        env: Env,
        campaign_id: u64,
        creator: Address,
        initial_balance: i128,
    ) -> Result<(), EscrowError> {
        env.storage()
            .persistent()
            .set(&DataKey::Creator, &creator);
        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &EscrowStatus::Active);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(campaign_id), &initial_balance);
        Ok(())
    }

    /// Mark a campaign as disputed, freezing the escrow.
    pub fn dispute(env: Env, campaign_id: u64, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();

        let status: EscrowStatus = env
            .storage()
            .persistent()
            .get(&DataKey::Status(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)?;

        if status != EscrowStatus::Closed {
            return Err(EscrowError::InvalidState);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &EscrowStatus::Disputed);

        Ok(())
    }

    /// Issue a partial or full refund from a disputed escrow.
    ///
    /// Only the configured mediator/admin may call this. The escrow must be in
    /// the `Disputed` state. The refund amount must not exceed the remaining
    /// escrow balance. On success the status is set to `Refunded` and a
    /// `RefundIssued` event is emitted.
    pub fn refund(
        env: Env,
        campaign_id: u64,
        refund_amount: i128,
        refund_type: RefundType,
    ) -> Result<(), EscrowError> {
        // Only the mediator may issue refunds.
        let mediator: Address = env
            .storage()
            .instance()
            .get(&DataKey::Mediator)
            .ok_or(EscrowError::Unauthorized)?;
        mediator.require_auth();

        // The escrow must be in the Disputed state.
        let status: EscrowStatus = env
            .storage()
            .persistent()
            .get(&DataKey::Status(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)?;

        if status != EscrowStatus::Disputed {
            return Err(EscrowError::InvalidState);
        }

        // Validate the refund amount.
        if refund_amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)?;

        // Ensure the refund does not exceed the remaining escrow.
        if refund_amount > balance {
            return Err(EscrowError::InsufficientEscrow);
        }

        // Determine the amount to refund and the resulting balance.
        let (amount_to_refund, remaining_balance) = match refund_type {
            RefundType::Full => (balance, 0i128),
            RefundType::Partial => (refund_amount, balance - refund_amount),
        };

        // Transfer the refund to the campaign (creator).
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(EscrowError::Unauthorized)?;
        let creator: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Creator)
            .ok_or(EscrowError::CampaignNotFound)?;

        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&env.current_contract_address(), &creator, &amount_to_refund);

        // Update escrow balance and status.
        env.storage()
            .persistent()
            .set(&DataKey::Balance(campaign_id), &remaining_balance);
        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &EscrowStatus::Refunded);

        // Emit the refund event.
        RefundIssued {
            campaign_id,
            refund_amount: amount_to_refund,
            refund_type,
            remaining_balance,
        }
        .publish(&env);

        Ok(())
    }

    /// Return the current status of a campaign escrow.
    pub fn get_status(env: Env, campaign_id: u64) -> Result<EscrowStatus, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Status(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)
    }

    /// Return the remaining escrow balance for a campaign.
    pub fn get_balance(env: Env, campaign_id: u64) -> Result<i128, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)
    }
}