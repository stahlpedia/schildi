import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const clientDir = path.join(root, 'client');
const publicDir = path.join(root, 'public');
const assetsDir = path.join(publicDir, 'assets');

await fs.mkdir(assetsDir, { recursive: true });

await build({
  entryPoints: [path.join(clientDir, 'src', 'main.jsx')],
  outfile: path.join(assetsDir, 'app.js'),
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  jsx: 'automatic',
  sourcemap: false,
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  logLevel: 'info',
  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
    '.css': 'css'
  }
});

await fs.copyFile(path.join(clientDir, 'index.html'), path.join(publicDir, 'index.html'));
