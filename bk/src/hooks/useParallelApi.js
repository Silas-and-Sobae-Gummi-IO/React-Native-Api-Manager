import {useState, useEffect, useRef} from 'react';

/**
 * A hook for making multiple API requests in parallel.
 * @param {object} apiClient - An instance of the ApiClient.
 * @param {Array<object>} requests - An array of request configurations.
 * @returns {{data: Array|null, loading: boolean, error: Error|null}}
 */
export const useParallelApi = (apiClient, requests = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Stringify the requests to create a stable dependency for the effect hook.
    const requestKey = JSON.stringify(requests);

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const responses = await apiClient.all(requests);
        if (isMounted.current) {
          setData(responses);
        }
      } catch (err) {
        if (isMounted.current) {
          setError(err);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    if (requests.length > 0) {
      fetchData();
    } else {
      setLoading(false);
    }

    return () => {
      apiClient.abort();
    };
  }, [apiClient, requestKey]);

  return {data, loading, error};
};
