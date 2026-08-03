#![no_std]
use contract_common::ReentrancyGuard;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol,
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
    ReentrantCall = 11,
}

#[contracttype]
#[derive(Clone, Debug, Copy, PartialEq, Eq)]
pub enum StreamStatus {
    Active,
    Paused,
    Canceled,
    Completed,
}

const LEDGER_THRESHOLD: u32 = 518_400;
const LEDGER_BUMP: u32 = 535_680;

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

#[contracttype]
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

#[contracttype]
#[derive(Clone, Debug)]
pub struct StreamTransferredEvent {
    pub stream_id: u64,
    pub ownership_id: u64,
    pub from: Address,
    pub to: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct StreamClaimedEvent {
    pub stream_id: u64,
    pub recipient: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct StreamCancelledEvent {
    pub stream_id: u64,
    pub sender: Address,
    pub refund_amount: i128,
    pub vested_amount: i128,
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
        let _guard = Self::acquire_guard(&env);

        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::StreamCounter, &0u64);
        env.storage().instance().set(&DataKey::OwnershipCounter, &0u64);
        Self::extend_instance_ttl(&env);

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
        let _guard = Self::acquire_guard(&env);

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
        let new_stream_id = stream_id + 1;
        env.storage()
            .instance()
            .set(&DataKey::StreamCounter, &new_stream_id);

        let ownership_id = Self::mint_ownership_record(env.clone(), recipient.clone(), new_stream_id);

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
        Self::extend_persistent_ttl(&env, &DataKey::Stream(new_stream_id));
        Self::extend_instance_ttl(&env);

        env.events().publish(
            (Symbol::new(&env, "stream_created"),),
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
            },
        );

