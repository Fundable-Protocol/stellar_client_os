import { QueryClient, QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { distribute } from '@/lib/api';
import { useWallet } from '@/providers/StellarWalletProvider';
import { createBatches } from '@fundable/sdk';

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
        mutationFn: async (params: DistributeInput) => {
            const sender = params.sender || address;
            if (!sender) {
                throw new Error('Wallet not connected');
            }

            const BATCH_SIZE = 100;
            if (params.recipients.length > BATCH_SIZE) {
                const recipientBatches = createBatches(params.recipients, BATCH_SIZE);
                if (typeof params.amounts === 'bigint') {
                    for (const batch of recipientBatches) {
                        await distribute({
                            ...params,
                            recipients: batch,
                            sender,
                            signTransaction,
                        });
                    }
                    return;
                } else {
                    const amountBatches = createBatches(params.amounts, BATCH_SIZE);
                    for (let i = 0; i < recipientBatches.length; i++) {
                        await distribute({
                            ...params,
                            recipients: recipientBatches[i],
                            amounts: amountBatches[i],
                            sender,
                            signTransaction,
                        });
                    }
                    return;
                }
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
