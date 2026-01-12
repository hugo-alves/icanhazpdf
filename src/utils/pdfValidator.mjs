/**
 * Validates that a URL actually returns an accessible PDF
 * Uses browser-like headers to catch 403 blocks
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/pdf,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Check if a PDF URL is actually accessible
 * @param {string} url - The PDF URL to validate
 * @param {number} timeout - Timeout in ms (default 5000)
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validatePdfUrl(url, timeout = 5000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'HEAD',
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { valid: false, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';

    // Accept PDF or octet-stream (some servers use generic binary type)
    if (contentType.includes('application/pdf') ||
        contentType.includes('application/octet-stream') ||
        url.toLowerCase().endsWith('.pdf')) {
      return { valid: true };
    }

    // Some servers don't return content-type on HEAD, try GET with range
    if (!contentType || contentType.includes('text/html')) {
      return await validateWithGet(url, timeout);
    }

    return { valid: true }; // Assume valid if we got 200
  } catch (error) {
    if (error.name === 'AbortError') {
      return { valid: false, error: 'timeout' };
    }
    return { valid: false, error: error.message };
  }
}

/**
 * Fallback: fetch first bytes and check PDF signature
 */
async function validateWithGet(url, timeout = 5000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...BROWSER_HEADERS,
        'Range': 'bytes=0-10', // Just get first few bytes
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok && response.status !== 206) {
      return { valid: false, error: `HTTP ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Check for PDF magic bytes: %PDF
    if (bytes[0] === 0x25 && bytes[1] === 0x50 &&
        bytes[2] === 0x44 && bytes[3] === 0x46) {
      return { valid: true };
    }

    // Check if it's HTML (error page)
    const text = new TextDecoder().decode(bytes);
    if (text.toLowerCase().includes('<!doc') || text.toLowerCase().includes('<html')) {
      return { valid: false, error: 'HTML response (not PDF)' };
    }

    return { valid: true }; // Assume valid
  } catch (error) {
    if (error.name === 'AbortError') {
      return { valid: false, error: 'timeout' };
    }
    return { valid: false, error: error.message };
  }
}
