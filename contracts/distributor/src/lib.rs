#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Map, Symbol, Vec,
};

#[contract]
pub struct DistributorContract;

#[contracttype]
#[derive(Clone)]
pub struct TokenStats {
    pub total_amount: i128,
    pub distribution_count: u32,
    pub last_time: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct UserStats {
    pub distributions_initiated: u32,
    pub total_amount: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct DistributionHistory {
    pub sender: Address,
    pub token: Address,
    pub amount: i128,
    pub recipients_count: u32,
    pub timestamp: u64,
}

#[contractimpl]
impl DistributorContract {
    pub fn initialize(env: Env, admin: Address, protocol_fee_percent: u32, fee_address: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        admin.require_auth();
        
        let storage = env.storage().instance();
        storage.set(&Symbol::new(&env, "admin"), &admin);
        storage.set(&Symbol::new(&env, "fee_pct"), &protocol_fee_percent);
        storage.set(&Symbol::new(&env, "fee_addr"), &fee_address);
        storage.set(&Symbol::new(&env, "tot_dist"), &0u64);
        storage.set(&Symbol::new(&env, "tot_amt"), &0i128);
        storage.set(&Symbol::new(&env, "hist_cnt"), &0u64);
    }

    
    pub fn distribute_equal(
        env: Env,
        sender: Address,
        token: Address,
        total_amount: i128,
        recipients: Vec<Address>,
    ) {
        sender.require_auth();
        
        let recipient_count = recipients.len() as i128;
        assert!(recipient_count > 0, "No recipients provided");
        assert!(total_amount > 0, "Amount must be positive");
        
        let amount_per_recipient = total_amount / recipient_count;
        assert!(amount_per_recipient > 0, "Amount too small to distribute");
        
        let token_client = token::Client::new(&env, &token);
        
       
        let protocol_fee = Self::calculate_fee(&env, total_amount);
        let total_with_fee = total_amount + protocol_fee;
        
        if protocol_fee > 0 {
            let fee_address: Address = env.storage().instance()
                .get(&Symbol::new(&env, "fee_addr"))
                .unwrap();
            token_client.transfer(&sender, &fee_address, &protocol_fee);
        }
        
        
        for recipient in recipients.iter() {
            token_client.transfer(&sender, &recipient, &amount_per_recipient);
        }
        
        
        Self::update_global_stats(&env, total_amount);
        Self::update_token_stats(&env, &token, total_amount, recipients.len());
        Self::update_user_stats(&env, &sender, total_amount);
        Self::record_history(&env, sender, token, total_amount, recipients.len());
    }

  
    pub fn distribute_weighted(
        env: Env,
        sender: Address,
        token: Address,
        recipients: Vec<Address>,
        amounts: Vec<i128>,
    ) {
        sender.require_auth();
        
        assert!(recipients.len() == amounts.len(), "Recipients and amounts must match");
        assert!(recipients.len() > 0, "No recipients provided");
        
        let token_client = token::Client::new(&env, &token);
        
        let mut total_amount: i128 = 0;
        for amount in amounts.iter() {
            assert!(amount > 0, "All amounts must be positive");
            total_amount += amount;
        }
        
       
        let protocol_fee = Self::calculate_fee(&env, total_amount);
        
       
        if protocol_fee > 0 {
            let fee_address: Address = env.storage().instance()
                .get(&Symbol::new(&env, "fee_addr"))
                .unwrap();
            token_client.transfer(&sender, &fee_address, &protocol_fee);
        }
        
        
        for i in 0..recipients.len() {
            let recipient = recipients.get(i).unwrap();
            let amount = amounts.get(i).unwrap();
            token_client.transfer(&sender, &recipient, &amount);
        }
        
        
        Self::update_global_stats(&env, total_amount);
        Self::update_token_stats(&env, &token, total_amount, recipients.len());
        Self::update_user_stats(&env, &sender, total_amount);
        Self::record_history(&env, sender, token, total_amount, recipients.len());
    }

   
    fn update_global_stats(env: &Env, amount: i128) {
        let storage = env.storage().instance();
        let mut total_dist: u64 = storage.get(&Symbol::new(&env, "tot_dist")).unwrap_or(0);
        let mut total_amt: i128 = storage.get(&Symbol::new(&env, "tot_amt")).unwrap_or(0);
        
        total_dist += 1;
        total_amt += amount;
        
        storage.set(&Symbol::new(&env, "tot_dist"), &total_dist);
        storage.set(&Symbol::new(&env, "tot_amt"), &total_amt);
    }

    fn update_token_stats(env: &Env, token: &Address, amount: i128, recipient_count: u32) {
        let storage = env.storage().persistent();
        let key = (Symbol::new(&env, "tok_stats"), token);
        
        let mut stats: TokenStats = storage.get(&key).unwrap_or(TokenStats {
            total_amount: 0,
            distribution_count: 0,
            last_time: 0,
        });
        
        stats.total_amount += amount;
        stats.distribution_count += 1;
    
        let ts = env.ledger().timestamp();
        stats.last_time = if ts == 0 { 1 } else { ts };
        
        storage.set(&key, &stats);
    }

    fn update_user_stats(env: &Env, user: &Address, amount: i128) {
        let storage = env.storage().persistent();
        let key = (Symbol::new(&env, "usr_stats"), user);
        
        let mut stats: UserStats = storage.get(&key).unwrap_or(UserStats {
            distributions_initiated: 0,
            total_amount: 0,
        });
        
        stats.distributions_initiated += 1;
        stats.total_amount += amount;
        
        storage.set(&key, &stats);
    }

    fn record_history(env: &Env, sender: Address, token: Address, amount: i128, recipient_count: u32) {
        let storage = env.storage().persistent();
        let mut count: u64 = env.storage().instance()
            .get(&Symbol::new(&env, "hist_cnt"))
            .unwrap_or(0);
        
        let history = DistributionHistory {
            sender,
            token,
            amount,
            recipients_count: recipient_count,
            timestamp: env.ledger().timestamp(),
        };
        
        storage.set(&(Symbol::new(&env, "history"), count), &history);
        count += 1;
        env.storage().instance().set(&Symbol::new(&env, "hist_cnt"), &count);
    }

    fn calculate_fee(env: &Env, amount: i128) -> i128 {
        let fee_percent: u32 = env.storage().instance()
            .get(&Symbol::new(&env, "fee_pct"))
            .unwrap_or(0);
        (amount * fee_percent as i128) / 10000
    }

  
    pub fn get_total_distributions(env: Env) -> u64 {
        env.storage().instance().get(&Symbol::new(&env, "tot_dist")).unwrap_or(0)
    }

    pub fn get_total_distributed_amount(env: Env) -> i128 {
        env.storage().instance().get(&Symbol::new(&env, "tot_amt")).unwrap_or(0)
    }

    pub fn get_token_stats(env: Env, token: Address) -> Option<TokenStats> {
        env.storage().persistent().get(&(Symbol::new(&env, "tok_stats"), token))
    }

    pub fn get_user_stats(env: Env, user: Address) -> Option<UserStats> {
        env.storage().persistent().get(&(Symbol::new(&env, "usr_stats"), user))
    }

    pub fn get_distribution_history(env: Env, start_id: u64, limit: u64) -> Vec<DistributionHistory> {
        let mut history = Vec::new(&env);
        let storage = env.storage().persistent();
        
        for i in start_id..(start_id + limit) {
            if let Some(record) = storage.get::<_, DistributionHistory>(&(Symbol::new(&env, "history"), i)) {
                history.push_back(record);
            }
        }
        
        history
    }

    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&Symbol::new(&env, "admin"))
    }

