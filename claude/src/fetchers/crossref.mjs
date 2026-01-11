import axios from 'axios';

/**
 * Crossref fetcher - searches for papers and returns DOI + metadata
 * Crossref doesn't provide PDFs directly, but helps find DOIs for use with Unpaywall
 */
export async function fetchFromCrossref(title) {
  try {
    const searchUrl = 'https://api.crossref.org/works';
    const params = {
      query: title,
      rows: 5,
      select: 'DOI,title,author,published,publisher,link'
    };

    const response = await axios.get(searchUrl, { params, timeout: 10000 });

    if (!response.data.message?.items || response.data.message.items.length === 0) {
      return { success: false, error: 'No results found on Crossref' };
    }

    // Return the first result with DOI
    const item = response.data.message.items[0];
    if (item.DOI) {
      // Check if there's a direct link to PDF
      const pdfLink = item.link?.find(l => l['content-type'] === 'application/pdf');

      if (pdfLink?.URL) {
        return {
          success: true,
          pdf_url: pdfLink.URL,
          source: 'Crossref',
          metadata: {
            title: item.title?.[0],
            authors: item.author?.map(a => `${a.given} ${a.family}`).join(', '),
            doi: item.DOI,
            publisher: item.publisher
          }
        };
      }

      // Return DOI for potential use with Unpaywall
      return {
        success: false,
        error: 'No direct PDF link from Crossref',
        doi: item.DOI,
        metadata: {
          title: item.title?.[0],
          authors: item.author?.map(a => `${a.given} ${a.family}`).join(', '),
          doi: item.DOI,
          publisher: item.publisher
        }
      };
    }

    return { success: false, error: 'No DOI found on Crossref' };
  } catch (error) {
    return { success: false, error: `Crossref error: ${error.message}` };
  }
}
