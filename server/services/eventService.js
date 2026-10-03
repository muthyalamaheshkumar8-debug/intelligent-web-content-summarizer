const { AppError } = require('../utils/errors');

function createEventService() {
  const clients = new Map();
  return {
    publish(ownerId, event) {
      for (const res of clients.get(ownerId) || []) {
        // A slow reader must not consume unbounded process memory.
        if (!res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`))
          res.end();
      }
    },
    subscribe(req, res, next) {
      const group = clients.get(req.ownerId) || new Set();
      const count = [...clients.values()].reduce(
        (sum, set) => sum + set.size,
        0,
      );
      if (group.size >= 5 || count >= 500)
        return next(
          new AppError(
            429,
            'STREAM_LIMIT',
            'Too many live connections. Close another tab and try again.',
          ),
        );
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      res.write('retry: 3000\nevent: ready\ndata: {}\n\n');
      group.add(res);
      clients.set(req.ownerId, group);
      const heartbeat = setInterval(() => {
        if (!res.write(': heartbeat\n\n')) res.end();
      }, 15000);
      res.on('close', () => {
        clearInterval(heartbeat);
        group.delete(res);
        if (!group.size) clients.delete(req.ownerId);
      });
    },
    close() {
      for (const group of clients.values()) for (const res of group) res.end();
      clients.clear();
    },
  };
}

module.exports = { createEventService };
