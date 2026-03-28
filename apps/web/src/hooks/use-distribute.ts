import { QueryClient, QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { distribute } from '@/lib/api';
import { useWallet } from '@/providers/StellarWalletProvider';

type DistributeInput = Parameters<typeof distribute>[0];

interface DistributeMutationContext {
    previousStreams: Array<[QueryKey, unknown]>;
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

export function useDistribute() {
    const queryClient = useQueryClient();
    const { address, signTransaction } = useWallet();

    return useMutation({
        mutationFn: (params: DistributeInput) => {
            const sender = params.sender || address;
            if (!sender) {
                throw new Error('Wallet not connected');
            }

            return distribute({
                ...params,
                sender,
                signTransaction,
            });
        },
        onMutate: async (): Promise<DistributeMutationContext> => {
            const previousStreams = queryClient.getQueriesData({
                queryKey: ['streams'],
            });

            try {
                await queryClient.cancelQueries({ queryKey: ['streams'] });
            } catch (error) {
                // Silently fail cache snapshot
            }

            return { previousStreams };
        },
        onError: (_error, _variables, context) => {
            const restored = restorePreviousStreams(queryClient, context?.previousStreams);
            if (!restored) {
                queryClient.invalidateQueries({ queryKey: ['streams'] });
            }
            toast.error('Distribution failed. Refreshing latest data.');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['streams'] });
        },
    });
}
