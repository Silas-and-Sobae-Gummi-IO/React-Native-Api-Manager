import { ApiError } from './ApiError';

describe('ApiError - A custom error class for API requests', () => {
  it('should correctly store all provided properties', () => {
    const mockRequestConfig = { method: 'GET', url: '/users' };
    const mockResponse = { data: { message: 'Not Found' }, status: 404 };
    const errorMessage = 'Request failed with status code 404';

    const error = new ApiError(errorMessage, mockRequestConfig, mockResponse);

    // Check that it's a true instance of Error
    expect(error).toBeInstanceOf(Error);

    // Check custom properties
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe(errorMessage);
    expect(error.config).toBe(mockRequestConfig);
    expect(error.response).toBe(mockResponse);
    expect(error.status).toBe(404);
  });

  it('should handle cases where response is not provided', () => {
    const mockRequestConfig = { method: 'GET', url: '/users' };
    const errorMessage = 'Network Error';

    const error = new ApiError(errorMessage, mockRequestConfig);

    expect(error.response).toBeUndefined();
    expect(error.status).toBeUndefined();
    expect(error.config).toBe(mockRequestConfig);
  });
});
