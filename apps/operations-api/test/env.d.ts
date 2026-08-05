import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      STORAGE: R2Bucket;
      SETUP_TOKEN: string;
      TEST_MIGRATIONS: D1Migration[];
    }

    interface GlobalProps {
      mainModule: typeof import('../src/worker');
    }
  }
}

export {};
