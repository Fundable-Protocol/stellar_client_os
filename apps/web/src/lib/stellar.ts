import { Keypair, Networks, Horizon } from '@stellar/stellar-sdk'
import { PaymentStreamFormData, SUPPORTED_TOKENS, StreamRecord, WithdrawStreamFormData } from './validations'

// Use testnet for development
export const server = new Horizon.Server('https://horizon-testnet.stellar.org')
export const networkPassphrase = Networks.TESTNET

function createAbortError(): Error {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError()
  }
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(createAbortError())
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface CreateStreamParams {
  senderKeypair: Keypair
  recipientAddress: string
  tokenAddress: string
  totalAmount: string
  durationInSeconds: number
  cancelable: boolean
  transferable: boolean
}

export class StellarService {
  static async createPaymentStream(formData: PaymentStreamFormData, signal?: AbortSignal): Promise<string> {
    try {
      throwIfAborted(signal)

      // For demo purposes, we'll simulate the transaction
      // In a real implementation, you would:
      // 1. Connect to user's wallet (Freighter, etc.)
      // 2. Get the user's keypair
      // 3. Build and submit the actual transaction to the smart contract

      console.log('Creating payment stream with data:', formData)

      // Convert duration to seconds (using parseFloat to handle fractional durations)
      const durationValue = parseFloat(formData.duration)
      const durationInSeconds = formData.durationUnit === 'days'
        ? durationValue * 24 * 60 * 60
        : durationValue * 60 * 60

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
      console.error('Error creating payment stream:', error)
      throw new Error('Failed to create payment stream: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  static async getAccountInfo(publicKey: string) {
    try {
      const account = await server.loadAccount(publicKey)
      return account
    } catch (error) {
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

  static async getWithdrawableAmount(streamId: string, signal?: AbortSignal): Promise<string> {
    try {
      throwIfAborted(signal)

      // In a real implementation, this would call the smart contract
      // For demo purposes, we'll simulate the calculation

      console.log('Getting withdrawable amount for stream:', streamId)

      // Simulate network delay
      await abortableDelay(1000, signal)

      // Mock calculation - in reality this would be based on:
      // - Current time vs stream start/end time
      // - Total amount and duration
      // - Already withdrawn amount
      const mockWithdrawableAmount = "150.5000000" // 150.5 tokens available

      throwIfAborted(signal)
      return mockWithdrawableAmount
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      console.error('Error getting withdrawable amount:', error)
      throw new Error('Failed to get withdrawable amount')
    }
  }

  static async withdrawFromStream(
    streamId: string,
    formData: WithdrawStreamFormData,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      throwIfAborted(signal)
      console.log('Withdrawing from stream:', streamId, formData)

      // Validate withdrawal amount against available amount
      const availableAmount = await this.getWithdrawableAmount(streamId, signal)
      const requestedAmount = parseFloat(formData.amount)
      const maxAvailable = parseFloat(availableAmount)

      if (!formData.useMax && requestedAmount > maxAvailable) {
        throw new Error(`Insufficient funds. Available: ${availableAmount}`)
      }

      // In a real implementation, you would:
      // 1. Connect to user's wallet
      // 2. Build a transaction to call the withdraw function on the contract
      // 3. Submit the transaction to the network

      // Simulate network delay
      await abortableDelay(2000, signal)
      throwIfAborted(signal)

      // Mock transaction hash
      const txHash = `withdraw_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      return txHash
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      console.error('Error withdrawing from stream:', error)
      throw error instanceof Error ? error : new Error('Failed to withdraw from stream')
    }
  }

  static async getStreamDetails(streamId: string, signal?: AbortSignal): Promise<StreamRecord> {
    try {
      throwIfAborted(signal)
      console.log('Getting stream details for:', streamId)

      // Simulate network delay
      await abortableDelay(500, signal)

      // Mock stream data - in reality this would come from the blockchain
      const mockStream: StreamRecord = {
        id: streamId,
        sender: "GCKFBEIYTKP5RDBQMTVVALONAOPBXICYQPGJGQONRRGZRWCXJWW2BVN7",
        recipient: "GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7",
        token: "USDC",
        tokenSymbol: "USDC",
        totalAmount: "1000.0000000",
        withdrawnAmount: "250.0000000",
        startTime: Date.now() - 86400000, // Started 1 day ago
        endTime: Date.now() + 86400000 * 6, // Ends in 6 days
        status: "Active",
        cancelable: true,
        transferable: false,
      }

      throwIfAborted(signal)
      return mockStream
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      console.error('Error getting stream details:', error)
      throw new Error('Failed to get stream details')
    }
  }

  static formatTokenAmount(amount: string, decimals: number = 7): string {
    const num = parseFloat(amount)
    return num.toFixed(decimals).replace(/\.?0+$/, '')
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
