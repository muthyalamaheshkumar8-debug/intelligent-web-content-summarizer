const { AppError } = require('./errors');

function validateUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.trim())
    throw new AppError(
      400,
      'INVALID_URL',
      'Enter a public HTTP or HTTPS article URL.',
    );
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError(400, 'INVALID_URL', 'Enter a valid article URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new AppError(
      400,
      'INVALID_URL',
      'Use an HTTP or HTTPS URL without credentials or custom ports.',
    );
  url.hash = '';
  return url.href;
}

function validateId(id) {
  if (!/^[a-f0-9]{24}$/i.test(id))
    throw new AppError(400, 'INVALID_ID', 'Invalid summary identifier.');
}

function readPagination(query) {
  const limit = Number(query.limit ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new AppError(
      400,
      'INVALID_PAGE',
      'Page size must be between 1 and 50.',
    );
  let cursor;
  if (query.cursor !== undefined) {
    try {
      if (typeof query.cursor !== 'string' || query.cursor.length > 256)
        throw new Error();
      cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString());
      validateId(cursor.id);
      if (
        typeof cursor.date !== 'string' ||
        Number.isNaN(Date.parse(cursor.date))
      )
        throw new Error();
    } catch {
      throw new AppError(400, 'INVALID_PAGE', 'Invalid history cursor.');
    }
  }
  return { limit, cursor };
}

module.exports = { validateUrl, validateId, readPagination };
