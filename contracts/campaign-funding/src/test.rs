#[cfg(test)]
mod test {
    use crate::{CampaignFundingContract, CampaignFundingContractClient, CampaignStatus};
    use soroban_sdk::testutils::{Address as _, Events, Ledger};
    use soroban_sdk::{token, Address, Env};

    fn create_token_contract<'a>(
        env: &Env,
        admin: &Address,
    ) -> (Address, token::Client<'a>, token::StellarAssetClient<'a>) {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_address = sac.address();
        let token_client = token::Client::new(env, &token_address);
        let token_admin = token::StellarAssetClient::new(env, &token_address);
        (token_address, token_client, token_admin)
    }

    fn setup(env: &Env) -> (CampaignFundingContractClient<'_>, Address) {
        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (client, contract_id)
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let stored_admin = client.get_admin();
        assert_eq!(stored_admin, Some(admin));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_re_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin);
    }

    #[test]
    fn test_create_campaign() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let (token_address, _token_client, _token_admin) = create_token_contract(&env, &creator);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        assert_eq!(campaign_id, 1);

        let campaign = client.get_campaign(&campaign_id);
        assert_eq!(campaign.id, 1);
        assert_eq!(campaign.creator, creator);
        assert_eq!(campaign.token, token_address);
        assert_eq!(campaign.goal_amount, 1000);
        assert_eq!(campaign.total_raised, 0);
        assert_eq!(campaign.deadline, deadline);
        assert_eq!(campaign.status, CampaignStatus::Active);
        assert!(!campaign.withdrawn);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_create_campaign_zero_goal() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let token_address = Address::generate(&env);

        let deadline = env.ledger().timestamp() + 1000;
        client.create_campaign(&creator, &token_address, &0, &deadline);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn test_create_campaign_deadline_in_past() {
        let env = Env::default();
        env.mock_all_auths();

        env.ledger().set_timestamp(500);

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let token_address = Address::generate(&env);

        let deadline = 100;
        client.create_campaign(&creator, &token_address, &1000, &deadline);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #15)")]
    fn test_create_campaign_deadline_too_far() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let token_address = Address::generate(&env);

        // Deadline well beyond the ~365-day TTL horizon
        let deadline = env.ledger().timestamp() + 10_000_000_000;
        client.create_campaign(&creator, &token_address, &1000, &deadline);
    }

    #[test]
    fn test_contribute() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &500);

        let campaign = client.get_campaign(&campaign_id);
        assert_eq!(campaign.total_raised, 500);

        let stored = client.get_contribution(&campaign_id, &contributor);
        assert!(stored.is_some());
        let contribution = stored.unwrap();
        assert_eq!(contribution.amount, 500);
        assert!(!contribution.refunded);

        assert_eq!(token_client.balance(&contributor), 0);
        assert_eq!(token_client.balance(&contract_id), 500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_contribute_zero_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_contribute_campaign_not_found() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let contributor = Address::generate(&env);

        client.contribute(&999, &contributor, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_contribute_after_deadline() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        env.ledger().set_timestamp(deadline + 1);

        client.contribute(&campaign_id, &contributor, &500);
    }

    #[test]
    fn test_contribute_multiple_from_same_backer() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &300);
        client.contribute(&campaign_id, &contributor, &400);

        let campaign = client.get_campaign(&campaign_id);
        assert_eq!(campaign.total_raised, 700);

        let stored = client.get_contribution(&campaign_id, &contributor).unwrap();
        assert_eq!(stored.amount, 700);

        assert_eq!(token_client.balance(&contract_id), 700);
    }

    #[test]
    fn test_contribute_multiple_backers() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let backer1 = Address::generate(&env);
        let backer2 = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&backer1, &1000);
        token_admin.mint(&backer2, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &backer1, &600);
        client.contribute(&campaign_id, &backer2, &400);

        let campaign = client.get_campaign(&campaign_id);
        assert_eq!(campaign.total_raised, 1000);

        assert_eq!(client.get_contribution(&campaign_id, &backer1).unwrap().amount, 600);
        assert_eq!(client.get_contribution(&campaign_id, &backer2).unwrap().amount, 400);
    }

    #[test]
    fn test_claim_success() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &1000);

        env.ledger().set_timestamp(deadline + 1);

        assert_eq!(token_client.balance(&creator), 0);
        client.claim(&campaign_id);

        let campaign = client.get_campaign(&campaign_id);
        assert_eq!(campaign.status, CampaignStatus::Success);
        assert!(campaign.withdrawn);

        assert_eq!(token_client.balance(&creator), 1000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_claim_before_deadline() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &1000);

        client.claim(&campaign_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_claim_goal_not_met() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &500);

        env.ledger().set_timestamp(deadline + 1);

        client.claim(&campaign_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_claim_already_withdrawn() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &1000);

        env.ledger().set_timestamp(deadline + 1);

        client.claim(&campaign_id);
        client.claim(&campaign_id);
    }

    #[test]
    fn test_refund_success() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &500);

        env.ledger().set_timestamp(deadline + 1);

        assert_eq!(token_client.balance(&contributor), 0);
        assert_eq!(token_client.balance(&contract_id), 500);
        client.refund(&campaign_id, &contributor);

        let stored = client.get_contribution(&campaign_id, &contributor).unwrap();
        assert!(stored.refunded);
        assert_eq!(stored.amount, 500);

        assert_eq!(token_client.balance(&contributor), 500);
        assert_eq!(token_client.balance(&contract_id), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_refund_before_deadline() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &500);

        client.refund(&campaign_id, &contributor);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_refund_goal_met() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &1000);

        env.ledger().set_timestamp(deadline + 1);

        client.refund(&campaign_id, &contributor);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_refund_already_refunded() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &2000, &deadline);

        client.contribute(&campaign_id, &contributor, &500);

        env.ledger().set_timestamp(deadline + 1);

        client.refund(&campaign_id, &contributor);
        client.refund(&campaign_id, &contributor);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_refund_no_contribution() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let (token_address, _token_client, _token_admin) = create_token_contract(&env, &creator);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        env.ledger().set_timestamp(deadline + 1);

        let non_contributor = Address::generate(&env);
        client.refund(&campaign_id, &non_contributor);
    }

    #[test]
    fn test_refund_permissionless() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &500);

        env.ledger().set_timestamp(deadline + 1);

        assert_eq!(token_client.balance(&contract_id), 500);
        // Anyone can trigger refund for any contributor
        client.refund(&campaign_id, &contributor);

        assert_eq!(token_client.balance(&contributor), 500);
        assert_eq!(token_client.balance(&contract_id), 0);
    }

    #[test]
    fn test_refund_multiple_backers() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let backer1 = Address::generate(&env);
        let backer2 = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&backer1, &500);
        token_admin.mint(&backer2, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &backer1, &300);
        client.contribute(&campaign_id, &backer2, &400);

        env.ledger().set_timestamp(deadline + 1);

        client.refund(&campaign_id, &backer1);
        client.refund(&campaign_id, &backer2);

        assert_eq!(token_client.balance(&backer1), 500);
        assert_eq!(token_client.balance(&backer2), 500);
        assert_eq!(token_client.balance(&contract_id), 0);
    }

    #[test]
    fn test_full_lifecycle_success() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let backer1 = Address::generate(&env);
        let backer2 = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&backer1, &1000);
        token_admin.mint(&backer2, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1500, &deadline);

        client.contribute(&campaign_id, &backer1, &800);
        client.contribute(&campaign_id, &backer2, &700);

        env.ledger().set_timestamp(deadline + 1);

        assert_eq!(token_client.balance(&creator), 0);
        assert_eq!(token_client.balance(&contract_id), 1500);
        client.claim(&campaign_id);

        assert_eq!(token_client.balance(&creator), 1500);
        assert_eq!(token_client.balance(&backer1), 200);
        assert_eq!(token_client.balance(&backer2), 300);
        assert_eq!(token_client.balance(&contract_id), 0);
    }

    #[test]
    fn test_full_lifecycle_refund() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let backer1 = Address::generate(&env);
        let backer2 = Address::generate(&env);
        let (token_address, token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&backer1, &1000);
        token_admin.mint(&backer2, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &2000, &deadline);

        client.contribute(&campaign_id, &backer1, &800);
        client.contribute(&campaign_id, &backer2, &700);

        env.ledger().set_timestamp(deadline + 1);

        assert_eq!(token_client.balance(&contract_id), 1500);
        client.refund(&campaign_id, &backer1);
        client.refund(&campaign_id, &backer2);

        assert_eq!(token_client.balance(&backer1), 1000);
        assert_eq!(token_client.balance(&backer2), 1000);
        assert_eq!(token_client.balance(&contract_id), 0);
    }

    #[test]
    fn test_get_contribution_none() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let (token_address, _token_client, _token_admin) = create_token_contract(&env, &creator);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        let random = Address::generate(&env);
        let result = client.get_contribution(&campaign_id, &random);
        assert!(result.is_none());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_get_campaign_not_found() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        client.get_campaign(&999);
    }

    #[test]
    fn test_events_emitted() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &1000);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &500);

        let events = env.events().all();
        assert!(events.len() >= 2);
    }

    #[test]
    fn test_refund_sets_campaign_status_to_expired() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &500);

        env.ledger().set_timestamp(deadline + 1);

        assert_eq!(client.get_campaign(&campaign_id).status, CampaignStatus::Active);

        client.refund(&campaign_id, &contributor);

        assert_eq!(client.get_campaign(&campaign_id).status, CampaignStatus::Expired);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_contribute_to_expired_campaign_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let other = Address::generate(&env);
        let (token_address, _token_client, token_admin) = create_token_contract(&env, &creator);

        token_admin.mint(&contributor, &500);
        token_admin.mint(&other, &500);

        let deadline = env.ledger().timestamp() + 1000;
        let campaign_id = client.create_campaign(&creator, &token_address, &1000, &deadline);

        client.contribute(&campaign_id, &contributor, &500);

        env.ledger().set_timestamp(deadline + 1);

        client.refund(&campaign_id, &contributor);

        // Campaign is now Expired — any further contribution should fail
        client.contribute(&campaign_id, &other, &500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_create_campaign_without_init_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let creator = Address::generate(&env);
        let token_address = Address::generate(&env);

        client.create_campaign(&creator, &token_address, &1000, &1000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_contribute_without_init_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let contributor = Address::generate(&env);

        client.contribute(&1, &contributor, &100);
    }
}
