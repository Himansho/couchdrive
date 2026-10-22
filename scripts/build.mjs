// Bundles the TypeScript with esbuild and copies the pages next to it.
// Type-checking is separate: `npm run typecheck`.
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const at = (...parts) => path.join(root, ...parts);

for (const dir of ['dist', 'server/public']) fs.rmSync(at(dir), { recursive: true, force: true });

const shared = { bundle: true, sourcemap: true, logLevel: 'warning' };

await Promise.all([
  // Main process and preload: Node, CommonJS; npm packages stay in node_modules.
  esbuild.build({
    ...shared,
    entryPoints: [at('electron/main.ts'), at('electron/preload.ts')],
    outdir: at('dist/electron'),
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    packages: 'external',
  }),
  // Desktop window.
  esbuild.build({
    ...shared,
    entryPoints: [at('electron/renderer/renderer.ts')],
    outdir: at('dist/electron/renderer'),
    platform: 'browser',
    format: 'iife',
    target: 'chrome130',
  }),
  // Phone test page, served by the Express server from server/public.
  esbuild.build({
    ...shared,
    entryPoints: [at('web/spike/test-page.ts')],
    outdir: at('server/public'),
    platform: 'browser',
    format: 'iife',
    target: 'chrome100',
  }),
]);

copy('electron/renderer', 'dist/electron/renderer', ['index.html', 'style.css']);
copy('web/spike', 'server/public', ['index.html', 'style.css']);

function copy(from, to, names) {
  for (const name of names) fs.copyFileSync(at(from, name), at(to, name));
}
