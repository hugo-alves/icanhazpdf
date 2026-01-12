import { fetchWithRetry, successResult, failureResult } from './baseFetcher.mjs';
import { isTitleMatch } from '../utils/titleMatch.mjs';

/**
 * OpenAlex fetcher - free and open catalog of scholarly papers
 * Now validates title similarity to avoid false positives
 */
export async function fetchFromOpenAlex(title) {
  const url = 'https://api.openalex.org/works';
  const options = {
    params: {
      search: title,
      per_page: 5,
      mailto: process.env.UNPAYWALL_EMAIL || 'example@example.com'
    }
  };

  return fetchWithRetry(url, options, (data) => {
    if (!data.results || data.results.length === 0) {
      return failureResult('No results found on OpenAlex');
    }

    // Try to find a paper with matching title AND open access PDF
    for (const work of data.results) {
      // Validate title similarity first
      if (!isTitleMatch(title, work.title)) {
        continue;
      }

      const pdfUrl = work.open_access?.oa_url ||
                     work.primary_location?.pdf_url ||
                     work.best_oa_location?.pdf_url;

      if (pdfUrl) {
        return successResult(pdfUrl, 'OpenAlex', {
          title: work.title,
          authors: work.authorships?.map(a => a.author?.display_name).filter(Boolean).join(', '),
          year: work.publication_year,
          doi: work.doi?.replace('https://doi.org/', ''),
          isOpenAccess: work.open_access?.is_oa
        });
      }
    }

    // Return DOI if found for matching title (for Unpaywall fallback)
    for (const work of data.results) {
      if (isTitleMatch(title, work.title) && work.doi) {
        return failureResult(
          'No open access PDF found on OpenAlex',
          work.doi.replace('https://doi.org/', '')
        );
      }
    }

    return failureResult('No matching paper found on OpenAlex');
  });
}
