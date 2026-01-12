import axios from 'axios';

/**
 * Validate that a URL points to an actual PDF
 * Checks Content-Type header and optionally PDF magic bytes
 */
export async function validatePdfUrl(url, options = {}) {
  const { timeout = 5000, checkMagicBytes = false } = options;

  try {
    if (checkMagicBytes) {
      // Download first bytes and check PDF magic number
      const response = await axios.get(url, {
        timeout,
        responseType: 'arraybuffer',
        headers: {
          'Range': 'bytes=0-4',
          'User-Agent': 'Mozilla/5.0 (compatible; PaperFetcherBot/1.0)'
        },
        maxContentLength: 1024 // Only need first few bytes
      });

      const buffer = Buffer.from(response.data);
      const magic = buffer.toString('utf8', 0, 4);

      if (magic !== '%PDF') {
        return {
          valid: false,
          error: 'Not a PDF file (magic bytes mismatch)'
        };
      }

      return { valid: true };
    }

    // Just check Content-Type header
    const response = await axios.head(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PaperFetcherBot/1.0)'
      }
    });

    const contentType = response.headers['content-type'] || '';

    // Accept application/pdf or octet-stream (some servers misconfigure)
    if (
      contentType.includes('application/pdf') ||
      contentType.includes('application/octet-stream')
    ) {
      return { valid: true, contentType };
    }

    // Check if URL ends in .pdf and server returned HTML (common error page)
    if (contentType.includes('text/html') && url.toLowerCase().includes('.pdf')) {
      return {
        valid: false,
        error: 'URL returns HTML instead of PDF (likely error page)',
        contentType
      };
    }

    // For other content types, be permissive if URL looks like PDF
    if (url.toLowerCase().includes('.pdf') || url.includes('/pdf/')) {
      return { valid: true, contentType, warning: 'Non-standard Content-Type' };
    }

    return {
      valid: false,
      error: `Unexpected Content-Type: ${contentType}`,
      contentType
    };
  } catch (error) {
    // Network errors or timeouts
    if (error.response?.status === 404) {
      return { valid: false, error: 'PDF not found (404)' };
    }
    if (error.response?.status === 403) {
      return { valid: false, error: 'PDF access forbidden (403)' };
    }
    if (error.code === 'ECONNABORTED') {
      return { valid: false, error: 'Timeout validating PDF' };
    }

    return { valid: false, error: `Validation error: ${error.message}` };
  }
}

/**
 * Quick check if URL is likely a PDF based on URL pattern
 * Use for fast pre-filtering before network validation
 */
export function looksLikePdfUrl(url) {
  const urlLower = url.toLowerCase();
  return (
    urlLower.endsWith('.pdf') ||
    urlLower.includes('/pdf/') ||
    urlLower.includes('type=pdf') ||
    urlLower.includes('format=pdf')
  );
}
