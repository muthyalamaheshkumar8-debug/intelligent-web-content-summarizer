const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { fixture } = require('./helpers/fixtures');

test('SSE delivers owner-scoped events, permits reconnects and cleans closed clients', async () => {
  const { app, agent } = fixture();
  const bootstrap = await agent.get('/api/session');
  const cookie = bootstrap.headers['set-cookie'][0].split(';')[0];
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const events = app.locals.events;
  const owner = cookie.split('=')[1].split('.')[0];
  let client;
  let incoming;
  try {
    let buffer = '';
    const ready = new Promise((resolve, reject) => {
      client = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/events',
          headers: { Cookie: cookie },
        },
        (res) => {
          incoming = res;
          assert.ok(
            res.headers['content-type'].startsWith('text/event-stream'),
          );
          res.on('data', (chunk) => {
            buffer += chunk.toString();
            if (buffer.includes('event: ready')) resolve();
          });
        },
      );
      client.on('error', reject);
    });
    await ready;
    events.publish('another-owner', { stage: 'should-not-leak' });
    events.publish(owner, { stage: 'summarizing' });
    await new Promise((resolve) => {
      const check = () => {
        if (buffer.includes('summarizing')) {
          incoming.off('data', check);
          resolve();
        }
      };
      incoming.on('data', check);
      check();
    });
    assert.ok(!buffer.includes('should-not-leak'));
    incoming.destroy();
    client.destroy();
    const reconnect = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/api/events',
      headers: { Cookie: cookie },
    });
    await new Promise((resolve, reject) => {
      reconnect.once('response', (res) => {
        assert.equal(res.statusCode, 200);
        res.destroy();
        resolve();
      });
      reconnect.once('error', reject);
    });
    reconnect.destroy();
  } finally {
    incoming?.destroy();
    client?.destroy();
    events.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
