const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLoopbackHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Stellar SDK server options for the web app.
 * Plain HTTP is only enabled in non-production builds against loopback hosts.
 * Optional RPC header can be provided as a JSON object string or 'Header-Name: value' format.
 */
export function getStellarServerOptions(
  url: string,
  rpcHeader?: string
): { allowHttp: boolean; headers?: Record<string, string> } {
  const isDev = process.env.NODE_ENV !== 'production';
  const options: { allowHttp: boolean; headers?: Record<string, string> } = {
    allowHttp: isDev && isLoopbackHttpUrl(url),
  };

  if (rpcHeader && rpcHeader.trim() !== '') {
    try {
      const parsed = JSON.parse(rpcHeader);
      if (typeof parsed === 'object' && parsed !== null) {
        options.headers = parsed;
      }
    } catch {
      const colonIdx = rpcHeader.indexOf(':');
      if (colonIdx !== -1) {
        const key = rpcHeader.slice(0, colonIdx).trim();
        const val = rpcHeader.slice(colonIdx + 1).trim();
        if (key) {
          options.headers = { [key]: val };
        }
      } else {
        options.headers = { Authorization: rpcHeader.trim() };
      }
    }
  }

  return options;
}
