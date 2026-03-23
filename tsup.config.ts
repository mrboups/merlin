import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'modules/wallet/index': 'src/modules/wallet/index.ts',
    'modules/privacy/index': 'src/modules/privacy/index.ts',
    'modules/provider/index': 'src/modules/provider/index.ts',
    'modules/transaction/index': 'src/modules/transaction/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  outDir: 'dist',
  target: 'node22',
});
