import { jest } from '@jest/globals';

// Set up global mocks
global.jest = jest;

// Add proper error handling for unhandled rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Promise Rejection:', error);
});

// Increase timeout for all tests
jest.setTimeout(30000);