import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Service-role Supabase client (server-side only) ───────────────
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

// ── In-memory rate limit store ────────────────────────────────────
// Key: IP address  →  array of submission timestamps
const ipLog = new Map<string, number[]>();

const RATE_WINDOW_MS  = 10 * 60 * 1000; // 10 minutes
const RATE_MAX        = 3;               // max submissions per window
const DEDUP_WINDOW_MS = 5  * 60 * 1000; // 5 minutes — same city+status dedupe

// ── Validation constants ──────────────────────────────────────────
const VALID_STATUSES  = new Set(['enough', 'low', 'urgent']);
const NOTE_MAX_LEN    = 280;
const DAYS_MAX        = 365;

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  // ── Parse body ───────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { city, status, days_left, refill_booked, expected_delivery, note } = body;

  // ── Server-side validation ────────────────────────────────────────
  if (!city || typeof city !== 'string' || city.trim().length === 0 || city.trim().length > 100) {
    return NextResponse.json({ error: 'Invalid city.' }, { status: 400 });
  }
  if (!VALID_STATUSES.has(status as string)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }
  if (days_left !== null && days_left !== undefined) {
    const d = Number(days_left);
    if (!Number.isInteger(d) || d < 0 || d > DAYS_MAX) {
      return NextResponse.json({ error: 'days_left must be 0–365.' }, { status: 400 });
    }
  }
  if (typeof refill_booked !== 'boolean') {
    return NextResponse.json({ error: 'refill_booked must be boolean.' }, { status: 400 });
  }
  if (note !== null && note !== undefined) {
    if (typeof note !== 'string' || note.length > NOTE_MAX_LEN) {
      return NextResponse.json({ error: `Note must be under ${NOTE_MAX_LEN} characters.` }, { status: 400 });
    }
  }
  if (expected_delivery !== null && expected_delivery !== undefined) {
    if (typeof expected_delivery !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expected_delivery)) {
      return NextResponse.json({ error: 'Invalid delivery date format.' }, { status: 400 });
    }
  }

  // ── Rate limiting ─────────────────────────────────────────────────
  const ip  = getIp(req);
  const now = Date.now();
  const log = (ipLog.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);

  if (log.length >= RATE_MAX) {
    return NextResponse.json(
      { error: 'Too many reports submitted recently. Please try again later.' },
      { status: 429 }
    );
  }

  // ── Duplicate check (same IP + city + status within dedup window) ─
  const { data: recent } = await supabaseAdmin
    .from('community_reports')
    .select('id, created_at')
    .eq('city', city.trim())
    .eq('status', status)
    .gte('created_at', new Date(now - DEDUP_WINDOW_MS).toISOString())
    .limit(1);

  // Only block if the same IP has already submitted this city+status combo.
  // We track this by checking our in-memory log alongside the DB result so
  // we don't falsely block different users in the same city.
  const ipRecentForCombo = log.length > 0 && recent && recent.length > 0;
  if (ipRecentForCombo) {
    return NextResponse.json(
      { error: 'You already reported this status for that city recently.' },
      { status: 429 }
    );
  }

  // ── Insert ────────────────────────────────────────────────────────
  const { error } = await supabaseAdmin.from('community_reports').insert({
    city:              city.trim(),
    status,
    days_left:         days_left !== undefined && days_left !== null ? Number(days_left) : null,
    refill_booked:     refill_booked,
    expected_delivery: refill_booked && expected_delivery ? expected_delivery : null,
    note:              note?.toString().trim() || null,
  });

  if (error) {
    console.error('[community-reports] insert error:', error.message);
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 });
  }

  // ── Update in-memory log after successful insert ──────────────────
  ipLog.set(ip, [...log, now]);

  // Prune old entries to prevent unbounded memory growth
  if (ipLog.size > 10_000) {
    for (const [k, v] of ipLog) {
      if (v.every(t => now - t >= RATE_WINDOW_MS)) ipLog.delete(k);
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
