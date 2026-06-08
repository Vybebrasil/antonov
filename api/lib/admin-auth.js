import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { getSql } from './db.js';
import { json, parseCookies } from './admin-http.js';

export const COOKIE_NAME = 'antonov_admin';
const TTL = '7d';

function getSecret() {
  const s = process.env.ADMIN_JWT_SECRET;
  if (!s || s.length < 32) return null;
  return new TextEncoder().encode(s);
}

export function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=604800',
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export async function signToken(payload) {
  const secret = getSecret();
  if (!secret) throw new Error('ADMIN_JWT_SECRET não configurado.');
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret);
}

export async function verifyToken(token) {
  const secret = getSecret();
  if (!secret || !token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.sub) return null;
  return { userId: Number(payload.sub), email: payload.email };
}

export async function requireAdmin(req, res) {
  const session = await getSession(req);
  if (!session) {
    json(res, 401, { error: 'Não autenticado.' });
    return null;
  }
  return session;
}

export async function loginUser(email, password) {
  const sql = getSql();
  const rows = await sql`
    SELECT id, email, password_hash FROM admin_users
    WHERE email = ${email.trim().toLowerCase()}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return { id: user.id, email: user.email };
}

export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'planos',
  'contato',
  'sobre',
  'form',
  'forms',
  'index',
  'assets',
]);
