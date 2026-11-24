import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds, and bundles server.js automatically on `vite build`.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        async closeBundle(error?: Error): Promise<void> {
          if (error) {
            return;
          }
          const rootDir = import.meta.dirname;
          const distDir = path.resolve(rootDir, 'dist');
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          await esbuild.build({
            entryPoints: [path.resolve(rootDir, 'src/server/appServer.ts')],
            bundle: true,
            platform: 'node',
            format: 'esm',
            packages: 'external',
            outfile: path.resolve(rootDir, 'server.js'),
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-three',
                test: /node_modules[\\/]three[\\/](?!examples[\\/]jsm[\\/](loaders[\\/]GLTFLoader|utils[\\/]SkeletonUtils))/,
                priority: 20,
              },
              {
                name: 'vendor-motion',
                test: /node_modules[\\/](gsap|motion|framer-motion|cannon-es)[\\/]/,
                priority: 15,
              },
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler|lucide-react)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