    pub fn set_protocol_fee(env: Env, admin: Address, new_fee_percent: u32) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap();
        assert!(admin == stored_admin, "Unauthorized");
        
        env.storage().instance().set(&Symbol::new(&env, "fee_pct"), &new_fee_percent);
    }

    
}

#[cfg(test)]
mod test {
  use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, LedgerInfo},
        token::{Client as TokenClient, StellarAssetClient},
        Address, Env,
    };


    fn create_token_contract<'a>(
        env: &Env,
        admin: &Address,
    ) -> (Address, TokenClient<'a>, StellarAssetClient<'a>) {
        let token_address = env.register_stellar_asset_contract(admin.clone());
        let token_client = TokenClient::new(env, &token_address);
        let token_admin_client = StellarAssetClient::new(env, &token_address);
        (token_address, token_client, token_admin_client)
    }

     
    fn setup_distributor(env: &Env) -> (Address, DistributorContractClient, Address, Address) {
        let contract_id = env.register(DistributorContract, ());
        let client = DistributorContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let fee_address = Address::generate(&env);
        
        client.initialize(&admin, &250, &fee_address); 
        
        (contract_id, client, admin, fee_address)
    }


    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DistributorContract, ());
        let client = DistributorContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let fee_address = Address::generate(&env);

        client.initialize(&admin, &250, &fee_address);

        let stored_admin = client.get_admin();
        assert_eq!(stored_admin, Some(admin));
    }

    #[test]
    #[should_panic(expected = "Contract already initialized")]
    fn test_re_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DistributorContract, ());
        let client = DistributorContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let fee_address = Address::generate(&env);

        client.initialize(&admin, &250, &fee_address);
        // This should panic
        client.initialize(&admin, &250, &fee_address);
    }

    #[test]
    fn test_distribute_equal() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, _fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        let recipient1 = Address::generate(&env);
        let recipient2 = Address::generate(&env);
        let recipient3 = Address::generate(&env);

       
        token_admin.mint(&sender, &10000);

       
        let mut recipients = Vec::new(&env);
        recipients.push_back(recipient1.clone());
        recipients.push_back(recipient2.clone());
        recipients.push_back(recipient3.clone());

        
        let total_amount = 900i128;
        
        distributor_client.distribute_equal(&sender, &token_address, &total_amount, &recipients);

        
        assert_eq!(token_client.balance(&recipient1), 300);
        assert_eq!(token_client.balance(&recipient2), 300);
        assert_eq!(token_client.balance(&recipient3), 300);

        assert_eq!(distributor_client.get_total_distributions(), 1);
        assert_eq!(distributor_client.get_total_distributed_amount(), 900);
    }

    #[test]
    fn test_distribute_weighted() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, _fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        let recipient1 = Address::generate(&env);
        let recipient2 = Address::generate(&env);
        let recipient3 = Address::generate(&env);

        token_admin.mint(&sender, &10000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(recipient1.clone());
        recipients.push_back(recipient2.clone());
        recipients.push_back(recipient3.clone());

        let mut amounts = Vec::new(&env);
        amounts.push_back(100);
        amounts.push_back(200);
        amounts.push_back(300);

        distributor_client.distribute_weighted(&sender, &token_address, &recipients, &amounts);

        
        assert_eq!(token_client.balance(&recipient1), 100);
        assert_eq!(token_client.balance(&recipient2), 200);
        assert_eq!(token_client.balance(&recipient3), 300);

       
        assert_eq!(distributor_client.get_total_distributions(), 1);
        assert_eq!(distributor_client.get_total_distributed_amount(), 600);
    }

