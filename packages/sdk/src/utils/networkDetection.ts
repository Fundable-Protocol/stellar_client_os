/**
 * Network detection utilities for Stellar
 * 
 * Auto-detect network passphrase from RPC server status
 * to reduce configuration boilerplate for SDK users.
 */

import { SorobanRpc, Networks } from "@stellar/stellar-sdk";

export interface NetworkInfo {
  passphrase: string;
  friendlyName?: string;
  protocolVersion?: number;
}

/**
 * Detect the network passphrase from an RPC server
 * @param rpcUrl The Stellar RPC server URL
 * @returns Network information including passphrase
 */
export async function detectNetworkPassphrase(
  rpcUrl: string
): Promise<NetworkInfo> {
  const server = new SorobanRpc.Server(rpcUrl);
  
  try {
    // Fetch network information from RPC
    const health = await server.getHealth();
    
    // Get network details - the RPC server exposes network passphrase
    // in its getNetwork() method
    const network = await server.getNetwork();
    
    const passphrase = network.passphrase;
    
    // Determine friendly name based on known passphrases
    let friendlyName: string | undefined;
    if (passphrase === Networks.PUBLIC) {
      friendlyName = "Mainnet";
    } else if (passphrase === Networks.TESTNET) {
      friendlyName = "Testnet";
    } else if (passphrase === Networks.FUTURENET) {
      friendlyName = "Futurenet";
    } else if (passphrase.includes("Standalone")) {
      friendlyName = "Standalone";
    }

    return {
      passphrase,
      friendlyName,
      protocolVersion: network.protocolVersion,
    };
  } catch (error) {
    throw new Error(
      `Failed to detect network passphrase from ${rpcUrl}: ${error}`
    );
  }
}

/**
 * Get network passphrase with fallback
 * If passphrase is provided, use it. Otherwise, detect from RPC.
 * @param rpcUrl The Stellar RPC server URL
 * @param providedPassphrase Optional manually provided passphrase
 * @returns The network passphrase to use
 */
export async function getNetworkPassphrase(
  rpcUrl: string,
  providedPassphrase?: string
): Promise<string> {
  if (providedPassphrase) {
    return providedPassphrase;
  }
  
  const networkInfo = await detectNetworkPassphrase(rpcUrl);
  return networkInfo.passphrase;
}

/**
 * Check if an RPC URL is reachable and return network info
 * @param rpcUrl The Stellar RPC server URL
 * @returns Network info if reachable, null otherwise
 */
export async function checkRpcConnection(
  rpcUrl: string
): Promise<NetworkInfo | null> {
  try {
    return await detectNetworkPassphrase(rpcUrl);
  } catch (error) {
    return null;
  }
}
