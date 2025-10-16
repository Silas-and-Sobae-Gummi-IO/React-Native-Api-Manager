/**
 * @file Jest setup file for test environment configuration
 * @author Alan Chen
 */

// Mock React Native modules for testing
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn((obj) => obj.ios || obj.default),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
}));

// Note: @react-navigation/native is mocked via moduleNameMapper in jest.config.js

// Mock console methods to keep test output clean
global.console = {
  ...console,
  // Uncomment to ignore console logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set up global test utilities
global.setImmediate = global.setImmediate || ((fn, ...args) => global.setTimeout(fn, 0, ...args));