/**
 * @file Jest testing configuration for React Native project.
 * @author Alan Chen
 */

/** @type {Object} Jest configuration object */
const config = {
  // Use jsdom for React component testing
  testEnvironment: 'jsdom',

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },

  moduleFileExtensions: ['js', 'json', 'jsx', 'ts', 'tsx', 'node'],
  testMatch: ['<rootDir>/src/**/*.test.(js|ts|tsx)'],
  
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-native-community|@testing-library)',
  ],
  
  // Mock React Native and React Navigation modules that don't exist in test environment
  moduleNameMapper: {
    '^react-native$': '<rootDir>/node_modules/react-native',
    '^@react-navigation/native$': '<rootDir>/jest.mocks.js',
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/**/*.test.{js,jsx}',
    '!src/index.js', // Exclude main export file
  ],
  
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
};

module.exports = config;
