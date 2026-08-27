import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createStreamMock, toastErrorMock, walletMock } = vi.hoisted(() => ({
  createStreamMock: vi.fn(),
  toastErrorMock: vi.fn(),
  walletMock: {
    address: 'GSENDER' as string | null,
    signTransaction: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({ createStream: createStreamMock }));
vi.mock('@/providers/StellarWalletProvider', () => ({ useWallet: () => walletMock }));
vi.mock('react-hot-toast', () => ({ default: { error: toastErrorMock } }));

import { useCreateStream } from './use-create-stream';

const streamInput = {
  recipient: 'GRECIPIENT',
  token: 'CTOKEN',
  amount: 100n,
  startTime: 1_700_000_000,
  endTime: 1_700_003_600,
};

function createWrapper(queryClient: QueryClient) {
  function QueryClientWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }

  return QueryClientWrapper;
}

describe('useCreateStream', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    walletMock.address = 'GSENDER';
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it('optimistically appends an active stream and refetches after creation', async () => {
    let resolveCreate!: (streamId: number) => void;
    createStreamMock.mockImplementation(
      () => new Promise<number>((resolve) => { resolveCreate = resolve; })
    );
    queryClient.setQueryData(['streams', 'GSENDER'], [{ id: 7, status: 'Active' }]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateStream(), {
      wrapper: createWrapper(queryClient),
    });

    let mutation!: Promise<number>;
    act(() => {
      mutation = result.current.mutateAsync(streamInput);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['streams', 'GSENDER'])).toEqual([
        { id: 7, status: 'Active' },
        { ...streamInput, id: -1, status: 'Active' },
      ]);
    });
    expect(createStreamMock).toHaveBeenCalledWith({
      ...streamInput,
      sender: 'GSENDER',
      signTransaction: walletMock.signTransaction,
    });

    resolveCreate(8);
    await expect(mutation).resolves.toBe(8);
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['streams'] });
    });
  });

  it('restores all stream caches and notifies the user when creation fails', async () => {
    createStreamMock.mockRejectedValue(new Error('Network unavailable'));
    const userStreams = [{ id: 7, status: 'Active' }];
    const dashboardStreams = [{ id: 3, status: 'Paused' }];
    queryClient.setQueryData(['streams', 'GSENDER'], userStreams);
    queryClient.setQueryData(['streams', 'dashboard'], dashboardStreams);
    const { result } = renderHook(() => useCreateStream(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync(streamInput)).rejects.toThrow('Network unavailable');

    expect(queryClient.getQueryData(['streams', 'GSENDER'])).toEqual(userStreams);
    expect(queryClient.getQueryData(['streams', 'dashboard'])).toEqual(dashboardStreams);
    expect(toastErrorMock).toHaveBeenCalledWith('Failed to create stream. Refreshing latest data.');
  });

  it('uses an explicit sender instead of the connected wallet address', async () => {
    createStreamMock.mockResolvedValue(8);
    const { result } = renderHook(() => useCreateStream(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({ ...streamInput, sender: 'GOVERRIDE' })).resolves.toBe(8);

    expect(createStreamMock).toHaveBeenCalledWith(expect.objectContaining({ sender: 'GOVERRIDE' }));
  });

  it('rejects stream creation when neither an input sender nor a wallet is available', async () => {
    walletMock.address = null;
    const { result } = renderHook(() => useCreateStream(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync(streamInput)).rejects.toThrow('Wallet not connected');
    expect(createStreamMock).not.toHaveBeenCalled();
  });
});
