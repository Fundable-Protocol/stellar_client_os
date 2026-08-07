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
  static async createPaymentStream(formData: PaymentStreamFormData, signal?: AbortSignal): Promise<string> {
    try {
      throwIfAborted(signal)

      // For demo purposes, we'll simulate the transaction
      // In a real implementation, you would:
      // 1. Connect to user's wallet (Freighter, etc.)
      // 2. Get the user's keypair
      // 3. Build and submit the actual transaction to the smart contract

      // Get token info
      const selectedToken = SUPPORTED_TOKENS.find(token => token.value === formData.token)
      if (!selectedToken) {
        throw new Error('Invalid token selected')
      }

      // Simulate contract interaction
      const streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      // In a real implementation, you would:
      // 1. Create a transaction that calls the payment stream contract
      // 2. Include operations to transfer tokens to the contract
      // 3. Submit the transaction to the network

      // Simulate network delay
      await abortableDelay(2000, signal)
      throwIfAborted(signal)

      return streamId
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      throw new Error('Failed to create payment stream: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

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
