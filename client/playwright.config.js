import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5050',
    browserName: 'chromium',
    headless: true,
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
          ...(process.env.PLAYWRIGHT_SINGLE_PROCESS === '1'
            ? {
                args: [
                  '--single-process',
                  '--no-zygote',
                  '--in-process-gpu',
                  '--use-gl=angle',
                  '--use-angle=swiftshader',
                ],
              }
            : {}),
        }
      : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node ../tests/ui-server.js',
    url: 'http://127.0.0.1:5050/api/health',
    reuseExistingServer: false,
  },
});
