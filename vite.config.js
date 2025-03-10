import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';
import path from 'path'

export default defineConfig({
    root: './src',
    server: {
        open: true
    },
    plugins: [glsl({
        exclude: undefined,                         // File paths/extensions to ignore
        include: /\.(glsl|wgsl|vert|frag|vs|fs)$/i, // File paths/extensions to import
        defaultExtension: 'glsl',                   // Shader suffix when no extension is specified
        warnDuplicatedImports: true,                // Warn if the same chunk was imported multiple times
        compress: true,                             // Compress the resulting shader code
    })],
    build: {
        chunkSizeWarningLimit: 1024,
        outDir: '../dist',
        minify: 'terser',
        assetsDir: 'assets',
        sourcemap: true,
        rollupOptions: {
            output: {
                entryFileNames: '[name]-[hash].js',
                chunkFileNames: '[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    let extType = path.extname(assetInfo.name);
                    if (!/js|css/i.test(extType)) {
                        return `assets/[name][extname]`;
                    }
                    return '[name]-[hash][extname]';
                  }
            }
        }
    }
});