/**
 * Normalize a title for comparison
 */
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate word overlap similarity between two titles
 * Returns a score between 0 and 1
 */
export function titleSimilarity(title1, title2) {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  
  if (!norm1 || !norm2) return 0;
  
  const words1 = new Set(norm1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(norm2.split(' ').filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return intersection / union;
}

/**
 * Check if result title matches search title (50% word overlap threshold)
 */
export function isTitleMatch(searchTitle, resultTitle, threshold = 0.5) {
  return titleSimilarity(searchTitle, resultTitle) >= threshold;
}
