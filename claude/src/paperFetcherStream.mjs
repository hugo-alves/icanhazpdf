import { fetchFromArxiv } from './fetchers/arxiv.mjs';
import { fetchFromSemanticScholar } from './fetchers/semanticScholar.mjs';
import { fetchFromUnpaywall } from './fetchers/unpaywall.mjs';
import { fetchFromCrossref } from './fetchers/crossref.mjs';
import { fetchFromCore } from './fetchers/core.mjs';
import { fetchFromOpenAlex } from './fetchers/openalex.mjs';
import { fetchFromPubMed } from './fetchers/pubmed.mjs';
import { fetchFromWebSearch } from './fetchers/webSearch.mjs';
import { cacheGet, cacheSet } from './cache.mjs';

/**
 * Source priority for selecting best result
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
 * Streaming paper fetcher with progress events
 * Emits events as each source is tried
 *
 * @param {string} title - Paper title to search
 * @param {function} emit - Callback to emit SSE events: emit(event, data)
 * @param {object} options - Fetch options
 */
export async function fetchPaperWithProgress(title, emit, options = {}) {
  // Check cache first
  if (!options.skipCache) {
    const cached = await cacheGet(title);
    if (cached) {
      emit('cache_hit', { title });
      emit('complete', { ...cached, cached: true });
      return;
    }
  }

  emit('start', { title, sources: 7 });

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

  const successfulResults = [];
  const collectedDois = [];
  const collectedMetadata = [];

  // Run strategies with progress events
  const promises = strategies.map(async (strategy) => {
    emit('trying', { source: strategy.name });

    try {
      const result = await strategy.fn();

      if (result.success && result.pdf_url) {
        emit('found', { source: strategy.name, pdf_url: result.pdf_url });
        return { name: strategy.name, result, success: true };
      } else {
        emit('no_pdf', {
          source: strategy.name,
          doi: result.doi || null,
          error: result.error
        });
        return { name: strategy.name, result, success: false };
      }
    } catch (error) {
      emit('error', { source: strategy.name, error: error.message });
      return { name: strategy.name, result: { success: false, error: error.message }, success: false };
    }
  });

  const results = await Promise.allSettled(promises);

  // Process results
  for (const settled of results) {
    if (settled.status === 'fulfilled') {
      const { name, result, success } = settled.value;
      if (success) {
        successfulResults.push({ name, result });
      } else {
        if (result.doi) collectedDois.push(result.doi);
        if (result.metadata) collectedMetadata.push({ source: name, ...result.metadata });
      }
    }
  }

  // If we found PDFs, return the best one
  if (successfulResults.length > 0) {
    successfulResults.sort((a, b) =>
      (SOURCE_PRIORITY[a.name] || 99) - (SOURCE_PRIORITY[b.name] || 99)
    );

    const best = successfulResults[0];
    emit('selected', { source: best.name, count: successfulResults.length });

    const finalResult = {
      success: true,
      pdf_url: best.result.pdf_url,
      source: best.result.source || best.name,
      metadata: best.result.metadata,
      fetchedAt: new Date().toISOString()
    };

    await cacheSet(title, finalResult);
    emit('complete', finalResult);
    return;
  }

  // Try Unpaywall with DOI
  if (collectedDois.length > 0) {
    const doi = collectedDois[0];
    emit('trying', { source: 'Unpaywall', doi });

    try {
      const unpaywallResult = await fetchFromUnpaywall(doi);

      if (unpaywallResult.success && unpaywallResult.pdf_url) {
        emit('found', { source: 'Unpaywall', pdf_url: unpaywallResult.pdf_url });

        const finalResult = {
          success: true,
          pdf_url: unpaywallResult.pdf_url,
          source: unpaywallResult.source,
          metadata: unpaywallResult.metadata,
          fetchedAt: new Date().toISOString()
        };

        await cacheSet(title, finalResult);
        emit('complete', finalResult);
        return;
      } else {
        emit('no_pdf', { source: 'Unpaywall', error: unpaywallResult.error });
      }
    } catch (error) {
      emit('error', { source: 'Unpaywall', error: error.message });
    }
  }

  // All failed
  const hasPartialData = collectedDois.length > 0 || collectedMetadata.length > 0;
  emit('complete', {
    success: false,
    partial: hasPartialData,
    error: 'No open access PDF found',
    doi: collectedDois[0] || null,
    metadata: collectedMetadata[0] || null,
    fetchedAt: new Date().toISOString()
  });
}
