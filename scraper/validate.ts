// Anomaly detection for the LPG scraper

const PRICE_SPIKE_THRESHOLD = 0.20; // 20% change
const WAIT_TIME_THRESHOLD = 2.0;    // 200% change

export function validatePriceChange(
  oldPrice: number,
  newPrice: number,
  city: string
): boolean {
  if (oldPrice === 0) return false;
  const changePct = Math.abs((newPrice - oldPrice) / oldPrice);
  if (changePct > PRICE_SPIKE_THRESHOLD) {
    console.warn(
      `[ANOMALY] Price spike in ${city}: ₹${oldPrice} → ₹${newPrice} (${(changePct * 100).toFixed(1)}% change)`
    );
    return true;
  }
  return false;
}

export function validateWaitTimeChange(
  oldWait: number,
  newWait: number,
  city: string
): boolean {
  if (oldWait === 0) return false;
  const changePct = Math.abs((newWait - oldWait) / oldWait);
  if (changePct > WAIT_TIME_THRESHOLD) {
    console.warn(
      `[ANOMALY] Wait time spike in ${city}: ${oldWait} days → ${newWait} days (${(changePct * 100).toFixed(1)}% change)`
    );
    return true;
  }
  return false;
}

export function logScraperRun(
  citiesScraped: number,
  anomalies: number,
  status: 'success' | 'failed' | 'anomaly'
) {
  const emoji = status === 'success' ? '✓' : status === 'anomaly' ? '⚠' : '✗';
  console.log(`[${emoji}] Scraper ${status}: ${citiesScraped} cities, ${anomalies} anomalies`);
}
