/**
 * @file Jest testing configuration for React Native project.
 * @author Alan Chen
 */

/** @type {Object} Jest configuration object */
const config = {
  // Use the node environment provided by the react-native preset
  testEnvironment: 'node',

  // Set the Jest preset to 'react-native'
  preset: 'react-native',

  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },

  moduleFileExtensions: ['js', 'json', 'jsx', 'ts', 'tsx', 'node'],
  testMatch: ['<rootDir>/src/**/*.test.(js|ts|tsx)'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-native-community|@testing-library)',
  ],
};

module.exports = config;
