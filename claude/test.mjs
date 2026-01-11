import 'dotenv/config';
import { fetchPaper } from './src/paperFetcher.mjs';

/**
 * Test script to demonstrate the Paper Fetcher API
 * Run with: node test.mjs
 */

const testPapers = [
  'Attention Is All You Need',
  'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
  'Deep Residual Learning for Image Recognition',
  'Generative Adversarial Networks',
  'ImageNet Classification with Deep Convolutional Neural Networks'
];

async function runTests() {
  console.log('🧪 Paper Fetcher Test Suite\n');
  console.log('=' .repeat(80));
  console.log('\n');

  const results = [];

  for (let i = 0; i < testPapers.length; i++) {
    const title = testPapers[i];
    console.log(`\nTest ${i + 1}/${testPapers.length}: "${title}"`);
    console.log('-'.repeat(80));

    try {
      const result = await fetchPaper(title, { downloadLocal: false });

      if (result.success) {
        console.log('✅ SUCCESS');
        console.log(`   Source: ${result.source}`);
        console.log(`   PDF URL: ${result.pdf_url}`);
        if (result.metadata) {
          console.log(`   Authors: ${result.metadata.authors || 'N/A'}`);
          console.log(`   Year: ${result.metadata.year || 'N/A'}`);
        }
        results.push({ title, success: true, source: result.source });
      } else {
        console.log('❌ FAILED');
        console.log(`   Error: ${result.error}`);
        results.push({ title, success: false, error: result.error });
      }
    } catch (error) {
      console.log('❌ ERROR');
      console.log(`   ${error.message}`);
      results.push({ title, success: false, error: error.message });
    }

    // Small delay to avoid rate limiting
    if (i < testPapers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  console.log('\n');
  console.log('=' .repeat(80));
  console.log('📊 Test Summary');
  console.log('=' .repeat(80));
  console.log('');

  const successful = results.filter(r => r.success).length;
  const successRate = ((successful / results.length) * 100).toFixed(1);

  console.log(`Total papers tested: ${results.length}`);
  console.log(`Successful fetches: ${successful}`);
  console.log(`Failed fetches: ${results.length - successful}`);
  console.log(`Success rate: ${successRate}%`);
  console.log('');

  // Source breakdown
  const sources = {};
  results.filter(r => r.success).forEach(r => {
    sources[r.source] = (sources[r.source] || 0) + 1;
  });

  if (Object.keys(sources).length > 0) {
    console.log('Sources used:');
    Object.entries(sources).forEach(([source, count]) => {
      console.log(`  - ${source}: ${count}`);
    });
  }

  console.log('');
  console.log('=' .repeat(80));
}

// Run tests
runTests().catch(console.error);
