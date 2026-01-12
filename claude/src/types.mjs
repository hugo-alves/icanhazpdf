/**
 * Type definitions for Paper Fetcher API
 * Using JSDoc for TypeScript-like type safety without compilation
 */

/**
 * @typedef {Object} PaperMetadata
 * @property {string} [title] - Paper title
 * @property {string} [authors] - Comma-separated author names
 * @property {number|string} [year] - Publication year
 * @property {string} [doi] - Digital Object Identifier
 * @property {string} [arxivId] - arXiv paper ID
 * @property {string} [published] - Publication date string
 * @property {boolean} [isOpenAccess] - Whether paper is open access
 * @property {string} [semanticScholarUrl] - Semantic Scholar URL
 */

/**
 * @typedef {Object} FetchResult
 * @property {boolean} success - Whether fetch was successful
 * @property {string} [pdf_url] - URL to PDF file
 * @property {string} [pdf_path] - Local path if downloaded
 * @property {string} [source] - Source that provided the result
 * @property {PaperMetadata} [metadata] - Paper metadata
 * @property {string} [error] - Error message if failed
 * @property {string} [doi] - DOI if found (for partial results)
 * @property {boolean} [cached] - Whether result came from cache
 * @property {boolean} [partial] - Whether partial data is available
 * @property {string[]} [triedSources] - List of sources that were tried
 * @property {string} [fetchedAt] - ISO timestamp of fetch
 */

/**
 * @typedef {Object} FetchOptions
 * @property {boolean} [downloadLocal] - Download PDF to local storage
 * @property {boolean} [skipCache] - Skip cache lookup
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {string} status - 'healthy' | 'degraded' | 'unhealthy'
 * @property {string} timestamp - ISO timestamp
 * @property {SourceStatus[]} [sources] - Per-source status (deep check only)
 * @property {{healthy: number, total: number}} [summary] - Summary counts
 */

/**
 * @typedef {Object} SourceStatus
 * @property {string} name - Source name
 * @property {string} status - 'healthy' | 'degraded' | 'unhealthy'
 * @property {number} [statusCode] - HTTP status code
 * @property {number} [latencyMs] - Response time in ms
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} SSEEvent
 * @property {string} event - Event type: 'start' | 'trying' | 'found' | 'no_pdf' | 'error' | 'selected' | 'complete' | 'cache_hit'
 * @property {Object} data - Event data
 */

/**
 * @typedef {Object} BibtexResult
 * @property {boolean} success - Whether BibTeX was fetched
 * @property {string} [bibtex] - BibTeX citation string
 * @property {string} [doi] - DOI used for lookup
 * @property {string} [error] - Error message if failed
 */

// Export empty object to make this a module
export {};
