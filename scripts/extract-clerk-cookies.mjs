/**
 * Reads Clerk auth cookies from Chrome's locked SQLite Cookies DB using WAL
 * mode (read-only URI). Prints the cookies as JSON for use in Playwright.
 */
import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';

const cookiePath = path.join(
  os.homedir(),
  'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cookies',
);

let db;
try {
  // Open read-only so Chrome's lock isn't disturbed
  db = new Database(cookiePath, { readonly: true, fileMustExist: true });
} catch (e) {
  console.error('Could not open Cookies DB:', e.message);
  process.exit(1);
}

const rows = db.prepare(
  `SELECT name, value, encrypted_value, host_key, path, secure, expires_utc
   FROM cookies
   WHERE host_key LIKE '%localhost%' OR host_key LIKE '%clerk%'`
).all();

db.close();
console.log(JSON.stringify(rows, null, 2));
