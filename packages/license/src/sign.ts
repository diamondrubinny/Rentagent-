// Vendor-side helpers: key generation and signing. Only the license server and the
// vendor CLI import this entry point; installations only verify.
import { createPrivateKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { CHECK_PREFIX, type CheckBody, type CheckResponse } from './state';
import { licensePayloadSchema, type LicensePayload, TOKEN_FORMAT, type VendorKey } from './token';

export interface VendorKeyPair {
  publicKey: VendorKey;
  /** PKCS#8 DER, base64. Keep secret: anyone holding it can issue licenses. */
  privateKey: string;
}

export function generateVendorKey(kid: string): VendorKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    publicKey: { kid, x: String(jwk.x) },
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };
}

function signer(privateKey: string) {
  const key = createPrivateKey({
    key: Buffer.from(privateKey, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return (message: string) => sign(null, Buffer.from(message), key).toString('base64url');
}

export function newLicenseId(): string {
  return `lic_${randomBytes(12).toString('base64url')}`;
}

/** Signs a license; the payload is validated against the same schema installations use. */
export function signLicense(payload: LicensePayload, privateKey: string): string {
  const valid = licensePayloadSchema.parse(payload);
  const body = Buffer.from(JSON.stringify(valid)).toString('base64url');
  const message = `${TOKEN_FORMAT.prefix}.${body}`;
  return `${message}.${signer(privateKey)(message)}`;
}

export function signCheckResponse(body: CheckBody, kid: string, privateKey: string): CheckResponse {
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  return { kid, body: encoded, sig: signer(privateKey)(`${CHECK_PREFIX}.${encoded}`) };
}
