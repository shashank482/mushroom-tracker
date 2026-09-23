// Settings for the Mushroom Market Tracker.
// Nothing in this file costs money or needs an account.

module.exports = {
  // This is the Government of India's public, free data feed for mandi (wholesale market) prices.
  // No sign-up was needed to use it -- it's a "demo key" that data.gov.in itself publishes for
  // anyone to try immediately. It can get slow or rate-limited if used heavily.
  // Later, you can get your own free personal key at https://data.gov.in (Sign Up -> My Account ->
  // Generate API Key) and paste it below for more reliable access. That step is optional and free;
  // I have not created an account for you and won't unless you ask.
  dataGovInApiKey: '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b',

  // The specific government dataset that holds daily mandi prices, going back to 2006.
  mandiResourceId: '35985678-0d79-46b4-9ed6-6f13308a1d24',

  // IMPORTANT: in this government dataset, mushroom is filed under the misspelled name
  // "Mashrooms" (with an "a"), not "Mushroom". This is a mistake in the government's own
  // system, not ours -- but we have to use their spelling or no results come back.
  commodityName: 'Mashrooms',

  // The mandi markets we are tracking for you.
  // Ghaziabad's own mandi does not report mushroom prices in this dataset (checked during
  // Stage 0 research), so for now Azadpur (Delhi) is the only working mandi price source.
  // We keep the Ghaziabad entry in the list so the app keeps checking automatically --
  // if that ever changes, we'll start seeing data without needing to change the code.
  markets: [
    {
      name: 'Azadpur (Delhi)',
      state: 'NCT of Delhi',
      district: 'Delhi',
    },
    {
      name: 'Ghaziabad',
      state: 'Uttar Pradesh',
      district: 'Ghaziabad',
    },
  ],

  // Government mandi prices are reported in Rupees per quintal (1 quintal = 100 kg).
  // We convert everything to Rupees per kg so it can be compared with retail prices later.
  quintalToKg: 100,

  dataFile: 'data/mandi-prices.jsonl',
  sampleDataFile: 'data/sample-mandi-prices.jsonl',
  summaryFile: 'summary.html',
  testSummaryFile: 'summary-test.html',
};