        Ok(new_stream_id)
    }

    pub fn transfer_stream(env: Env, stream_id: u64, new_recipient: Address) -> Result<(), Error> {
        let _guard = Self::acquire_guard(&env);

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
        Self::extend_persistent_ttl(&env, &DataKey::Stream(stream_id));

        ownership_record.owner = new_recipient.clone();
        env.storage()
            .persistent()
            .set(&DataKey::StreamOwnershipRecord(ownership_id), &ownership_record);
        Self::extend_persistent_ttl(&env, &DataKey::StreamOwnershipRecord(ownership_id));

        env.events().publish(
            (Symbol::new(&env, "stream_transferred"),),
            StreamTransferredEvent {
                stream_id,
                ownership_id,
                from: old_recipient,
                to: new_recipient,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    pub fn claim(env: Env, stream_id: u64) -> Result<i128, Error> {
        let _guard = Self::acquire_guard(&env);

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
        Self::extend_persistent_ttl(
            &env,
            &DataKey::StreamOwnershipRecord(stream.ownership_id),
        );

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
        Self::extend_persistent_ttl(&env, &DataKey::Stream(stream_id));

        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&env.current_contract_address(), &ownership_record.owner, &claimable);

        env.events().publish(
            (Symbol::new(&env, "stream_claimed"),),
            StreamClaimedEvent {
                stream_id,
                recipient: ownership_record.owner,
                amount: claimable,
                timestamp: current_time,
            },
        );

        Ok(claimable)
    }

    pub fn cancel_stream(env: Env, stream_id: u64) -> Result<(), Error> {
        let _guard = Self::acquire_guard(&env);

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
        Self::extend_persistent_ttl(&env, &DataKey::StreamOwnershipRecord(ownership_id));

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
        Self::extend_persistent_ttl(&env, &DataKey::Stream(stream_id));

        if refund_amount > 0 {
            let token_client = token::Client::new(&env, &stream.token);
            token_client.transfer(
                &env.current_contract_address(),
                &stream.sender,
                &refund_amount,
            );
        }

        env.events().publish(
            (Symbol::new(&env, "stream_cancelled"),),
            StreamCancelledEvent {
                stream_id,
                sender: stream.sender,
                refund_amount,
                vested_amount: vested,
                timestamp: current_time,
            },
        );

        Ok(())
    }

    pub fn get_stream(env: Env, stream_id: u64) -> Result<Stream, Error> {
        let key = DataKey::Stream(stream_id);
        let stream = env.storage()
            .persistent()
            .get(&key)
            .ok_or(Error::StreamNotFound)?;
        Self::extend_persistent_ttl(&env, &key);
        Ok(stream)
    }

    pub fn get_ownership_record(env: Env, ownership_id: u64) -> Result<StreamOwnershipRecord, Error> {
        let key = DataKey::StreamOwnershipRecord(ownership_id);
        let ownership_record = env.storage()
            .persistent()
            .get(&key)
            .ok_or(Error::OwnershipRecordNotFound)?;
        Self::extend_persistent_ttl(&env, &key);
        Ok(ownership_record)
    }

    pub fn ownership_record_owner(env: Env, ownership_id: u64) -> Result<Address, Error> {
        let ownership_record: StreamOwnershipRecord = env
            .storage()
            .persistent()
            .get(&DataKey::StreamOwnershipRecord(ownership_id))
            .ok_or(Error::OwnershipRecordNotFound)?;
        Self::extend_persistent_ttl(&env, &DataKey::StreamOwnershipRecord(ownership_id));
        Ok(ownership_record.owner)
    }

    pub fn get_claimable(env: Env, stream_id: u64) -> Result<i128, Error> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(Error::StreamNotFound)?;
        Self::extend_persistent_ttl(&env, &DataKey::Stream(stream_id));

        if stream.status != StreamStatus::Active {
            return Ok(0);
        }

        Ok(Self::calculate_claimable(&stream, env.ledger().timestamp()))
    }

    fn mint_ownership_record(env: Env, recipient: Address, stream_id: u64) -> u64 {
        let ownership_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::OwnershipCounter)
            .unwrap_or(0);
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
        Self::extend_persistent_ttl(
            &env,
            &DataKey::StreamOwnershipRecord(new_ownership_id),
        );
        Self::extend_persistent_ttl(&env, &DataKey::OwnershipToStream(new_ownership_id));
        Self::extend_instance_ttl(&env);

        new_ownership_id
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

    fn acquire_guard(env: &Env) -> ReentrancyGuard {
        ReentrancyGuard::acquire(env)
            .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, Error::ReentrantCall))
    }

    fn extend_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    fn extend_persistent_ttl(env: &Env, key: &DataKey) {
        env.storage()
            .persistent()
            .extend_ttl(key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }
}

#[cfg(test)]
mod tests {
    use super::{PaymentStreamContract, PaymentStreamContractClient};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{contract, contractimpl, token, Address, Env};

    #[contract]
    struct ReentrantToken;

    #[contractimpl]
    impl ReentrantToken {
        pub fn initialize(env: Env, target: Address) {
            env.storage().instance().set(&0u32, &target);
        }

        pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
            let target: Address = env.storage().instance().get(&0u32).unwrap();
            let client = PaymentStreamContractClient::new(&env, &target);
            let _ = (from, amount);
            client.transfer_stream(&1, &to);
        }
    }

    #[test]
    fn reentrant_token_callback_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        let reentrant_token_id = env.register(ReentrantToken, ());
        let reentrant_token = ReentrantTokenClient::new(&env, &reentrant_token_id);
        reentrant_token.initialize(&contract_id);

        let result = client.try_create_stream(
            &sender,
            &recipient,
            &reentrant_token_id,
            &1_000,
            &0,
            &100,
            &true,
        );
        assert!(result.is_err());

        let asset = env.register_stellar_asset_contract_v2(admin.clone());
        let token = asset.address();
        token::StellarAssetClient::new(&env, &token).mint(&sender, &1_000);

        let stream_id = client.create_stream(
            &sender,
            &recipient,
            &token,
            &1_000,
            &0,
            &100,
            &true,
        );
        assert_eq!(stream_id, 1);
    }
}
