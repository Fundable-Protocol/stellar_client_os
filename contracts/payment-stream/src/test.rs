#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
    use soroban_sdk::{token, Address, Env, IntoVal, Vec as SorobanVec};
    use crate::{PaymentStreamContract, PaymentStreamContractClient, StreamStatus, FeeTier};


    
    #[test]
    fn test_create_stream() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        // Mint tokens to sender
        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
        );

        assert_eq!(stream_id, 1);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.total_amount, 1000);
        assert_eq!(stream.balance, 1000);
        assert_eq!(stream.status, StreamStatus::Active);

        // Check contract balance
        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&contract_id), 1000);
    }

    #[test]
    fn test_withdrawable_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
        );

        env.ledger().set_timestamp(50);
        let available = client.withdrawable_amount(&stream_id);
        assert_eq!(available, 500);
    }

    #[test]
    fn test_withdraw() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
        );

        env.ledger().set_timestamp(50);

        client.withdraw(&stream_id, &300);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.withdrawn_amount, 300);

        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&recipient), 300);
        assert_eq!(token_client.balance(&contract_id), 700);
    }

    #[test]
    fn test_withdraw_with_fee_tier_0() {
        // Test: A donor below first threshold pays the base fee (tier 0)
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let donor = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        // Default tiers: Tier 0 (0+): 500 bps (5%), Tier 1 (50,000+): 250 bps, Tier 2 (500,000+): 100 bps

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&donor, &100_000);

        // Create a small stream (1000 total) to keep cumulative volume below 50,000
        let stream_id = client.create_stream(
            &donor,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
        );

        env.ledger().set_timestamp(50);
        let available = client.withdrawable_amount(&stream_id);
        
        // Withdraw available amount (500) - should pay tier 0 fee (500 bps = 5%)
        // Fee = 500 * 500 / 10000 = 25
        client.withdraw(&stream_id, &available);

        let token_client = token::Client::new(&env, &token);
        // Recipient should receive: 500 - 25 = 475
        assert_eq!(token_client.balance(&recipient), 475);
        // Fee collector should receive: 25
        assert_eq!(token_client.balance(&fee_collector), 25);
    }

    #[test]
    fn test_withdraw_with_fee_tier_1() {
        // Test: A donor above 50,000 cumulative volume qualifies for tier 1
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let donor = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&donor, &1_000_000);

        // Create first stream: 40,000 total
        let stream_id_1 = client.create_stream(
            &donor,
            &recipient,
            &token,
            &40_000,
            &40_000,
            &0,
            &100,
        );

        // Create second stream: 20,000 total (cumulative now 60,000, crosses threshold at 50,000)
        let stream_id_2 = client.create_stream(
            &donor,
            &recipient,
            &token,
            &20_000,
            &20_000,
            &100,
            &200,
        );

        env.ledger().set_timestamp(50);

        // Withdraw from second stream at time 50
        // Available on stream 2: 20,000 * 50 / 100 = 10,000
        let available_2 = client.withdrawable_amount(&stream_id_2);
        
        // Donor cumulative volume is now 60,000 (qualifies for tier 1: 250 bps = 2.5%)
        // Fee = 10,000 * 250 / 10000 = 250
        client.withdraw(&stream_id_2, &available_2);

        let token_client = token::Client::new(&env, &token);
        // Recipient should receive: 10,000 - 250 = 9,750
        assert_eq!(token_client.balance(&recipient), 9_750);
        // Fee collector should receive: 250
        assert_eq!(token_client.balance(&fee_collector), 250);
    }

    #[test]
    fn test_withdraw_with_fee_tier_2() {
        // Test: A donor above 500,000 cumulative volume qualifies for tier 2
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let donor = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&donor, &2_000_000);

        // Create stream: 600,000 total (qualifies for tier 2)
        let stream_id = client.create_stream(
            &donor,
            &recipient,
            &token,
            &600_000,
            &600_000,
            &0,
            &100,
        );

        env.ledger().set_timestamp(50);
        let available = client.withdrawable_amount(&stream_id);
        
        // Donor cumulative volume is 600,000 (qualifies for tier 2: 100 bps = 1.0%)
        // Available at time 50: 600,000 * 50 / 100 = 300,000
        // Fee = 300,000 * 100 / 10000 = 3,000
        client.withdraw(&stream_id, &available);

        let token_client = token::Client::new(&env, &token);
        // Recipient should receive: 300,000 - 3,000 = 297,000
        assert_eq!(token_client.balance(&recipient), 297_000);
        // Fee collector should receive: 3,000
        assert_eq!(token_client.balance(&fee_collector), 3_000);
    }

    #[test]
    fn test_cumulative_volume_across_multiple_streams() {
        // Test: Cumulative volume correctly accumulates across multiple streams
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let donor = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&donor, &500_000);

        // Donor's cumulative volume should be 0 initially
        assert_eq!(client.get_donor_cumulative_volume(&donor), 0);

        // Create stream 1: 30,000
        client.create_stream(&donor, &recipient, &token, &30_000, &30_000, &0, &100);
        assert_eq!(client.get_donor_cumulative_volume(&donor), 30_000);

        // Create stream 2: 25,000 (cumulative now 55,000)
        client.create_stream(&donor, &recipient, &token, &25_000, &25_000, &100, &200);
        assert_eq!(client.get_donor_cumulative_volume(&donor), 55_000);

        // Create stream 3: 10,000 (cumulative now 65,000)
        client.create_stream(&donor, &recipient, &token, &10_000, &10_000, &200, &300);
        assert_eq!(client.get_donor_cumulative_volume(&donor), 65_000);
    }

    #[test]
    fn test_independent_donor_volumes() {
        // Test: Two different donors' volumes are tracked independently
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let donor_1 = Address::generate(&env);
        let donor_2 = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&donor_1, &100_000);
        token_admin.mint(&donor_2, &100_000);

        // Donor 1 creates stream: 40,000
        client.create_stream(&donor_1, &recipient, &token, &40_000, &40_000, &0, &100);
        assert_eq!(client.get_donor_cumulative_volume(&donor_1), 40_000);

        // Donor 2 creates stream: 30,000
        client.create_stream(&donor_2, &recipient, &token, &30_000, &30_000, &100, &200);
        assert_eq!(client.get_donor_cumulative_volume(&donor_2), 30_000);

        // Volumes should remain independent
        assert_eq!(client.get_donor_cumulative_volume(&donor_1), 40_000);
        assert_eq!(client.get_donor_cumulative_volume(&donor_2), 30_000);
    }

    #[test]
    fn test_set_fee_tiers_admin_only() {
        // Test: Non-admin cannot update fee tiers
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let non_admin = Address::generate(&env);

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        // Create new tiers
        let mut new_tiers = SorobanVec::new(&env);
        new_tiers.push_back(FeeTier { threshold: 0, fee_rate: 300 });

        // Non-admin attempt should fail
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            env.mock_auth(&[(
                &non_admin,
                MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: &Symbol::new(&env, "set_fee_tiers"),
                    args: (&new_tiers,).into_val(&env),
                    invoke_contract: true,
                },
            )]);
            client.set_fee_tiers(&new_tiers);
        }));
        
        // We expect this to fail with Unauthorized
        assert!(result.is_err());
    }

    #[test]
    fn test_set_fee_tiers_non_monotonic_fees() {
        // Test: Setting tiers with non-monotonic fees (higher tier with higher fee) is rejected
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        // Create invalid tiers (fee increases at tier 2)
        let mut invalid_tiers = SorobanVec::new(&env);
        invalid_tiers.push_back(FeeTier { threshold: 0, fee_rate: 300 });
        invalid_tiers.push_back(FeeTier { threshold: 50_000, fee_rate: 200 });
        invalid_tiers.push_back(FeeTier { threshold: 500_000, fee_rate: 400 }); // Invalid: fee increased

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.set_fee_tiers(&invalid_tiers);
        }));
        
        // Should fail with TierFeeNotMonotonic
        assert!(result.is_err());
    }

    #[test]
    fn test_set_fee_tiers_first_tier_threshold_zero() {
        // Test: First tier must have threshold 0
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        // Create invalid tiers (first tier threshold is not 0)
        let mut invalid_tiers = SorobanVec::new(&env);
        invalid_tiers.push_back(FeeTier { threshold: 100, fee_rate: 300 }); // Invalid: not 0

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.set_fee_tiers(&invalid_tiers);
        }));
        
        // Should fail with InvalidTierConfiguration
        assert!(result.is_err());
    }

    #[test]
    fn test_get_fee_tiers() {
        // Test: get_fee_tiers returns the configured tier structure
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        // Get default tiers (should be initialized in init)
        let tiers = client.get_fee_tiers();
        
        assert_eq!(tiers.len(), 3);
        
        // Verify default tier structure
        let tier_0 = tiers.get(0).unwrap();
        assert_eq!(tier_0.threshold, 0);
        assert_eq!(tier_0.fee_rate, 500);

        let tier_1 = tiers.get(1).unwrap();
        assert_eq!(tier_1.threshold, 50_000);
        assert_eq!(tier_1.fee_rate, 250);

        let tier_2 = tiers.get(2).unwrap();
        assert_eq!(tier_2.threshold, 500_000);
        assert_eq!(tier_2.fee_rate, 100);
    }

    #[test]
    fn test_fee_tier_boundary_exact() {
        // Test: A donor exactly at a tier threshold qualifies for that tier
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let donor = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&donor, &100_000);

        // Create stream with exactly 50,000 (should qualify for tier 1)
        let stream_id = client.create_stream(
            &donor,
            &recipient,
            &token,
            &50_000,
            &50_000,
            &0,
            &100,
        );

        env.ledger().set_timestamp(50);
        let available = client.withdrawable_amount(&stream_id);
        
        // Cumulative volume is exactly 50,000 (qualifies for tier 1: 250 bps)
        // Available at time 50: 50,000 * 50 / 100 = 25,000
        // Fee = 25,000 * 250 / 10000 = 625
        client.withdraw(&stream_id, &available);

        let token_client = token::Client::new(&env, &token);
        // Recipient should receive: 25,000 - 625 = 24,375
        assert_eq!(token_client.balance(&recipient), 24_375);
        // Fee collector should receive: 625
        assert_eq!(token_client.balance(&fee_collector), 625);
    }

    #[test]
    fn test_arithmetic_overflow_checked() {
        // Test: Very large volume amounts use checked arithmetic
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let donor = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        // Mint a very large amount
        token_admin.mint(&donor, &i128::MAX);

        // Create a stream with a large but valid amount
        let large_amount = i128::MAX / 2;
        let stream_id = client.create_stream(
            &donor,
            &recipient,
            &token,
            &large_amount,
            &large_amount,
            &0,
            &100,
        );

        // Cumulative volume should be recorded safely
        let volume = client.get_donor_cumulative_volume(&donor);
        assert_eq!(volume, large_amount);

        env.ledger().set_timestamp(50);
        let available = client.withdrawable_amount(&stream_id);
        
        // Withdraw should work with large amounts
        client.withdraw(&stream_id, &available);

        let token_client = token::Client::new(&env, &token);
        // Check that balances are consistent (no overflow)
        let recipient_balance = token_client.balance(&recipient);
        assert!(recipient_balance > 0);
    }

    #[test]
    fn test_default_tiers_initialized_on_init() {
        // Test: Default fee tiers are properly initialized
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let tiers = client.get_fee_tiers();
        
        // Should have 3 default tiers
        assert_eq!(tiers.len(), 3);
        
        // Verify they are monotonically non-increasing
        let mut prev_fee = u32::MAX;
        for i in 0..tiers.len() {
            let tier = tiers.get(i).unwrap();
            assert!(tier.fee_rate <= prev_fee);
            prev_fee = tier.fee_rate;
        }
    }

    #[test]
    fn test_withdraw_max() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);


        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
        );

        env.ledger().set_timestamp(100);

        client.withdraw_max(&stream_id);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.status, StreamStatus::Completed);

        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&recipient), 1000);
    }

    #[test]
    fn test_pause_stream() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
        );

        client.pause_stream(&stream_id);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.status, StreamStatus::Paused);
    }

    #[test]
    fn test_resume_stream() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
        );

        client.pause_stream(&stream_id);
        client.resume_stream(&stream_id);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.status, StreamStatus::Active);
    }

    #[test]
    fn test_set_delegate() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let delegate = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
        );

        client.set_delegate(&stream_id, &delegate);

        let retrieved_delegate = client.get_delegate(&stream_id);
        assert_eq!(retrieved_delegate, Some(delegate));
    }

    #[test]
    fn test_cancel_stream() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(
            &sender,
            &recipient,
            &token,
            &1000,
            &500,
            &0,
            &100,
        );

        client.cancel_stream(&stream_id);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.status, StreamStatus::Canceled);

        let token_client = token::Client::new(&env, &token);
        // Sender should receive refund of remaining balance (500)
        assert_eq!(token_client.balance(&sender), 500);
    }
}
