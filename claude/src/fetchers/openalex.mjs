import axios from 'axios';
import { isTitleMatch } from '../utils/titleMatch.mjs';

/**
 * OpenAlex fetcher - free and open catalog of scholarly papers
 * Now validates title similarity to avoid false positives
 */
export async function fetchFromOpenAlex(title) {
  try {
    const searchUrl = 'https://api.openalex.org/works';
    const params = {
      search: title,
      per_page: 5,
      mailto: process.env.UNPAYWALL_EMAIL || 'example@example.com'
    };

    const response = await axios.get(searchUrl, { params, timeout: 10000 });

    if (!response.data.results || response.data.results.length === 0) {
      return { success: false, error: 'No results found on OpenAlex' };
    }

    // Try to find a paper with matching title AND open access PDF
    for (const work of response.data.results) {
      // Validate title similarity first
      if (!isTitleMatch(title, work.title)) {
        continue;  // Skip non-matching titles
      }

      const pdfUrl = work.open_access?.oa_url ||
                     work.primary_location?.pdf_url ||
                     work.best_oa_location?.pdf_url;

      if (pdfUrl) {
        return {
          success: true,
          pdf_url: pdfUrl,
          source: 'OpenAlex',
          metadata: {
            title: work.title,
            authors: work.authorships?.map(a => a.author?.display_name).filter(Boolean).join(', '),
            year: work.publication_year,
            doi: work.doi?.replace('https://doi.org/', ''),
            isOpenAccess: work.open_access?.is_oa
          }
        };
      }
    }

    // Also return DOI if found for matching title (for Unpaywall fallback)
    for (const work of response.data.results) {
      if (isTitleMatch(title, work.title) && work.doi) {
        return { 
          success: false, 
          error: 'No open access PDF found on OpenAlex',
          doi: work.doi.replace('https://doi.org/', '')
        };
      }
    }

    return { success: false, error: 'No matching paper found on OpenAlex' };
  } catch (error) {
    return { success: false, error: `OpenAlex error: ${error.message}` };
  }
}
