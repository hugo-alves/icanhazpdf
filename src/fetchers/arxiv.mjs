import { parseStringPromise } from 'xml2js';
import axios from 'axios';
import { isTitleMatch } from '../utils/titleMatch.mjs';
import { validatePdfUrl } from '../utils/pdfValidator.mjs';
import { withRetry } from './baseFetcher.mjs';

/**
 * ArXiv fetcher - searches for papers on arXiv and returns PDF URLs
 * ArXiv is a free preprint repository with direct PDF access
 * Validates title similarity and PDF content-type
 * Now with retry logic for transient failures
 */
export async function fetchFromArxiv(title) {
  try {
    // Search arXiv API with retry
    const searchUrl = 'http://export.arxiv.org/api/query';
    const params = {
      search_query: `ti:"${title}"`,
      max_results: 5
    };

    const response = await withRetry(() =>
      axios.get(searchUrl, { params, timeout: 10000 })
    );
    const data = await parseStringPromise(response.data);

    if (!data.feed.entry || data.feed.entry.length === 0) {
      return { success: false, error: 'No results found on arXiv' };
    }

    // Loop through results and validate title match
    for (const entry of data.feed.entry) {
      const resultTitle = entry.title[0].replace(/\s+/g, ' ').trim();

      // Validate title similarity to avoid false positives
      if (!isTitleMatch(title, resultTitle)) {
        continue;
      }

      const arxivId = entry.id[0].split('/abs/')[1];
      const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;

      // Verify the PDF exists and is actually a PDF
      const validation = await validatePdfUrl(pdfUrl);
      if (validation.valid) {
        return {
          success: true,
          pdf_url: pdfUrl,
          source: 'arXiv',
          metadata: {
            title: resultTitle,
            authors: entry.author?.map(a => a.name[0]).join(', '),
            published: entry.published[0],
            arxivId
          }
        };
      }
      // PDF validation failed, try next result
    }

    return { success: false, error: 'No matching paper found on arXiv' };
  } catch (error) {
    return { success: false, error: `arXiv error: ${error.message}` };
  }
}
