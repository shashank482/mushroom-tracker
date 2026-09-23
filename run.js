// This is the one file you actually run.
//
//   Normal (real) mode:   node run.js
//   Test / sample mode:   node run.js --test
//
// Normal mode fetches this week's real mandi prices from the government
// data feed and adds them to your permanent history.
//
// Test mode makes up realistic sample numbers instantly (no waiting, no
// internet needed) so you can see what the summary page looks like. It
// never touches your real history file.

const { collectAll, appendToDataFile } = require('./collect-mandi');
const { generate } = require('./generate-summary');
const { buildSampleWeeks } = require('./generate-sample-data');
const config = require('./config');
const fs = require('fs');
const path = require('path');

async function runReal() {
  console.log('=== Mushroom Market Tracker: real weekly collection ===\n');
  const records = await collectAll();
  appendToDataFile(records, config.dataFile);
  generate({ dataFile: config.dataFile, outputFile: config.summaryFile, isTestMode: false });
}

function runTest() {
  console.log('=== Mushroom Market Tracker: TEST MODE (sample data, nothing real is saved) ===\n');
  const records = buildSampleWeeks();
  const fullPath = path.join(__dirname, config.sampleDataFile);
  fs.writeFileSync(fullPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  generate({ dataFile: config.sampleDataFile, outputFile: config.testSummaryFile, isTestMode: true });
}

const isTestMode = process.argv.includes('--test');
if (isTestMode) {
  runTest();
} else {
  runReal();
}
