import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Hostnames of cloud instance-metadata services (credential theft via SSRF). */
const BLOCKED_HOSTS = new Set([
  'metadata.google.internal',
  'metadata',
  'metadata.azure.com',
  'instance-data',
  'instance-data.ec2.internal',
]);

/**
 * Extracts the IPv4 address from an IPv4-mapped IPv6 address in either notation:
 * "::ffff:169.254.169.254" or the normalized hex form "::ffff:a9fe:a9fe".
 */
function ipv4FromMapped(address: string): string | null {
  const match = /^(?:0{0,4}:){0,4}:?(?:0{0,4}:)?ffff:(.+)$/.exec(address);
  if (!match?.[1]) return null;
  const rest = match[1];
  if (isIP(rest) === 4) return rest;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
  if (!hex?.[1] || !hex[2]) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
    if (a === 100 && b === 100) return address === '100.100.100.200'; // Alibaba metadata
    if (a === 0) return true;
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    ) {
      return true; // fe80::/10 link-local
    }
    if (lower === 'fd00:ec2::254') return true; // AWS IPv6 metadata
    const mapped = ipv4FromMapped(lower);
    if (mapped) return isBlockedAddress(mapped);
    return false;
  }
  return false;
}

export type EndpointCheck =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid' | 'protocol' | 'credentials' | 'blocked' | 'unresolvable' };

/**
 * Validates an operator-supplied API base URL. Private network addresses are allowed
 * on purpose (self-hosted models), but cloud metadata endpoints are never reachable.
 * DNS is resolved so a hostname cannot point at a metadata address.
 */
export async function checkEndpointUrl(
  value: string,
  resolve: (host: string) => Promise<string[]> = async (host) =>
    (await lookup(host, { all: true })).map((entry) => entry.address),
): Promise<EndpointCheck> {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    return { ok: false, reason: 'protocol' };
  if (url.username || url.password) return { ok: false, reason: 'credentials' };
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isBlockedAddress(host)) return { ok: false, reason: 'blocked' };
  if (!isIP(host)) {
    let addresses: string[];
    try {
      addresses = await resolve(host);
    } catch {
      return { ok: false, reason: 'unresolvable' };
    }
    if (addresses.some(isBlockedAddress)) return { ok: false, reason: 'blocked' };
  }
  url.hash = '';
  url.search = '';
  return { ok: true, url: url.toString().replace(/\/+$/, '') };
}
