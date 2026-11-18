import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const proxyData: unknown = JSON.parse(
  readFileSync(new URL('./dev/proxies.json', import.meta.url), 'utf8')
);
if (
  !proxyData ||
  typeof proxyData !== 'object' ||
  Array.isArray(proxyData) ||
  Object.values(proxyData).some((target) => typeof target !== 'string')
) {
  throw new Error('Proxy configuration must map routes to URL strings');
}
const proxies = proxyData as Record<string, string>;

function lintFixWatch(): Plugin {
  return {
    name: 'lint-fix-watch',
    apply: 'serve',
    configureServer(server) {
      if (process.env.LINT_FIX_WATCH !== 'true') return;

      const source = `${resolve(server.config.root, 'src')}${sep}`;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running = false;
      let pending = false;
      let closed = false;

      function run() {
        pending = true;
        if (running || closed) return;
        pending = false;
        running = true;
        const child = spawn('npm', ['run', 'lint:fix'], {
          cwd: server.config.root,
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });
        child.on('error', (error) =>
          server.config.logger.error(
            `Could not start lint:fix: ${error.message}`
          )
        );
        child.on('close', (code, signal) => {
          running = false;
          if (code !== 0) {
            server.config.logger.error(
              `lint:fix failed (${signal || code}); see output above.`
            );
          }
          if (pending && !closed) run();
        });
      }

      function onChange(_event: string, file: string) {
        if (!file.startsWith(source) || !/\.tsx?$/.test(file)) return;
        clearTimeout(timer);
        timer = setTimeout(run, 200);
      }

      server.watcher.on('all', onChange);
      server.httpServer?.once('close', () => {
        closed = true;
        clearTimeout(timer);
        server.watcher.off('all', onChange);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), lintFixWatch()],
  server: {
    host: '0.0.0.0',
    port: 8000,
    strictPort: true,
    proxy: Object.fromEntries(
      Object.entries(proxies).map(([route, target]) => [
        `/${route}`,
        { target, changeOrigin: true },
      ])
    ),
  },
});
