import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { withRetry } from './baseFetcher.mjs';

/**
 * PubMed/PMC fetcher - for biomedical and life sciences papers
 * PubMed Central (PMC) provides free full-text articles
 * Now with retry logic for transient failures
 */
export async function fetchFromPubMed(title) {
  try {
    // Step 1: Search PubMed for the paper (with retry)
    const searchUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
    const searchParams = {
      db: 'pubmed',
      term: title,
      retmax: 5,
      retmode: 'json'
    };

    const searchResponse = await withRetry(() =>
      axios.get(searchUrl, { params: searchParams, timeout: 10000 })
    );
    const ids = searchResponse.data.esearchresult?.idlist;

    if (!ids || ids.length === 0) {
      return { success: false, error: 'No results found on PubMed' };
    }

    // Step 2: Get PMC ID from PubMed ID (with retry)
    const linkUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi';
    const linkParams = {
      dbfrom: 'pubmed',
      db: 'pmc',
      id: ids[0],
      retmode: 'json'
    };

    const linkResponse = await withRetry(() =>
      axios.get(linkUrl, { params: linkParams, timeout: 10000 })
    );
    const pmcId = linkResponse.data.linksets?.[0]?.linksetdbs?.find(
      ls => ls.dbto === 'pmc'
    )?.links?.[0];

    if (!pmcId) {
      return { success: false, error: 'Paper not available in PubMed Central' };
    }

    // Step 3: Get article details (with retry)
    const summaryUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
    const summaryParams = {
      db: 'pmc',
      id: pmcId,
      retmode: 'json'
    };

    const summaryResponse = await withRetry(() =>
      axios.get(summaryUrl, { params: summaryParams, timeout: 10000 })
    );
    const article = summaryResponse.data.result?.[pmcId];

    // PMC PDF URL format
    const pdfUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcId}/pdf/`;

    return {
      success: true,
      pdf_url: pdfUrl,
      source: 'PubMed Central',
      metadata: {
        title: article?.title,
        authors: article?.authors?.map(a => a.name).join(', '),
        pmid: ids[0],
        pmcid: `PMC${pmcId}`,
        doi: article?.articleids?.find(id => id.idtype === 'doi')?.value
      }
    };
  } catch (error) {
    return { success: false, error: `PubMed error: ${error.message}` };
  }
}
