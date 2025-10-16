/**
 * @file Jest mocks for external dependencies
 * @author Alan Chen
 */

// Mock for @react-navigation/native
module.exports = {
  NavigationContext: {
    Provider: ({ children }) => children,
    Consumer: ({ children }) => children({}),
  },
  useFocusEffect: jest.fn(),
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    addListener: jest.fn(() => jest.fn()), // Mock for navigation.addListener
  })),
};