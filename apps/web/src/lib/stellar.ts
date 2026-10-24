/**
 * @deprecated Utility methods for Stellar address validation and amount formatting.
 * All smart contract operations now route through {@link @/services/stellar.service.ts}
 * or the SDK client wrappers in {@link @/lib/api.ts}.
 */
import { Keypair, Networks, Horizon } from '@stellar/stellar-sdk'
import { StreamRecord } from './validations'

// Use testnet for development
export const server = new Horizon.Server('https://horizon-testnet.stellar.org')
export const networkPassphrase = Networks.TESTNET

export class StellarService {
  static async getAccountInfo(publicKey: string) {
    try {
      const account = await server.loadAccount(publicKey)
      return account
    } catch {
      throw new Error('Failed to load account information')
    }
  }

  static validateStellarAddress(address: string): boolean {
    try {
      Keypair.fromPublicKey(address)
      return true
    } catch {
      return false
    }
  }

  static formatAmount(amount: string, decimals: number = 7): string {
    const num = parseFloat(amount)
    return num.toFixed(decimals)
  }

  static formatTokenAmount(amount: string, decimals: number = 7): string {
    const num = parseFloat(amount)
    const formatted = num.toFixed(decimals)
    // Only strip trailing zeros when there is a decimal point
    return formatted.includes('.') ? formatted.replace(/\.?0+$/, '') : formatted
  }

  /**
   * @deprecated Use the currency helpers in {@link @/lib/currency.ts} instead.
   * Maintained for legacy components that still import from this module.
   *
   * Formats a dual-amount receipt line showing the original amount, the
   * converted amount and the conversion rate applied at pledge time.
   */
  static formatDualAmountReceipt(
    originalAmount: string,
    originalCurrency: string,
    convertedAmount: string,
    convertedCurrency: string,
    rate: number,
    decimals: number = 2
  ): string {
    const original = StellarService.formatTokenAmount(originalAmount, decimals)
    const converted = StellarService.formatTokenAmount(convertedAmount, decimals)
    const formattedRate = StellarService.formatTokenAmount(rate.toString(), 6)
    return `${original} ${originalCurrency} → ${converted} ${convertedCurrency} (rate: 1 ${originalCurrency} = ${formattedRate} ${convertedCurrency})`
  }

  static calculateStreamProgress(stream: StreamRecord): {
    progressPercentage: number
    timeRemaining: string
    ratePerHour: number
  } {
    const now = Date.now()
    const totalDuration = stream.endTime - stream.startTime
    const elapsed = Math.max(0, now - stream.startTime)
    const remaining = Math.max(0, stream.endTime - now)

    const progressPercentage = Math.min(100, (elapsed / totalDuration) * 100)

    const hoursRemaining = Math.ceil(remaining / (1000 * 60 * 60))
    const daysRemaining = Math.floor(hoursRemaining / 24)

    let timeRemaining: string
    if (daysRemaining > 0) {
      timeRemaining = `${daysRemaining}d ${hoursRemaining % 24}h`
    } else {
      timeRemaining = `${hoursRemaining}h`
    }

    const totalHours = totalDuration / (1000 * 60 * 60)
    const ratePerHour = parseFloat(stream.totalAmount) / totalHours

    return {
      progressPercentage,
      timeRemaining,
      ratePerHour,
    }
  }
}
