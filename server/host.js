const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadConfig } = require('./config');
const { log } = require('./utils/logger');

// Both processes share a lifecycle, but only Express is publicly reachable.
function supervise(
  children,
  {
    signals = process,
    exit = process.exit.bind(process),
    deadlineMs = 16000,
  } = {},
) {
  let stopping = false;
  let finished = false;
  let exitCode = 0;
  let deadline;
  const pending = new Set(children.map(({ child }) => child));
  const finish = () => {
    if (pending.size || finished) return;
    finished = true;
    clearTimeout(deadline);
    signals.removeListener('SIGINT', stopNormally);
    signals.removeListener('SIGTERM', stopNormally);
    exit(exitCode);
  };
  const stop = (code) => {
    exitCode = Math.max(exitCode, code);
    if (stopping) return;
    stopping = true;
    deadline = setTimeout(() => {
      for (const child of pending) child.kill('SIGKILL');
      exit(1);
    }, deadlineMs);
    deadline.unref();
    for (const child of pending) child.kill('SIGTERM');
    finish();
  };
  const stopNormally = () => stop(0);
  signals.on('SIGINT', stopNormally);
  signals.on('SIGTERM', stopNormally);
  for (const { child, name } of children) {
    child.once('error', () => {
      log('error', 'host_process_failed', { service: name });
      pending.delete(child);
      stop(1);
      finish();
    });
    child.once('exit', (code, signal) => {
      pending.delete(child);
      if (!stopping) {
        log('error', 'host_process_exited', { service: name, code, signal });
        stop(1);
      } else if (code && !signal) exitCode = 1;
      finish();
    });
  }
}

function startHost() {
  const config = loadConfig();
  const scraperEnv = {
    ...process.env,
    APP_ENV: 'production',
    SCRAPER_TOKEN: config.scraperToken,
  };
  // Python does not need the AI key, database credentials, or browser signing key.
  for (const name of [
    'GEMINI_API_KEY',
    'MONGODB_URI',
    'SESSION_SECRET',
    'GUNICORN_CMD_ARGS',
  ])
    delete scraperEnv[name];
  const scraper = spawn(
    process.env.PYTHON_BIN || 'python3',
    [
      '-m',
      'gunicorn',
      '--bind',
      '127.0.0.1:5001',
      '--workers',
      '1',
      '--threads',
      '4',
      '--timeout',
      '35',
      '--graceful-timeout',
      '10',
      '--access-logfile',
      '/dev/null',
      'scraper:app',
    ],
    {
      cwd: path.join(__dirname, '../scraper'),
      env: scraperEnv,
      stdio: 'inherit',
    },
  );
  const api = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, SCRAPER_URL: 'http://127.0.0.1:5001' },
    stdio: 'inherit',
  });
  supervise([
    { name: 'scraper', child: scraper },
    { name: 'api', child: api },
  ]);
}

if (require.main === module) {
  try {
    startHost();
  } catch {
    log('error', 'host_configuration_invalid');
    process.exit(1);
  }
}
module.exports = { supervise };
