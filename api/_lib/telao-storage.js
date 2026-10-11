const DEFAULT_BUCKET = 'telao-criativos';

const CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
};

export const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.DB_SUPABASE_URL || '').trim();
}

function supabaseServiceKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DB_SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function storageConfigured() {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

function config() {
  if (!storageConfigured()) {
    const error = new Error('Storage não configurado. Conecte o Supabase ao projeto na Vercel.');
    error.status = 503;
    throw error;
  }
  return {
    base: supabaseUrl().replace(/\/$/, ''),
    key: supabaseServiceKey(),
    bucket: process.env.TELAO_STORAGE_BUCKET || DEFAULT_BUCKET,
  };
}

function headers(key, json = false) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function ensureBucket({ base, key, bucket }) {
  const res = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers(key, true),
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  if (res.ok || res.status === 409) return;
  const text = await res.text();
  if (/already exists/i.test(text)) return;
  const error = new Error(`Não foi possível preparar o bucket de criativos (${res.status}).`);
  error.status = 503;
  throw error;
}

export async function createSignedUpload({ id, contentType }) {
  const ext = CONTENT_TYPES[contentType];
  if (!ext) {
    const error = new Error('Envie JPG, PNG ou MP4.');
    error.status = 400;
    throw error;
  }
  const { base, key, bucket } = config();
  await ensureBucket({ base, key, bucket });
  const path = `${id}.${ext}`;
  const encoded = encodeURIComponent(path);
  const res = await fetch(`${base}/storage/v1/object/upload/sign/${bucket}/${encoded}`, {
    method: 'POST',
    headers: headers(key, true),
    body: JSON.stringify({ upsert: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || data.error || 'Falha ao preparar o upload.');
    error.status = 502;
    throw error;
  }
  const token = data.token || '';
  let signedUrl = '';
  if (typeof data.signedUrl === 'string' && data.signedUrl.startsWith('http')) signedUrl = data.signedUrl;
  else if (typeof data.url === 'string' && data.url.startsWith('http')) signedUrl = data.url;
  else if (typeof data.url === 'string' && data.url.startsWith('/')) {
    signedUrl = `${base}/storage/v1${data.url}`;
  } else {
    signedUrl = `${base}/storage/v1/object/upload/sign/${bucket}/${encoded}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }
  if (token && !signedUrl.includes('token=')) {
    signedUrl += `${signedUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }
  return {
    id,
    path,
    token,
    contentType,
    signedUrl,
    publicUrl: `${base}/storage/v1/object/public/${bucket}/${encoded}`,
  };
}
