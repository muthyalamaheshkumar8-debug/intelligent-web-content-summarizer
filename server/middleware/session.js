const crypto = require('node:crypto');
const { AppError } = require('../utils/errors');

const COOKIE = 'summary_session';
const LIFETIME = 60 * 60 * 24 * 30;

function sessionMiddleware(config) {
  const sign = (value) =>
    crypto
      .createHmac('sha256', config.sessionSecret)
      .update(value)
      .digest('base64url');
  return (req, res, next) => {
    const token = (req.headers.cookie || '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    let ownerId;
    if (token && token.length < 256) {
      const [id, expires, signature] = token.split('.');
      const expected = sign(`${id}.${expires}`);
      if (
        /^[a-f0-9]{64}$/.test(id) &&
        /^\d+$/.test(expires) &&
        Number(expires) > Date.now() &&
        typeof signature === 'string' &&
        /^[A-Za-z0-9_-]{43}$/.test(signature) &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      )
        ownerId = id;
    }
    if (!ownerId) {
      ownerId = crypto.randomBytes(32).toString('hex');
      const value = `${ownerId}.${Date.now() + LIFETIME * 1000}`;
      res.cookie(COOKIE, `${value}.${sign(value)}`, {
        httpOnly: true,
        secure: config.production,
        sameSite: 'lax',
        maxAge: LIFETIME * 1000,
        path: '/api',
      });
    }
    req.ownerId = ownerId;
    next();
  };
}

function protectMutations(origins) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (
      req.get('X-Requested-With') !== 'WebContentSummarizer' ||
      (req.get('Origin') && !origins.includes(req.get('Origin')))
    ) {
      return next(
        new AppError(
          403,
          'FORBIDDEN',
          'This request is not allowed. Refresh the page and try again.',
        ),
      );
    }
    next();
  };
}

module.exports = { sessionMiddleware, protectMutations };
