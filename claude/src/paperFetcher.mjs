/** @typedef {import('./types.mjs').FetchResult} FetchResult */
/** @typedef {import('./types.mjs').FetchOptions} FetchOptions */
/** @typedef {import('./types.mjs').PaperMetadata} PaperMetadata */

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fetchFromArxiv } from './fetchers/arxiv.mjs';
import { fetchFromSemanticScholar } from './fetchers/semanticScholar.mjs';
import { fetchFromUnpaywall } from './fetchers/unpaywall.mjs';
import { fetchFromCrossref } from './fetchers/crossref.mjs';
import { fetchFromCore } from './fetchers/core.mjs';
import { fetchFromOpenAlex } from './fetchers/openalex.mjs';
import { fetchFromPubMed } from './fetchers/pubmed.mjs';
import { fetchFromWebSearch } from './fetchers/webSearch.mjs';
import { cacheGet, cacheSet, normalizeTitle } from './cache.mjs';
import { createFetchLogger } from './logger.mjs';

const PDF_STORAGE_PATH = process.env.PDF_STORAGE_PATH || './pdfs';

/**
 * In-flight request deduplication
 * Prevents duplicate API calls for the same paper title
 */
const inflightRequests = new Map();

/**
 * Download PDF and save to local storage
 */
async function downloadPdf(url, title) {
  try {
    // Ensure PDF directory exists
    await fs.mkdir(PDF_STORAGE_PATH, { recursive: true });

    // Generate safe filename
    const safeTitle = title
      .replace(/[^a-z0-9]/gi, '_')
      .substring(0, 100)
      .toLowerCase();
    const timestamp = Date.now();
    const filename = `${safeTitle}_${timestamp}.pdf`;
    const filepath = path.join(PDF_STORAGE_PATH, filename);

    // Download PDF
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024, // 100MB max
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PaperFetcherBot/1.0)'
      }
    });

    // Save to disk
    await fs.writeFile(filepath, response.data);

    return { success: true, filepath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Source priority for selecting best result when multiple succeed
 */
const SOURCE_PRIORITY = {
  'arXiv': 1,
  'Semantic Scholar': 2,
  'OpenAlex': 3,
  'PubMed Central': 4,
  'CORE': 5,
  'Crossref': 6,
  'Web Search': 7,
  'Unpaywall': 8
};

/**
 * Main paper fetcher with parallel fetching strategy
 * Runs all sources in parallel for speed, picks best result
 * Deduplicates concurrent requests for the same paper
 * @param {string} title - Paper title to search for
 * @param {FetchOptions} [options] - Fetch options
 * @returns {Promise<FetchResult>} - Fetch result with PDF URL or error
 */
export async function fetchPaper(title, options = {}) {
  const normalizedKey = normalizeTitle(title);

  const log = createFetchLogger(title);

  // Check cache first
  if (!options.skipCache) {
    const cached = await cacheGet(title);
    if (cached) {
      log.info('Cache hit');
      return {
        ...cached,
        cached: true
      };
    }
  }

  // Check for in-flight request for same paper
  if (inflightRequests.has(normalizedKey)) {
    log.info('Deduplicating request');
    return inflightRequests.get(normalizedKey);
  }

  // Create promise for this request and store it
  const fetchPromise = fetchPaperInternal(title, options);
  inflightRequests.set(normalizedKey, fetchPromise);

  try {
    const result = await fetchPromise;
    return result;
  } finally {
    // Clean up after request completes
    inflightRequests.delete(normalizedKey);
  }
}

/**
 * Internal fetch implementation (called by deduplicating wrapper)
 */
async function fetchPaperInternal(title, options = {}) {
  const log = createFetchLogger(title);
  log.info('Fetching paper');

  // Define fetching strategies
  const strategies = [
    { name: 'arXiv', fn: () => fetchFromArxiv(title) },
    { name: 'Semantic Scholar', fn: () => fetchFromSemanticScholar(title) },
    { name: 'OpenAlex', fn: () => fetchFromOpenAlex(title) },
    { name: 'PubMed Central', fn: () => fetchFromPubMed(title) },
    { name: 'CORE', fn: () => fetchFromCore(title) },
    { name: 'Crossref', fn: () => fetchFromCrossref(title) },
    { name: 'Web Search', fn: () => fetchFromWebSearch(title) },
  ];

  log.info({ sourceCount: strategies.length }, 'Trying sources in parallel');

  // Run all strategies in parallel
  const results = await Promise.allSettled(
    strategies.map(async (strategy) => {
      try {
        const result = await strategy.fn();
        return { name: strategy.name, result };
      } catch (error) {
        return { name: strategy.name, result: { success: false, error: error.message } };
      }
    })
  );

  // Process results: find PDFs, collect DOIs and metadata
  const successfulResults = [];
  const collectedDois = [];
  const collectedMetadata = [];
  const errors = [];

  for (const settled of results) {
    if (settled.status === 'fulfilled') {
      const { name, result } = settled.value;
      if (result.success && result.pdf_url) {
        log.info({ source: name }, 'Found PDF');
        successfulResults.push({ name, result });
      } else {
        if (result.doi) {
          collectedDois.push(result.doi);
        }
        // Collect metadata even from unsuccessful results
        if (result.metadata) {
          collectedMetadata.push({ source: name, ...result.metadata });
        }
        if (result.error) {
          errors.push(`${name}: ${result.error}`);
        }
      }
    } else {
      errors.push(settled.reason?.message || 'Unknown error');
    }
  }

  // If we found PDFs, return the best one (by source priority)
  if (successfulResults.length > 0) {
    successfulResults.sort((a, b) =>
      (SOURCE_PRIORITY[a.name] || 99) - (SOURCE_PRIORITY[b.name] || 99)
    );

    const best = successfulResults[0];
    log.info({ source: best.name, totalSources: successfulResults.length }, 'Selected best result');

    // Optionally download and store locally
    let localPath = null;
    if (options.downloadLocal) {
      const downloadResult = await downloadPdf(best.result.pdf_url, title);
      if (downloadResult.success) {
        localPath = downloadResult.filepath;
      }
    }

    const finalResult = {
      success: true,
      pdf_url: best.result.pdf_url,
      pdf_path: localPath,
      source: best.result.source || best.name,
      metadata: best.result.metadata,
      fetchedAt: new Date().toISOString()
    };

    // Cache the result
    await cacheSet(title, finalResult);

    return finalResult;
  }

  // No PDF found - try Unpaywall with collected DOIs
  if (collectedDois.length > 0) {
    const uniqueDoi = collectedDois[0]; // Use first DOI found
    log.info({ doi: uniqueDoi }, 'Trying Unpaywall with DOI');

    try {
      const unpaywallResult = await fetchFromUnpaywall(uniqueDoi);

      if (unpaywallResult.success && unpaywallResult.pdf_url) {
        log.info({ source: 'Unpaywall' }, 'Found PDF');

        let localPath = null;
        if (options.downloadLocal) {
          const downloadResult = await downloadPdf(unpaywallResult.pdf_url, title);
          if (downloadResult.success) {
            localPath = downloadResult.filepath;
          }
        }

        const finalResult = {
          success: true,
          pdf_url: unpaywallResult.pdf_url,
          pdf_path: localPath,
          source: unpaywallResult.source,
          metadata: unpaywallResult.metadata,
          fetchedAt: new Date().toISOString()
        };

        await cacheSet(title, finalResult);

        return finalResult;
      }
    } catch (error) {
      log.warn({ error: error.message }, 'Unpaywall failed');
      errors.push(`Unpaywall: ${error.message}`);
    }
  }

  // All strategies failed - return partial results if we have any
  const hasPartialData = collectedDois.length > 0 || collectedMetadata.length > 0;

  return {
    success: false,
    partial: hasPartialData,
    error: errors[0] || 'No open access PDF found',
    // Include DOI if found (user can try other methods)
    doi: collectedDois[0] || null,
    // Include best metadata from sources
    metadata: collectedMetadata[0] || null,
    triedSources: strategies.map(s => s.name).concat(collectedDois.length > 0 ? ['Unpaywall'] : []),
    fetchedAt: new Date().toISOString()
  };
}
