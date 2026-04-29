'use client';

import { useState, useCallback } from 'react';
import { Horizon } from '@stellar/stellar-sdk';
import { DistributorClient } from '../../../../packages/sdk/src/DistributorClient';
import { useWallet } from '@/providers/StellarWalletProvider';
import { notify } from '@/utils/notification';
import { DISTRIBUTOR_CONTRACT_ID, SOROBAN_RPC_URL, NETWORK_PASSPHRASE } from '@/lib/constants';
import { amountToStroops } from '@/utils/amount-validation';
import type { DistributionState } from '@/types/distribution';

const IS_MAINNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'public';
const HORIZON_URL = IS_MAINNET
  ? 'https://horizon.stellar.org'
  : 'https://horizon-testnet.stellar.org';

const ACCOUNT_CHECK_TIMEOUT_MS = 10_000;

/**
 * Rejects after a given number of milliseconds with a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout checking account: ${label}`)), ms)
    ),
  ]);
}

/**
 * Checks if an account exists on the Stellar network.
 * Rejects with a timeout error if the account does not respond within ACCOUNT_CHECK_TIMEOUT_MS.
 */
async function accountExists(address: string): Promise<boolean> {
  try {
    const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: true });
    await withTimeout(horizon.loadAccount(address), ACCOUNT_CHECK_TIMEOUT_MS, address);
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Timeout checking account:')) {
      throw err;
    }
    return false;
  }
}

/**
 * Checks if the sender has a trustline for the given token and sufficient balance.
 * For native XLM, only checks balance.
 */
async function checkSenderBalance(
  senderAddress: string,
  tokenAddress: string,
  requiredAmount: bigint
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: true });
    const account = await horizon.loadAccount(senderAddress);

    if (tokenAddress === 'native') {
      const xlmBalance = account.balances.find(
        (b): b is Horizon.HorizonApi.BalanceLine<'native'> => b.asset_type === 'native'
      );
      const available = BigInt(Math.floor(parseFloat(xlmBalance?.balance ?? '0') * 1e7));
      // Keep 1 XLM reserve
      const reserve = BigInt(1e7);
      if (available - reserve < requiredAmount) {
        return { ok: false, reason: 'Insufficient XLM balance' };
      }
      return { ok: true };
    }

    // For Soroban/SAC tokens Horizon exposes a `contract_id` field on the balance line.
    // The SDK types don't include it yet, so we extend the known union type.
    type BalanceWithContract = Horizon.HorizonApi.BalanceLine & { contract_id?: string };
    const tokenBalance = (account.balances as BalanceWithContract[]).find(
      (b) => b.asset_type !== 'native' && b.contract_id === tokenAddress
    );

    if (!tokenBalance) {
      return { ok: false, reason: 'Token trustline not found. Add the token to your wallet first.' };
    }

    const available = BigInt(Math.floor(parseFloat(tokenBalance.balance) * 1e7));
    if (available < requiredAmount) {
      return { ok: false, reason: 'Insufficient token balance' };
    }

    return { ok: true };
  } catch {
    // If we can't check, let the contract simulation catch it
    return { ok: true };
  }
}

/**
 * Hook for executing a distribution transaction against the Distributor contract.
 * Handles validation, balance checks, wallet signing, and toast notifications.
 */
export function useDistributionTransaction() {
  const { address, signTransaction } = useWallet();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const execute = useCallback(
    async (state: DistributionState, tokenAddress: string): Promise<boolean> => {
      if (!address) {
        notify.error('Connect your wallet first');
        return false;
      }

      if (!state.isValid) {
        const firstError = state.errors[0]?.message ?? 'Please fix form errors before submitting';
        notify.error(firstError);
        return false;
      }

      const recipients = state.recipients.map((r) => r.address);

      // Pre-flight: check all recipient accounts exist
      notify.loading('Validating recipients...');
      let existenceChecks: boolean[];
      try {
        existenceChecks = await Promise.all(recipients.map(accountExists));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Account validation timed out';
        notify.error(msg);
        return false;
      }
      const missingIndex = existenceChecks.findIndex((exists) => !exists);
      if (missingIndex !== -1) {
        notify.error(
          `Recipient ${missingIndex + 1} (${recipients[missingIndex].slice(0, 8)}...) does not exist on the network`
        );
        return false;
      }

      const recipients = state.recipients.map(r => r.address);

      for (const address of recipients) {
        try {
          const exists = await stellarService.accountExists(address);
          if (!exists) {
            throw new Error(`Account ${address} does not exist or is not funded`);
          }
        } catch (e: any) {
          if (e.message && e.message.includes('not exist')) throw e;
          throw new Error('Network rate limited while verifying accounts. Please wait a moment and try again.');
        }
      }

      let transactionHash: string;
      // Calculate total amount in stroops (7 decimal places)
      let totalStroops: bigint;
      let amountsStroops: bigint[] = [];

      if (state.type === 'equal') {
        totalStroops = amountToStroops(state.totalAmount);
      } else {
        amountsStroops = state.recipients.map((r) => amountToStroops(r.amount!));
        totalStroops = amountsStroops.reduce((sum, a) => sum + a, 0n);
      }

      // Pre-flight: check sender balance
      const balanceCheck = await checkSenderBalance(address, tokenAddress, totalStroops);
      if (!balanceCheck.ok) {
        notify.error(balanceCheck.reason!);
        return false;
      }

      // Check XLM balance for transaction fees
      const xlmCheck = await checkSenderBalance(address, 'native', 100000n); // 0.01 XLM for fees
      if (!xlmCheck.ok) {
        notify.error('Insufficient XLM balance for transaction fees');
        return false;
      }

      setIsSubmitting(true);
      notify.loading('Building transaction...');

      try {
        const client = new DistributorClient({
          contractId: DISTRIBUTOR_CONTRACT_ID,
          networkPassphrase: NETWORK_PASSPHRASE,
          rpcUrl: SOROBAN_RPC_URL,
          publicKey: address,
        });

        let tx;
        if (state.type === 'equal') {
          tx = await client.distributeEqual({
            sender: address,
            token: tokenAddress,
            total_amount: totalStroops,
            recipients,
          });
        } else {
          tx = await client.distributeWeighted({
            sender: address,
            token: tokenAddress,
            recipients,
            amounts: amountsStroops,
          });
        }

        notify.loading('Awaiting wallet signature...');

        // Wrap the wallet's signTransaction (returns string) into the shape
        // the SDK's AssembledTransaction.signAndSend expects: { signedTxXdr: string }
        const sdkSigner = async (xdr: string) => {
          const signedTxXdr = await signTransaction(xdr);
          return { signedTxXdr };
        };

        const sent = await tx.signAndSend({ signTransaction: sdkSigner });

        const txHash = sent.sendTransactionResponse?.hash ?? '';
        notify.success(
          txHash,
          `Successfully distributed to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed';

        // Surface friendly messages for known contract errors
        if (message.includes('insufficient balance') || message.includes('InsufficientBalance')) {
          notify.error('Insufficient balance to complete the distribution');
        } else if (message.includes('no trust') || message.includes('TrustlineMissing')) {
          notify.error('A recipient is missing a trustline for this token');
        } else if (message.includes('User declined') || message.includes('rejected')) {
          notify.error('Transaction rejected by wallet');
        } else {
          notify.error(message, () => execute(state, tokenAddress));
        }

        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [address, signTransaction]
  );

  return { execute, isSubmitting };
}
