#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        Address, Env, String,
    };
    use crate::{SoulboundBadgeContract, SoulboundBadgeContractClient};

    // -----------------------------------------------------------------------
    // Test helpers
    // -----------------------------------------------------------------------

    /// Set up a minimal env with a deployed, initialised contract.
    fn setup() -> (Env, Address /* admin */, SoulboundBadgeContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);
        client.initialize(&admin).unwrap();

        (env, admin, client)
    }

    /// Create a campaign and return its ID + organiser address.
    fn create_default_campaign(
        env: &Env,
        client: &SoulboundBadgeContractClient,
        threshold: i128,
    ) -> (u64, Address) {
        let organiser = Address::generate(env);
        let name = String::from_str(env, "Test Campaign");
        let campaign_id = client.create_campaign(&name, &threshold, &organiser).unwrap();
        (campaign_id, organiser)
    }

    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialize_success() {
        let (_, _, client) = setup();
        assert_eq!(client.total_badges(), 0);
        assert_eq!(client.total_campaigns(), 0);
    }

    #[test]
    fn test_initialize_twice_fails() {
        let (env, admin, client) = setup();
        let result = client.try_initialize(&admin);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Campaign creation
    // -----------------------------------------------------------------------

    #[test]
    fn test_create_campaign_success() {
        let (env, _, client) = setup();
        let organiser = Address::generate(&env);
        let name = String::from_str(&env, "Galaxy Fund");
        let campaign_id = client.create_campaign(&name, &500, &organiser).unwrap();

        assert_eq!(campaign_id, 1);
        assert_eq!(client.total_campaigns(), 1);

        let campaign = client.get_campaign(&campaign_id).unwrap();
        assert_eq!(campaign.threshold, 500);
        assert!(campaign.active);
    }

    #[test]
    fn test_create_campaign_zero_threshold_fails() {
        let (env, _, client) = setup();
        let organiser = Address::generate(&env);
        let name = String::from_str(&env, "Bad Campaign");
        let result = client.try_create_campaign(&name, &0, &organiser);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_campaign_negative_threshold_fails() {
        let (env, _, client) = setup();
        let organiser = Address::generate(&env);
        let name = String::from_str(&env, "Negative");
        let result = client.try_create_campaign(&name, &-100, &organiser);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_multiple_campaigns() {
        let (env, _, client) = setup();
        let organiser = Address::generate(&env);
        let name1 = String::from_str(&env, "Alpha");
        let name2 = String::from_str(&env, "Beta");

        let id1 = client.create_campaign(&name1, &100, &organiser).unwrap();
        let id2 = client.create_campaign(&name2, &200, &organiser).unwrap();

        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(client.total_campaigns(), 2);
    }

    // -----------------------------------------------------------------------
    // Campaign deactivation
    // -----------------------------------------------------------------------

    #[test]
    fn test_deactivate_campaign() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);

        client.deactivate_campaign(&campaign_id).unwrap();

        let campaign = client.get_campaign(&campaign_id).unwrap();
        assert!(!campaign.active);
    }

    #[test]
    fn test_deactivate_nonexistent_campaign_fails() {
        let (_, _, client) = setup();
        let result = client.try_deactivate_campaign(&999);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Contribution recording
    // -----------------------------------------------------------------------

    #[test]
    fn test_record_contribution_success() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 1000);
        let backer = Address::generate(&env);

        let new_total = client.record_contribution(&campaign_id, &backer, &500).unwrap();
        assert_eq!(new_total, 500);

        let stored = client.get_contribution(&campaign_id, &backer);
        assert_eq!(stored, 500);
    }

    #[test]
    fn test_record_contribution_accumulates() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 1000);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &300).unwrap();
        client.record_contribution(&campaign_id, &backer, &400).unwrap();
        let total = client.record_contribution(&campaign_id, &backer, &300).unwrap();

        assert_eq!(total, 1000);
        assert_eq!(client.get_contribution(&campaign_id, &backer), 1000);
    }

    #[test]
    fn test_record_zero_contribution_fails() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 1000);
        let backer = Address::generate(&env);

        let result = client.try_record_contribution(&campaign_id, &backer, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_record_negative_contribution_fails() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 1000);
        let backer = Address::generate(&env);

        let result = client.try_record_contribution(&campaign_id, &backer, &-1);
        assert!(result.is_err());
    }

    #[test]
    fn test_record_contribution_to_inactive_campaign_fails() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 1000);
        client.deactivate_campaign(&campaign_id).unwrap();

        let backer = Address::generate(&env);
        let result = client.try_record_contribution(&campaign_id, &backer, &500);
        assert!(result.is_err());
    }

    #[test]
    fn test_record_contribution_nonexistent_campaign_fails() {
        let (env, _, client) = setup();
        let backer = Address::generate(&env);
        let result = client.try_record_contribution(&999, &backer, &100);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Badge minting — success paths
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_badge_success() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 1000);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &1000).unwrap();
        let badge_id = client.mint_badge(&campaign_id, &backer).unwrap();

        assert_eq!(badge_id, 1);
        assert_eq!(client.total_badges(), 1);

        let badge = client.get_badge(&badge_id).unwrap();
        assert_eq!(badge.campaign_id, campaign_id);
        assert_eq!(badge.owner, backer);
        assert_eq!(badge.contribution_at_mint, 1000);
    }

    #[test]
    fn test_mint_badge_contribution_exceeds_threshold() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 500);
        let backer = Address::generate(&env);

        // Backer contributes more than threshold
        client.record_contribution(&campaign_id, &backer, &2000).unwrap();
        let badge_id = client.mint_badge(&campaign_id, &backer).unwrap();

        let badge = client.get_badge(&badge_id).unwrap();
        assert_eq!(badge.contribution_at_mint, 2000);
    }

    #[test]
    fn test_mint_badge_multiple_backers() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer1 = Address::generate(&env);
        let backer2 = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer1, &100).unwrap();
        client.record_contribution(&campaign_id, &backer2, &150).unwrap();

        let id1 = client.mint_badge(&campaign_id, &backer1).unwrap();
        let id2 = client.mint_badge(&campaign_id, &backer2).unwrap();

        assert_ne!(id1, id2);
        assert_eq!(client.total_badges(), 2);
    }

    #[test]
    fn test_get_badge_for_backer_returns_id() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &100).unwrap();
        let badge_id = client.mint_badge(&campaign_id, &backer).unwrap();

        let stored_id = client.get_badge_for_backer(&campaign_id, &backer);
        assert_eq!(stored_id, Some(badge_id));
    }

    #[test]
    fn test_get_badge_for_backer_no_badge_returns_none() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        assert_eq!(client.get_badge_for_backer(&campaign_id, &backer), None);
    }

    #[test]
    fn test_badge_timestamp_set() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        env.ledger().set_timestamp(9999);
        client.record_contribution(&campaign_id, &backer, &100).unwrap();
        let badge_id = client.mint_badge(&campaign_id, &backer).unwrap();

        let badge = client.get_badge(&badge_id).unwrap();
        assert_eq!(badge.minted_at, 9999);
    }

    // -----------------------------------------------------------------------
    // Badge minting — failure paths
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_badge_threshold_not_met_fails() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 1000);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &999).unwrap();
        let result = client.try_mint_badge(&campaign_id, &backer);
        assert!(result.is_err());
    }

    #[test]
    fn test_mint_badge_no_contribution_fails() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        let result = client.try_mint_badge(&campaign_id, &backer);
        assert!(result.is_err());
    }

    #[test]
    fn test_mint_badge_twice_fails() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &100).unwrap();
        client.mint_badge(&campaign_id, &backer).unwrap();

        // Second mint must fail
        let result = client.try_mint_badge(&campaign_id, &backer);
        assert!(result.is_err());
    }

    #[test]
    fn test_mint_badge_nonexistent_campaign_fails() {
        let (env, _, client) = setup();
        let backer = Address::generate(&env);
        let result = client.try_mint_badge(&999, &backer);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Soulbound — no transfer
    // -----------------------------------------------------------------------

    #[test]
    fn test_badge_owner_is_immutable() {
        // Verify there is no transfer method on the client.
        // The badge owner field can only be read, never updated.
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &100).unwrap();
        let badge_id = client.mint_badge(&campaign_id, &backer).unwrap();

        let badge_before = client.get_badge(&badge_id).unwrap();

        // No transfer call exists — fetch the badge again and assert unchanged
        let badge_after = client.get_badge(&badge_id).unwrap();
        assert_eq!(badge_before.owner, badge_after.owner);
        assert_eq!(badge_after.owner, backer);
    }

    // -----------------------------------------------------------------------
    // Eligibility helper
    // -----------------------------------------------------------------------

    #[test]
    fn test_is_eligible_true_when_threshold_met() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &100).unwrap();
        assert!(client.is_eligible(&campaign_id, &backer));
    }

    #[test]
    fn test_is_eligible_false_when_threshold_not_met() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &50).unwrap();
        assert!(!client.is_eligible(&campaign_id, &backer));
    }

    #[test]
    fn test_is_eligible_false_after_badge_minted() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &100).unwrap();
        client.mint_badge(&campaign_id, &backer).unwrap();

        // No longer eligible once badge already issued
        assert!(!client.is_eligible(&campaign_id, &backer));
    }

    #[test]
    fn test_is_eligible_false_for_unknown_campaign() {
        let (env, _, client) = setup();
        let backer = Address::generate(&env);
        assert!(!client.is_eligible(&999, &backer));
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    #[test]
    fn test_campaign_created_event_emitted() {
        let (env, _, client) = setup();
        let organiser = Address::generate(&env);
        let name = String::from_str(&env, "Fundable Launch");
        client.create_campaign(&name, &250, &organiser).unwrap();

        let events = env.events().all();
        // At least one event for campaign creation
        assert!(events.len() >= 1);
    }

    #[test]
    fn test_badge_minted_event_emitted() {
        let (env, _, client) = setup();
        let (campaign_id, _) = create_default_campaign(&env, &client, 100);
        let backer = Address::generate(&env);

        client.record_contribution(&campaign_id, &backer, &100).unwrap();
        client.mint_badge(&campaign_id, &backer).unwrap();

        let events = env.events().all();
        // At least 3 events: CampaignCreated + ContributionRecorded + BadgeMinted
        assert!(events.len() >= 3);
    }

    // -----------------------------------------------------------------------
    // Uninitialized contract guard
    // -----------------------------------------------------------------------

    #[test]
    fn test_create_campaign_without_init_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let organiser = Address::generate(&env);
        let name = String::from_str(&env, "Uninit");
        let result = client.try_create_campaign(&name, &100, &organiser);
        assert!(result.is_err());
    }
}
