import axios from 'axios';

const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

/**
 * Base fetcher with retry logic and consistent error handling
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

      // Don't retry on client errors (4xx) or if it's the last attempt
      if (error.response?.status >= 400 && error.response?.status < 500) {
        break;
      }

      if (attempt < retries) {
        // Wait before retrying (exponential backoff)
        await new Promise(r => setTimeout(r, RETRY_DELAY * Math.pow(2, attempt)));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error'
  };
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
