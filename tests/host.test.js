const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { supervise } = require('../server/host');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

test(
  'free host serves the built UI with real MongoDB and authenticated Gunicorn, then shuts down',
  { skip: process.env.RUN_HOST_TESTS !== '1', timeout: 45000 },
  async () => {
    const {
      MongoMemoryServer,
    } = require('../server/node_modules/mongodb-memory-server');
    const mongo = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION || '8.0.17' },
      instance: { args: ['--nounixsocket'] },
    });
    const reservation = net.createServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '../server/host.js')],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          APP_ENV: 'production',
          MONGODB_URI: mongo.getUri(),
          GEMINI_API_KEY: 'test-provider-key',
          SESSION_SECRET: 's'.repeat(64),
          SCRAPER_TOKEN: 't'.repeat(64),
          PORT: String(port),
          CLIENT_ORIGIN: '',
          RENDER_EXTERNAL_URL: 'https://test-host.onrender.com',
          TRUST_PROXY: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const exited = new Promise((resolve) =>
      child.once('exit', (code) => resolve(code)),
    );
    const url = `http://127.0.0.1:${port}`;
    try {
      let healthy = false;
      for (
        let attempt = 0;
        attempt < 80 && child.exitCode === null;
        attempt++
      ) {
        try {
          healthy = (
            await fetch(`${url}/api/health`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok;
        } catch {
          /* Startup is bounded by the loop and request timeout. */
        }
        if (healthy) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(healthy, output);
      const page = await fetch(url);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<div id="root"><\/div>/);
      const session = await fetch(`${url}/api/session`, {
        headers: { Origin: 'https://test-host.onrender.com' },
      });
      assert.equal(session.status, 200);
      assert.match(session.headers.get('set-cookie'), /Secure/);
      assert.equal((await fetch('http://127.0.0.1:5001/health')).status, 401);
      assert.equal(
        (
          await fetch('http://127.0.0.1:5001/health', {
            headers: { 'X-Scraper-Token': 't'.repeat(64) },
          })
        ).status,
        200,
      );
      child.kill('SIGTERM');
      assert.equal(await exited, 0, output);
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await exited;
      }
      await mongo.stop();
    }
  },
);

function fixture(options = {}) {
  const signals = new EventEmitter();
  const exits = [];
  const children = ['api', 'scraper'].map((name) => {
    const child = new EventEmitter();
    child.kills = [];
    child.kill = (signal) => child.kills.push(signal);
    return { child, name };
  });
  supervise(children, {
    signals,
    exit: (code) => exits.push(code),
    ...options,
  });
  return { signals, exits, api: children[0].child, scraper: children[1].child };
}

test('host forwards termination once and waits for both services to close', () => {
  const f = fixture();
  f.signals.emit('SIGTERM');
  f.signals.emit('SIGINT');
  assert.deepEqual(f.api.kills, ['SIGTERM']);
  assert.deepEqual(f.scraper.kills, ['SIGTERM']);
  f.api.emit('exit', 0, null);
  assert.deepEqual(f.exits, []);
  f.scraper.emit('exit', 0, null);
  assert.deepEqual(f.exits, [0]);
  assert.equal(f.signals.listenerCount('SIGTERM'), 0);
});

test('unexpected scraper exit stops the API and marks the host as failed', () => {
  const f = fixture();
  f.scraper.emit('exit', 1, null);
  assert.deepEqual(f.api.kills, ['SIGTERM']);
  f.api.emit('exit', 0, null);
  assert.deepEqual(f.exits, [1]);
});

test('a process spawn failure stops the other service', () => {
  const f = fixture();
  f.api.emit('error', new Error('spawn failed'));
  assert.deepEqual(f.scraper.kills, ['SIGTERM']);
  f.scraper.emit('exit', 0, null);
  assert.deepEqual(f.exits, [1]);
});

test('host bounds shutdown when a service does not terminate', async () => {
  const f = fixture({ deadlineMs: 10 });
  f.signals.emit('SIGTERM');
  f.api.emit('exit', 0, null);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(f.scraper.kills, ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(f.exits, [1]);
});
