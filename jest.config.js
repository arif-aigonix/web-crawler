module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    '*.js',
    '!jest.config.js',
    '!coverage/**',
    '!node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFiles: [],
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  transform: {},
  verbose: true
};
