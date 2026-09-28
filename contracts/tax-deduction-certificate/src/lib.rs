//! Campaign Tax Deduction Certification — issue #948 (v1)
//!
//! For campaigns run with a registered non-profit partner, this contract
//! records each sponsor's charitable contributions and issues on-chain tax
//! deduction certificates showing the contribution amount.
//!
//! Flow:
//! 1. The admin registers non-profit partners and links campaigns to them.
//! 2. Authorised recorders (e.g. the campaign-funding contract or the
//!    backend) record contributions. The tax year comes from the ledger
//!    timestamp (UTC calendar year), so it cannot be chosen by the caller.
//! 3. The partner (or the admin) issues a certificate per sponsor, campaign,
//!    tax year and token for the total recorded amount.
//!
//! Certificates are non-transferable. If more contributions are recorded
//! after a certificate is issued, issuing again supersedes the old one with
//! a certificate for the new total. The partner or admin can revoke a
//! certificate, e.g. after a refund.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Vec,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    NextCertificateId,
    /// Addresses allowed to record contributions.
    Recorder(Address),
    /// Non-profit partner details, keyed by the partner's address.
    Partner(Address),
    /// Partner a campaign is run with.
    CampaignPartner(u64),
    /// Running contribution total: (campaign_id, sponsor, tax_year, token).
    Contribution(u64, Address, u32, Address),
    Certificate(u64),
    /// Latest certificate id for (campaign_id, sponsor, tax_year, token).
    CertificateFor(u64, Address, u32, Address),
    /// All certificate ids issued to a sponsor.
    SponsorCertificates(Address),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Partner {
    pub legal_name: String,
    /// Charity / tax-exempt registration number, e.g. an EIN.
    pub registration_number: String,
    /// ISO 3166-1 alpha-2 country code of the registration.
    pub country: String,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CertificateStatus {
    Active,
    /// Replaced by a newer certificate with an updated total.
    Superseded,
    Revoked,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Certificate {
    pub id: u64,
    pub campaign_id: u64,
    pub sponsor: Address,
    pub partner: Address,
    pub partner_legal_name: String,
    pub partner_registration_number: String,
    pub partner_country: String,
    pub token: Address,
    /// Charitable contribution amount, in the token's smallest unit.
    pub amount: i128,
    pub tax_year: u32,
    pub issued_at: u64,
    pub status: CertificateStatus,
    /// Certificate this one replaced, if any.
    pub supersedes: Option<u64>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    PartnerNotFound = 4,
    PartnerInactive = 5,
    CampaignNotLinked = 6,
    InvalidAmount = 7,
    NoContributions = 8,
    AlreadyIssued = 9,
    CertificateNotFound = 10,
    CertificateNotActive = 11,
    ArithmeticOverflow = 12,
    InvalidPartnerDetails = 13,
}

/// Storage TTL threshold: ~30 days at 5 s/ledger.
const LEDGER_THRESHOLD: u32 = 518_400;
/// Storage TTL bump: ~31 days at 5 s/ledger.
const LEDGER_BUMP: u32 = 535_680;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct TaxDeductionCertificateContract;

#[contractimpl]
impl TaxDeductionCertificateContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextCertificateId, &1u64);
        bump_instance(&env);
    }

    // -----------------------------------------------------------------------
    // Administration
    // -----------------------------------------------------------------------

    /// Registers or updates a non-profit partner.
    pub fn register_partner(
        env: Env,
        partner: Address,
        legal_name: String,
        registration_number: String,
        country: String,
    ) {
        require_admin(&env);
        if legal_name.len() == 0 || registration_number.len() == 0 || country.len() != 2 {
            panic_with_error!(&env, Error::InvalidPartnerDetails);
        }
        let details = Partner {
            legal_name,
            registration_number,
            country,
            active: true,
        };
        set_persistent(&env, &DataKey::Partner(partner.clone()), &details);
        env.events().publish(("PartnerRegistered",), partner);
    }

    /// Stops a partner from being linked to campaigns or issuing certificates.
    /// Certificates it already issued stay valid.
    pub fn deactivate_partner(env: Env, partner: Address) {
        require_admin(&env);
        let mut details = load_partner(&env, &partner);
        details.active = false;
        set_persistent(&env, &DataKey::Partner(partner.clone()), &details);
        env.events().publish(("PartnerDeactivated",), partner);
    }

    pub fn link_campaign(env: Env, campaign_id: u64, partner: Address) {
        require_admin(&env);
        if !load_partner(&env, &partner).active {
            panic_with_error!(&env, Error::PartnerInactive);
        }
        set_persistent(&env, &DataKey::CampaignPartner(campaign_id), &partner);
        env.events()
            .publish(("CampaignLinked", campaign_id), partner);
    }

    pub fn set_recorder(env: Env, recorder: Address, allowed: bool) {
        require_admin(&env);
        let key = DataKey::Recorder(recorder);
        if allowed {
            set_persistent(&env, &key, &true);
        } else {
            env.storage().persistent().remove(&key);
        }
    }

    // -----------------------------------------------------------------------
    // Contributions
    // -----------------------------------------------------------------------

    /// Records a sponsor's contribution to a partner-linked campaign in the
    /// current tax year. Returns the sponsor's new total for that year.
    pub fn record_contribution(
        env: Env,
        recorder: Address,
        campaign_id: u64,
        sponsor: Address,
        token: Address,
        amount: i128,
    ) -> i128 {
        recorder.require_auth();
        if !env
            .storage()
            .persistent()
            .has(&DataKey::Recorder(recorder.clone()))
        {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        campaign_partner(&env, campaign_id);

        let tax_year = year_from_timestamp(env.ledger().timestamp());
        let key = DataKey::Contribution(campaign_id, sponsor.clone(), tax_year, token.clone());
        let total = env
            .storage()
            .persistent()
            .get::<_, i128>(&key)
            .unwrap_or(0)
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        set_persistent(&env, &key, &total);

        env.events().publish(
            ("ContributionRecorded", campaign_id, sponsor),
            (token, amount, tax_year, total),
        );
        total
    }

    pub fn get_contribution_total(
        env: Env,
        campaign_id: u64,
        sponsor: Address,
        tax_year: u32,
        token: Address,
    ) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(campaign_id, sponsor, tax_year, token))
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Certificates
    // -----------------------------------------------------------------------

    /// Issues a certificate for the sponsor's recorded total. `issuer` must be
    /// the campaign's partner or the admin. Returns the certificate id.
    pub fn issue_certificate(
        env: Env,
        issuer: Address,
        campaign_id: u64,
        sponsor: Address,
        tax_year: u32,
        token: Address,
    ) -> u64 {
        issuer.require_auth();
        let partner = campaign_partner(&env, campaign_id);
        require_partner_or_admin(&env, &issuer, &partner);

        let details = load_partner(&env, &partner);
        if !details.active {
            panic_with_error!(&env, Error::PartnerInactive);
        }

        let amount = Self::get_contribution_total(
            env.clone(),
            campaign_id,
            sponsor.clone(),
            tax_year,
            token.clone(),
        );
        if amount == 0 {
            panic_with_error!(&env, Error::NoContributions);
        }

        let lookup = DataKey::CertificateFor(campaign_id, sponsor.clone(), tax_year, token.clone());
        let mut supersedes = None;
        if let Some(previous_id) = env.storage().persistent().get::<_, u64>(&lookup) {
            let mut previous = load_certificate(&env, previous_id);
            if previous.status == CertificateStatus::Active {
                if previous.amount == amount {
                    panic_with_error!(&env, Error::AlreadyIssued);
                }
                previous.status = CertificateStatus::Superseded;
                set_persistent(&env, &DataKey::Certificate(previous_id), &previous);
                supersedes = Some(previous_id);
            }
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextCertificateId)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        env.storage()
            .instance()
            .set(&DataKey::NextCertificateId, &(id + 1));
        bump_instance(&env);

        let certificate = Certificate {
            id,
            campaign_id,
            sponsor: sponsor.clone(),
            partner,
            partner_legal_name: details.legal_name,
            partner_registration_number: details.registration_number,
            partner_country: details.country,
            token,
            amount,
            tax_year,
            issued_at: env.ledger().timestamp(),
            status: CertificateStatus::Active,
            supersedes,
        };
        set_persistent(&env, &DataKey::Certificate(id), &certificate);
        set_persistent(&env, &lookup, &id);

        let sponsor_key = DataKey::SponsorCertificates(sponsor.clone());
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&sponsor_key)
            .unwrap_or_else(|| Vec::new(&env));
        ids.push_back(id);
        set_persistent(&env, &sponsor_key, &ids);

        env.events().publish(
            ("CertificateIssued", campaign_id, sponsor),
            (id, amount, tax_year, supersedes),
        );
        id
    }

    /// Revokes an active certificate. `issuer` must be its partner or the admin.
    pub fn revoke_certificate(env: Env, issuer: Address, certificate_id: u64) {
        issuer.require_auth();
        let mut certificate = load_certificate(&env, certificate_id);
        require_partner_or_admin(&env, &issuer, &certificate.partner);
        if certificate.status != CertificateStatus::Active {
            panic_with_error!(&env, Error::CertificateNotActive);
        }
        certificate.status = CertificateStatus::Revoked;
        set_persistent(&env, &DataKey::Certificate(certificate_id), &certificate);
        env.events()
            .publish(("CertificateRevoked", certificate_id), issuer);
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    pub fn get_admin(env: Env) -> Address {
        load_admin(&env)
    }

    pub fn get_partner(env: Env, partner: Address) -> Partner {
        load_partner(&env, &partner)
    }

    pub fn get_campaign_partner(env: Env, campaign_id: u64) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::CampaignPartner(campaign_id))
    }

    pub fn get_certificate(env: Env, certificate_id: u64) -> Certificate {
        load_certificate(&env, certificate_id)
    }

    /// Latest certificate (of any status) for a sponsor, campaign, year and token.
    pub fn find_certificate(
        env: Env,
        campaign_id: u64,
        sponsor: Address,
        tax_year: u32,
        token: Address,
    ) -> Option<Certificate> {
        env.storage()
            .persistent()
            .get::<_, u64>(&DataKey::CertificateFor(campaign_id, sponsor, tax_year, token))
            .map(|id| load_certificate(&env, id))
    }

    pub fn get_sponsor_certificates(env: Env, sponsor: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::SponsorCertificates(sponsor))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// True if the certificate exists and is the active one.
    pub fn is_valid(env: Env, certificate_id: u64) -> bool {
        env.storage()
            .persistent()
            .get::<_, Certificate>(&DataKey::Certificate(certificate_id))
            .map(|c| c.status == CertificateStatus::Active)
            .unwrap_or(false)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
}

