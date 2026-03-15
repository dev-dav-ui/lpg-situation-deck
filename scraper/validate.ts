import { createClient } from '@supabase/supabase-js';

export interface ScrapedCity {
  city: string;
  state: string;
  cylinderType: 'domestic' | 'commercial';
  waitDays: number;
  price: number;
}

interface Anomaly {
  city: ScrapedCity;
  reason: string;
}

const PRICE_SPIKE_THRESHOLD = 0.20;  // 20%
const WAIT_TIME_THRESHOLD = 2.0;     // 200%

const PRICE_BOUNDS = {
  domestic: { min: 600, max: 1200 },
  commercial: { min: 1200, max: 2500 },
};

export async function validateScrapedData(
  cities: ScrapedCity[]
): Promise<{ valid: ScrapedCity[]; anomalies: Anomaly[] }> {
  const valid: ScrapedCity[] = [];
  const anomalies: Anomaly[] = [];

  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );

  // Fetch existing prices for comparison
  const { data: existing } = await supabase
    .from('city_data')
    .select('city, state, cylinder_type, price_per_cylinder, wait_days');

  const existingMap = new Map<string, { price: number; waitDays: number }>();
  for (const row of existing || []) {
    existingMap.set(`${row.city}|${row.state}|${row.cylinder_type}`, {
      price: Number(row.price_per_cylinder),
      waitDays: row.wait_days,
    });
  }

  for (const city of cities) {
    const reasons: string[] = [];

    // 1. Absolute price bounds check
    const bounds = PRICE_BOUNDS[city.cylinderType];
    if (city.price < bounds.min || city.price > bounds.max) {
      reasons.push(
        `Price ₹${city.price} out of expected range [₹${bounds.min}–₹${bounds.max}] for ${city.cylinderType}`
      );
    }

    // 2. Spike vs previous price
    const key = `${city.city}|${city.state}|${city.cylinderType}`;
    const prev = existingMap.get(key);
    if (prev && prev.price > 0) {
      const changePct = Math.abs((city.price - prev.price) / prev.price);
      if (changePct > PRICE_SPIKE_THRESHOLD) {
        reasons.push(
          `Price spike: ₹${prev.price} → ₹${city.price} (${(changePct * 100).toFixed(1)}%)`
        );
      }
    }

    // 3. Wait time spike
    if (city.waitDays > 0 && prev && prev.waitDays > 0) {
      const waitChangePct = Math.abs((city.waitDays - prev.waitDays) / prev.waitDays);
      if (waitChangePct > WAIT_TIME_THRESHOLD) {
        reasons.push(
          `Wait time spike: ${prev.waitDays} → ${city.waitDays} days (${(waitChangePct * 100).toFixed(1)}%)`
        );
      }
    }

    if (reasons.length > 0) {
      anomalies.push({ city, reason: reasons.join('; ') });
    } else {
      valid.push(city);
    }
  }

  return { valid, anomalies };
}

export async function logScraperRun(
  status: 'success' | 'failed' | 'anomaly',
  citiesScraped: number,
  anomaliesFound: number,
  errorMessage?: string
) {
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );

  await supabase.from('scraper_runs').insert({
    completed_at: new Date().toISOString(),
    status,
    cities_scraped: citiesScraped,
    anomalies_flagged: anomaliesFound,
    error_message: errorMessage || null,
  });

  const emoji = status === 'success' ? '✓' : status === 'anomaly' ? '⚠' : '✗';
  console.log(`[${emoji}] Scraper ${status}: ${citiesScraped} cities, ${anomaliesFound} anomalies`);
}
