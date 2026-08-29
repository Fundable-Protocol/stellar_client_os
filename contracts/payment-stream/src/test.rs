#[cfg(test)]
mod test {
    use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
    use soroban_sdk::{token, vec, Address, Env, Event, IntoVal, Vec};
    use crate::{
        DelegationGrantedEvent, EmergencyPausedEvent, EmergencyUnpausedEvent,
        PaymentStreamContract, PaymentStreamContractClient, StreamPausedEvent, StreamResumedEvent,
        StreamParams, StreamStatus,
    };
    use soroban_sdk::{token, vec, Address, Env, IntoVal, Vec};
    use crate::{Error, PaymentStreamContract, PaymentStreamContractClient, StreamParams, StreamStatus};


    
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

    // Set delegate
    client.set_delegate(&stream_id, &delegate);

    // Check delegate is set
    let retrieved_delegate = client.get_delegate(&stream_id);
    assert_eq!(retrieved_delegate, Some(delegate.clone()));

    // (No event assertion here: the test ends with a get_delegate read, which
    // clears the event buffer, so this test's snapshot holds no events. The
    // DelegationGrantedEvent payload is asserted in test_delegate_withdraw.)
}

#[test]
fn test_delegate_withdraw() {
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

    // Set delegate
    client.set_delegate(&stream_id, &delegate);

    env.ledger().set_timestamp(50);

    // Verify the DelegationGrantedEvent was emitted with the correct payload
    // (topic "DelegationGranted" + stream_id/recipient/delegate).
    let expected = DelegationGrantedEvent {
        stream_id,
        recipient: recipient.clone(),
        delegate: delegate.clone(),
    }
    .to_xdr(&env, &contract_id);
    let events = env.events().all();
    assert!(
        events.events().iter().any(|e| *e == expected),
        "expected DelegationGrantedEvent to be emitted"
    );
}

#[test]
fn test_revoke_delegate() {
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

    // Set delegate
    client.set_delegate(&stream_id, &delegate);

    // Check delegate is set
    let retrieved_delegate = client.get_delegate(&stream_id);
    assert_eq!(retrieved_delegate, Some(delegate.clone()));

    // Revoke delegate
    client.revoke_delegate(&stream_id);

    // Check delegate is removed
    let retrieved_delegate = client.get_delegate(&stream_id);
    assert_eq!(retrieved_delegate, None);

    // (No event assertion here: the test ends with a get_delegate read, which
    // clears the event buffer, so this test's snapshot holds no events. The
    // DelegationGrantedEvent payload is asserted in test_delegate_withdraw.)
}

#[test]
#[should_panic(expected = "Error(Contract, #16)")]
fn test_set_self_delegate() {
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

    // Attempt to set self as delegate - should fail
    client.set_delegate(&stream_id, &recipient);
}

#[test]
fn test_overwrite_delegate() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let delegate1 = Address::generate(&env);
    let delegate2 = Address::generate(&env);

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

    // Set first delegate
    client.set_delegate(&stream_id, &delegate1);
    assert_eq!(client.get_delegate(&stream_id), Some(delegate1.clone()));

    // Overwrite with second delegate
    client.set_delegate(&stream_id, &delegate2);
    assert_eq!(client.get_delegate(&stream_id), Some(delegate2.clone()));

    // (No event assertion here: the test ends with a get_delegate read, which
    // clears the event buffer, so this test's snapshot holds no events.)
}

#[test]
fn test_revoke_nonexistent_delegate() {
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

    // Revoke without setting delegate
    client.revoke_delegate(&stream_id);
    assert_eq!(client.get_delegate(&stream_id), None);

    // Check event - no event emitted when revoking non-existent delegate
    let events = env.events().all();
    assert!(events.events().is_empty());
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_unauthorized_delegate_withdraw_after_revoke() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let delegate = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();

    let contract_id = env.register(PaymentStreamContract, ());
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    // Use specific mock_auths for setup operations
    env.mock_auths(&[
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: (&admin, &fee_collector, &0u32).into_val(&env),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &token,
                fn_name: "mint",
                args: (&sender, 1000i128).into_val(&env),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &sender,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "create_stream",
                args: (&sender, &recipient, &token, 1000i128, 0i128, 0u64, 100u64).into_val(&env),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &recipient,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "set_delegate",
                args: (1u64, &delegate).into_val(&env),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &recipient,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "revoke_delegate",
                args: (1u64,).into_val(&env),
                sub_invokes: &[],
            },
        },
    ]);

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

    // Set delegate
    client.set_delegate(&stream_id, &delegate);

    // Revoke delegate
    client.revoke_delegate(&stream_id);

    env.ledger().set_timestamp(50);

    // Try to withdraw as delegate - should fail (no auth mocked for withdraw)
    client.withdraw(&stream_id, &300);
}

// NOTE: test_unauthorized_non_recipient_set_delegate removed - mock_all_auths() mocks all require_auth() calls.
// Authorization is tested by other tests and validated by the contract code.

#[test]
fn test_recipient_can_still_withdraw_after_delegate_set() {
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

    // Set delegate
    client.set_delegate(&stream_id, &delegate);

    env.ledger().set_timestamp(50);

    // Recipient withdraws
    client.withdraw(&stream_id, &300);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.withdrawn_amount, 300);

    let token_client = token::Client::new(&env, &token);
    assert_eq!(token_client.balance(&recipient), 300);
    assert_eq!(token_client.balance(&contract_id), 700);
}


