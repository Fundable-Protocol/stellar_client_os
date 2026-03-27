import { useQuery } from '@tanstack/react-query';
import { fetchStream } from '@/lib/api';

export function useStreamDetails(streamId: number | undefined) {
    return useQuery({
        queryKey: ['stream', streamId],
        queryFn: ({ signal }) => (streamId ? fetchStream(streamId, signal) : Promise.resolve(null)),
        enabled: !!streamId,
    });
}