fn set_persistent<V>(env: &Env, key: &DataKey, value: &V)
where
    V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
{
    env.storage().persistent().set(key, value);
    env.storage()
        .persistent()
        .extend_ttl(key, LEDGER_THRESHOLD, LEDGER_BUMP);
}

fn load_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

fn require_admin(env: &Env) {
    load_admin(env).require_auth();
    bump_instance(env);
}

fn require_partner_or_admin(env: &Env, issuer: &Address, partner: &Address) {
    if issuer != partner && *issuer != load_admin(env) {
        panic_with_error!(env, Error::Unauthorized);
    }
}

fn load_partner(env: &Env, partner: &Address) -> Partner {
    env.storage()
        .persistent()
        .get(&DataKey::Partner(partner.clone()))
        .unwrap_or_else(|| panic_with_error!(env, Error::PartnerNotFound))
}

fn campaign_partner(env: &Env, campaign_id: u64) -> Address {
    env.storage()
        .persistent()
        .get(&DataKey::CampaignPartner(campaign_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::CampaignNotLinked))
}

fn load_certificate(env: &Env, certificate_id: u64) -> Certificate {
    env.storage()
        .persistent()
        .get(&DataKey::Certificate(certificate_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::CertificateNotFound))
}

/// UTC calendar year of a unix timestamp (days-to-civil conversion).
pub fn year_from_timestamp(timestamp: u64) -> u32 {
    let z = timestamp / 86_400 + 719_468;
    let era = z / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    year as u32
}

#[cfg(test)]
mod test;