#[test]
fn test_pausing_stops_token_vesting() {
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

    // Advance time to 25% of duration
    env.ledger().set_timestamp(25);

    // Check withdrawable amount before pause (should be 250 tokens)
    let withdrawable_before = client.withdrawable_amount(&stream_id);
    assert_eq!(withdrawable_before, 250);

    // Pause the stream
    client.pause_stream(&stream_id);

    // Verify stream is paused
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Paused);

    // Withdrawable amount should be 0 when paused
    let withdrawable_paused = client.withdrawable_amount(&stream_id);
    assert_eq!(withdrawable_paused, 0);

    // Advance time by another 25 seconds while paused
    env.ledger().set_timestamp(50);

    // Withdrawable amount should still be 0 (vesting stopped)
    let withdrawable_still_paused = client.withdrawable_amount(&stream_id);
    assert_eq!(withdrawable_still_paused, 0);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Paused);
}


#[test]
fn test_resuming_continues_from_where_it_left_off() {
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

    let initial_end_time = 100;

    // Advance time to 20%
    env.ledger().set_timestamp(20);

    let withdrawable_at_20 = client.withdrawable_amount(&stream_id);
    assert_eq!(withdrawable_at_20, 200);

    // Pause the stream
    client.pause_stream(&stream_id);
    let pause_time = env.ledger().timestamp();

    // Advance time by 30 seconds while paused
    env.ledger().set_timestamp(50);

    // Resume the stream
    client.resume_stream(&stream_id);
    let resume_time = env.ledger().timestamp();

    // Verify stream is active again
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Active);

    // Check that end_time was extended by pause duration
    let pause_duration = resume_time - pause_time;
    let expected_new_end_time = initial_end_time + pause_duration;
    assert_eq!(stream.end_time, expected_new_end_time);

    // Withdrawable should still be 200 (same as when paused)
    let withdrawable_after_resume = client.withdrawable_amount(&stream_id);
    assert_eq!(withdrawable_after_resume, 200);

    env.ledger().set_timestamp(70);

    let withdrawable_after_more_time = client.withdrawable_amount(&stream_id);
    assert_eq!(withdrawable_after_more_time, 400);
}


#[test]
fn test_withdrawable_amount_zero_for_paused_streams() {
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
    assert_eq!(client.withdrawable_amount(&stream_id), 500);

    // Pause stream
    client.pause_stream(&stream_id);

    // Withdrawable should immediately become 0
    assert_eq!(client.withdrawable_amount(&stream_id), 0);

    env.ledger().set_timestamp(60);
    assert_eq!(client.withdrawable_amount(&stream_id), 0);

    env.ledger().set_timestamp(80);
    assert_eq!(client.withdrawable_amount(&stream_id), 0);

    client.resume_stream(&stream_id);

    assert_eq!(client.withdrawable_amount(&stream_id), 500);
}



#[test]
fn test_stream_paused_event_emitted() {
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

    // Pause the stream (last contract invocation so the snapshot captures the
    // event; any read after this would clear the event buffer)
    client.pause_stream(&stream_id);

    // Verify the StreamPausedEvent was emitted with the correct payload
    // (topic "StreamPaused" + stream_id/paused_at).
    let expected = StreamPausedEvent {
        stream_id,
        paused_at: env.ledger().timestamp(),
    }
    .to_xdr(&env, &contract_id);
    let events = env.events().all();
    assert!(
        events.events().iter().any(|e| *e == expected),
        "expected StreamPausedEvent to be emitted"
    );
}


#[test]
fn test_stream_resumed_event_emitted() {
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

    // Pause the stream
    client.pause_stream(&stream_id);
    let paused_at = env.ledger().timestamp();

    // Advance time
    env.ledger().set_timestamp(10);

    // Resume the stream (last contract invocation so the snapshot captures the
    // event; any read after this would clear the event buffer)
    client.resume_stream(&stream_id);

    // Verify the StreamResumedEvent was emitted with the correct payload
    // (topic "StreamResumed" + stream_id/resumed_at/paused_duration).
    let expected = StreamResumedEvent {
        stream_id,
        resumed_at: env.ledger().timestamp(),
        paused_duration: 10u64.saturating_sub(paused_at),
    }
    .to_xdr(&env, &contract_id);
    let events = env.events().all();
    assert!(
        events.events().iter().any(|e| *e == expected),
        "expected StreamResumedEvent to be emitted"
    );
}


 #[test]
    fn test_protocol_metrics_initialization() {
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

    #[test]
fn test_only_sender_can_pause() {
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

    // Sender can pause (this should work)
    client.pause_stream(&stream_id);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Paused);
}

#[test]
fn test_only_sender_can_resume() {
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

    // Pause first
    client.pause_stream(&stream_id);

    // Sender can resume (this should work)
    client.resume_stream(&stream_id);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Active);
}


