// Core Client & Manager
export {createApiClient, ApiError} from './libraries/ApiClient';
export {manager as apiManager} from './services/ApiManager';

// Core Hooks
export {useApiBase} from './hooks/useApiBase';
export {useScreenFocus} from './hooks/useScreenFocus';
export {useParallelApi} from './hooks/useParallelApi';

// Main Project-Facing Hook (aliased for convenience)
export {useApiNavigation as useApi} from './hooks/useApiNavigation';
