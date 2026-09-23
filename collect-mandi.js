// Stage 1: fetch this week's mushroom mandi (wholesale market) prices and save them.
//
// "Save" here means: add one line of text to a file (data/mandi-prices.jsonl).
// Each line is one price reading. Nothing is ever overwritten or deleted -- new
// readings just get added underneath the old ones, so the file becomes a running
// history the longer you use the app. That file IS the "simple database" mentioned
// in the project brief.

const fs = require('fs');
const path = require('path');
const config = require('./config');

async function fetchLatestPrice(market) {
  const params = new URLSearchParams({
    'api-key': config.dataGovInApiKey,
    format: 'json',
    limit: '5',
  });
  params.set('filters[Commodity]', config.commodityName);
  params.set('filters[State]', market.state);
  params.set('filters[District]', market.district);
  params.set('sort[Arrival_Date]', 'desc');

  const url = `https://api.data.gov.in/resource/${config.mandiResourceId}?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    return {
      status: 'error',
      note: `The government data website replied with an error (HTTP ${response.status}). It may be temporarily down.`,
    };
  }

  const body = await response.json();
  const records = body.records || [];

  if (records.length === 0) {
    return {
      status: 'no_data',
      note: `No mushroom price was reported for this market. This mandi does not report mushroom prices every week -- this is a known gap found during Stage 0 research, not a fault in the app.`,
    };
  }

  const latest = records[0];
  const toKg = (value) => Math.round((Number(value) / config.quintalToKg) * 100) / 100;

  return {
    status: 'ok',
    arrival_date: latest.Arrival_Date,
    market_name: latest.Market,
    min_price_per_kg: toKg(latest.Min_Price),
    max_price_per_kg: toKg(latest.Max_Price),
    modal_price_per_kg: toKg(latest.Modal_Price),
  };
}

async function collectAll() {
  const collectedAt = new Date().toISOString();
  const results = [];

  for (const market of config.markets) {
    process.stdout.write(`Checking ${market.name}... `);
    let result;
    try {
      result = await fetchLatestPrice(market);
    } catch (err) {
      result = {
        status: 'error',
        note: `Could not reach the government data website. Details: ${err.message}`,
      };
    }
    console.log(result.status === 'ok'
      ? `found a price (Rs ${result.modal_price_per_kg}/kg, dated ${result.arrival_date})`
      : `${result.status} -- ${result.note}`);

    results.push({
      collected_at: collectedAt,
      source_type: 'mandi',
      source_name: market.name,
      ...result,
    });
  }

  return results;
}

function appendToDataFile(records, filePath) {
  const fullPath = path.join(__dirname, filePath);
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(fullPath, lines, 'utf8');
}

async function main() {
  console.log('Collecting mandi prices from the free government data feed...\n');
  const records = await collectAll();
  appendToDataFile(records, config.dataFile);
  console.log(`\nDone. ${records.length} reading(s) added to ${config.dataFile}`);
}

if (require.main === module) {
  main();
}

module.exports = { fetchLatestPrice, collectAll, appendToDataFile };
