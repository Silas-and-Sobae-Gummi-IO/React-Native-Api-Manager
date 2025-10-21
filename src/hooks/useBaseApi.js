import {useState, useRef, useEffect} from 'react';

/**
 * useBaseApi - Internal base hook for request state management
 * 
 * Manages the lifecycle of a single API request with reactive data state.
 * Does NOT include extensions (pagination, refresh, etc.)
 * 
 * @param {Object} config
 * @param {ApiClient} config.client - ApiClient instance
 * @param {string} config.url - Request URL (e.g., 'GET:/posts' or '/posts')
 * @param {Object} config.initialData - Initial/default data state
 * @param {Function} config.onSuccess - Success callback (response) => void
 * @param {Function} config.onError - Error callback (error) => void
 * 
 * @returns {Object} API state and methods
 */
export function useBaseApi(config) {
  const {
    client,
    url,
    initialData = {},
    onSuccess,
    onError,
  } = config;

  // Parse URL to extract method and path
  const {method, path} = parseUrl(url);

  // Core state
  const [state, setState] = useState({
    data: initialData,
    response: null,
    error: null,
    isLoading: false,
  });

  // Track if component is mounted (prevent state updates after unmount)
  const isMounted = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * Send request with optional data overrides
   * @param {Object} overrides - One-time data overrides
   * @returns {Promise} Resolves with response data
   */
  const send = async (overrides = {}) => {
    // Merge data with overrides
    const finalData = {...state.data, ...overrides};

    // Start loading
    if (isMounted.current) {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
      }));
    }

    try {
      // Make request using ApiClient
      const request = client[method.toLowerCase()](path, finalData);
      const response = await request.send();

      // Update state on success
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          response,
          isLoading: false,
        }));
      }

      // Call success callback
      onSuccess?.(response);

      return response;
    } catch (error) {
      // Update state on error
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          error,
          isLoading: false,
        }));
      }

      // Call error callback
      onError?.(error);

      throw error;
    }
  };

  /**
   * Update a single field in data
   * @param {string} key - Field name
   * @param {any} value - New value
   */
  const updateData = (key, value) => {
    setState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [key]: value,
      },
    }));
  };

  /**
   * Replace entire data object
   * @param {Object} newData - New data object
   */
  const setData = (newData) => {
    setState(prev => ({
      ...prev,
      data: newData,
    }));
  };

  /**
   * Reset to initial state
   */
  const reset = () => {
    setState({
      data: initialData,
      response: null,
      error: null,
      isLoading: false,
    });
  };

  return {
    // State
    data: state.data,
    response: state.response,
    error: state.error,
    isLoading: state.isLoading,

    // Methods
    send,
    updateData,
    setData,
    reset,
  };
}

/**
 * Parse URL string to extract method and path
 * Supports formats: 'GET:/posts', 'POST:/users', or '/posts' (defaults to GET)
 * 
 * @param {string} url - URL string
 * @returns {Object} { method, path }
 */
function parseUrl(url) {
  const match = url.match(/^([A-Z]+):(.+)$/);
  
  if (match) {
    return {
      method: match[1],
      path: match[2],
    };
  }
  
  // Default to GET if no method specified
  return {
    method: 'GET',
    path: url,
  };
}
