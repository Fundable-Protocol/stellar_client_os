#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, token,
    Address, Env, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    InvalidAmount = 2,
    InvalidTimeRange = 3,
    InvalidStartTime = 4,
    StreamNotFound = 5,
    StreamNotActive = 6,
    StreamNotTransferable = 7,
    OwnershipRecordNotFound = 8,
    NoTokensToClaim = 9,
    Unauthorized = 10,
    /// An ID counter has reached `u64::MAX`; no more records can be created.
    ContractFull = 11,
}

#[contracttype]
#[derive(Clone, Debug, Copy, PartialEq, Eq)]
pub enum StreamStatus {
    Active,
    Paused,
    Canceled,
    Completed,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Stream {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub withdrawn_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub status: StreamStatus,
    pub transferable: bool,
    pub ownership_id: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct StreamOwnershipRecord {
    pub stream_id: u64,
    pub owner: Address,
    pub minted_at: u64,
}

// Storage keys
#[contracttype]
pub enum DataKey {
    StreamCounter,
    OwnershipCounter,
    Stream(u64),
    StreamOwnershipRecord(u64),
    OwnershipToStream(u64),
    Admin,
}

#[contractevent(topics = ["stream_created"])]
#[derive(Clone, Debug)]
pub struct StreamCreatedEvent {
    pub stream_id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub transferable: bool,
    pub ownership_id: u64,
}

#[contractevent(topics = ["stream_transferred"])]
#[derive(Clone, Debug)]
pub struct StreamTransferredEvent {
    pub stream_id: u64,
    pub ownership_id: u64,
    pub from: Address,
    pub to: Address,
    pub timestamp: u64,
}

#[contractevent(topics = ["stream_claimed"])]
#[derive(Clone, Debug)]
pub struct StreamClaimedEvent {
    pub stream_id: u64,
    pub recipient: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contractevent(topics = ["stream_cancelled"])]
#[derive(Clone, Debug)]
pub struct StreamCancelledEvent {
    pub stream_id: u64,
    pub sender: Address,
    pub refund_amount: i128,
    pub vested_amount: i128,
    pub timestamp: u64,
}

/// Emitted when an ID counter (`StreamCounter` or `OwnershipCounter`) has
/// reached `u64::MAX` and a creation/mint attempt is rejected instead of
/// overflowing.
#[contractevent(topics = ["contract_full"])]
#[derive(Clone, Debug)]
pub struct ContractFullEvent {
    /// The exhausted resource ("streams" or "ownership").
    pub resource: Symbol,
    /// Ledger timestamp of the rejected attempt.
    pub timestamp: u64,
}

#[contract]
pub struct PaymentStreamContract;

#[contractimpl]
impl PaymentStreamContract {
    pub fn initialize(
        env: Env,
        admin: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::StreamCounter, &0u64);
        env.storage().instance().set(&DataKey::OwnershipCounter, &0u64);

        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        total_amount: i128,
        start_time: u64,
        end_time: u64,
        transferable: bool,
    ) -> Result<u64, Error> {
        sender.require_auth();

        if total_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if start_time >= end_time {
            return Err(Error::InvalidTimeRange);
        }
        if start_time < env.ledger().timestamp() {
            return Err(Error::InvalidStartTime);
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &total_amount);

        let stream_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StreamCounter)
            .unwrap_or(0);
        if stream_id == u64::MAX {
            // Stream ID space exhausted: reject gracefully instead of overflowing.
            ContractFullEvent {
                resource: symbol_short!("streams"),
                timestamp: env.ledger().timestamp(),
            }
            .publish(&env);
            return Err(Error::ContractFull);
        }
        let new_stream_id = stream_id + 1;
        env.storage()
            .instance()
            .set(&DataKey::StreamCounter, &new_stream_id);

        let ownership_id =
            Self::mint_ownership_record(env.clone(), recipient.clone(), new_stream_id)?;

        let stream = Stream {
            id: new_stream_id,
            sender: sender.clone(),
            recipient: recipient.clone(),
            token: token.clone(),
            total_amount,
            withdrawn_amount: 0,
            start_time,
            end_time,
            status: StreamStatus::Active,
            transferable,
            ownership_id,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Stream(new_stream_id), &stream);

        StreamCreatedEvent {
            stream_id: new_stream_id,
            sender: sender.clone(),
            recipient,
            token,
            total_amount,
            start_time,
            end_time,
            transferable,
            ownership_id,
        }
        .publish(&env);

        Ok(new_stream_id)
    }

