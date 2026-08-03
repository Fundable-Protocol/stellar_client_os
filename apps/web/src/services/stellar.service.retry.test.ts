// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Networks, Keypair } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';
import type { StellarServiceConfig } from './types';
import { Server as RpcServer, Api } from '@stellar/stellar-sdk/rpc';

// Mock the Stellar SDK modules
vi.mock('@stellar/stellar-sdk/rpc', async () => {
    const actual = await vi.importActual('@stellar/stellar-sdk/rpc');
    return {
        ...actual,
        Server: vi.fn().mockImplementation(() => ({
            getAccount: vi.fn().mockResolvedValue({
                sequenceNumber: () => '1',
                accountId: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
            }),
            simulateTransaction: vi.fn().mockResolvedValue({
                result: { retval: { switch: () => 0 } },
                minResourceFee: '100',
            }),
            sendTransaction: vi.fn().mockResolvedValue({
                hash: '123',
                status: 'SUCCESS',
            }),
            getTransaction: vi.fn(),
        })),
        Api: {
            ...actual.Api,
            isSimulationSuccess: () => true,
            GetTransactionStatus: {
                NOT_FOUND: 'NOT_FOUND',
                SUCCESS: 'SUCCESS',
                FAILED: 'FAILED',
            },
        },
        assembleTransaction: vi.fn().mockReturnValue({
            build: () => ({
                sign: vi.fn(),
            }),
        }),
    };
});

describe('StellarService Retry Logic', () => {
    const testConfig: StellarServiceConfig = {
        network: {
            networkPassphrase: Networks.TESTNET,
            rpcUrl: 'https://soroban-testnet.stellar.org',
            horizonUrl: 'https://horizon-testnet.stellar.org',
        },
        contracts: {
            paymentStream: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
            distributor: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M',
        },
        defaultTimeout: 30,
        maxRetries: 3,
    };

    let service: StellarService;
    let testKeypair: Keypair;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new StellarService(testConfig);
        testKeypair = Keypair.random();
    });

    it('should retry getTransaction when it returns NOT_FOUND', async () => {
        const mockGetTransaction = (service as any).rpcServer.getTransaction;
        
        mockGetTransaction
            .mockResolvedValueOnce({ status: 'NOT_FOUND' })
            .mockResolvedValueOnce({ status: 'NOT_FOUND' })
            .mockResolvedValueOnce({ 
                status: 'SUCCESS', 
                returnValue: { switch: () => 0 } 
            });

        // Use any method that uses submitAndWait, e.g., createStream
        // Need to mock getAccount for createStream simulation/submission
        (service as any).rpcServer.getAccount.mockResolvedValue({
            sequenceNumber: () => '1',
            accountId: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        });

        const params = {
            recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
            token: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
            totalAmount: 1000n,
            startTime: 1000n,
            endTime: 2000n,
        };

        await service.createStream(params, testKeypair);

        expect(mockGetTransaction).toHaveBeenCalledTimes(3);
    });
});
