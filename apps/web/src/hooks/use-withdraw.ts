import { QueryClient, QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { withdraw } from '@/lib/api';
import { useWallet } from '@/providers/StellarWalletProvider';

type WithdrawInput = Parameters<typeof withdraw>[0];

interface WithdrawMutationContext {
    previousStreams: Array<[QueryKey, unknown]>;
    streamQueryKey?: QueryKey;
    previousStream?: unknown;
}

function restorePreviousStreams(
    queryClient: QueryClient,
    previousStreams: Array<[QueryKey, unknown]> | undefined
): boolean {
    if (!previousStreams?.length) {
        return false;
    }

    previousStreams.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
    });

    return true;
}

export function useWithdraw() {
    const queryClient = useQueryClient();
    const { address, signTransaction } = useWallet();

    return useMutation({
        mutationFn: (params: WithdrawInput) => {
            return withdraw({
                ...params,
                sender: params.sender || address || undefined,
                signTransaction,
            });
        },
        onMutate: async (variables): Promise<WithdrawMutationContext> => {
            const previousStreams = queryClient.getQueriesData({
                queryKey: ['streams'],
            });
            const streamQueryKey: QueryKey | undefined =
                typeof variables?.streamId === 'number' ? ['stream', variables.streamId] : undefined;
            const previousStream = streamQueryKey
                ? queryClient.getQueryData(streamQueryKey)
                : undefined;

            try {
                await queryClient.cancelQueries({ queryKey: ['streams'] });
                if (streamQueryKey) {
                    await queryClient.cancelQueries({ queryKey: streamQueryKey });
                }
            } catch (error) {
                // Silently fail cache snapshot
            }

            return { previousStreams, streamQueryKey, previousStream };
        },
        onError: (_error, variables, context) => {
            const restoredStreams = restorePreviousStreams(queryClient, context?.previousStreams);
            let restoredStreamDetails = false;

            if (context?.streamQueryKey && typeof context.previousStream !== 'undefined') {
                queryClient.setQueryData(context.streamQueryKey, context.previousStream);
                restoredStreamDetails = true;
            }

            if (!restoredStreams && !restoredStreamDetails) {
                queryClient.invalidateQueries({ queryKey: ['streams'] });
                if (typeof variables?.streamId === 'number') {
                    queryClient.invalidateQueries({ queryKey: ['stream', variables.streamId] });
                }
            }

            toast.error('Withdraw failed. Refreshing latest data.');
        },
        onSettled: (_data, _error, variables) => {
            queryClient.invalidateQueries({ queryKey: ['streams'] });
            if (typeof variables?.streamId === 'number') {
                queryClient.invalidateQueries({ queryKey: ['stream', variables.streamId] });
            }
        },
    });
}
