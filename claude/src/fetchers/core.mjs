import axios from 'axios';

/**
 * CORE fetcher - UK-based open access repository aggregator
 * CORE aggregates millions of open access papers from repositories worldwide
 */
export async function fetchFromCore(title) {
  try {
    const searchUrl = 'https://api.core.ac.uk/v3/search/works';
    const params = {
      q: title,
      limit: 5
    };

    const response = await axios.get(searchUrl, { params, timeout: 10000 });

    if (!response.data.results || response.data.results.length === 0) {
      return { success: false, error: 'No results found on CORE' };
    }

    // Try to find a paper with a downloadable PDF
    for (const paper of response.data.results) {
      if (paper.downloadUrl) {
        return {
          success: true,
          pdf_url: paper.downloadUrl,
          source: 'CORE',
          metadata: {
            title: paper.title,
            authors: paper.authors?.join(', '),
            year: paper.yearPublished,
            doi: paper.doi
          }
        };
      }
    }

    return { success: false, error: 'No downloadable PDF found on CORE' };
  } catch (error) {
    return { success: false, error: `CORE error: ${error.message}` };
  }
}
