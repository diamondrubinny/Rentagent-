import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

/** IPv4 ranges an agent must never reach (loopback, private, link-local, CGNAT, reserved, multicast). */
const BLOCKED_V4: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10 CGNAT
  [0x7f000000, 8], // 127.0.0.0/8
  [0xa9fe0000, 16], // 169.254.0.0/16 link-local / metadata
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0000000, 24], // 192.0.0.0/24
  [0xc0000200, 24], // 192.0.2.0/24 TEST-NET-1
  [0xc0a80000, 16], // 192.168.0.0/16
  [0xc6120000, 15], // 198.18.0.0/15 benchmarking
  [0xc6336400, 24], // 198.51.100.0/24 TEST-NET-2
  [0xcb007100, 24], // 203.0.113.0/24 TEST-NET-3
  [0xe0000000, 3], // 224.0.0.0/3 multicast + reserved
];

function ipv4ToInt(address: string): number {
  return address.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function mappedIpv4(address: string): string | null {
  const match = /^(?:0{0,4}:){0,5}:?ffff:(.+)$/.exec(address);
  if (!match?.[1]) return null;
  if (isIP(match[1]) === 4) return match[1];
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(match[1]);
  if (!hex?.[1] || !hex[2]) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

/** True for any address that is not a public unicast address. */
export function isNonPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const value = ipv4ToInt(address);
    return BLOCKED_V4.some(([base, bits]) => value >>> (32 - bits) === base >>> (32 - bits));
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const mapped = mappedIpv4(lower);
    if (mapped) return isNonPublicAddress(mapped);
    const first = Number.parseInt(lower.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (lower.startsWith('64:ff9b:')) return true; // NAT64 can reach internal IPv4
    if (lower.startsWith('2001:db8:')) return true; // documentation
    return false;
  }
  return true;
}

export class BlockedDestinationError extends Error {
  constructor(
    readonly reason: 'protocol' | 'credentials' | 'private' | 'not_allowed' | 'unresolvable',
  ) {
    super(`Destination blocked: ${reason}`);
    this.name = 'BlockedDestinationError';
  }
}

/** Matches "example.com" exactly or "*.example.com" for subdomains (and the apex). */
export function hostAllowed(host: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  const target = host.toLowerCase().replace(/\.$/, '');
  return allowlist.some((entry) => {
    const rule = entry.toLowerCase();
    if (rule.startsWith('*.')) {
      const apex = rule.slice(2);
      return target === apex || target.endsWith(`.${apex}`);
    }
    return target === rule;
  });
}

/** Validates the URL shape and host before any network activity. */
export function assertPublicUrl(value: string, allowlist: readonly string[] = []): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BlockedDestinationError('protocol');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new BlockedDestinationError('protocol');
  if (url.username || url.password) throw new BlockedDestinationError('credentials');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    throw new BlockedDestinationError('private');
  }
  if (isIP(host) && isNonPublicAddress(host)) throw new BlockedDestinationError('private');
  if (!hostAllowed(host, allowlist)) throw new BlockedDestinationError('not_allowed');
  return url;
}

/**
 * DNS lookup used at connection time: every resolved address is checked, so DNS
 * rebinding (public at check time, private at connect time) cannot bypass the guard.
 */
function guardedLookup(
  hostname: string,
  options: object,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '');
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => isNonPublicAddress(entry.address))) {
      const blocked = Object.assign(new Error('Destination resolves to a non-public address'), {
        code: 'EBLOCKED',
      });
      return callback(blocked, '');
    }
    const all = (options as { all?: boolean }).all;
    if (all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

const publicAgent = new Agent({ connect: { lookup: guardedLookup, timeout: 10_000 } });

export interface SafeFetchOptions {
  allowlist?: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

/**
 * Fetch for agent tools: public destinations only, every redirect re-validated,
 * response size and time capped, body decoded as text.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const { allowlist = [], maxBytes = 512 * 1024, timeoutMs = 15_000, maxRedirects = 3 } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  let url = assertPublicUrl(rawUrl, allowlist);
  for (let hop = 0; ; hop++) {
    let response;
    try {
      response = await undiciFetch(url, {
        method: options.method ?? 'GET',
        headers: {
          'user-agent': 'RentAgent/1.0 (+agent tool)',
          accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5',
          ...options.headers,
        },
        body: options.body,
        redirect: 'manual',
        signal,
        dispatcher: publicAgent,
      });
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code === 'EBLOCKED') throw new BlockedDestinationError('private');
      if (code === 'ENOTFOUND') throw new BlockedDestinationError('unresolvable');
      throw error;
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (hop >= maxRedirects) throw new Error('Too many redirects');
      url = assertPublicUrl(new URL(response.headers.get('location')!, url).toString(), allowlist);
      await response.body?.cancel();
      continue;
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let truncated = false;
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          chunks.push(value.subarray(0, value.byteLength - (received - maxBytes)));
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    return {
      url: url.toString(),
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      body: Buffer.concat(chunks).toString('utf8'),
      truncated,
    };
  }
}