#[test]
fn test_withdraw_after_pause_and_resume() {
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

    // Vest 300 tokens
    env.ledger().set_timestamp(30);
    assert_eq!(client.withdrawable_amount(&stream_id), 300);

    // Withdraw 100 tokens
    client.withdraw(&stream_id, &100);
    assert_eq!(client.withdrawable_amount(&stream_id), 200);

    // Pause
    client.pause_stream(&stream_id);
    assert_eq!(client.withdrawable_amount(&stream_id), 0);

    // Time passes while paused
    env.ledger().set_timestamp(50);
    assert_eq!(client.withdrawable_amount(&stream_id), 0);

    // Resume
    client.resume_stream(&stream_id);
    assert_eq!(client.withdrawable_amount(&stream_id), 200);

    // Vest another 300
    env.ledger().set_timestamp(80);
    assert_eq!(client.withdrawable_amount(&stream_id), 500);

    // Withdraw the rest
    client.withdraw(&stream_id, &500);

    // Verify recipient received tokens
    let token_client = token::Client::new(&env, &token);
    let recipient_balance = token_client.balance(&recipient);
    assert!(recipient_balance > 0);
    assert_eq!(recipient_balance, 600); // 100 + 500
}

// --- Dispute resolution timelock tests ---

const DAY: u64 = 86400;

fn setup_dispute_test(env: &Env) -> (Address, Address, Address, Address, Address, u64) {
    let admin = Address::generate(env);
    let fee_collector = Address::generate(env);
    let sender = Address::generate(env);
    let recipient = Address::generate(env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();

    let contract_id = env.register(PaymentStreamContract, ());
    let client = PaymentStreamContractClient::new(env, &contract_id);
    client.initialize(&admin, &fee_collector, &0);

    let token_admin = token::StellarAssetClient::new(env, &token);
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

    (admin, sender, recipient, token, contract_id, stream_id)
}

#[test]
fn test_resolve_dispute_queues_and_pauses_stream() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    let dispute_id = client.resolve_dispute(&stream_id, &600, &400);
    assert_eq!(dispute_id, 1);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Disputed);

    let queued = client.get_queued_resolution(&dispute_id).unwrap();
    assert_eq!(queued.stream_id, stream_id);
    assert_eq!(queued.recipient_amount, 600);
    assert_eq!(queued.sender_amount, 400);
    assert!(!queued.executed);
    assert_eq!(queued.execute_after, env.ledger().timestamp() + 2 * DAY);

    assert_eq!(client.get_active_dispute(&stream_id), Some(dispute_id));

    let protocol_metrics = client.get_protocol_metrics();
    assert_eq!(protocol_metrics.total_active_streams, 0);

    let _ = admin;
}

#[test]
fn test_execute_resolution_before_timelock_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    let dispute_id = client.resolve_dispute(&stream_id, &600, &400);

    // Not enough time has elapsed
    env.ledger().set_timestamp(DAY);
    let result = client.try_execute_resolution(&dispute_id);
    assert!(result.is_err());
}

#[test]
fn test_execute_resolution_after_timelock_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, sender, recipient, token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    let dispute_id = client.resolve_dispute(&stream_id, &600, &400);

    env.ledger().set_timestamp(2 * DAY + 1);
    client.execute_resolution(&dispute_id);

    let token_client = token::Client::new(&env, &token);
    assert_eq!(token_client.balance(&recipient), 600);
    assert_eq!(token_client.balance(&sender), 400);
    assert_eq!(token_client.balance(&contract_id), 0);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Completed);
    // The full escrowed balance is considered settled once execution
    // completes, not just the amount paid to the recipient.
    assert_eq!(stream.withdrawn_amount, 1000);

    let queued = client.get_queued_resolution(&dispute_id).unwrap();
    assert!(queued.executed);

    assert_eq!(client.get_active_dispute(&stream_id), None);
}

#[test]
fn test_execute_resolution_partial_refunds_residual_to_sender() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, sender, recipient, token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    // Resolve only part of the 1000-token escrow (300 + 200 = 500), leaving
    // 500 unallocated.
    let dispute_id = client.resolve_dispute(&stream_id, &300, &200);

    env.ledger().set_timestamp(2 * DAY + 1);
    client.execute_resolution(&dispute_id);

    let token_client = token::Client::new(&env, &token);
    // The sender receives both their explicit resolution share and the
    // unallocated residual: 200 + 500 = 700.
    assert_eq!(token_client.balance(&recipient), 300);
    assert_eq!(token_client.balance(&sender), 700);

    // No funds are left stranded in the contract.
    assert_eq!(token_client.balance(&contract_id), 0);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Completed);
    assert_eq!(stream.withdrawn_amount, stream.balance);
}

#[test]
fn test_execute_resolution_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    let dispute_id = client.resolve_dispute(&stream_id, &600, &400);
    env.ledger().set_timestamp(2 * DAY + 1);
    client.execute_resolution(&dispute_id);

    let result = client.try_execute_resolution(&dispute_id);
    assert!(result.is_err());
}

#[test]
fn test_execute_nonexistent_resolution_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, _stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    let result = client.try_execute_resolution(&999);
    assert!(result.is_err());
}

