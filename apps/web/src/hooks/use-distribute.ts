import { QueryClient, QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { distribute } from '@/lib/api';

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

    return useMutation({
        mutationFn: distribute,
        onMutate: async (): Promise<DistributeMutationContext> => {
            const previousStreams = queryClient.getQueriesData({
                queryKey: ['streams'],
            });

            try {
                await queryClient.cancelQueries({ queryKey: ['streams'] });
            } catch (error) {
                console.error('Failed to prepare distribution mutation cache snapshot:', error);
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
