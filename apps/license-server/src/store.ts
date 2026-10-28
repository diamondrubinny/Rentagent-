import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** What the vendor keeps about an issued license (the token itself is not stored). */
export interface LicenseRecord {
  id: string;
  licensee: string;
  tier: string;
  domains: string[];
  features: string[];
  maxUsers: number | null;
  issuedAt: string;
  expiresAt: string | null;
  note: string;
  revokedAt: string | null;
  /** Last online check: only what the installation sends (no user data). */
  lastCheck: { at: string; domain: string; version: string } | null;
}

interface StoreFile {
  version: 1;
  licenses: Record<string, LicenseRecord>;
}

/**
 * A small JSON file store: vendors issue few licenses, and a file is easy to back
 * up. Writes are serialised and atomic (temporary file + rename). The file is
 * re-read when it changes, so the CLI can revoke licenses while the server runs.
 */
export class LicenseStore {
  private data: StoreFile | null = null;
  private loadedVersion = '';
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  private async fileVersion(): Promise<string> {
    try {
      const info = await stat(this.file);
      return `${info.mtimeMs}:${info.size}:${info.ino}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
      throw error;
    }
  }

  private async load(): Promise<StoreFile> {
    const version = await this.fileVersion();
    if (this.data && version === this.loadedVersion) return this.data;
    if (version === 'missing') {
      this.data = { version: 1, licenses: {} };
    } else {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as StoreFile;
      if (parsed.version !== 1 || typeof parsed.licenses !== 'object')
        throw new Error('unsupported store file');
      this.data = parsed;
    }
    this.loadedVersion = version;
    return this.data;
  }

  async get(id: string): Promise<LicenseRecord | null> {
    const data = await this.load();
    return Object.hasOwn(data.licenses, id) ? data.licenses[id]! : null;
  }

  async list(): Promise<LicenseRecord[]> {
    return Object.values((await this.load()).licenses).sort((a, b) =>
      a.issuedAt.localeCompare(b.issuedAt),
    );
  }

  /** Applies a change to one record (or creates it) and saves the file. */
  update(
    id: string,
    change: (current: LicenseRecord | null) => LicenseRecord | null,
  ): Promise<LicenseRecord | null> {
    const next = this.queue.then(async () => {
      const data = await this.load();
      const updated = change(Object.hasOwn(data.licenses, id) ? data.licenses[id]! : null);
      if (!updated) return null;
      data.licenses[id] = updated;
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.file);
      this.loadedVersion = await this.fileVersion();
      return updated;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
