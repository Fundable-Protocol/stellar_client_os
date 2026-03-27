import { useQuery } from '@tanstack/react-query';
import { fetchUserStreams } from '@/lib/api';

export function useStreams(address: string | undefined) {
    return useQuery({
        queryKey: ['streams', address],
        queryFn: ({ signal }) => (address ? fetchUserStreams(address, signal) : Promise.resolve([])),
        enabled: !!address,
        staleTime: 60 * 1000,
    });
}
