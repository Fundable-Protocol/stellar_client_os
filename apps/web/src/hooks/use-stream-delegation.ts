import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/utils/notification';
import { isValidStellarAddress } from '@/utils/stellar-validation';
import { StellarService } from '@/lib/stellar';

export function useStreamDelegation() {
  const queryClient = useQueryClient();

  const setDelegate = useMutation({
    mutationFn: async ({ streamId, delegateAddress }: { streamId: string; delegateAddress: string }) => {
      // Validate delegate address before SDK call
      if (!isValidStellarAddress(delegateAddress)) {
        throw new Error('Please enter a valid Stellar address');
      }

      if (!streamId) {
        console.error('Stream ID is required');
        throw new Error('Stream ID is required');
      }

      // In a real implementation, this would call PaymentStreamClient.setDelegate()
      // For now, we simulate the call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Simulate SDK call: PaymentStreamClient.setDelegate(BigInt(streamId), delegateAddress)
      console.log('Setting delegate for stream:', streamId, delegateAddress);

      return { streamId, delegateAddress };
    },
    onSuccess: ({ streamId }: { streamId: string; delegateAddress: string }) => {
      notify.success('txHash123', 'Delegate set successfully');
      // Invalidate the stream detail query to refetch updated delegate info
      queryClient.invalidateQueries({ queryKey: ['stream', streamId] });
      queryClient.invalidateQueries({ queryKey: ['streams'] });
    },
    onError: (error: Error) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set delegate';
      notify.error(errorMessage);
    },
  });

  const revokeDelegate = useMutation({
    mutationFn: async (streamId: string) => {
      if (!streamId) {
        console.error('Stream ID is required');
        throw new Error('Stream ID is required');
      }

      // In a real implementation, this would call PaymentStreamClient.revokeDelegate()
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log('Revoking delegate for stream:', streamId);

      return { streamId };
    },
    onSuccess: ({ streamId }: { streamId: string }) => {
      notify.success('txHash123', 'Delegate revoked');
      // Invalidate the stream detail query to refetch updated delegate info
      queryClient.invalidateQueries({ queryKey: ['stream', streamId] });
      queryClient.invalidateQueries({ queryKey: ['streams'] });
    },
    onError: (error: Error) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to revoke delegate';
      notify.error(errorMessage);
    },
  });

  return {
    setDelegate,
    revokeDelegate,
  };
}
