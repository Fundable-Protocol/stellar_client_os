//! Overflow-safe arithmetic helpers for `i128` campaign amounts.
//!
//! Every financial operation in the crowdfunding contract routes through this
//! module so that an overflow or underflow fails loudly with a typed
//! [`Error::ArithmeticOverflow`](crate::Error::ArithmeticOverflow) instead of
//! wrapping silently.

use crate::{Error, MAX_AMOUNT};
use soroban_sdk::{panic_with_error, Env};

/// Validate that `amount` is a usable positive campaign amount.
///
/// Rejects zero, negative values, and anything above [`MAX_AMOUNT`] with
/// [`Error::InvalidAmount`](crate::Error::InvalidAmount).
pub fn validate_amount(env: &Env, amount: i128) {
    if amount <= 0 || amount > MAX_AMOUNT {
        panic_with_error!(env, Error::InvalidAmount);
    }
}

/// Checked addition. Panics with `Error::ArithmeticOverflow` on overflow.
pub fn checked_add(env: &Env, a: i128, b: i128) -> i128 {
    a.checked_add(b)
        .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
}

/// Checked subtraction. Panics with `Error::ArithmeticOverflow` on underflow.
pub fn checked_sub(env: &Env, a: i128, b: i128) -> i128 {
    a.checked_sub(b)
        .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
}

/// Checked multiplication. Panics with `Error::ArithmeticOverflow` on overflow.
pub fn checked_mul(env: &Env, a: i128, b: i128) -> i128 {
    a.checked_mul(b)
        .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_sub_mul_normal() {
        let env = Env::default();
        assert_eq!(checked_add(&env, 2_000, 3_000), 5_000);
        assert_eq!(checked_sub(&env, 10_000, 4_000), 6_000);
        assert_eq!(checked_mul(&env, 6, 7), 42);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn add_overflows_at_i128_max() {
        let env = Env::default();
        checked_add(&env, i128::MAX, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn mul_overflows() {
        let env = Env::default();
        checked_mul(&env, i128::MAX, 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn sub_underflows_at_i128_min() {
        let env = Env::default();
        checked_sub(&env, i128::MIN, 1);
    }

    #[test]
    fn validate_accepts_positive_and_boundary_max() {
        let env = Env::default();
        validate_amount(&env, 1);
        validate_amount(&env, MAX_AMOUNT);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn validate_rejects_max_plus_one() {
        let env = Env::default();
        validate_amount(&env, MAX_AMOUNT + 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn validate_rejects_zero() {
        let env = Env::default();
        validate_amount(&env, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn validate_rejects_negative() {
        let env = Env::default();
        validate_amount(&env, -1);
    }
}
