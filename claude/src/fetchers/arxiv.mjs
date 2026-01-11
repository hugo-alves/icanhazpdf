import axios from 'axios';
import { parseStringPromise } from 'xml2js';

/**
 * ArXiv fetcher - searches for papers on arXiv and returns PDF URLs
 * ArXiv is a free preprint repository with direct PDF access
 */
export async function fetchFromArxiv(title) {
  try {
    // Search arXiv API
    const searchUrl = 'http://export.arxiv.org/api/query';
    const params = {
      search_query: `ti:"${title}"`,
      max_results: 5
    };

    const response = await axios.get(searchUrl, { params, timeout: 10000 });
    const data = await parseStringPromise(response.data);

    if (!data.feed.entry || data.feed.entry.length === 0) {
      return { success: false, error: 'No results found on arXiv' };
    }

    // Get the first result
    const entry = data.feed.entry[0];
    const arxivId = entry.id[0].split('/abs/')[1];
    const pdfUrl = `http://arxiv.org/pdf/${arxivId}.pdf`;

    // Verify the PDF exists
    const headResponse = await axios.head(pdfUrl, { timeout: 5000 });
    if (headResponse.status === 200) {
      return {
        success: true,
        pdf_url: pdfUrl,
        source: 'arXiv',
        metadata: {
          title: entry.title[0],
          authors: entry.author?.map(a => a.name[0]).join(', '),
          published: entry.published[0]
        }
      };
    }

    return { success: false, error: 'PDF not accessible on arXiv' };
  } catch (error) {
    return { success: false, error: `arXiv error: ${error.message}` };
  }
}
