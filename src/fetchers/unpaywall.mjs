import axios from 'axios';
import { withRetry } from './baseFetcher.mjs';

/**
 * Unpaywall fetcher - finds legal open access versions of papers via DOI
 * Requires a DOI to work, so this depends on finding the DOI first
 * Now with retry logic for transient failures
 */
export async function fetchFromUnpaywall(doi, email = process.env.UNPAYWALL_EMAIL || 'example@example.com') {
  try {
    if (!doi) {
      return { success: false, error: 'DOI required for Unpaywall' };
    }

    const url = `https://api.unpaywall.org/v2/${doi}`;
    const params = { email };

    const response = await withRetry(() =>
      axios.get(url, { params, timeout: 10000 })
    );
    const data = response.data;

    if (data.best_oa_location?.url_for_pdf) {
      return {
        success: true,
        pdf_url: data.best_oa_location.url_for_pdf,
        source: 'Unpaywall',
        metadata: {
          title: data.title,
          authors: data.z_authors?.map(a => a.given + ' ' + a.family).join(', '),
          year: data.year,
          doi: data.doi,
          publisher: data.publisher,
          isOpenAccess: data.is_oa
        }
      };
    }

    return { success: false, error: 'No open access PDF found on Unpaywall' };
  } catch (error) {
    if (error.response?.status === 404) {
      return { success: false, error: 'DOI not found on Unpaywall' };
    }
    return { success: false, error: `Unpaywall error: ${error.message}` };
  }
}
