#!/usr/bin/env node
// Writes a CycloneDX 1.5 SBOM of the production dependencies and enforces the
// dependency license policy. Usage: node scripts/sbom.mjs [output.json]
// Exit code 1 when a dependency has a forbidden or unknown license.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const output = process.argv[2] ?? 'sbom.cdx.json';
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const allowlist = JSON.parse(readFileSync('scripts/license-allowlist.json', 'utf8'));

// Strong copyleft or source-available licenses cannot ship in a commercial, self-hosted product.
const FORBIDDEN = /\b(?<!L)(A?GPL|SSPL|EUPL|OSL|CPAL|RPL|BUSL|Commons-Clause|Elastic|CC-BY-NC)\b/i;
// Weak copyleft / attribution licenses: allowed, but listed for legal review and notices.
const REVIEW = /\b(LGPL|MPL|EPL|CDDL|CC-BY)\b/i;

const byLicense = JSON.parse(
  execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);

/** SPDX expressions as such; anything else as a plain license name. */
function licenseEntry(license) {
  if (!license) return [];
  const expression = license.replace(/\band\b/g, 'AND').replace(/\bor\b/g, 'OR');
  return /^[\w.+\-() ]+$/.test(expression) ? [{ expression }] : [{ license: { name: license } }];
}

const components = [];
const forbidden = [];
const review = [];
for (const [license, packages] of Object.entries(byLicense)) {
  for (const pkg of packages) {
    for (const version of pkg.versions) {
      const id = `${pkg.name}@${version}`;
      const allowed = allowlist[pkg.name];
      // With "A OR B" the product may pick an acceptable option.
      const options = license.replace(/[()]/g, '').split(/\s+or\s+/i);
      if (
        !license ||
        /^(unknown|unlicensed)$/i.test(license) ||
        options.every((option) => FORBIDDEN.test(option))
      ) {
        if (!allowed) forbidden.push(`${id} (${license || 'no license'})`);
      } else if (REVIEW.test(license)) {
        review.push(`${id} (${license})`);
      }
      const namespace = pkg.name.startsWith('@') ? pkg.name.split('/')[0] : undefined;
      components.push({
        type: 'library',
        'bom-ref': `pkg:npm/${pkg.name}@${version}`,
        ...(namespace ? { group: namespace } : {}),
        name: namespace ? pkg.name.slice(namespace.length + 1) : pkg.name,
        version,
        purl: `pkg:npm/${pkg.name.replace('@', '%40')}@${version}`,
        licenses: licenseEntry(license),
        ...(pkg.homepage
          ? { externalReferences: [{ type: 'website', url: String(pkg.homepage) }] }
          : {}),
      });
    }
  }
}
components.sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref']));

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: 'application', name: root.name, version: root.version },
  },
  components,
};
writeFileSync(output, `${JSON.stringify(sbom, null, 2)}\n`);
console.log(`SBOM: ${components.length} components → ${output}`);
if (review.length)
  console.log(`Licenses to review for notices (${review.length}):\n  ${review.join('\n  ')}`);
if (forbidden.length) {
  console.error(
    `Forbidden or unknown licenses (${forbidden.length}):\n  ${forbidden.join('\n  ')}`,
  );
  console.error(
    'Replace the dependency or add a reviewed exception to scripts/license-allowlist.json.',
  );
  process.exit(1);
}
