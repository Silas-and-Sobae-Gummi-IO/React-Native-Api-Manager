import {useState, useRef, useEffect} from 'react';
import {ApiClient} from '../client/ApiClient';
import {InterceptorManager} from '../client/lib/InterceptorManager';

/**
 * useBaseApi - Internal base hook for request state management
 *
 * Manages the lifecycle of a single API request with reactive data state.
 * Does NOT include extensions (pagination, refresh, etc.)
 *
 * @param {Object} config
 * @param {ApiClient} config.client - ApiClient instance (optional - creates one if not provided)
 * @param {string} config.url - Request URL (e.g., 'GET:/posts', 'POST:/users')
 * @param {Object} config.initialData - Initial/default data state (becomes request body)
 * @param {Function} config.filterData - Transform/format final data before send (data) => transformedData
 * @param {Function} config.validateData - Validate final data before send (data) => boolean|void (throw to abort)
 * @param {Function} config.onSend - Called right before request.send() with finalData
 * @param {Function} config.onResponse - Called with full response object from request.response
 * @param {Function} config.onSuccess - Success callback with parsed data (data) => void
 * @param {Function} config.onError - Error callback (error) => void
 * @param {Function} config.onDataChanged - Called when data changes (prevData, newData) => void
 * @param {Function} config.onReset - Called when reset() is invoked
 * @param {Function} config.onAbort - Called when abort() is invoked with (reason)
 * @param {InterceptorManager} config.interceptors - Optional interceptor manager (for extensions)
 * @param {Object} config.* - Any other ApiClient request config (headers, timeout, recovery, etc.)
 *
 * @returns {Object} API state and methods
 */
export function useBaseApi(config, interceptors = null) {
  const {
    client: providedClient,
    url,
    initialData = {},
    filterData,
    validateData,
    onSend,
    onResponse,
    onSuccess,
    onError,
    onDataChanged,
    onReset,
    onAbort,
    ...requestConfig // Everything else goes to request (headers, timeout, recovery, etc.)
  } = config;

  // Use provided client or create one-time instance
  const client = providedClient || new ApiClient();

  // Hook state (reactive)
  const [data, setData] = useState(initialData);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Store current request for abort access
  const currentRequestRef = useRef(null);

  // Track previous data for onDataChanged
  const prevDataRef = useRef(initialData);

  // Use provided interceptors or create new one
  const hooksRef = useRef(interceptors || new InterceptorManager());

  // Effect to trigger onDataChanged when data updates
  useEffect(() => {
    if (onDataChanged && prevDataRef.current !== data) {
      onDataChanged(prevDataRef.current, data);
      prevDataRef.current = data;
    }
  }, [data, onDataChanged]);

  // Lifecycle hooks: onMount and onUnmount
  useEffect(() => {
    (async () => {
      await hooksRef.current.run('onMount', undefined, {
        data,
        response,
        error,
        isLoading,
      });
    })();

    return () => {
      (async () => {
        await hooksRef.current.run('onUnmount', undefined, {
          data,
          response,
          error,
          isLoading,
        });
      })();
    };
  }, []); // Empty deps - run once on mount/unmount

  /**
   * Send request with optional data overrides
   * @param {Object} overrides - One-time data overrides merged with current data
   * @returns {Promise} Resolves with response data
   */
  const send = async (overrides = {}) => {
    // Prevent concurrent requests
    if (isLoading) {
      console.warn('[useBaseApi] Request already in progress');
      return;
    }

    // Merge current data with overrides
    let finalData = {...data, ...overrides};

    // Run beforeSend hooks (extensions can modify finalData)
    finalData = await hooksRef.current.run('beforeSend', finalData, {data, overrides});

    // Filter/transform data if provided
    if (filterData) {
      finalData = filterData(finalData);
    }

    // Validate data before sending
    if (validateData) {
      try {
        const isValid = validateData(finalData);
        if (isValid === false) {
          console.warn('[useBaseApi] Data validation failed, aborting send');
          return;
        }
      } catch (err) {
        console.error('[useBaseApi] Data validation threw error:', err);
        return;
      }
    }

    // Start loading
    setIsLoading(true);
    setError(null);

    // Call onSend hook
    onSend?.(finalData);

    try {
      // Create fresh request each time (fresh AbortController for proper abort)
      // Use client.request() which handles URL parsing
      const request = client.request(url, {
        ...requestConfig,
        body: finalData, // Merge finalData into body
      });
      
      // Store current request for abort access
      currentRequestRef.current = request;

      // Send request and get parsed data
      const parsedData = await request.send();

      // Get full response from request instance for onResponse
      const fullResponse = currentRequestRef.current._context?._response;

      // Call onResponse with full response object
      if (onResponse && fullResponse) {
        onResponse(fullResponse);
      }

      // Update state on success
      setResponse(parsedData);
      setIsLoading(false);

      // Call success callback with parsed data
      onSuccess?.(parsedData);

      // Run afterSend hooks (extensions can react to response)
      await hooksRef.current.run('afterSend', parsedData, {data: finalData, response: parsedData, fullResponse});

      return parsedData;
    } catch (err) {
      // Update state on error
      setError(err);
      setIsLoading(false);

      // Call error callback
      onError?.(err);

      // Run onError hooks
      await hooksRef.current.run('onError', err, {data: finalData});

      throw err;
    }
  };

  /**
   * Update a single field in data
   * @param {string} key - Field name
   * @param {any} value - New value
   */
  const updateData = (key, value) => {
    setData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  /**
   * Create a change handler for a specific field (convenience for forms)
   * @param {string} key - Field name
   * @returns {Function} Change handler (value) => void
   *
   * @example
   * <TextInput onChange={api.handleDataChange('name')} />
   */
  const handleDataChange = (key) => (value) => {
    updateData(key, value);
  };

  /**
   * Replace entire data object
   * @param {Object} newData - New data object
   */
  const replaceData = (newData) => {
    setData(newData);
  };

  /**
   * Reset to initial state
   */
  const reset = async () => {
    // Run beforeReset hooks
    await hooksRef.current.run('beforeReset', undefined, {data, response, error});

    setData(initialData);
    setResponse(null);
    setError(null);
    setIsLoading(false);
    onReset?.();

    // Run afterReset hooks
    await hooksRef.current.run('afterReset', undefined, {});
  };

  /**
   * Abort the current request
   * @param {string} reason - Abort reason
   */
  const abort = async (reason = 'manual') => {
    const request = currentRequestRef.current;
    if (request) {
      request.abort(reason);
      onAbort?.(reason);

      // Run onAbort hooks
      await hooksRef.current.run('onAbort', reason, {request});
    }
  };


  return {
    // State
    data,
    response,
    error,
    isLoading,

    // Data mutation methods
    updateData,
    setData: replaceData,
    handleDataChange, // Convenience for forms

    // Request methods
    send,
    abort,
    reset,

    // Expose current request instance (for advanced users)
    request: currentRequestRef.current,
  };
}
