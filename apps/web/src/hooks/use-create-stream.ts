import { QueryClient, QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { createStream } from '@/lib/api';
import { useWallet } from '@/providers/StellarWalletProvider';

type CreateStreamInput = Parameters<typeof createStream>[0];

interface CreateStreamMutationContext {
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

export function useCreateStream() {
    const queryClient = useQueryClient();
    const { address, signTransaction } = useWallet();

    return useMutation({
        mutationFn: (params: CreateStreamInput) => {
            const sender = params.sender || address;
            if (!sender) {
                throw new Error('Wallet not connected');
            }

            return createStream({
                ...params,
                sender,
                signTransaction,
            });
        },
        onMutate: async (newStream): Promise<CreateStreamMutationContext> => {
            const previousStreams = queryClient.getQueriesData({
                queryKey: ['streams'],
            });

            try {
                await queryClient.cancelQueries({ queryKey: ['streams'] });

                queryClient.setQueriesData({ queryKey: ['streams'] }, (old: unknown) => {
                    if (!Array.isArray(old)) {
                        return old;
                    }
                    return [...old, { ...newStream, id: -1, status: 'Active' }];
                });
            } catch (error) {
                // Silently fail optimistic update
            }

            return { previousStreams };
        },
        onError: (_error, _newStream, context) => {
            const restored = restorePreviousStreams(queryClient, context?.previousStreams);
            if (!restored) {
                queryClient.invalidateQueries({ queryKey: ['streams'] });
            }
            toast.error('Failed to create stream. Refreshing latest data.');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['streams'] });
        },
    });
}
