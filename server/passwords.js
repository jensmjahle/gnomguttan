// Password hashing for our own accounts. scrypt is built into Node, so there are
// no native dependencies. The cost parameters are stored with every hash, so they
// can be raised later without breaking existing passwords.
//
// VoceChat kept passwords in plaintext; they are hashed here the moment they
// reach us (on login or in the one-time import) and never stored as-is.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const DEFAULT_COST = { N: 2 ** 15, r: 8, p: 1 };

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;

const COMMON_PASSWORDS = new Set([
  'passord', 'passord1', 'passord12', 'passord123', 'password', 'password1', 'password123',
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', 'qwertyui',
  'qwerty123', 'qwertyuiop', 'asdfghjk', 'abcdefgh', 'abc12345', 'iloveyou', 'gnomguttan',
  'gnomguttan1', 'gnomguttan123', 'sommer2024', 'sommer2025', 'sommer2026', 'vinter2025', 'vinter2026',
]);

const scryptKey = (password, salt, length, cost) =>
  scrypt(password.normalize('NFC'), salt, length, { ...cost, maxmem: 256 * cost.N * cost.r });

export async function hashPassword(password, cost = DEFAULT_COST) {
  const salt = randomBytes(16);
  const key = await scryptKey(password, salt, KEY_LENGTH, cost);
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [scheme, N, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const cost = { N: Number(N), r: Number(r), p: Number(p) };
  if (![cost.N, cost.r, cost.p].every(Number.isInteger)) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptKey(password, Buffer.from(saltB64, 'base64'), expected.length, cost);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash;
/** Spends as long as a real check, so response times don't reveal which emails have accounts. */
export async function burnPasswordCheck(password) {
  dummyHash ??= hashPassword('not-a-real-password');
  await verifyPassword(typeof password === 'string' ? password : '', await dummyHash);
}

/** A Norwegian explanation of why a new password is rejected, or null when it's fine. */
export function passwordProblem(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Passordet må ha minst ${PASSWORD_MIN_LENGTH} tegn.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) return `Passordet kan ha maks ${PASSWORD_MAX_LENGTH} tegn.`;
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(password)) return 'Passordet er for lett å gjette.';
  const compact = (value) => String(value).toLowerCase().replace(/\s+/g, '');
  if (email && (lower === email.toLowerCase() || lower === email.toLowerCase().split('@')[0])) {
    return 'Passordet kan ikke være e-postadressen din.';
  }
  if (name && compact(password) === compact(name)) return 'Passordet kan ikke være navnet ditt.';
  return null;
}
