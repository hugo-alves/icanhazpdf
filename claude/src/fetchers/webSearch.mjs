import axios from 'axios';
import { isTitleMatch } from '../utils/titleMatch.mjs';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

// Trusted academic domains for PDF downloads
const TRUSTED_DOMAINS = [
  'arxiv.org',
  'researchgate.net',
  'academia.edu',
  'ssrn.com',
  'biorxiv.org',
  'medrxiv.org',
  'hal.science',
  'hal.archives-ouvertes.fr',
  'ncbi.nlm.nih.gov',
  'pmc.ncbi.nlm.nih.gov',
  '.edu',  // University domains
  'dspace',
  'scholarspace',
  'repository',
  'eprints',
  'core.ac.uk',
  'zenodo.org',
  'osf.io',
  'philpapers.org'
];

/**
 * Check if URL is from a trusted academic domain
 */
function isTrustedDomain(url) {
  const urlLower = url.toLowerCase();
  return TRUSTED_DOMAINS.some(domain => urlLower.includes(domain));
}

/**
 * Web search fallback - uses Brave Search to find preprints and author-hosted PDFs
 */
export async function fetchFromWebSearch(title) {
  if (!BRAVE_API_KEY) {
    return { success: false, error: 'BRAVE_API_KEY not configured' };
  }

  try {
    // Search for paper title + PDF/preprint
    const query = `"${title}" filetype:pdf OR preprint`;
    
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: {
        q: query,
        count: 10
      },
      headers: {
        'X-Subscription-Token': BRAVE_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    const results = response.data?.web?.results || [];
    
    if (results.length === 0) {
      return { success: false, error: 'No web search results' };
    }

    // Look for PDF links from trusted domains
    for (const result of results) {
      const url = result.url || '';
      
      // Check if it's from a trusted domain
      if (!isTrustedDomain(url)) {
        continue;
      }

      // Check if URL looks like a PDF
      const isPdfUrl = url.toLowerCase().includes('.pdf') || 
                       url.toLowerCase().includes('/pdf/') ||
                       url.toLowerCase().includes('download');

      if (isPdfUrl) {
        return {
          success: true,
          pdf_url: url,
          source: 'Web Search',
          metadata: {
            title: result.title,
            description: result.description,
            domain: new URL(url).hostname
          }
        };
      }
    }

    // If no direct PDF, try to find any academic link
    for (const result of results) {
      const url = result.url || '';
      if (isTrustedDomain(url)) {
        // Return the link even if not direct PDF - might lead to download
        return {
          success: true,
          pdf_url: url,
          source: 'Web Search (landing page)',
          metadata: {
            title: result.title,
            description: result.description,
            domain: new URL(url).hostname
          }
        };
      }
    }

    return { success: false, error: 'No trusted academic sources found' };
  } catch (error) {
    return { success: false, error: `Web search error: ${error.message}` };
  }
}
