const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function shouldAllowLocalHttp(url: string, allowHttp = false): boolean {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:') {
    return false;
  }

  if (!allowHttp || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      'HTTP Stellar RPC URLs are only allowed for loopback development endpoints when allowHttp is set to true'
    );
  }

  return true;
}
