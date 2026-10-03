const { log } = require('../utils/logger');

// Four arguments are required for Express to recognize error middleware.
function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message =
    status < 500 || err.status
      ? err.message
      : 'Something went wrong. Please try again.';
  if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body must be valid JSON.';
  }
  if (err.type === 'entity.too.large') {
    status = 413;
    code = 'BODY_TOO_LARGE';
    message = 'Request body is too large.';
  }
  if (err.name === 'ValidationError') {
    status = 400;
    code = 'INVALID_DATA';
    message = 'Summary data could not be saved.';
  }
  if (
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError'
  ) {
    status = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'History is temporarily unavailable. Please try again.';
  }
  log(status >= 500 ? 'error' : 'info', 'request_failed', {
    requestId: req.requestId,
    status,
    code: typeof code === 'string' ? code : 'INTERNAL_ERROR',
  });
  if (res.headersSent) return res.end();
  res.status(status).json({ message, code, requestId: req.requestId });
}
module.exports = errorHandler;
