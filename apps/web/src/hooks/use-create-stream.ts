import { QueryClient, QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { createStream } from '@/lib/api';

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

    return useMutation({
        mutationFn: createStream,
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
                console.error('Failed to apply optimistic stream update:', error);
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
