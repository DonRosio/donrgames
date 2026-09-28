import { buildApp } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(1);
}

const { app } = await buildApp({ config });
await app.listen({ host: config.host, port: config.port });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => process.exit(0));
  });
}
