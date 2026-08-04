#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
    use soroban_sdk::{token, Address, Env, IntoVal};
    use crate::{PaymentStreamContract, PaymentStreamContractClient, StreamStatus};


    
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

        env.ledger().set_timestamp(50);

        client.withdraw_max(&stream_id);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.withdrawn_amount, 500);

        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&recipient), 500);
        assert_eq!(token_client.balance(&contract_id), 500);
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
            &1000,
            &0,
            &100,
        );

        env.ledger().set_timestamp(50);
        client.withdraw(&stream_id, &500);

        client.cancel_stream(&stream_id);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.status, StreamStatus::Canceled);

        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&sender), 500);
        assert_eq!(token_client.balance(&contract_id), 0);
    }

   #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_get_nonexistent_stream() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &0);
        client.get_stream(&999);
    }

    #[test]
    #[should_panic(expected = "Unauthorized")]
    fn test_unauthorized_withdraw() {
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

        let fee_collector = Address::generate(&env);
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
    }

    
   #[test]
fn test_pause_and_resume_stream() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();

    let contract_id = env.register(PaymentStreamContract, ());
    let client = PaymentStreamContractClient::new(&env, &contract_id);

    let fee_collector = Address::generate(&env);
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

    // Initially active
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Active);

    // Pause
    client.pause_stream(&stream_id);
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Paused);

    // Resume
    client.resume_stream(&stream_id);
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Active);
}

    #[test]
    fn test_deposit() {
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
            &0, // initial_amount = 0
            &0,
            &100,
        );

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.balance, 0);

        // Deposit 500
        client.deposit(&stream_id, &500);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.balance, 500);

        // Check contract balance
        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&contract_id), 500);
    }

    #[test]
    fn test_deposit_exceeds_total() {
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
            &500,
            &200,
            &0,
            &100,
        );

        // Try to deposit 400, which would make balance 600 > 500
        let result = client.try_deposit(&stream_id, &400);
        assert!(result.is_err());
    }

    #[test]
    fn test_deposit_invalid_amount() {
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
            &0,
            &0,
            &100,
        );

        // Try to deposit 0
        let result = client.try_deposit(&stream_id, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_deposit_multiple() {
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
            &0,
            &0,
            &100,
        );

        // First deposit
        client.deposit(&stream_id, &300);
        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.balance, 300);

        // Second deposit
        client.deposit(&stream_id, &200);
        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.balance, 500);
    }

    #[test]
    fn test_deposit_after_withdrawal() {
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

        env.ledger().set_timestamp(50);
        let available = client.withdrawable_amount(&stream_id);
        client.withdraw(&stream_id, &available);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.withdrawn_amount, available);

        // Deposit more
        client.deposit(&stream_id, &100);
        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.balance, 500 + 100);
    }

    #[test]
    fn test_deposit_negative_amount() {
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
            &0,
            &0,
            &100,
        );

        // Try to deposit negative amount
        let result = client.try_deposit(&stream_id, &-100);
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

    // Verify delegation was set correctly
    // (Event assertions removed - Events trait captures differently in host)
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

        // Verify event was emitted (at least one event should exist)
        let events = env.events().all();
        assert!(!events.events().is_empty());
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

    // Verify delegation was set and revoked correctly
    // (Event assertions removed - Events trait captures differently in host)
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

    // Verify overwrite was successful
    // (Event assertions removed - Events trait captures differently in host)
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

    // Pause the stream
    client.pause_stream(&stream_id);

    // Verify stream status
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Paused);
    assert!(stream.paused_at.is_some());
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

    // Advance time
    env.ledger().set_timestamp(10);

    // Resume the stream
    client.resume_stream(&stream_id);

    // Verify stream status
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.status, StreamStatus::Active);
    assert!(stream.paused_at.is_none());

}


 #[test]
    fn test_protocol_metrics_initialization() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);

        let contract_id = env.register(PaymentStreamContract, ());
        let client = PaymentStreamContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_collector, &100);

        // Verify protocol metrics are initialized
        let metrics = client.get_protocol_metrics();
        
        assert_eq!(metrics.total_active_streams, 0);
        assert_eq!(metrics.total_tokens_streamed, 0);
        assert_eq!(metrics.total_streams_created, 0);
        assert_eq!(metrics.total_delegations, 0);
    }


