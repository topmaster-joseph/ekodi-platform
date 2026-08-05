import { resolve } from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: resolve(import.meta.dirname, 'src/worker.ts'),
      wrangler: { configPath: resolve(import.meta.dirname, 'wrangler.toml') },
      miniflare: {
        bindings: {
          SETUP_TOKEN: 'integration-test-setup-token',
          TEST_MIGRATIONS: await readD1Migrations(resolve(import.meta.dirname, 'migrations'))
        }
      }
    }))
  ],
  test: {
    include: ['test/worker.integration.test.ts'],
    setupFiles: ['test/apply-migrations.ts'],
    sequence: { concurrent: false }
  }
});
