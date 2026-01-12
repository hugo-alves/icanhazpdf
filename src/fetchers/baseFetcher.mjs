import axios from 'axios';
import { classifyError, isRetryable, getRetryDelay, RateLimitError } from '../errors.mjs';

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
 * Uses error classification for smarter retry decisions
 *
 * @param {function} fetchFn - Async function to execute
 * @param {object} options - Options
 * @param {number} options.retries - Max retry attempts (default 2)
 * @param {string} options.source - Source name for error classification
 * @returns {Promise<any>}
 */
export async function withRetry(fetchFn, options = {}) {
  const { retries = MAX_RETRIES, source = 'unknown' } = typeof options === 'number'
    ? { retries: options }
    : options;

  let lastError;
  let classifiedError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;
      classifiedError = classifyError(error, source);

      // Don't retry if error is not retryable (4xx except 429)
      if (!isRetryable(classifiedError)) {
        break;
      }

      if (attempt < retries) {
        const delay = getRetryDelay(classifiedError, attempt, BASE_DELAY);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // Attach classified error info for circuit breaker
  lastError.classifiedError = classifiedError;
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

/**
 * Validate a PDF URL
 * - Checks URL format
 * - Optionally verifies Content-Type header
 * - Optionally checks for PDF magic bytes
 *
 * @param {string} url - URL to validate
 * @param {object} options - Validation options
 * @param {boolean} options.checkHeader - Whether to check Content-Type header (default: true)
 * @param {boolean} options.checkMagicBytes - Whether to check PDF magic bytes (default: false, slower)
 * @param {number} options.timeout - Request timeout in ms (default: 5000)
 * @returns {Promise<{ valid: boolean, error?: string, contentType?: string }>}
 */
export async function validatePdfUrl(url, options = {}) {
  const {
    checkHeader = true,
    checkMagicBytes = false,
    timeout = 5000
  } = options;

  // Validate URL format
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Invalid protocol (must be http or https)' };
    }
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Skip network checks if not needed
  if (!checkHeader && !checkMagicBytes) {
    return { valid: true };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Use HEAD request first to check Content-Type without downloading
    if (checkHeader && !checkMagicBytes) {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ICanHazPDF/1.0)'
        }
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      const isPdf = contentType.includes('application/pdf') ||
                    contentType.includes('application/octet-stream') ||
                    url.toLowerCase().endsWith('.pdf');

      if (!isPdf && response.ok) {
        return {
          valid: false,
          error: `Not a PDF (Content-Type: ${contentType})`,
          contentType
        };
      }

      return { valid: true, contentType };
    }

    // If checking magic bytes, need to download part of the file
    if (checkMagicBytes) {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ICanHazPDF/1.0)',
          'Range': 'bytes=0-4' // Only get first 5 bytes for magic check
        }
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';

      // Check content type first
      if (checkHeader) {
        const isPdfContentType = contentType.includes('application/pdf') ||
                                  contentType.includes('application/octet-stream');
        if (!isPdfContentType && !url.toLowerCase().endsWith('.pdf')) {
          return {
            valid: false,
            error: `Not a PDF (Content-Type: ${contentType})`,
            contentType
          };
        }
      }

      // Check magic bytes: PDF files start with %PDF-
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const header = String.fromCharCode(...bytes.slice(0, 5));

      if (!header.startsWith('%PDF-')) {
        return {
          valid: false,
          error: 'Invalid PDF magic bytes',
          contentType
        };
      }

      return { valid: true, contentType };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return { valid: false, error: 'Validation timeout' };
    }
    // Network errors shouldn't invalidate the URL - it might still work
    // Log but don't fail validation
    return { valid: true, error: `Validation skipped: ${error.message}` };
  }

  return { valid: true };
}

/**
 * Create a validated success result
 * Validates the PDF URL before returning success
 *
 * @param {string} pdfUrl - PDF URL
 * @param {string} source - Source name
 * @param {object} metadata - Paper metadata
 * @param {object} validationOptions - PDF validation options
 * @returns {Promise<object>}
 */
export async function validatedSuccessResult(pdfUrl, source, metadata, validationOptions = {}) {
  const validation = await validatePdfUrl(pdfUrl, validationOptions);

  if (!validation.valid) {
    return {
      success: false,
      error: `Invalid PDF URL: ${validation.error}`,
      source,
      metadata
    };
  }

  return {
    success: true,
    pdf_url: pdfUrl,
    source,
    metadata,
    validated: true
  };
}
