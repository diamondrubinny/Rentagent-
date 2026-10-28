import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkOnline } from '@rentagent/license';
import { generateVendorKey } from '@rentagent/license/sign';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from '../src/app';
import { loadConfig } from '../src/config';
import { type LicenseRecord, LicenseStore } from '../src/store';

const vendor = generateVendorKey('k1');
const keys = [vendor.publicKey];
let dir = '';
let server: Server;
let url = '';
let store: LicenseStore;

const record = (id: string, extra: Partial<LicenseRecord> = {}): LicenseRecord => ({
  id,
  licensee: 'Acme',
  tier: 'pro',
  domains: ['agents.acme.example'],
  features: ['white_label'],
  maxUsers: null,
  issuedAt: new Date().toISOString(),
  expiresAt: null,
  note: '',
  revokedAt: null,
  lastCheck: null,
  ...extra,
});

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'license-server-'));
  const config = loadConfig({
    LICENSE_PRIVATE_KEY: vendor.privateKey,
    LICENSE_KEY_ID: 'k1',
    LICENSE_DATA_FILE: join(dir, 'licenses.json'),
  });
  store = new LicenseStore(config.dataFile);
  await store.update('lic_active_0001', () => record('lic_active_0001'));
  await store.update('lic_revoked_001', () =>
    record('lic_revoked_001', { revokedAt: new Date().toISOString() }),
  );
  server = createServer(createHandler(config, store));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const ask = (licenseId: string) =>
  checkOnline(url, { licenseId, domain: 'Agents.Acme.Example', version: '1.2.3' }, keys);

describe('license server', () => {
  it('confirms active licenses and records only id, domain and version', async () => {
    expect(await ask('lic_active_0001')).toMatchObject({ status: 'valid' });
    const saved = JSON.parse(await readFile(join(dir, 'licenses.json'), 'utf8'));
    expect(saved.licenses.lic_active_0001.lastCheck).toMatchObject({
      domain: 'agents.acme.example',
      version: '1.2.3',
    });
  });

  it('reports revoked and unknown licenses without storing unknown ids', async () => {
    expect(await ask('lic_revoked_001')).toMatchObject({ status: 'revoked' });
    expect(await ask('lic_unknown_001')).toMatchObject({ status: 'unknown' });
    expect(await store.get('lic_unknown_001')).toBeNull();
  });

  it('sees changes made by another process (the CLI)', async () => {
    const cli = new LicenseStore(join(dir, 'licenses.json'));
    await cli.update('lic_active_0001', (current) =>
      current ? { ...current, revokedAt: new Date().toISOString() } : null,
    );
    expect(await ask('lic_active_0001')).toMatchObject({ status: 'revoked' });
    await cli.update('lic_active_0001', (current) =>
      current ? { ...current, revokedAt: null } : null,
    );
    expect(await ask('lic_active_0001')).toMatchObject({ status: 'valid' });
  });

  it('rejects bad requests', async () => {
    const post = (body: string) => fetch(`${url}/v1/check`, { method: 'POST', body });
    expect((await post('{')).status).toBe(400);
    expect((await post(JSON.stringify({ licenseId: 'x' }))).status).toBe(400);
    expect(
      (
        await post(
          JSON.stringify({
            licenseId: 'lic_active_0001',
            domain: 'a',
            version: '1',
            nonce: 'n'.repeat(20),
            extra: 1,
          }),
        )
      ).status,
    ).toBe(400);
    expect((await post('x'.repeat(5000))).status).toBe(413);
    expect((await fetch(`${url}/v1/check`)).status).toBe(405);
    expect((await fetch(`${url}/nope`)).status).toBe(404);
    expect((await fetch(`${url}/health`)).status).toBe(200);
  });

  it('rate-limits each client', async () => {
    const config = loadConfig({ LICENSE_PRIVATE_KEY: vendor.privateKey, LICENSE_KEY_ID: 'k1' });
    const limited = createServer(createHandler(config, store));
    await new Promise<void>((resolve) => limited.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(limited.address() as AddressInfo).port}/v1/check`;
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++)
      statuses.push((await fetch(base, { method: 'POST', body: '{}' })).status);
    limited.close();
    expect(statuses.slice(0, 60).every((status) => status === 400)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
  });

  it('refuses to start without a signing key', () => {
    expect(() => loadConfig({})).toThrow(/LICENSE_PRIVATE_KEY/);
  });
});