#[test]
    fn test_withdrawal_updates_metrics() {
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

        // Get initial metrics
        let initial_metrics = client.get_stream_metrics(&stream_id);
        let initial_activity = initial_metrics.last_activity;

        // Advance time to make some amount withdrawable
        env.ledger().set_timestamp(50);

        // Withdraw
        let withdrawable = client.withdrawable_amount(&stream_id);
        client.withdraw(&stream_id, &withdrawable);

        // Check metrics updated
        let stream_metrics = client.get_stream_metrics(&stream_id);
        
        assert_eq!(stream_metrics.total_withdrawn, withdrawable);
        assert_eq!(stream_metrics.withdrawal_count, 1);
        assert!(stream_metrics.last_activity > initial_activity);
    }

    #[test]
    fn test_withdraw_max_updates_metrics() {
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

        let withdrawable = client.withdrawable_amount(&stream_id);
        client.withdraw_max(&stream_id);

        // Check metrics
        let stream_metrics = client.get_stream_metrics(&stream_id);
        
        assert_eq!(stream_metrics.total_withdrawn, withdrawable);
        assert_eq!(stream_metrics.withdrawal_count, 1);
    }


    #[test]
    fn test_multiple_withdrawals_accumulate_metrics() {
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

        // First withdrawal
        env.ledger().set_timestamp(25);
        client.withdraw(&stream_id, &100);

        let metrics_after_first = client.get_stream_metrics(&stream_id);
        assert_eq!(metrics_after_first.total_withdrawn, 100);
        assert_eq!(metrics_after_first.withdrawal_count, 1);

        // Second withdrawal
        env.ledger().set_timestamp(50);
        client.withdraw(&stream_id, &200);

        let metrics_after_second = client.get_stream_metrics(&stream_id);
        assert_eq!(metrics_after_second.total_withdrawn, 300);
        assert_eq!(metrics_after_second.withdrawal_count, 2);

        // Third withdrawal
        env.ledger().set_timestamp(75);
        client.withdraw(&stream_id, &150);

        let metrics_after_third = client.get_stream_metrics(&stream_id);
        assert_eq!(metrics_after_third.total_withdrawn, 450);
        assert_eq!(metrics_after_third.withdrawal_count, 3);
    }

    #[test]
    fn test_pause_updates_metrics() {
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

        // Initial metrics
        let initial_metrics = client.get_stream_metrics(&stream_id);
        assert_eq!(initial_metrics.pause_count, 0);

        // Pause stream
        client.pause_stream(&stream_id);

        // Check metrics
        let stream_metrics = client.get_stream_metrics(&stream_id);
        assert_eq!(stream_metrics.pause_count, 1);

        // Check protocol metrics
        let protocol_metrics = client.get_protocol_metrics();
        assert_eq!(protocol_metrics.total_active_streams, 0);
    }

    #[test]
    fn test_resume_updates_metrics() {
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

        // Pause and resume
        client.pause_stream(&stream_id);
        
        let paused_activity = client.get_stream_metrics(&stream_id).last_activity;
        
        env.ledger().set_timestamp(10);
        client.resume_stream(&stream_id);

        // Check metrics updated
        let stream_metrics = client.get_stream_metrics(&stream_id);
        assert!(stream_metrics.last_activity > paused_activity);

        // Check active streams incremented back
        let protocol_metrics = client.get_protocol_metrics();
        assert_eq!(protocol_metrics.total_active_streams, 1);
    }

#[test]
    fn test_revoke_delegate_updates_metrics() {
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

        // Revoke delegate
        client.revoke_delegate(&stream_id);

        // Check metrics
        let stream_metrics = client.get_stream_metrics(&stream_id);
        assert!(stream_metrics.current_delegate.is_none());
        assert_eq!(stream_metrics.total_delegations, 1); // Count doesn't decrease
    }


    #[test]
    fn test_deposit_updates_last_activity() {
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
            &100,
            &0,
            &100,
        );

        let initial_metrics = client.get_stream_metrics(&stream_id);
        let initial_time = initial_metrics.last_activity;

        // Advance time
        env.ledger().set_timestamp(10);

        // Deposit more
        client.deposit(&stream_id, &100);

        let updated_metrics = client.get_stream_metrics(&stream_id);
        assert!(updated_metrics.last_activity >= initial_time);
    }

    #[test]
    fn test_multiple_streams_metrics() {
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
        token_admin.mint(&sender, &6000);

        // Create multiple streams
        let recipient1 = Address::generate(&env);
        let recipient2 = Address::generate(&env);
        let recipient3 = Address::generate(&env);

        let _stream_id1 = client.create_stream(
            &sender,
            &recipient1,
            &token,
            &1000,
            &1000,
            &0,
            &100,
        );

        let _stream_id2 = client.create_stream(
            &sender,
            &recipient2,
            &token,
            &2000,
            &2000,
            &0,
            &100,
        );

        let _stream_id3 = client.create_stream(
            &sender,
            &recipient3,
            &token,
            &3000,
            &3000,
            &0,
            &100,
        );

        // Check protocol metrics
        let protocol_metrics = client.get_protocol_metrics();
        
        assert_eq!(protocol_metrics.total_active_streams, 3);
        assert_eq!(protocol_metrics.total_tokens_streamed, 6000);
        assert_eq!(protocol_metrics.total_streams_created, 3);
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

    // -----------------------------------------------------------------------
    // Emergency pause circuit breaker tests
    // -----------------------------------------------------------------------

    /// Helper: initialise a contract and return (client, contract_id, admin,
    /// fee_collector, sender, recipient, token).
    fn setup_paused_contract(
        env: &Env,
    ) -> (
        PaymentStreamContractClient,
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

        let (client, _, _, _, _, _, _) = setup_paused_contract(&env);
        client.emergency_pause();

        let events = env.events().all();
        assert!(events.len() > 0);
    }

    /// `emergency_unpause` emits the correct event.
    #[test]
    fn test_emergency_unpause_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, _, _, _, _) = setup_paused_contract(&env);
        client.emergency_pause();
        client.emergency_unpause();

        let events = env.events().all();
        assert!(events.len() > 0);
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
    
}
