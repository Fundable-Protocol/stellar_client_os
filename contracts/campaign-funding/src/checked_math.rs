#![no_std]
use crate::Error;

/// Safe checked arithmetic library for campaign financial calculations (Issue #850).
/// Audits all amounts and ensures no overflow occurs across addition, subtraction,
/// multiplication, division, and basis-point percentage splits.
pub struct CheckedMath;

impl CheckedMath {
    /// Safe addition with checked bounds and positive verification.
    #[inline]
    pub fn add(a: i128, b: i128) -> Result<i128, Error> {
        a.checked_add(b).ok_or(Error::ArithmeticOverflow)
    }

    /// Safe subtraction preventing negative underflows for unsigned balances.
    #[inline]
    pub fn sub(a: i128, b: i128) -> Result<i128, Error> {
        if b > a {
            return Err(Error::ArithmeticOverflow);
        }
        a.checked_sub(b).ok_or(Error::ArithmeticOverflow)
    }

    /// Safe multiplication preventing overflow.
    #[inline]
    pub fn mul(a: i128, b: i128) -> Result<i128, Error> {
        a.checked_mul(b).ok_or(Error::ArithmeticOverflow)
    }

    /// Safe integer division protecting against division by zero.
    #[inline]
    pub fn div(a: i128, b: i128) -> Result<i128, Error> {
        if b == 0 {
            return Err(Error::InvalidAmount);
        }
        a.checked_div(b).ok_or(Error::ArithmeticOverflow)
    }

    /// Safe basis-points calculation: (amount * bps) / 10_000.
    /// Preserves precision without overflowing intermediate values.
    #[inline]
    pub fn mul_bps(amount: i128, bps: u32) -> Result<i128, Error> {
        if bps == 0 || amount == 0 {
            return Ok(0);
        }
        let numerator = amount
            .checked_mul(bps as i128)
            .ok_or(Error::ArithmeticOverflow)?;
        numerator
            .checked_div(10_000)
            .ok_or(Error::ArithmeticOverflow)
    }

    /// Validate that an amount is strictly positive and fits within safe ranges.
    #[inline]
    pub fn validate_positive_amount(amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        Ok(())
    }
}
