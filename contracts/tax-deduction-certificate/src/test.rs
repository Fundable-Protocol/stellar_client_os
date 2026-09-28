#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

/// 2026-01-01T00:00:00Z
const JAN_1_2026: u64 = 1_767_225_600;
const CAMPAIGN: u64 = 7;

struct Setup<'a> {
    env: Env,
    client: TaxDeductionCertificateContractClient<'a>,
    admin: Address,
    partner: Address,
    recorder: Address,
    sponsor: Address,
    token: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(JAN_1_2026 + 86_400 * 100);

    let contract_id = env.register(TaxDeductionCertificateContract, ());
    let client = TaxDeductionCertificateContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let partner = Address::generate(&env);
    let recorder = Address::generate(&env);

    client.initialize(&admin);
    client.register_partner(
        &partner,
        &String::from_str(&env, "Green Roots Foundation"),
        &String::from_str(&env, "EIN 12-3456789"),
        &String::from_str(&env, "US"),
    );
    client.link_campaign(&CAMPAIGN, &partner);
    client.set_recorder(&recorder, &true);

    let sponsor = Address::generate(&env);
    let token = Address::generate(&env);
    Setup { env, client, admin, partner, recorder, sponsor, token }
}

#[test]
fn test_year_from_timestamp() {
    assert_eq!(year_from_timestamp(0), 1970);
    assert_eq!(year_from_timestamp(JAN_1_2026 - 1), 2025);
    assert_eq!(year_from_timestamp(JAN_1_2026), 2026);
    // 2024-02-29T12:00:00Z (leap day)
    assert_eq!(year_from_timestamp(1_709_208_000), 2024);
    // 2024-12-31T23:59:59Z
    assert_eq!(year_from_timestamp(1_735_689_599), 2024);
}

#[test]
fn test_initialize_twice_fails() {
    let s = setup();
    assert_eq!(s.client.get_admin(), s.admin);
    assert_eq!(
        s.client.try_initialize(&s.admin),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn test_register_partner_validates_details() {
    let s = setup();
    let other = Address::generate(&s.env);
    assert_eq!(
        s.client.try_register_partner(
            &other,
            &String::from_str(&s.env, "Name"),
            &String::from_str(&s.env, "REG-1"),
            &String::from_str(&s.env, "USA"),
        ),
        Err(Ok(Error::InvalidPartnerDetails))
    );
    assert!(s.client.get_partner(&s.partner).active);
    assert_eq!(s.client.get_campaign_partner(&CAMPAIGN), Some(s.partner.clone()));
}

#[test]
fn test_record_contribution_accumulates_by_tax_year() {
    let s = setup();
    assert_eq!(
        s.client.record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &400),
        400
    );
    assert_eq!(
        s.client.record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &100),
        500
    );

    // Next calendar year starts a fresh total.
    s.env.ledger().set_timestamp(JAN_1_2026 + 366 * 86_400);
    s.client.record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &50);

    assert_eq!(s.client.get_contribution_total(&CAMPAIGN, &s.sponsor, &2026, &s.token), 500);
    assert_eq!(s.client.get_contribution_total(&CAMPAIGN, &s.sponsor, &2027, &s.token), 50);
}

#[test]
fn test_record_contribution_rejects_bad_input() {
    let s = setup();
    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.client.try_record_contribution(&stranger, &CAMPAIGN, &s.sponsor, &s.token, &10),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        s.client.try_record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.client.try_record_contribution(&s.recorder, &99, &s.sponsor, &s.token, &10),
        Err(Ok(Error::CampaignNotLinked))
    );

    s.client.set_recorder(&s.recorder, &false);
    assert_eq!(
        s.client.try_record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &10),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn test_partner_issues_certificate() {
    let s = setup();
    s.client.record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &2_500);

    let id = s.client.issue_certificate(&s.partner, &CAMPAIGN, &s.sponsor, &2026, &s.token);
    let certificate = s.client.get_certificate(&id);

    assert_eq!(id, 1);
    assert_eq!(certificate.amount, 2_500);
    assert_eq!(certificate.tax_year, 2026);
    assert_eq!(certificate.sponsor, s.sponsor);
    assert_eq!(certificate.partner, s.partner);
    assert_eq!(
        certificate.partner_registration_number,
        String::from_str(&s.env, "EIN 12-3456789")
    );
    assert_eq!(certificate.status, CertificateStatus::Active);
    assert_eq!(certificate.supersedes, None);
    assert!(s.client.is_valid(&id));
    assert_eq!(s.client.get_sponsor_certificates(&s.sponsor).len(), 1);
    assert_eq!(
        s.client.find_certificate(&CAMPAIGN, &s.sponsor, &2026, &s.token),
        Some(certificate)
    );
}

