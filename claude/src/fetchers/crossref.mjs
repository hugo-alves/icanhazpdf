import axios from 'axios';
import { isTitleMatch } from '../utils/titleMatch.mjs';

/**
 * Crossref fetcher - searches for papers by title and returns PDF links
 * Uses query.title for more precise matching
 */
export async function fetchFromCrossref(title) {
  try {
    const searchUrl = 'https://api.crossref.org/works';
    const params = {
      'query.title': title,  // More precise title search
      rows: 5,
      select: 'DOI,title,author,published,publisher,link'
    };

    const response = await axios.get(searchUrl, { params, timeout: 15000 });

    if (!response.data.message?.items || response.data.message.items.length === 0) {
      return { success: false, error: 'No results found on Crossref' };
    }

    // Look through results for matching title with PDF
    for (const item of response.data.message.items) {
      const resultTitle = item.title?.[0];
      
      // Validate title match
      if (!isTitleMatch(title, resultTitle)) {
        continue;
      }

      // Check for direct PDF link
      const pdfLink = item.link?.find(l => l['content-type'] === 'application/pdf');
      
      if (pdfLink?.URL) {
        return {
          success: true,
          pdf_url: pdfLink.URL,
          source: 'Crossref',
          doi: item.DOI,
          metadata: {
            title: resultTitle,
            authors: item.author?.map(a => `${a.given || ''} ${a.family || ''}`).join(', '),
            doi: item.DOI,
            publisher: item.publisher
          }
        };
      }

      // If matching title found but no PDF, return DOI for Unpaywall
      if (item.DOI) {
        return {
          success: false,
          error: 'No direct PDF link from Crossref',
          doi: item.DOI,
          metadata: {
            title: resultTitle,
            authors: item.author?.map(a => `${a.given || ''} ${a.family || ''}`).join(', '),
            doi: item.DOI,
            publisher: item.publisher
          }
        };
      }
    }

    return { success: false, error: 'No matching paper found on Crossref' };
  } catch (error) {
    return { success: false, error: `Crossref error: ${error.message}` };
  }
}
