import { describe, expect, it } from 'vitest';
import { checkEndpointUrl } from '../src/url-guard';

const resolver = (map: Record<string, string[]>) => async (host: string) => {
  if (!map[host]) throw new Error('ENOTFOUND');
  return map[host];
};

describe('checkEndpointUrl', () => {
  const resolve = resolver({
    'api.example.com': ['93.184.216.34'],
    ollama: ['172.18.0.5'],
    'evil.example': ['169.254.169.254'],
  });

  it('accepts public and private endpoints and normalizes them', async () => {
    expect(await checkEndpointUrl('https://api.example.com/v1/?x=1#y', resolve)).toEqual({
      ok: true,
      url: 'https://api.example.com/v1',
    });
    expect(await checkEndpointUrl('http://ollama:11434/v1', resolve)).toMatchObject({ ok: true });
    expect(await checkEndpointUrl('http://10.0.0.5:8000/v1', resolve)).toMatchObject({ ok: true });
  });

  it.each([
    ['ftp://api.example.com', 'protocol'],
    ['file:///etc/passwd', 'protocol'],
    ['https://user:pass@api.example.com', 'credentials'],
    ['http://169.254.169.254/latest/meta-data', 'blocked'],
    ['http://metadata.google.internal/', 'blocked'],
    ['http://[fe80::1]/', 'blocked'],
    ['http://[::ffff:169.254.169.254]/', 'blocked'],
    ['http://[::ffff:a9fe:a9fe]/', 'blocked'],
    ['http://[0:0:0:0:0:ffff:a9fe:a9fe]/', 'blocked'],
    ['http://[fd00:ec2::254]/', 'blocked'],
    ['http://0.0.0.0/', 'blocked'],
    ['http://evil.example/v1', 'blocked'],
    ['https://nowhere.invalid', 'unresolvable'],
    ['not a url', 'invalid'],
  ])('rejects %s (%s)', async (url, reason) => {
    expect(await checkEndpointUrl(url, resolve)).toEqual({ ok: false, reason });
  });
});
