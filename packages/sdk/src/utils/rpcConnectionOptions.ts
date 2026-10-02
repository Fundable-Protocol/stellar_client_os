/**
 * Helpers for safely configuring Stellar RPC / Horizon HTTP connections.
 *
 * Plain HTTP is only permitted for local loopback endpoints when the caller
 * explicitly opts in via `allowHttp: true`.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface RpcConnectionOptions {
  /** Opt in to plain HTTP for local loopback RPC/Horizon URLs. Defaults to false. */
  allowHttp?: boolean;
}

/**
 * Returns true when `url` uses plain HTTP against a local loopback host.
 */
export function isLoopbackHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:') {
    return false;
  }

  return LOOPBACK_HOSTNAMES.has(parsed.hostname);
}

/**
 * Rejects non-loopback plain-HTTP URLs before any network client is created.
 */
export function assertSecureRpcUrl(url: string): void {
  if (url.startsWith('http://') && !isLoopbackHttpUrl(url)) {
    throw new Error(
      `Insecure RPC URL rejected: "${url}". Use https:// for remote hosts. ` +
        'Plain HTTP is only permitted for local development against ' +
        'http://localhost, http://127.0.0.1, or http://[::1] with allowHttp: true.'
    );
  }
}

/**
 * Resolves Stellar SDK `{ allowHttp }` server options from a URL and caller config.
 */
export function resolveRpcServerOptions(
  url: string,
  options: RpcConnectionOptions = {}
): { allowHttp: boolean } {
  assertSecureRpcUrl(url);

  const requestedAllowHttp = options.allowHttp ?? false;
  if (requestedAllowHttp) {
    if (!isLoopbackHttpUrl(url)) {
      throw new Error(
        'allowHttp: true is only permitted for loopback HTTP URLs ' +
          '(http://localhost, http://127.0.0.1, http://[::1]). ' +
          `Got: "${url}"`
      );
    }
    return { allowHttp: true };
  }

  if (isLoopbackHttpUrl(url)) {
    throw new Error(
      'Plain HTTP for loopback RPC URLs requires explicit allowHttp: true.'
    );
  }

  return { allowHttp: false };
}