#[test]
    fn test_distribute_equal_with_protocol_fee() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        let recipient1 = Address::generate(&env);
        let recipient2 = Address::generate(&env);

        
        token_admin.mint(&sender, &10000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(recipient1.clone());
        recipients.push_back(recipient2.clone());

       
        let total_amount = 1000i128;
        
        distributor_client.distribute_equal(&sender, &token_address, &total_amount, &recipients);

        assert_eq!(token_client.balance(&recipient1), 500);
        assert_eq!(token_client.balance(&recipient2), 500);
        
        
        assert_eq!(token_client.balance(&fee_address), 25);
        
        
        assert_eq!(token_client.balance(&sender), 8975);
    }

    

     #[test]
    fn test_distribute_weighted_with_protocol_fee() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        let recipient1 = Address::generate(&env);
        let recipient2 = Address::generate(&env);

        token_admin.mint(&sender, &10000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(recipient1.clone());
        recipients.push_back(recipient2.clone());

        let mut amounts = Vec::new(&env);
        amounts.push_back(400);
        amounts.push_back(600);

        distributor_client.distribute_weighted(&sender, &token_address, &recipients, &amounts);

        assert_eq!(token_client.balance(&recipient1), 400);
        assert_eq!(token_client.balance(&recipient2), 600);
        
       
        assert_eq!(token_client.balance(&fee_address), 25);
    }

    
    #[test]
    fn test_update_global_stats() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, _fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        token_admin.mint(&sender, &100000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(Address::generate(&env));

        assert_eq!(distributor_client.get_total_distributions(), 0);
        assert_eq!(distributor_client.get_total_distributed_amount(), 0);

      
        distributor_client.distribute_equal(&sender, &token_address, &1000, &recipients);
        
        
        assert_eq!(distributor_client.get_total_distributions(), 1);
        assert_eq!(distributor_client.get_total_distributed_amount(), 1000);

       
        distributor_client.distribute_equal(&sender, &token_address, &2500, &recipients);
        
       
        assert_eq!(distributor_client.get_total_distributions(), 2);
        assert_eq!(distributor_client.get_total_distributed_amount(), 3500);

       
        distributor_client.distribute_equal(&sender, &token_address, &500, &recipients);
        
       
        assert_eq!(distributor_client.get_total_distributions(), 3);
        assert_eq!(distributor_client.get_total_distributed_amount(), 4000);

        
        let mut amounts = Vec::new(&env);
        amounts.push_back(300);
        
        distributor_client.distribute_weighted(&sender, &token_address, &recipients, &amounts);
        
        
        assert_eq!(distributor_client.get_total_distributions(), 4);
        assert_eq!(distributor_client.get_total_distributed_amount(), 4300);
    }

     #[test]
    fn test_update_token_statistics() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, _fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        let recipient1 = Address::generate(&env);

        token_admin.mint(&sender, &100000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(recipient1.clone());

        distributor_client.distribute_equal(&sender, &token_address, &1000, &recipients);

     
        distributor_client.distribute_equal(&sender, &token_address, &2000, &recipients);

       
        let token_stats = distributor_client.get_token_stats(&token_address);
        assert!(token_stats.is_some());
        
        let stats = token_stats.unwrap();
        assert_eq!(stats.total_amount, 3000);
        assert_eq!(stats.distribution_count, 2);
        assert!(stats.last_time > 0);
    }

    #[test]
    fn test_update_user_statistics() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, _fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        let recipient1 = Address::generate(&env);

        token_admin.mint(&sender, &100000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(recipient1.clone());

       
        distributor_client.distribute_equal(&sender, &token_address, &500, &recipients);
        distributor_client.distribute_equal(&sender, &token_address, &1500, &recipients);
        distributor_client.distribute_equal(&sender, &token_address, &2000, &recipients);

 
        let user_stats = distributor_client.get_user_stats(&sender);
        assert!(user_stats.is_some());
        
        let stats = user_stats.unwrap();
        assert_eq!(stats.distributions_initiated, 3);
        assert_eq!(stats.total_amount, 4000);
    }



