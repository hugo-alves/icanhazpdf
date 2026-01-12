import axios from 'axios';
import { isTitleMatch } from '../utils/titleMatch.mjs';
import { withRetry } from './baseFetcher.mjs';

/**
 * Semantic Scholar fetcher - uses S2 API to find papers and their open access PDFs
 * Validates title similarity to avoid false positives
 * Now with retry logic for transient failures
 */
export async function fetchFromSemanticScholar(title) {
  try {
    const searchUrl = 'https://api.semanticscholar.org/graph/v1/paper/search';
    const params = {
      query: title,
      limit: 5,
      fields: 'title,authors,year,openAccessPdf,externalIds,url'
    };

    const headers = {};
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
      headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
    }

    const response = await withRetry(() =>
      axios.get(searchUrl, { params, headers, timeout: 10000 })
    );

    if (!response.data.data || response.data.data.length === 0) {
      return { success: false, error: 'No results found on Semantic Scholar' };
    }

    // Try to find a paper with matching title AND open access PDF
    for (const paper of response.data.data) {
      // Validate title similarity first
      if (!isTitleMatch(title, paper.title)) {
        continue;
      }

      if (paper.openAccessPdf?.url) {
        return {
          success: true,
          pdf_url: paper.openAccessPdf.url,
          source: 'Semantic Scholar',
          metadata: {
            title: paper.title,
            authors: paper.authors?.map(a => a.name).join(', '),
            year: paper.year,
            doi: paper.externalIds?.DOI,
            semanticScholarUrl: paper.url
          }
        };
      }
    }

    // Return DOI if found for matching title (for Unpaywall fallback)
    for (const paper of response.data.data) {
      if (isTitleMatch(title, paper.title) && paper.externalIds?.DOI) {
        return {
          success: false,
          error: 'No open access PDF on Semantic Scholar',
          doi: paper.externalIds.DOI
        };
      }
    }

    return { success: false, error: 'No matching paper found on Semantic Scholar' };
  } catch (error) {
    return { success: false, error: `Semantic Scholar error: ${error.message}` };
  }
}
