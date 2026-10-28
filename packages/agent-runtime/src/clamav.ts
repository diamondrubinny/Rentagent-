import { connect } from 'node:net';

export type ScanVerdict =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'error'; message: string };

/**
 * Scans a buffer with clamd's INSTREAM command over TCP.
 * Protocol: "zINSTREAM\0", then chunks prefixed with a 4-byte big-endian length, then a zero length.
 */
export function scanWithClamd(
  buffer: Buffer,
  host: string,
  port = 3310,
  timeoutMs = 60_000,
): Promise<ScanVerdict> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let reply = '';
    const finish = (verdict: ScanVerdict) => {
      socket.destroy();
      resolve(verdict);
    };
    socket.setTimeout(timeoutMs, () => finish({ status: 'error', message: 'timeout' }));
    socket.on('error', (error) => finish({ status: 'error', message: error.message }));
    socket.on('data', (data) => (reply += data.toString('utf8')));
    socket.on('end', () => {
      const text = reply.replace(/\0/g, '').trim();
      if (/:\s*OK$/.test(text)) return finish({ status: 'clean' });
      const found = /:\s*(.+)\s+FOUND$/.exec(text);
      if (found?.[1]) return finish({ status: 'infected', signature: found[1] });
      finish({ status: 'error', message: text.slice(0, 200) || 'empty reply' });
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const chunk = buffer.subarray(offset, offset + chunkSize);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
