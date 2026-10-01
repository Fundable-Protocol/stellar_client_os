import { describe, it, expect } from 'vitest';
import {
  assertSecureRpcUrl,
  isLoopbackHttpUrl,
  resolveRpcServerOptions,
} from '../utils/rpcConnectionOptions.js';

describe('rpcConnectionOptions', () => {
  describe('isLoopbackHttpUrl', () => {
    it.each([
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://[::1]:8000',
    ])('returns true for %s', (url) => {
      expect(isLoopbackHttpUrl(url)).toBe(true);
    });

    it.each([
      'https://localhost:8000',
      'http://example.com',
      'http://192.168.1.1',
      'https://soroban-testnet.stellar.org',
    ])('returns false for %s', (url) => {
      expect(isLoopbackHttpUrl(url)).toBe(false);
    });
  });

  describe('assertSecureRpcUrl', () => {
    it('allows https URLs', () => {
      expect(() =>
        assertSecureRpcUrl('https://soroban-testnet.stellar.org')
      ).not.toThrow();
    });

    it('allows loopback http URLs', () => {
      expect(() => assertSecureRpcUrl('http://localhost:8000')).not.toThrow();
    });

    it('rejects non-loopback http URLs', () => {
      expect(() => assertSecureRpcUrl('http://evil.example/rpc')).toThrow(
        /Insecure RPC URL rejected/
      );
    });
  });

  describe('resolveRpcServerOptions', () => {
    it('defaults allowHttp to false for https URLs', () => {
      expect(
        resolveRpcServerOptions('https://soroban-testnet.stellar.org')
      ).toEqual({ allowHttp: false });
    });

    it('requires explicit opt-in for loopback http URLs', () => {
      expect(() => resolveRpcServerOptions('http://localhost:8000')).toThrow(
        /requires explicit allowHttp: true/
      );
    });

    it('enables allowHttp for loopback http URLs when explicitly requested', () => {
      expect(
        resolveRpcServerOptions('http://localhost:8000', { allowHttp: true })
      ).toEqual({ allowHttp: true });
    });

    it('rejects allowHttp for non-loopback http URLs', () => {
      expect(() =>
        resolveRpcServerOptions('http://evil.example/rpc', { allowHttp: true })
      ).toThrow(/Insecure RPC URL rejected/);
    });

    it('rejects non-loopback http URLs even without allowHttp', () => {
      expect(() => resolveRpcServerOptions('http://evil.example/rpc')).toThrow(
        /Insecure RPC URL rejected/
      );
    });
  });
});
