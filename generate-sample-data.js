// Creates realistic-looking made-up data so you can see what the summary page
// will look like after several weeks of real use, without waiting.
//
// This writes ONLY to data/sample-mandi-prices.jsonl -- a completely separate
// file from data/mandi-prices.jsonl (your real history). The two never mix.

const fs = require('fs');
const path = require('path');
const config = require('./config');

function buildSampleWeeks(weeks = 8) {
  const records = [];
  const today = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const weekDate = new Date(today);
    weekDate.setDate(today.getDate() - i * 7);
    const collectedAt = weekDate.toISOString();
    const arrivalDate = `${String(weekDate.getDate()).padStart(2, '0')}/${String(weekDate.getMonth() + 1).padStart(2, '0')}/${weekDate.getFullYear()}`;

    // A gentle made-up price wobble, just so the sample chart isn't a flat line.
    const basePrice = 95 + Math.sin(i / 2) * 12 + (Math.random() * 6 - 3);
    const modal = Math.round(basePrice * 100) / 100;

    records.push({
      collected_at: collectedAt,
      source_type: 'mandi',
      source_name: 'Azadpur (Delhi) [SAMPLE]',
      status: 'ok',
      arrival_date: arrivalDate,
      market_name: 'APMC Azadpur [SAMPLE]',
      min_price_per_kg: Math.round((modal - 20) * 100) / 100,
      max_price_per_kg: Math.round((modal + 20) * 100) / 100,
      modal_price_per_kg: modal,
    });

    // Ghaziabad stays "no_data" in the sample too, since that mirrors the real situation.
    records.push({
      collected_at: collectedAt,
      source_type: 'mandi',
      source_name: 'Ghaziabad [SAMPLE]',
      status: 'no_data',
      note: 'Sample data: this mandi does not report mushroom prices (matches the real situation found in Stage 0).',
    });
  }

  return records;
}

function main() {
  const records = buildSampleWeeks();
  const fullPath = path.join(__dirname, config.sampleDataFile);
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(fullPath, lines, 'utf8'); // overwrite -- sample data is always regenerated fresh
  console.log(`Sample data written to ${config.sampleDataFile} (${records.length} rows, clearly labeled [SAMPLE]).`);
}

if (require.main === module) {
  main();
}

module.exports = { buildSampleWeeks };
