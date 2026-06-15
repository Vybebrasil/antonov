import crypto from 'crypto';
import { getSql } from './db.js';

export function hashIp(ip) {
  const salt = process.env.RATE_LIMIT_SALT || 'antonov';
  return crypto.createHash('sha256').update(`${ip}:${salt}`).digest('hex').slice(0, 32);
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export async function checkRateLimit(key, ip, { maxAttempts = 5, windowMs = 3600000 } = {}) {
  const sql = getSql();
  const ipHash = hashIp(ip);
  const rows = await sql`
    SELECT submit_count, window_start FROM form_rate_limits
    WHERE ip_hash = ${ipHash} AND slug = ${key}
  `;

  const windowStartLimit = Date.now() - windowMs;

  if (rows[0]) {
    const windowStart = new Date(rows[0].window_start).getTime();
    if (windowStart < windowStartLimit) {
      await sql`
        UPDATE form_rate_limits
        SET submit_count = 1, window_start = NOW()
        WHERE ip_hash = ${ipHash} AND slug = ${key}
      `;
      return true;
    }
    if (rows[0].submit_count >= maxAttempts) return false;
    await sql`
      UPDATE form_rate_limits
      SET submit_count = submit_count + 1
      WHERE ip_hash = ${ipHash} AND slug = ${key}
    `;
    return true;
  }

  await sql`
    INSERT INTO form_rate_limits (ip_hash, slug, submit_count, window_start)
    VALUES (${ipHash}, ${key}, 1, NOW())
    ON CONFLICT (ip_hash, slug) DO UPDATE SET submit_count = 1, window_start = NOW()
  `;
  return true;
}
