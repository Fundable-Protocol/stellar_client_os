/**
 * Test shim for `@stellar/freighter-api`.
 *
 * The published package ships a UMD bundle whose named exports (`getAddress`,
 * `signTransaction`, …) Node's CommonJS lexer cannot detect, so
 * `import { getAddress } from "@stellar/freighter-api"` throws
 * "does not provide an export named 'getAddress'". The wallet kit imports the
 * package that way.
 *
 * This module loads the package through CommonJS and re-exports the named
 * bindings explicitly so the wallet kit can be imported under Vitest.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface FreighterApi {
  getAddress: () => Promise<string>;
  requestAccess: () => Promise<string>;
  signTransaction: (transaction: unknown, opts?: unknown) => Promise<string>;
  signAuthEntry: (entry: unknown, opts?: unknown) => Promise<string>;
  signMessage: (message: string, opts?: unknown) => Promise<string>;
  getNetwork: () => Promise<string>;
  getNetworkDetails: () => Promise<unknown>;
  isConnected: () => Promise<boolean>;
  isAllowed: () => Promise<boolean>;
  isBrowser: () => boolean;
  addToken: (token: unknown) => Promise<unknown>;
  WatchWalletChanges: (callback: (event: unknown) => void) => void;
}

const freighterApi = require("@stellar/freighter-api") as FreighterApi;

export const getAddress = freighterApi.getAddress;
export const requestAccess = freighterApi.requestAccess;
export const signTransaction = freighterApi.signTransaction;
export const signAuthEntry = freighterApi.signAuthEntry;
export const signMessage = freighterApi.signMessage;
export const getNetwork = freighterApi.getNetwork;
export const getNetworkDetails = freighterApi.getNetworkDetails;
export const isConnected = freighterApi.isConnected;
export const isAllowed = freighterApi.isAllowed;
export const isBrowser = freighterApi.isBrowser;
export const addToken = freighterApi.addToken;
export const WatchWalletChanges = freighterApi.WatchWalletChanges;

export default freighterApi;