#[test]
fn test_issue_certificate_guards() {
    let s = setup();
    let stranger = Address::generate(&s.env);

    assert_eq!(
        s.client.try_issue_certificate(&s.partner, &CAMPAIGN, &s.sponsor, &2026, &s.token),
        Err(Ok(Error::NoContributions))
    );

    s.client.record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &10);
    assert_eq!(
        s.client.try_issue_certificate(&stranger, &CAMPAIGN, &s.sponsor, &2026, &s.token),
        Err(Ok(Error::Unauthorized))
    );

    // Admin may issue on the partner's behalf, but only once per total.
    s.client.issue_certificate(&s.admin, &CAMPAIGN, &s.sponsor, &2026, &s.token);
    assert_eq!(
        s.client.try_issue_certificate(&s.partner, &CAMPAIGN, &s.sponsor, &2026, &s.token),
        Err(Ok(Error::AlreadyIssued))
    );
}

#[test]
fn test_new_contributions_supersede_certificate() {
    let s = setup();
    s.client.record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &100);
    let first = s.client.issue_certificate(&s.partner, &CAMPAIGN, &s.sponsor, &2026, &s.token);

    s.client.record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &50);
    let second = s.client.issue_certificate(&s.partner, &CAMPAIGN, &s.sponsor, &2026, &s.token);

    assert_eq!(s.client.get_certificate(&first).status, CertificateStatus::Superseded);
    assert!(!s.client.is_valid(&first));

    let latest = s.client.get_certificate(&second);
    assert_eq!(latest.amount, 150);
    assert_eq!(latest.supersedes, Some(first));
    assert_eq!(s.client.get_sponsor_certificates(&s.sponsor).len(), 2);
}

#[test]
fn test_revoke_certificate() {
    let s = setup();
    s.client.record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &100);
    let id = s.client.issue_certificate(&s.partner, &CAMPAIGN, &s.sponsor, &2026, &s.token);

    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.client.try_revoke_certificate(&stranger, &id),
        Err(Ok(Error::Unauthorized))
    );

    s.client.revoke_certificate(&s.partner, &id);
    assert_eq!(s.client.get_certificate(&id).status, CertificateStatus::Revoked);
    assert!(!s.client.is_valid(&id));
    assert_eq!(
        s.client.try_revoke_certificate(&s.admin, &id),
        Err(Ok(Error::CertificateNotActive))
    );

    // A revoked certificate can be replaced by a fresh one.
    let reissued = s.client.issue_certificate(&s.partner, &CAMPAIGN, &s.sponsor, &2026, &s.token);
    assert_eq!(s.client.get_certificate(&reissued).supersedes, None);
    assert!(s.client.is_valid(&reissued));
}

#[test]
fn test_inactive_partner_cannot_be_linked_or_issue() {
    let s = setup();
    s.client.record_contribution(&s.recorder, &CAMPAIGN, &s.sponsor, &s.token, &100);
    s.client.deactivate_partner(&s.partner);

    assert_eq!(
        s.client.try_link_campaign(&8, &s.partner),
        Err(Ok(Error::PartnerInactive))
    );
    assert_eq!(
        s.client.try_issue_certificate(&s.partner, &CAMPAIGN, &s.sponsor, &2026, &s.token),
        Err(Ok(Error::PartnerInactive))
    );
    assert_eq!(
        s.client.try_get_certificate(&42),
        Err(Ok(Error::CertificateNotFound))
    );
}
