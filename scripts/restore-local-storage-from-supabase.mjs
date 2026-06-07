import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import mongoose from 'mongoose';

function loadEnv(file) {
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
}

const env = loadEnv('apps/api/.env');
const root = resolve(process.cwd(), '.local-storage');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const bucket = env.SUPABASE_STORAGE_BUCKET;

async function restore(key) {
  const dest = join(root, key);
  if (existsSync(dest)) {
    console.log(`skip (exists): ${key}`);
    return;
  }

  const { data, error } = await sb.storage.from(bucket).download(key);
  if (error) {
    console.log(`missing in supabase: ${key} — ${error.message}`);
    return;
  }

  mkdirSync(dirname(dest), { recursive: true });
  const buf = Buffer.from(await data.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`restored: ${key} (${buf.length} bytes)`);
}

await mongoose.connect(env.MONGODB_URI);
const db = mongoose.connection.db;

const keys = new Set();
for (const doc of await db.collection('pdf_templates').find({ fileKey: { $ne: null } }).toArray()) {
  if (doc.fileKey) keys.add(doc.fileKey);
}
for (const doc of await db.collection('documents').find({}).toArray()) {
  if (doc.fileKey) keys.add(doc.fileKey);
  if (doc.completedFileKey) keys.add(doc.completedFileKey);
}
for (const sig of await db.collection('signatures').find({}).toArray()) {
  if (sig.imageKey) keys.add(sig.imageKey);
}

console.log(`Checking ${keys.size} storage key(s)...`);
for (const key of keys) {
  await restore(key);
}

await mongoose.disconnect();
