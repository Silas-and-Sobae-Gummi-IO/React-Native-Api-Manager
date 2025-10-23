module.exports = {
  preset: 'react-native',

  // Tells Jest to look for tests only in the 'src' directory.
  roots: ['<rootDir>/src'],

  // The test environment that will be used for testing.
  testEnvironment: 'node',

  transformIgnorePatterns: [
    // This negative lookahead pattern means: ignore node_modules EXCEPT for 'uuid'
    '/node_modules/(?!uuid)/',
  ],
};
