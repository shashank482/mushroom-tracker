// Builds the weekly summary page (a single .html file) from whatever is in the
// data file. Open the resulting file by double-clicking it -- it opens in your
// normal web browser, no internet connection needed to view it.

const fs = require('fs');
const path = require('path');
const config = require('./config');

function readJsonlFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) return [];
  return fs
    .readFileSync(fullPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

// Keeps only the most recent reading for each source name.
function latestBySource(records) {
  const latest = {};
  for (const r of records) {
    if (!latest[r.source_name] || r.collected_at > latest[r.source_name].collected_at) {
      latest[r.source_name] = r;
    }
  }
  return Object.values(latest);
}

function historyForSource(records, sourceName) {
  return records
    .filter((r) => r.source_name === sourceName && r.status === 'ok')
    .sort((a, b) => a.collected_at.localeCompare(b.collected_at));
}

// Draws a simple line chart using plain SVG -- no external chart library needed,
// so the page works even with no internet connection.
function drawLineChart(points) {
  if (points.length === 0) return '<p class="muted">Not enough data yet to draw a chart.</p>';
  if (points.length === 1) return '<p class="muted">Only one reading so far -- a chart will appear once there are at least two.</p>';

  const width = 600;
  const height = 200;
  const padding = 30;
  const prices = points.map((p) => p.modal_price_per_kg);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const coords = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((p.modal_price_per_kg - minPrice) / priceRange) * (height - 2 * padding);
    return { x, y, price: p.modal_price_per_kg, date: p.arrival_date };
  });

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const dots = coords
    .map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="#2f6f4f"><title>${c.date}: Rs ${c.price}/kg</title></circle>`)
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart">
      <path d="${pathD}" fill="none" stroke="#2f6f4f" stroke-width="2" />
      ${dots}
      <text x="${padding}" y="14" class="chart-label">Rs ${maxPrice}/kg</text>
      <text x="${padding}" y="${height - padding + 16}" class="chart-label">Rs ${minPrice}/kg</text>
    </svg>`;
}

function renderSourceCard(latestReading, history) {
  const name = latestReading.source_name;
  if (latestReading.status !== 'ok') {
    return `
      <div class="card warning">
        <h3>${name}</h3>
        <p class="warning-text">&#9888; No data available. ${latestReading.note || ''}</p>
      </div>`;
  }

  return `
    <div class="card">
      <h3>${name}</h3>
      <p class="price">Rs ${latestReading.modal_price_per_kg} <span class="unit">per kg</span></p>
      <p class="muted">Range: Rs ${latestReading.min_price_per_kg} - Rs ${latestReading.max_price_per_kg}/kg &middot; Market date: ${latestReading.arrival_date}</p>
      ${drawLineChart(history)}
    </div>`;
}

function generate({ dataFile, outputFile, isTestMode }) {
  const records = readJsonlFile(dataFile);
  const latest = latestBySource(records);

  if (latest.length === 0) {
    console.log(`No data found in ${dataFile} yet. Run the collector first.`);
    return;
  }

  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const cards = latest
    .map((reading) => renderSourceCard(reading, historyForSource(records, reading.source_name)))
    .join('\n');

  const missingWarnings = latest.filter((r) => r.status !== 'ok');
  const warningBanner = missingWarnings.length > 0
    ? `<div class="banner warning-banner">&#9888; ${missingWarnings.length} source(s) had no data this week: ${missingWarnings.map((r) => r.source_name).join(', ')}.</div>`
    : '';

  const testBanner = isTestMode
    ? `<div class="banner test-banner">&#129504; TEST / SAMPLE DATA -- this is made-up data to show you how the page will look. It is not saved to your real price history.</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mushroom Market Tracker</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #f6f7f4; color: #222; margin: 0; padding: 16px; }
  h1 { font-size: 1.4rem; margin-bottom: 0; }
  .generated { color: #666; font-size: 0.85rem; margin-top: 4px; margin-bottom: 20px; }
  .banner { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.95rem; }
  .test-banner { background: #fff3cd; border: 1px solid #ffe08a; }
  .warning-banner { background: #fde2e1; border: 1px solid #f5a8a5; }
  .card { background: white; border-radius: 10px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .card.warning { background: #fff8f7; }
  .card h3 { margin: 0 0 8px 0; }
  .price { font-size: 1.8rem; font-weight: 600; color: #2f6f4f; margin: 4px 0; }
  .unit { font-size: 1rem; font-weight: 400; color: #555; }
  .muted { color: #666; font-size: 0.85rem; }
  .warning-text { color: #b23b36; font-weight: 500; }
  .chart { width: 100%; height: auto; margin-top: 8px; }
  .chart-label { font-size: 10px; fill: #888; }
</style>
</head>
<body>
  <h1>Mushroom Market Tracker</h1>
  <p class="generated">Generated ${generatedAt}</p>
  ${testBanner}
  ${warningBanner}
  ${cards}
  <p class="muted">Stage 1 of 7 -- mandi (wholesale) prices only. Retail prices, Google Trends, export data, cost comparison and weekly notes are added in later stages.</p>
</body>
</html>`;

  const fullOutputPath = path.join(__dirname, outputFile);
  fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
  fs.writeFileSync(fullOutputPath, html, 'utf8');
  console.log(`Summary page written to ${outputFile}. Open it by double-clicking the file.`);
}

if (require.main === module) {
  const isTestMode = process.argv.includes('--test');
  generate({
    dataFile: isTestMode ? config.sampleDataFile : config.dataFile,
    outputFile: isTestMode ? config.testSummaryFile : config.summaryFile,
    isTestMode,
  });
}

module.exports = { generate, readJsonlFile, latestBySource };
