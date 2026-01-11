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

const CACHE_FILE = process.env.CACHE_FILE || './cache.json';
const PDF_STORAGE_PATH = process.env.PDF_STORAGE_PATH || './pdfs';

/**
 * Load cache from disk
 */
async function loadCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

/**
 * Save cache to disk
 */
async function saveCache(cache) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Failed to save cache:', error);
  }
}

/**
 * Normalize title for cache key
 */
function normalizeTitle(title) {
  return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

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
 * Main paper fetcher with smart fallback strategy
 * Tries multiple sources in order of reliability and legality
 */
export async function fetchPaper(title, options = {}) {
  const normalizedTitle = normalizeTitle(title);

  // Check cache first
  const cache = await loadCache();
  if (cache[normalizedTitle] && !options.skipCache) {
    console.log('Cache hit for:', title);
    return {
      ...cache[normalizedTitle],
      cached: true
    };
  }

  console.log('Fetching paper:', title);

  // Define fetching strategies in order of preference
  // 1. Free, legal, reliable sources first
  // 2. Sources requiring DOI lookup next
  const strategies = [
    { name: 'arXiv', fn: () => fetchFromArxiv(title) },
    { name: 'Semantic Scholar', fn: () => fetchFromSemanticScholar(title) },
    { name: 'OpenAlex', fn: () => fetchFromOpenAlex(title) },
    { name: 'PubMed Central', fn: () => fetchFromPubMed(title) },
    { name: 'CORE', fn: () => fetchFromCore(title) },
  ];

  let lastError = null;
  let foundDoi = null;

  // Try each strategy
  for (const strategy of strategies) {
    try {
      console.log(`Trying ${strategy.name}...`);
      const result = await strategy.fn();

      if (result.success && result.pdf_url) {
        console.log(`✓ Found PDF via ${strategy.name}`);

        // Optionally download and store locally
        let localPath = null;
        if (options.downloadLocal) {
          const downloadResult = await downloadPdf(result.pdf_url, title);
          if (downloadResult.success) {
            localPath = downloadResult.filepath;
          }
        }

        const finalResult = {
          success: true,
          pdf_url: result.pdf_url,
          pdf_path: localPath,
          source: result.source,
          metadata: result.metadata,
          fetchedAt: new Date().toISOString()
        };

        // Cache the result
        cache[normalizedTitle] = finalResult;
        await saveCache(cache);

        return finalResult;
      }

      // Store DOI if found for later use with Unpaywall
      if (result.doi) {
        foundDoi = result.doi;
      }

      lastError = result.error;
    } catch (error) {
      console.error(`${strategy.name} failed:`, error.message);
      lastError = error.message;
    }
  }

  // If we found a DOI but no PDF, try Crossref + Unpaywall
  if (!foundDoi) {
    try {
      console.log('Trying Crossref for DOI...');
      const crossrefResult = await fetchFromCrossref(title);
      if (crossrefResult.doi) {
        foundDoi = crossrefResult.doi;
      }
    } catch (error) {
      console.error('Crossref failed:', error.message);
    }
  }

  // Try Unpaywall with the DOI
  if (foundDoi) {
    try {
      console.log('Trying Unpaywall with DOI:', foundDoi);
      const unpaywallResult = await fetchFromUnpaywall(foundDoi);

      if (unpaywallResult.success && unpaywallResult.pdf_url) {
        console.log('✓ Found PDF via Unpaywall');

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

        cache[normalizedTitle] = finalResult;
        await saveCache(cache);

        return finalResult;
      }
    } catch (error) {
      console.error('Unpaywall failed:', error.message);
      lastError = error.message;
    }
  }

  // All strategies failed
  return {
    success: false,
    error: lastError || 'Paper not found in any source',
    triedSources: strategies.map(s => s.name).concat(['Crossref', 'Unpaywall'])
  };
}
