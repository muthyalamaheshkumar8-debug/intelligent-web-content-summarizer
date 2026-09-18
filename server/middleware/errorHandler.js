const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }

  if (err.message === 'Unable to generate summary. Please try again.') {
    return res.status(503).json({ message: err.message });
  }

  res.status(500).json({ message: 'Internal server error' });
};

module.exports = errorHandler;
