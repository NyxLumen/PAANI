import fs from 'fs';

/**
 * Resolves the path to a Chrome or Chromium browser executable.
 * Priority:
 * 1. PUPPETEER_EXECUTABLE_PATH environment variable (if specified)
 * 2. Common system binary paths on Linux/macOS
 *
 * Throws a descriptive Error if no browser is detected.
 */
export function resolveBrowserExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    if (fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    throw new Error(
      `PUPPETEER_EXECUTABLE_PATH is set to "${process.env.PUPPETEER_EXECUTABLE_PATH}", but the executable was not found.`
    );
  }

  const candidatePaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/snap/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'No supported browser executable found. Please install Google Chrome or Chromium, or set PUPPETEER_EXECUTABLE_PATH.'
  );
}