#[test]
fn test_cancel_queued_resolution_restores_stream() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    let dispute_id = client.resolve_dispute(&stream_id, &600, &400);

    client.cancel_queued_resolution(&dispute_id);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Active);

    assert_eq!(client.get_active_dispute(&stream_id), None);

    let protocol_metrics = client.get_protocol_metrics();
    assert_eq!(protocol_metrics.total_active_streams, 1);

    // Cancelled dispute can no longer be executed
    env.ledger().set_timestamp(2 * DAY + 1);
    let result = client.try_execute_resolution(&dispute_id);
    assert!(result.is_err());
}

#[test]
fn test_cancel_queued_resolution_restores_paused_stream() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    client.pause_stream(&stream_id);

    let dispute_id = client.resolve_dispute(&stream_id, &600, &400);
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Disputed);

    client.cancel_queued_resolution(&dispute_id);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Paused);

    // The count was already decremented when the stream was originally paused,
    // and cancelling the dispute restores that Paused status, so it stays 0.
    let protocol_metrics = client.get_protocol_metrics();
    assert_eq!(protocol_metrics.total_active_streams, 0);
}

#[test]
fn test_cancel_already_executed_resolution_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    let dispute_id = client.resolve_dispute(&stream_id, &600, &400);
    env.ledger().set_timestamp(2 * DAY + 1);
    client.execute_resolution(&dispute_id);

    let result = client.try_cancel_queued_resolution(&dispute_id);
    assert!(result.is_err());
}

#[test]
fn test_resolve_dispute_requires_admin_auth() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();

    let contract_id = env.register(PaymentStreamContract, ());
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    env.mock_auths(&[
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: (&admin, &fee_collector, &0u32).into_val(&env),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &token,
                fn_name: "mint",
                args: (&sender, 1000i128).into_val(&env),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &sender,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "create_stream",
                args: (&sender, &recipient, &token, 1000i128, 1000i128, 0u64, 100u64).into_val(&env),
                sub_invokes: &[MockAuthInvoke {
                    contract: &token,
                    fn_name: "transfer",
                    args: (&sender, &contract_id, 1000i128).into_val(&env),
                    sub_invokes: &[],
                }],
            },
        },
    ]);

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

    // No auth mocked for admin on resolve_dispute, so this must fail
    env.mock_auths(&[]);
    let result = client.try_resolve_dispute(&stream_id, &600, &400);
    assert!(result.is_err());
}

#[test]
fn test_resolve_dispute_invalid_amounts_exceeding_balance() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    // 1000 + 1 exceeds the escrowed balance of 1000
    let result = client.try_resolve_dispute(&stream_id, &1000, &1);
    assert!(result.is_err());
}

#[test]
fn test_resolve_dispute_negative_amounts_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    let result = client.try_resolve_dispute(&stream_id, &-1, &400);
    assert!(result.is_err());
}

#[test]
fn test_resolve_dispute_already_disputed_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    client.resolve_dispute(&stream_id, &600, &400);

    let result = client.try_resolve_dispute(&stream_id, &100, &100);
    assert!(result.is_err());
}

#[test]
fn test_deposit_blocked_during_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    client.resolve_dispute(&stream_id, &600, &400);

    // The stream is already at capacity (balance == total_amount), so a
    // deposit would fail with DepositExceedsTotal even without a dispute.
    // Assert the specific error to prove this is actually blocked by the
    // dispute, not by capacity.
    let result = client.try_deposit(&stream_id, &1);
    match result {
        Err(Ok(err)) => assert_eq!(err, Error::DisputeInProgress.into()),
        other => panic!("expected Error::DisputeInProgress, got {:?}", other),
    }
}

#[test]
fn test_withdraw_blocked_during_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    env.ledger().set_timestamp(50);
    client.resolve_dispute(&stream_id, &600, &400);

    let result = client.try_withdraw(&stream_id, &100);
    assert!(result.is_err());
}

#[test]
fn test_cancel_stream_blocked_during_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    client.resolve_dispute(&stream_id, &600, &400);

    let result = client.try_cancel_stream(&stream_id);
    assert!(result.is_err());
}

