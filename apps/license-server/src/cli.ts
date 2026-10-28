// Vendor CLI: create signing keys, issue, revoke and list licenses.
import { parseArgs } from 'node:util';
import { LICENSE_FEATURES, LICENSE_TIERS, type LicensePayload } from '@rentagent/license';
import { generateVendorKey, newLicenseId, signLicense } from '@rentagent/license/sign';
import { LicenseStore } from './store';

const USAGE = `Usage: license-admin <command> [options]

  keygen [--kid k1]                   Create a signing key pair
  issue --licensee NAME --domain HOST [--domain HOST…] [--tier standard|pro|enterprise]
        [--feature white_label…] [--max-users N] [--expires YYYY-MM-DD] [--note TEXT]
  revoke ID | unrevoke ID             Change a license's status for online checks
  list                                Show issued licenses

Environment: LICENSE_PRIVATE_KEY, LICENSE_KEY_ID, LICENSE_DATA_FILE (default ./data/licenses.json)`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function signingKey() {
  const privateKey = process.env.LICENSE_PRIVATE_KEY?.trim();
  const kid = process.env.LICENSE_KEY_ID?.trim();
  if (!privateKey || !kid) fail('LICENSE_PRIVATE_KEY and LICENSE_KEY_ID must be set.');
  return { privateKey, kid };
}

const store = () =>
  new LicenseStore(process.env.LICENSE_DATA_FILE?.trim() || './data/licenses.json');

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      kid: { type: 'string', default: 'k1' },
      licensee: { type: 'string' },
      domain: { type: 'string', multiple: true },
      tier: { type: 'string', default: 'standard' },
      feature: { type: 'string', multiple: true },
      'max-users': { type: 'string' },
      expires: { type: 'string' },
      note: { type: 'string', default: '' },
    },
  });
  switch (command) {
    case 'keygen': {
      const pair = generateVendorKey(values.kid!);
      console.log('Public key — add to packages/license/src/keys.ts (VENDOR_PUBLIC_KEYS):');
      console.log(`  ${JSON.stringify(pair.publicKey)}`);
      console.log('\nPrivate key — store in a secret manager, never in git:');
      console.log(`  LICENSE_KEY_ID=${pair.publicKey.kid}`);
      console.log(`  LICENSE_PRIVATE_KEY=${pair.privateKey}`);
      return;
    }
    case 'issue': {
      const { privateKey, kid } = signingKey();
      if (!values.licensee) fail('--licensee is required.');
      if (!values.domain?.length) fail('--domain is required.');
      if (!(LICENSE_TIERS as readonly string[]).includes(values.tier!)) fail('Unknown --tier.');
      const features = values.feature ?? [];
      for (const feature of features)
        if (!(LICENSE_FEATURES as readonly string[]).includes(feature))
          fail(`Unknown --feature ${feature}.`);
      const maxUsers = values['max-users'] ? Number(values['max-users']) : null;
      if (maxUsers !== null && (!Number.isInteger(maxUsers) || maxUsers < 1))
        fail('--max-users must be a positive whole number.');
      let expiresAt: string | null = null;
      if (values.expires) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(values.expires)) fail('--expires must be YYYY-MM-DD.');
        expiresAt = new Date(`${values.expires}T23:59:59Z`).toISOString();
      }
      const payload: LicensePayload = {
        v: 1,
        kid,
        id: newLicenseId(),
        licensee: values.licensee,
        domains: values.domain.map((domain) => domain.toLowerCase()),
        tier: values.tier as LicensePayload['tier'],
        features,
        maxUsers,
        issuedAt: new Date().toISOString(),
        expiresAt,
      };
      let token: string;
      try {
        token = signLicense(payload, privateKey);
      } catch {
        fail('The license data is invalid (check the domains and the licensee name).');
      }
      await store().update(payload.id, () => ({
        id: payload.id,
        licensee: payload.licensee,
        tier: payload.tier,
        domains: payload.domains,
        features,
        maxUsers,
        issuedAt: payload.issuedAt,
        expiresAt,
        note: values.note ?? '',
        revokedAt: null,
        lastCheck: null,
      }));
      console.log(`Issued ${payload.id}. Send this key to the customer:\n\n${token}`);
      return;
    }
    case 'revoke':
    case 'unrevoke': {
      const id = positionals[0];
      if (!id) fail('A license id is required.');
      const updated = await store().update(id, (current) =>
        current
          ? { ...current, revokedAt: command === 'revoke' ? new Date().toISOString() : null }
          : null,
      );
      if (!updated) fail(`No license ${id}.`);
      console.log(`${id}: ${command === 'revoke' ? 'revoked' : 'active again'}.`);
      return;
    }
    case 'list': {
      for (const record of await store().list())
        console.log(
          [
            record.id,
            record.revokedAt ? 'REVOKED' : 'active',
            record.tier,
            record.licensee,
            record.domains.join(','),
            record.expiresAt?.slice(0, 10) ?? 'no-expiry',
            record.lastCheck
              ? `seen ${record.lastCheck.at.slice(0, 10)} v${record.lastCheck.version}`
              : 'never seen',
          ].join('\t'),
        );
      return;
    }
    default:
      fail(command ? `Unknown command ${command}.` : 'No command given.');
  }
}

await main(process.argv.slice(2));
