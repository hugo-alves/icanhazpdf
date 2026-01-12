import axios from 'axios';

const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 2;
const BASE_DELAY = 1000;

/**
 * Base fetcher with retry logic and consistent error handling
 * Features:
 * - Exponential backoff with jitter (prevents thundering herd)
 * - Skips retry on 4xx client errors
 * - Retries on 5xx, timeouts, and network errors
 *
 * @param {string} url - API endpoint URL
 * @param {object} options - Axios request options (params, headers, etc.)
 * @param {function} parser - Function to parse response data and return result
 * @returns {Promise<object>} - Result object with success, pdf_url, source, metadata, or error
 */
export async function fetchWithRetry(url, options, parser) {
  const { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES, ...axiosOptions } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        ...axiosOptions,
        timeout
      });

      // Let parser handle the response - it should return the result object
      return parser(response.data);

    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx) - they won't succeed on retry
      if (error.response?.status >= 400 && error.response?.status < 500) {
        break;
      }

      if (attempt < retries) {
        // Exponential backoff with jitter: base * 2^attempt * (0.5 to 1.5)
        // This prevents thundering herd when multiple requests fail simultaneously
        const jitter = 0.5 + Math.random();
        const delay = BASE_DELAY * Math.pow(2, attempt) * jitter;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // Provide more context about the error
  const errorMsg = lastError?.code === 'ECONNABORTED'
    ? `Request timeout after ${timeout}ms`
    : lastError?.message || 'Unknown error';

  return {
    success: false,
    error: errorMsg
  };
}

/**
 * Simpler retry wrapper for fetchers that need custom axios calls
 * Wraps the entire fetch logic with retry
 */
export async function withRetry(fetchFn, retries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;

      // Don't retry on 4xx
      if (error.response?.status >= 400 && error.response?.status < 500) {
        break;
      }

      if (attempt < retries) {
        const jitter = 0.5 + Math.random();
        const delay = BASE_DELAY * Math.pow(2, attempt) * jitter;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Create a standard fetcher result for success
 */
export function successResult(pdfUrl, source, metadata) {
  return {
    success: true,
    pdf_url: pdfUrl,
    source,
    metadata
  };
}

/**
 * Create a standard fetcher result for failure
 */
export function failureResult(error, doi = null, metadata = null) {
  const result = { success: false, error };
  if (doi) result.doi = doi;
  if (metadata) result.metadata = metadata;
  return result;
}
