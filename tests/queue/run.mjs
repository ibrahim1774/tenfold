// Runs the batch queue (src/batch/queue.ts) against a simulated engine on Node.
// Usage: npm run test:queue
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(here, '.out.cjs');

await esbuild.build({
  entryPoints: [path.join(here, 'test.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  logLevel: 'warning',
  // Analytics loads these lazily and only with a PostHog key, which tests never have.
  external: ['posthog-react-native', 'expo-constants', 'expo-device'],
  plugins: [
    {
      name: 'mocks',
      setup(b) {
        b.onResolve({ filter: /^@\// }, (a) => ({ path: path.join(root, 'src', `${a.path.slice(2)}.ts`) }));
        b.onResolve({ filter: /^\.\.\/engine$/ }, () => ({ path: path.join(here, 'mockEngine.ts') }));
        b.onResolve({ filter: /^expo-sqlite\/kv-store$/ }, () => ({ path: path.join(here, 'kvMock.ts') }));
        b.onResolve({ filter: /^react-native$/ }, () => ({ path: path.join(here, 'rnMock.ts') }));
      },
    },
  ],
});
execFileSync(process.execPath, [out], { stdio: 'inherit' });
