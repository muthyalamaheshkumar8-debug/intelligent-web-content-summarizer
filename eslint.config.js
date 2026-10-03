module.exports = [
  { ignores: ['**/node_modules/**', 'client/**'] },
  {
    ...require('./server/eslint.config.js')[1],
    files: ['server/**/*.js', 'tests/**/*.js'],
  },
];
