# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Build and Package
- `yarn build` - Build the library using tsup (generates CJS, ESM, and TypeScript declarations)
- `yarn test` - Run Jest tests for the project
- `yarn fix` - Run ESLint with auto-fix enabled
- `yarn format` - Format code using Prettier

### Running Single Tests
- `yarn test <test-file-name>` - Run a specific test file
- `yarn test --watch` - Run tests in watch mode for development

## Architecture Overview

This is a React Native API management library that provides a centralized, fluent interface for handling HTTP requests with React hooks. The architecture follows a modular design with clear separation of concerns.

### Core Components

**ApiClient** (`src/libraries/ApiClient.js`)
- Factory function `createApiClient(config)` creates fetch-based HTTP clients
- Supports RESTful methods (GET, POST, PUT, DELETE), file uploads, and parallel requests
- Features interceptors, dynamic headers, automatic JSON parsing, and structured error handling
- Uses AbortController for request cancellation and cleanup

**ApiManager** (`src/services/ApiManager.js`)
- Singleton registry that manages multiple named ApiClient instances
- Allows registering clients for different services (e.g., main backend, analytics)
- Supports setting a default client and provides proxy methods for convenience
- Prevents duplicate registrations and manages client lifecycle

**React Hooks Architecture**
- `useApiBase` - Core hook that handles API state management, loading states, and lifecycle
- `useApiNavigation` - Project-specific wrapper that integrates with React Navigation
- `useParallelApi` - Specialized hook for handling multiple concurrent requests
- `useScreenFocus` - Navigation integration utility for focus/blur event handling

### Key Patterns

**Singleton Pattern**: ApiManager uses singleton pattern to ensure single source of truth for API clients across the application.

**Hook Composition**: The library uses a layered approach where `useApiNavigation` wraps `useApiBase` to provide navigation-aware functionality.

**Configuration Over Convention**: Extensive configuration options allow customization of behavior (debouncing, pagination, global state integration, lifecycle management).

**Error Boundaries**: Custom `ApiError` class provides structured error handling with HTTP status codes and parsed response data.

## Import Patterns

Use the '@' alias for imports when working with client code that consumes this library:
```javascript
import { apiManager, useApi } from '@/services/api'
```

## Library Export Structure

The main exports from `src/index.js`:
- **Core**: `createApiClient`, `ApiError`, `apiManager`
- **Hooks**: `useApiBase`, `useParallelApi`, `useScreenFocus`, `useApi` (alias for `useApiNavigation`)

## State Management Integration

The library supports integration with global state managers (Zustand, Redux) through the `globalStore` and `dataPath` options in hooks. This allows seamless synchronization between API responses and global application state.

## Request Lifecycle

1. **Configuration**: ApiClient instances are configured with base URLs, headers, and interceptors
2. **Registration**: Clients are registered with the ApiManager using unique names
3. **Hook Usage**: React components use hooks to initiate requests with automatic state management
4. **Request Processing**: Requests go through interceptors, are sent via fetch, and responses are processed
5. **State Updates**: Response data is stored in local state or global store based on configuration
6. **Cleanup**: AbortController ensures proper cleanup on component unmount or navigation changes

## Testing Configuration

- Jest configured for React Native environment
- Tests should be placed in `src/**/*.test.(js|ts|tsx)`
- Uses Babel for JavaScript transformation
- Includes React Native testing library for component testing