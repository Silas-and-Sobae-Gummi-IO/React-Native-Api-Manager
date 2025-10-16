import {useApiBase} from './useApiBase';
import {useScreenFocus} from './useScreenFocus';

/**
 * A project-specific wrapper for `useApiBase` that automatically integrates
 * with React Navigation's focus and blur events.
 * @param {object} options - Configuration options for useApiBase.
 * @returns {object} The API state and methods.
 */
export const useApiNavigation = (options = {}) => {
  const api = useApiBase(options);

  useScreenFocus({
    onFocus: api.focus,
    onBlur: api.blur,
  });

  return api;
};