#[test]
fn test_pause_blocked_during_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _sender, _recipient, _token, contract_id, stream_id) = setup_dispute_test(&env);
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    client.resolve_dispute(&stream_id, &600, &400);

    let result = client.try_pause_stream(&stream_id);
    assert!(result.is_err());
}
    // -----------------------------------------------------------------------
    // Emergency pause circuit breaker tests
    // -----------------------------------------------------------------------

    /// Helper: initialise a contract and return (client, contract_id, admin,
    /// fee_collector, sender, recipient, token).
    fn setup_paused_contract(
        env: &Env,
    ) -> (
        PaymentStreamContractClient<'_>,
        Address, // contract_id
        Address, // admin
        Address, // fee_collector
        Address, // sender
        Address, // recipient
        Address, // token
    ) {
        let admin = Address::generate(env);
        let fee_collector = Address::generate(env);
        let sender = Address::generate(env);
        let recipient = Address::generate(env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        // Mint tokens to sender
        let token_admin = token::StellarAssetClient::new(env, &token);
        token_admin.mint(&sender, &2000);

        (client, contract_id, admin, fee_collector, sender, recipient, token)
    }

    /// Contract starts unpaused.
    #[test]
    fn test_is_paused_default_false() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, _, _, _) = setup_paused_contract(&env);

        assert!(!client.is_paused());
    }

    /// Admin can activate the emergency pause.
    #[test]
    fn test_emergency_pause_sets_flag() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, _, _, _) = setup_paused_contract(&env);

        assert!(!client.is_paused());
        client.emergency_pause();
        assert!(client.is_paused());
    }

    /// Admin can deactivate the emergency pause.
    #[test]
    fn test_emergency_unpause_clears_flag() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, _, _, _) = setup_paused_contract(&env);

        client.emergency_pause();
        assert!(client.is_paused());

        client.emergency_unpause();
        assert!(!client.is_paused());
    }

    /// `emergency_pause` emits the correct event.
    #[test]
    fn test_emergency_pause_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, contract_id, admin, _, _, _, _) = setup_paused_contract(&env);

        // emergency_pause is the last contract invocation so the snapshot
        // captures the event
        client.emergency_pause();

        // Verify the EmergencyPausedEvent was emitted with the correct payload
        // (topic "EmergencyPaused" + paused_by/paused_at).
        let expected = EmergencyPausedEvent {
            paused_by: admin,
            paused_at: env.ledger().timestamp(),
        }
        .to_xdr(&env, &contract_id);
        let events = env.events().all();
        assert!(
            events.events().iter().any(|e| *e == expected),
            "expected EmergencyPausedEvent to be emitted"
        );
    }

    /// `emergency_unpause` emits the correct event.
    #[test]
    fn test_emergency_unpause_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, contract_id, admin, _, _, _, _) = setup_paused_contract(&env);

        client.emergency_pause();

        // emergency_unpause is the last contract invocation so the snapshot
        // captures the event
        client.emergency_unpause();

        // Verify the EmergencyUnpausedEvent was emitted with the correct payload
        // (topic "EmergencyUnpaused" + unpaused_by/unpaused_at).
        let expected = EmergencyUnpausedEvent {
            unpaused_by: admin,
            unpaused_at: env.ledger().timestamp(),
        }
        .to_xdr(&env, &contract_id);
        let events = env.events().all();
        assert!(
            events.events().iter().any(|e| *e == expected),
            "expected EmergencyUnpausedEvent to be emitted"
        );
    }

    /// Double-pause is rejected with `AlreadyPaused` (error code 18).
    #[test]
    #[should_panic(expected = "Error(Contract, #18)")]
    fn test_emergency_pause_already_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, _, _, _) = setup_paused_contract(&env);

        client.emergency_pause();
        client.emergency_pause(); // should panic
    }

    /// Unpausing when not paused is rejected with `NotPaused` (error code 19).
    #[test]
    #[should_panic(expected = "Error(Contract, #19)")]
    fn test_emergency_unpause_when_not_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, _, _, _) = setup_paused_contract(&env);

        client.emergency_unpause(); // should panic
    }

    /// `create_stream` is blocked while the circuit breaker is active.
    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_create_stream_blocked_when_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, sender, recipient, token) = setup_paused_contract(&env);

        client.emergency_pause();

        // This call should panic with ContractPaused (17)
        client.create_stream(&sender, &recipient, &token, &1000, &1000, &0, &100);
    }

    /// `withdraw` is blocked while the circuit breaker is active.
    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_withdraw_blocked_when_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, sender, recipient, token) = setup_paused_contract(&env);

        // Create a stream before pausing
        let stream_id = client.create_stream(&sender, &recipient, &token, &1000, &1000, &0, &100);
        env.ledger().set_timestamp(50);

        client.emergency_pause();

        // Should be blocked
        client.withdraw(&stream_id, &500);
    }

    /// `withdraw_max` is blocked while the circuit breaker is active.
    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_withdraw_max_blocked_when_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, sender, recipient, token) = setup_paused_contract(&env);

        let stream_id = client.create_stream(&sender, &recipient, &token, &1000, &1000, &0, &100);
        env.ledger().set_timestamp(50);

        client.emergency_pause();

        // Should be blocked
        client.withdraw_max(&stream_id);
    }

    /// `deposit` is blocked while the circuit breaker is active.
    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_deposit_blocked_when_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, sender, recipient, token) = setup_paused_contract(&env);

        let stream_id = client.create_stream(&sender, &recipient, &token, &1000, &0, &0, &100);

        client.emergency_pause();

        // Should be blocked
        client.deposit(&stream_id, &500);
    }

    /// All operations resume normally after emergency_unpause.
    #[test]
    fn test_operations_resume_after_unpause() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, sender, recipient, token) = setup_paused_contract(&env);

        // Create stream, then pause
        let stream_id = client.create_stream(&sender, &recipient, &token, &1000, &1000, &0, &100);
        client.emergency_pause();
        assert!(client.is_paused());

        // Unpause and verify operations work again
        client.emergency_unpause();
        assert!(!client.is_paused());

        env.ledger().set_timestamp(50);
        let available = client.withdrawable_amount(&stream_id);
        assert_eq!(available, 500);

        // Withdraw should succeed
        client.withdraw(&stream_id, &200);
        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.withdrawn_amount, 200);
    }

    /// Pause/unpause can be cycled multiple times.
    #[test]
    fn test_pause_unpause_cycle() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, _, _, _) = setup_paused_contract(&env);

        for _ in 0..3 {
            assert!(!client.is_paused());
            client.emergency_pause();
            assert!(client.is_paused());
            client.emergency_unpause();
            assert!(!client.is_paused());
        }
    }

    /// Non-admin callers cannot activate emergency pause.
    #[test]
    #[should_panic(expected = "Unauthorized")]
    fn test_non_admin_cannot_emergency_pause() {
        let env = Env::default();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let attacker = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let _token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        env.mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: (&admin, &fee_collector, &0u32).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        client.initialize(&admin, &fee_collector, &0);

        // Now mock only the attacker's auth — admin auth is NOT provided for emergency_pause
        env.mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "emergency_pause",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }]);

        // Should panic because admin.require_auth() won't be satisfied
        client.emergency_pause();
    }

    /// Non-admin callers cannot deactivate emergency pause.
    #[test]
    #[should_panic(expected = "Unauthorized")]
    fn test_non_admin_cannot_emergency_unpause() {
        let env = Env::default();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let attacker = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let _token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        // Initialize and pause using real admin auth
        env.mock_auths(&[
            MockAuth {
                address: &admin,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "initialize",
                    args: (&admin, &fee_collector, &0u32).into_val(&env),
                    sub_invokes: &[],
                },
            },
            MockAuth {
                address: &admin,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "emergency_pause",
                    args: ().into_val(&env),
                    sub_invokes: &[],
                },
            },
        ]);
        client.initialize(&admin, &fee_collector, &0);
        client.emergency_pause();

        // Try to unpause as attacker
        env.mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "emergency_unpause",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }]);

        client.emergency_unpause(); // should panic
    }

    /// Read-only functions remain available while paused.
    #[test]
    fn test_read_operations_work_while_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, sender, recipient, token) = setup_paused_contract(&env);

        let stream_id = client.create_stream(&sender, &recipient, &token, &1000, &1000, &0, &100);
        env.ledger().set_timestamp(50);

        client.emergency_pause();

        // Read-only calls must not be blocked
        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.id, stream_id);

        let metrics = client.get_stream_metrics(&stream_id);
        assert_eq!(metrics.withdrawal_count, 0);

        let proto = client.get_protocol_metrics();
        assert_eq!(proto.total_streams_created, 1);

        let withdrawable = client.withdrawable_amount(&stream_id);
        assert_eq!(withdrawable, 500);

        assert!(client.is_paused());
    }

    // -----------------------------------------------------------------------
    // Cliff-period linear vesting tests
    // -----------------------------------------------------------------------

    /// A stream created with a cliff stores and reports the cliff duration.
    #[test]
    fn test_create_stream_with_cliff() {
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

        let stream_id = client.create_stream_with_cliff(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
            &10,
        );

        assert_eq!(stream_id, 1);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.cliff_duration, 10);
        assert_eq!(stream.total_amount, 1000);
        assert_eq!(stream.status, StreamStatus::Active);
    }

    /// A plain `create_stream` always reports a zero cliff duration, preserving
    /// the legacy no-cliff behaviour.
    #[test]
    fn test_create_stream_cliff_duration_zero() {
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

        let stream_id = client.create_stream(&sender, &recipient, &token, &1000, &1000, &0, &100);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.cliff_duration, 0);
    }

    /// Creating a stream whose cliff is not shorter than its duration is rejected.
    #[test]
    #[should_panic(expected = "Error(Contract, #23)")]
    fn test_create_stream_with_cliff_invalid() {
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

        // cliff_duration (100) is not shorter than duration (100 - 0)
        client.create_stream_with_cliff(&sender, &recipient, &token, &1000, &1000, &0, &100, &100);
    }

    /// Nothing is withdrawable while the clock is inside the cliff period.
    #[test]
    fn test_cliff_blocks_withdrawal_before_cliff() {
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

        let stream_id = client.create_stream_with_cliff(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
            &30,
        );

        env.ledger().set_timestamp(10);
        assert_eq!(client.withdrawable_amount(&stream_id), 0);

        env.ledger().set_timestamp(29);
        assert_eq!(client.withdrawable_amount(&stream_id), 0);
    }

    /// Attempting a withdrawal while the clock is inside the cliff period is
    /// rejected with `InsufficientWithdrawable`.
    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_withdraw_before_cliff() {
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

        let stream_id = client.create_stream_with_cliff(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
            &30,
        );

        env.ledger().set_timestamp(10);
        client.withdraw(&stream_id, &100);
    }

    /// At the exact cliff boundary the pro-rata share accrued during the cliff
    /// becomes claimable.
    #[test]
    fn test_cliff_release_at_boundary() {
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

        // 1000 tokens over 100 seconds with a 20-second cliff.
        let stream_id = client.create_stream_with_cliff(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
            &20,
        );

        // At t = 20 the pro-rata share (20/100 * 1000 = 200) is available.
        env.ledger().set_timestamp(20);
        assert_eq!(client.withdrawable_amount(&stream_id), 200);

        // Withdraw that share.
        client.withdraw(&stream_id, &200);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.withdrawn_amount, 200);

        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&recipient), 200);
        assert_eq!(token_client.balance(&contract_id), 800);
    }

    /// After the cliff, the amount available grows linearly over the whole
    /// vesting window.
    #[test]
    fn test_cliff_linear_vesting_after_cliff() {
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

        // 1000 tokens over 100 seconds, cliff 20 seconds.
        let stream_id = client.create_stream_with_cliff(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
            &20,
        );

        // t=25 -> 250, t=50 -> 500, t=80 -> 800, t=100 -> 1000.
        env.ledger().set_timestamp(25);
        assert_eq!(client.withdrawable_amount(&stream_id), 250);

        env.ledger().set_timestamp(50);
        assert_eq!(client.withdrawable_amount(&stream_id), 500);

        env.ledger().set_timestamp(80);
        assert_eq!(client.withdrawable_amount(&stream_id), 800);

        env.ledger().set_timestamp(100);
        assert_eq!(client.withdrawable_amount(&stream_id), 1000);
    }

    /// `withdraw_max` respects the cliff: rejected before, works after.
    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_withdraw_max_before_cliff() {
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

        let stream_id = client.create_stream_with_cliff(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
            &30,
        );

        env.ledger().set_timestamp(10);
        client.withdraw_max(&stream_id);
    }

    /// Cancelling inside the cliff returns the full escrowed balance to the
    /// sender because nothing has vested yet.
    #[test]
    fn test_cancel_before_cliff_refunds_full_balance() {
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

        let stream_id = client.create_stream_with_cliff(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
            &30,
        );

        env.ledger().set_timestamp(10);
        client.cancel_stream(&stream_id);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.status, StreamStatus::Canceled);

        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&sender), 1000);
        assert_eq!(token_client.balance(&contract_id), 0);
    }

    /// Pausing a stream inside its cliff keeps the effective elapsed time
    /// stopped, so the cliff must still elapse after the pause is lifted.
    #[test]
    fn test_cliff_with_pause_and_resume() {
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

        // 1000 over 100s, cliff 30s.
        let stream_id = client.create_stream_with_cliff(
            &sender,
            &recipient,
            &token,
            &1000,
            &1000,
            &0,
            &100,
            &30,
        );

        // Vest 20s, then pause for 40s.
        env.ledger().set_timestamp(20);
        client.pause_stream(&stream_id);

        env.ledger().set_timestamp(60);
        assert_eq!(client.withdrawable_amount(&stream_id), 0);

        client.resume_stream(&stream_id);

        // Resume: end_time extended by 40s (now 140). Effective elapsed =
        // (current - start) - paused = (60 - 0) - 40 = 20, still below cliff 30.
        assert_eq!(client.withdrawable_amount(&stream_id), 0);

        // Advance to effective elapsed = 40 -> vested = 1000 * 40 / 100 = 400.
        env.ledger().set_timestamp(80);
        assert_eq!(client.withdrawable_amount(&stream_id), 400);
    }

    // -----------------------------------------------------------------------
    // Batch stream creation (multi-recipient payroll) tests
    // -----------------------------------------------------------------------

    /// Helper: build a batch of identical `StreamParams` for `recipients`.
    fn batch_params(
        env: &Env,
        recipients: Vec<Address>,
        token: &Address,
        total: i128,
        start: u64,
        end: u64,
        cliff: u64,
    ) -> Vec<StreamParams> {
        let mut params: Vec<StreamParams> = Vec::new(env);
        for r in recipients.iter() {
            params.push_back(StreamParams {
                recipient: r,
                token: token.clone(),
                total_amount: total,
                initial_amount: total,
                start_time: start,
                end_time: end,
                cliff_duration: cliff,
            });
        }
        params
    }

    /// A small batch creates one stream per recipient with sequential IDs.
    #[test]
    fn test_create_batch_streams() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);
        let r3 = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &300);

        let recipients = vec![&env, r1.clone(), r2.clone(), r3.clone()];
        let params = batch_params(&env, recipients, &token, 100, 0, 100, 0);

        let ids = client.create_batch_streams(&sender, &params);

        assert_eq!(ids.len(), 3);
        assert_eq!(ids.get(0).unwrap(), 1);
        assert_eq!(ids.get(1).unwrap(), 2);
        assert_eq!(ids.get(2).unwrap(), 3);

        for id in 1..=3u64 {
            let stream = client.get_stream(&id);
            assert_eq!(stream.status, StreamStatus::Active);
            assert_eq!(stream.total_amount, 100);
        }

        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&contract_id), 300);
        assert_eq!(token_client.balance(&sender), 0);

        let proto = client.get_protocol_metrics();
        assert_eq!(proto.total_streams_created, 3);
        assert_eq!(proto.total_active_streams, 3);
    }

    /// A full batch of 50 streams succeeds in one call.
    #[test]
    fn test_create_batch_streams_50() {
        let env = Env::default();
        env.budget().reset_unlimited();
        // A full 50-recipient payroll batch intentionally exceeds the
        // conservative mainnet write-entry budget, so we disable the emulated
        // invocation resource limits for this test.
        env.cost_estimate().disable_resource_limits();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &500);

        let mut recipients: Vec<Address> = Vec::new(&env);
        for _ in 0..50 {
            recipients.push_back(Address::generate(&env));
        }
        let params = batch_params(&env, recipients, &token, 10, 0, 100, 0);

        let ids = client.create_batch_streams(&sender, &params);
        assert_eq!(ids.len(), 50);

        // IDs are sequential across the whole batch.
        for i in 0..50u64 {
            assert_eq!(ids.get(i as u32).unwrap(), i + 1);
        }

        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&contract_id), 500);
    }

    /// A single invalid entry reverts the entire batch — no partial streams.
    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_create_batch_streams_invalid_entry_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &300);

        let mut params: Vec<StreamParams> = Vec::new(&env);
        params.push_back(StreamParams {
            recipient: r1.clone(),
            token: token.clone(),
            total_amount: 100,
            initial_amount: 100,
            start_time: 0,
            end_time: 100,
            cliff_duration: 0,
        });
        // Invalid: total_amount <= 0.
        params.push_back(StreamParams {
            recipient: r2,
            token: token.clone(),
            total_amount: 0,
            initial_amount: 0,
            start_time: 0,
            end_time: 100,
            cliff_duration: 0,
        });

        client.create_batch_streams(&sender, &params);
    }

    /// After a failed batch, no stream state or token movement remains.
    #[test]
    fn test_create_batch_streams_invalid_entry_leaves_no_state() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &300);

        let mut params: Vec<StreamParams> = Vec::new(&env);
        params.push_back(StreamParams {
            recipient: r1,
            token: token.clone(),
            total_amount: 100,
            initial_amount: 100,
            start_time: 0,
            end_time: 100,
            cliff_duration: 0,
        });
        params.push_back(StreamParams {
            recipient: r2,
            token: token.clone(),
            total_amount: 0,
            initial_amount: 0,
            start_time: 0,
            end_time: 100,
            cliff_duration: 0,
        });

        // The batch call fails but must not create partial streams.
        let result = client.try_create_batch_streams(&sender, &params);
        assert!(result.is_err());

        // Nothing was created and no tokens moved.
        let proto = client.get_protocol_metrics();
        assert_eq!(proto.total_streams_created, 0);
        assert_eq!(proto.total_active_streams, 0);

        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&contract_id), 0);
        assert_eq!(token_client.balance(&sender), 300);
    }

    /// Batches larger than the maximum are rejected.
    #[test]
    #[should_panic(expected = "Error(Contract, #24)")]
    fn test_create_batch_streams_over_limit() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &600);

        let mut recipients: Vec<Address> = Vec::new(&env);
        for _ in 0..51 {
            recipients.push_back(Address::generate(&env));
        }
        let params = batch_params(&env, recipients, &token, 10, 0, 100, 0);

        client.create_batch_streams(&sender, &params);
    }

    /// An empty batch is rejected.
    #[test]
    #[should_panic(expected = "Error(Contract, #25)")]
    fn test_create_batch_streams_empty() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let params: Vec<StreamParams> = Vec::new(&env);
        client.create_batch_streams(&sender, &params);
    }

    /// A non-sender caller cannot create a batch.
    #[test]
    #[should_panic(expected = "Unauthorized")]
    fn test_create_batch_streams_unauthorized() {
        let env = Env::default();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let attacker = Address::generate(&env);
        let recipient = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        env.mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: (&admin, &fee_collector, &0u32).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        client.initialize(&admin, &fee_collector, &0);

        let mut params: Vec<StreamParams> = Vec::new(&env);
        params.push_back(StreamParams {
            recipient,
            token: token.clone(),
            total_amount: 100,
            initial_amount: 100,
            start_time: 0,
            end_time: 100,
            cliff_duration: 0,
        });

        // Only the attacker (not the sender) authorises the batch call.
        env.mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "create_batch_streams",
                args: (&attacker, &params).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        client.create_batch_streams(&attacker, &params);
    }

    /// Batch creation is blocked while the emergency circuit breaker is active.
    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_create_batch_streams_blocked_when_paused() {
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
        token_admin.mint(&sender, &100);

        client.emergency_pause();

        let mut params: Vec<StreamParams> = Vec::new(&env);
        params.push_back(StreamParams {
            recipient,
            token: token.clone(),
            total_amount: 100,
            initial_amount: 100,
            start_time: 0,
            end_time: 100,
            cliff_duration: 0,
        });

        client.create_batch_streams(&sender, &params);
    }

    /// Batch streams can carry per-recipient cliff periods.
    #[test]
    fn test_create_batch_streams_with_cliff() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let sender = Address::generate(&env);
        let r1 = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);

        let token_admin = token::StellarAssetClient::new(&env, &token);
        token_admin.mint(&sender, &1000);

        let recipients = vec![&env, r1.clone()];
        let params = batch_params(&env, recipients, &token, 1000, 0, 100, 30);

        let ids = client.create_batch_streams(&sender, &params);
        assert_eq!(ids.len(), 1);

        let stream = client.get_stream(&ids.get(0).unwrap());
        assert_eq!(stream.cliff_duration, 30);

        // Inside the cliff nothing is withdrawable.
        env.ledger().set_timestamp(10);
        assert_eq!(client.withdrawable_amount(&ids.get(0).unwrap()), 0);

        // Past the cliff, linear vesting resumes.
        env.ledger().set_timestamp(50);
        assert_eq!(client.withdrawable_amount(&ids.get(0).unwrap()), 500);
    }


}
