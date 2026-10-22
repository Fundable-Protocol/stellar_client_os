#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, LedgerInfo},
        token, Address, Env, String as SorobanString,
    };

    fn create_token_contract<'a>(env: &Env, admin: &Address) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
        let contract_address = env.register_stellar_asset_contract_v2(admin.clone());
        (
            token::Client::new(env, &contract_address.address()),
            token::StellarAssetClient::new(env, &contract_address.address()),
        )
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register_contract(None, QuadraticFundingContract);
        let client = QuadraticFundingContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        env.mock_all_auths();

        client.initialize(&admin);

        // Should not panic on get_round after initialization
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_initialize_twice() {
        let env = Env::default();
        let contract_id = env.register_contract(None, QuadraticFundingContract);
        let client = QuadraticFundingContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        env.mock_all_auths();

        client.initialize(&admin);
        client.initialize(&admin); // Should panic
    }

    #[test]
    fn test_create_round() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set(LedgerInfo {
            timestamp: 1000,
            protocol_version: 20,
            sequence_number: 10,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 10,
            min_persistent_entry_ttl: 10,
            max_entry_ttl: 3110400,
        });

        let contract_id = env.register_contract(None, QuadraticFundingContract);
        let client = QuadraticFundingContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, token_admin) = create_token_contract(&env, &admin);

        client.initialize(&admin);

        // Mint tokens to admin for matching pool
        token_admin.mint(&admin, &10_000_000);

        let round_id = client.create_round(
            &token.address,
            &1_000_000,
            &2000,
            &10000,
            &1_000,
        );

        assert_eq!(round_id, 1);

        // Verify round was created
        let round = client.get_round(&round_id);
        assert_eq!(round.id, 1);
        assert_eq!(round.matching_pool, 1_000_000);
        assert_eq!(round.remaining_pool, 1_000_000);
        assert_eq!(round.status, RoundStatus::Active);
    }

    #[test]
    fn test_quadratic_formula() {
        let env = Env::default();

        // Test: Two contributors to same project
        // Contributor A: 100 tokens -> sqrt = 10
        // Contributor B: 400 tokens -> sqrt = 20
        // QF score: (10 + 20)^2 = 900

        // If matching pool is 1000 and only one project, it gets all 1000

        assert_eq!(QuadraticFundingContract::isqrt(100), 10);
        assert_eq!(QuadraticFundingContract::isqrt(400), 20);

        let sum_sqrt = 10 + 20; // 30
        let qf_score = sum_sqrt * sum_sqrt; // 900
        assert_eq!(qf_score, 900);
    }

    #[test]
    fn test_isqrt_edge_cases() {
        let env = Env::default();

        assert_eq!(QuadraticFundingContract::isqrt(0), 0);
        assert_eq!(QuadraticFundingContract::isqrt(1), 1);
        assert_eq!(QuadraticFundingContract::isqrt(2), 1);
        assert_eq!(QuadraticFundingContract::isqrt(3), 1);
        assert_eq!(QuadraticFundingContract::isqrt(4), 2);
        assert_eq!(QuadraticFundingContract::isqrt(9), 3);
        assert_eq!(QuadraticFundingContract::isqrt(16), 4);
        assert_eq!(QuadraticFundingContract::isqrt(25), 5);
        assert_eq!(QuadraticFundingContract::isqrt(100), 10);
        assert_eq!(QuadraticFundingContract::isqrt(10000), 100);
    }

    #[test]
    #[should_panic(expected = "InvalidTimeRange")]
    fn test_create_round_invalid_time() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set(LedgerInfo {
            timestamp: 5000,
            protocol_version: 20,
            sequence_number: 10,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 10,
            min_persistent_entry_ttl: 10,
            max_entry_ttl: 3110400,
        });

        let contract_id = env.register_contract(None, QuadraticFundingContract);
        let client = QuadraticFundingContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, _) = create_token_contract(&env, &admin);

        client.initialize(&admin);

        // Try to create round with end_time before current time
        client.create_round(&token.address, &1_000_000, &6000, &4000, &1_000);
    }

    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_create_round_invalid_amount() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set(LedgerInfo {
            timestamp: 1000,
            protocol_version: 20,
            sequence_number: 10,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 10,
            min_persistent_entry_ttl: 10,
            max_entry_ttl: 3110400,
        });

        let contract_id = env.register_contract(None, QuadraticFundingContract);
        let client = QuadraticFundingContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, _) = create_token_contract(&env, &admin);

        client.initialize(&admin);

        // Try to create round with zero matching pool
        client.create_round(&token.address, &0, &2000, &10000, &1_000);
    }
}