    pub fn transfer_stream(env: Env, stream_id: u64, new_recipient: Address) -> Result<(), Error> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(Error::StreamNotFound)?;

        if stream.status != StreamStatus::Active {
            return Err(Error::StreamNotActive);
        }

        if !stream.transferable {
            return Err(Error::StreamNotTransferable);
        }

        let ownership_id = stream.ownership_id;
        let mut ownership_record: StreamOwnershipRecord = env
            .storage()
            .persistent()
            .get(&DataKey::StreamOwnershipRecord(ownership_id))
            .ok_or(Error::OwnershipRecordNotFound)?;

        ownership_record.owner.require_auth();

        let old_recipient = stream.recipient.clone();

        stream.recipient = new_recipient.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        ownership_record.owner = new_recipient.clone();
        env.storage()
            .persistent()
            .set(&DataKey::StreamOwnershipRecord(ownership_id), &ownership_record);

        StreamTransferredEvent {
            stream_id,
            ownership_id,
            from: old_recipient,
            to: new_recipient,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);

        Ok(())
    }

    pub fn claim(env: Env, stream_id: u64) -> Result<i128, Error> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(Error::StreamNotFound)?;

        if stream.status != StreamStatus::Active {
            return Err(Error::StreamNotActive);
        }

        let ownership_record: StreamOwnershipRecord = env
            .storage()
            .persistent()
            .get(&DataKey::StreamOwnershipRecord(stream.ownership_id))
            .ok_or(Error::OwnershipRecordNotFound)?;

        ownership_record.owner.require_auth();

        let current_time = env.ledger().timestamp();
        let claimable = Self::calculate_claimable(&stream, current_time);

        if claimable <= 0 {
            return Err(Error::NoTokensToClaim);
        }

        stream.withdrawn_amount += claimable;

        if stream.withdrawn_amount >= stream.total_amount {
            stream.status = StreamStatus::Completed;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&env.current_contract_address(), &ownership_record.owner, &claimable);

        StreamClaimedEvent {
            stream_id,
            recipient: ownership_record.owner,
            amount: claimable,
            timestamp: current_time,
        }
        .publish(&env);

        Ok(claimable)
    }

    pub fn cancel_stream(env: Env, stream_id: u64) -> Result<(), Error> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(Error::StreamNotFound)?;

        if stream.status != StreamStatus::Active {
            return Err(Error::StreamNotActive);
        }

        stream.sender.require_auth();

        let ownership_id: u64 = stream.ownership_id;
        let ownership_record: StreamOwnershipRecord = env
            .storage()
            .persistent()
            .get(&DataKey::StreamOwnershipRecord(ownership_id))
            .ok_or(Error::OwnershipRecordNotFound)?;

        let current_time = env.ledger().timestamp();
        let vested = Self::calculate_vested(&stream, current_time);
        let refund_amount = stream.total_amount - vested;

        if vested > 0 {
            let token_client = token::Client::new(&env, &stream.token);
            token_client.transfer(
                &env.current_contract_address(),
                &ownership_record.owner,
                &vested,
            );
        }

        stream.status = StreamStatus::Canceled;
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        if refund_amount > 0 {
            let token_client = token::Client::new(&env, &stream.token);
            token_client.transfer(
                &env.current_contract_address(),
                &stream.sender,
                &refund_amount,
            );
        }

        StreamCancelledEvent {
            stream_id,
            sender: stream.sender,
            refund_amount,
            vested_amount: vested,
            timestamp: current_time,
        }
        .publish(&env);

        Ok(())
    }

    pub fn get_stream(env: Env, stream_id: u64) -> Result<Stream, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(Error::StreamNotFound)
    }

    pub fn get_ownership_record(env: Env, ownership_id: u64) -> Result<StreamOwnershipRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::StreamOwnershipRecord(ownership_id))
            .ok_or(Error::OwnershipRecordNotFound)
    }

    pub fn ownership_record_owner(env: Env, ownership_id: u64) -> Result<Address, Error> {
        let ownership_record: StreamOwnershipRecord = env
            .storage()
            .persistent()
            .get(&DataKey::StreamOwnershipRecord(ownership_id))
            .ok_or(Error::OwnershipRecordNotFound)?;
        Ok(ownership_record.owner)
    }

    pub fn get_claimable(env: Env, stream_id: u64) -> Result<i128, Error> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(Error::StreamNotFound)?;

        if stream.status != StreamStatus::Active {
            return Ok(0);
        }

        Ok(Self::calculate_claimable(&stream, env.ledger().timestamp()))
    }

    fn mint_ownership_record(env: Env, recipient: Address, stream_id: u64) -> Result<u64, Error> {
        let ownership_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::OwnershipCounter)
            .unwrap_or(0);
        if ownership_id == u64::MAX {
            // Ownership ID space exhausted: reject gracefully instead of overflowing.
            ContractFullEvent {
                resource: symbol_short!("ownership"),
                timestamp: env.ledger().timestamp(),
            }
            .publish(&env);
            return Err(Error::ContractFull);
        }
        let new_ownership_id = ownership_id + 1;

        env.storage()
            .instance()
            .set(&DataKey::OwnershipCounter, &new_ownership_id);

        let ownership_record = StreamOwnershipRecord {
            stream_id,
            owner: recipient,
            minted_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::StreamOwnershipRecord(new_ownership_id), &ownership_record);
        env.storage()
            .persistent()
            .set(&DataKey::OwnershipToStream(new_ownership_id), &stream_id);

        Ok(new_ownership_id)
    }

    fn calculate_vested(stream: &Stream, current_time: u64) -> i128 {
        if current_time < stream.start_time {
            return 0;
        }

        if current_time >= stream.end_time {
            return stream.total_amount;
        }

        let elapsed = current_time - stream.start_time;
        let duration = stream.end_time - stream.start_time;

        (stream.total_amount * elapsed as i128) / duration as i128
    }

    fn calculate_claimable(stream: &Stream, current_time: u64) -> i128 {
        let vested = Self::calculate_vested(stream, current_time);
        vested - stream.withdrawn_amount
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _, token::StellarAssetClient, Address, Env,
    };

    /// Deploy + initialize the contract and fund the sender so the escrow
    /// transfer inside `create_stream` succeeds.
    fn setup(
        env: &Env,
    ) -> (
        Address,
        PaymentStreamContractClient,
        Address,
        Address,
        Address,
    ) {
        env.mock_all_auths();

        let admin = Address::generate(env);
        let sender = Address::generate(env);
        let recipient = Address::generate(env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(env, &contract_id);
        client.initialize(&admin);

        let token_admin = StellarAssetClient::new(env, &token);
        token_admin.mint(&sender, &1_000);

        (contract_id, client, token, sender, recipient)
    }

    #[test]
    fn test_create_stream_success() {
        let env = Env::default();
        let (_contract_id, client, token, sender, recipient) = setup(&env);

        let stream_id = client.create_stream(&sender, &recipient, &token, &1_000, &0, &100, &true);
        assert_eq!(stream_id, 1);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.recipient, recipient);

        // An ownership record is minted alongside the stream.
        let ownership = client.get_ownership_record(&1);
        assert_eq!(ownership.owner, recipient);
    }

    #[test]
    fn test_create_stream_rejected_when_stream_counter_full() {
        let env = Env::default();
        let (contract_id, client, token, sender, recipient) = setup(&env);

        // Exhaust the stream ID space: the next create must be rejected with
        // Error::ContractFull instead of panicking on arithmetic overflow.
        env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .set(&DataKey::StreamCounter, &u64::MAX);
        });

        let result = client.try_create_stream(&sender, &recipient, &token, &1_000, &0, &100, &true);
        assert!(result.is_err());

        // No stream was persisted and the counter was left untouched.
        assert!(client.try_get_stream(&1).is_err());
    }

    #[test]
    fn test_create_stream_rejected_when_ownership_counter_full() {
        let env = Env::default();
        let (contract_id, client, token, sender, recipient) = setup(&env);

        // Exhaust the ownership ID space: minting the ownership record must
        // be rejected with Error::ContractFull.
        env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .set(&DataKey::OwnershipCounter, &u64::MAX);
        });

        let result = client.try_create_stream(&sender, &recipient, &token, &1_000, &0, &100, &true);
        assert!(result.is_err());
    }
}