#[test]
    fn test_record_history() {
        let env = Env::default();
        env.mock_all_auths();

       
        env.ledger().set(LedgerInfo {
            timestamp: 12345,
            protocol_version: env.ledger().protocol_version(),
            sequence_number: 10,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 16,
            min_persistent_entry_ttl: 16,
            max_entry_ttl: 6312000,
        });

        let admin = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, _fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        let recipient1 = Address::generate(&env);
        let recipient2 = Address::generate(&env);

        token_admin.mint(&sender, &100000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(recipient1.clone());
        recipients.push_back(recipient2.clone());

       
        distributor_client.distribute_equal(&sender, &token_address, &1000, &recipients);
        distributor_client.distribute_equal(&sender, &token_address, &2000, &recipients);

       
        let history = distributor_client.get_distribution_history(&0, &2);
        assert_eq!(history.len(), 2);

        let record1 = history.get(0).unwrap();
        assert_eq!(record1.sender, sender);
        assert_eq!(record1.token, token_address);
        assert_eq!(record1.amount, 1000);
        assert_eq!(record1.recipients_count, 2);
        assert_eq!(record1.timestamp, 12345);

    
        let record2 = history.get(1).unwrap();
        assert_eq!(record2.amount, 2000);
    }



    #[test]
    fn test_set_protocol_fee() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DistributorContract, ());
        let client = DistributorContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let fee_address = Address::generate(&env);

        client.initialize(&admin, &250, &fee_address);

        // Change fee to 5% (500 basis points)
        client.set_protocol_fee(&admin, &500);

        // Test with new fee
        let sender = Address::generate(&env);
        let token_admin_addr = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &token_admin_addr);
        token_admin.mint(&sender, &10000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(Address::generate(&env));

        // 1000 tokens with 5% fee = 50 fee
        client.distribute_equal(&sender, &token_address, &1000, &recipients);
        assert_eq!(token_client.balance(&fee_address), 50);
    }



#[test]
    fn test_zero_protocol_fee() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DistributorContract, ());
        let client = DistributorContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let fee_address = Address::generate(&env);

        // Initialize with 0% fee
        client.initialize(&admin, &0, &fee_address);

        let sender = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &admin);
        token_admin.mint(&sender, &10000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(Address::generate(&env));

        client.distribute_equal(&sender, &token_address, &1000, &recipients);

        // Fee address should have 0 balance
        assert_eq!(token_client.balance(&fee_address), 0);
    }


    #[test]
    #[should_panic(expected = "All amounts must be positive")]
    fn test_distribute_weighted_zero_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, _fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        token_admin.mint(&sender, &10000);

        let mut recipients = Vec::new(&env);
        recipients.push_back(Address::generate(&env));
        recipients.push_back(Address::generate(&env));

        let mut amounts = Vec::new(&env);
        amounts.push_back(100);
        amounts.push_back(0); // Invalid: zero amount

        distributor_client.distribute_weighted(&sender, &token_address, &recipients, &amounts);
    }

     #[test]
    #[should_panic(expected = "Amount too small to distribute")]
    fn test_distribute_equal_amount_too_small() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, _fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        token_admin.mint(&sender, &10000);

        // Create many recipients so amount per recipient becomes 0
        let mut recipients = Vec::new(&env);
        for _ in 0..1000 {
            recipients.push_back(Address::generate(&env));
        }

        distributor_client.distribute_equal(&sender, &token_address, &10, &recipients);
    }

    #[test]
    #[should_panic(expected = "No recipients provided")]
    fn test_distribute_equal_empty_recipients() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &admin);
        let (_contract_id, distributor_client, _admin, _fee_address) = setup_distributor(&env);

        let sender = Address::generate(&env);
        token_admin.mint(&sender, &10000);

        let recipients = Vec::new(&env);
        distributor_client.distribute_equal(&sender, &token_address, &1000, &recipients);
    }

}

    



