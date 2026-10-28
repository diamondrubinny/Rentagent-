import { createServer } from 'node:http';
import { createHandler } from './app';
import { loadConfig } from './config';
import { LicenseStore } from './store';

const config = loadConfig();
const server = createServer(createHandler(config, new LicenseStore(config.dataFile)));
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
server.listen(config.port, () => {
  console.log(`license server listening on :${config.port}`);
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)));
