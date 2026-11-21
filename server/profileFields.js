// The fields a profile holds beyond name and picture. They are the same keys the
// Ølbørs has always used, so its pricing rules and checkout keep working: the
// profile is now the source, and open exchanges copy from it.

export const PROFILE_FIELD_KEYS = [
  'phone',
  'shoe_size',
  'weight',
  'height',
  'marital_status',
  'work_relationship',
  'gender',
  'sexual_orientation',
  'ethnicity',
  'experience_level',
];

export const GENDERS = ['male', 'female', 'other'];
export const WORK_RELATIONSHIPS = ['Student', 'Deltidsjobb', 'Fulltidsjobb', 'Arbeidsledig', 'Pensjonist', 'Annet'];
const NUMBER_RANGES = { shoe_size: [15, 60], weight: [20, 400], height: [50, 260] };
const TEXT_MAX = { phone: 30 };
const DEFAULT_TEXT_MAX = 60;

/** Fields a person can hide from others. Name, picture and bio are always shown. */
export const HIDEABLE_FIELDS = ['fullName', 'email', 'lastSeen', ...PROFILE_FIELD_KEYS];
export const BIO_MAX = 160;
export const FULL_NAME_MAX = 80;

export class ProfileError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ProfileError';
    this.status = status;
  }
}

const LABELS = {
  phone: 'Telefon', shoe_size: 'Skostørrelse', weight: 'Vekt', height: 'Høyde', marital_status: 'Sivilstatus',
  work_relationship: 'Arbeidsforhold', gender: 'Kjønn', sexual_orientation: 'Legning', ethnicity: 'Etnisitet',
  experience_level: 'Erfaring',
};

/** Trimmed single-line text, or '' for empty. */
export function cleanText(value, max, label) {
  if (value === undefined || value === null) return '';
  const text = String(value).replace(/[\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > max) throw new ProfileError(400, `${label} kan ha maks ${max} tegn.`);
  return text;
}

/** Validates one profile field. Returns the stored string, or '' to clear it. */
export function cleanProfileField(key, value) {
  const label = LABELS[key];
  if (!label) throw new ProfileError(400, 'Ukjent felt.');
  if (value === undefined || value === null || String(value).trim() === '') return '';
  if (NUMBER_RANGES[key]) {
    const number = Number(String(value).replace(',', '.'));
    const [min, max] = NUMBER_RANGES[key];
    if (!Number.isFinite(number) || number < min || number > max) throw new ProfileError(400, `${label} må være et tall mellom ${min} og ${max}.`);
    return String(Math.round(number * 10) / 10);
  }
  if (key === 'gender') {
    const gender = String(value).trim().toLowerCase();
    if (!GENDERS.includes(gender)) throw new ProfileError(400, 'Ugyldig kjønn.');
    return gender;
  }
  if (key === 'work_relationship') {
    const match = WORK_RELATIONSHIPS.find((option) => option.toLowerCase() === String(value).trim().toLowerCase());
    if (!match) throw new ProfileError(400, 'Ugyldig arbeidsforhold.');
    return match;
  }
  return cleanText(value, TEXT_MAX[key] ?? DEFAULT_TEXT_MAX, label);
}

/** Validates the profile fields present in `input`; absent keys are left alone. */
export function cleanProfileFields(input) {
  const set = {};
  const unset = [];
  for (const key of PROFILE_FIELD_KEYS) {
    if (!input || !(key in input)) continue;
    const value = cleanProfileField(key, input[key]);
    if (value) set[key] = value; else unset.push(key);
  }
  return { set, unset };
}

/** Mongo update for users.profile from cleanProfileFields' result. */
export function profileFieldUpdate({ set, unset }) {
  const update = {};
  if (Object.keys(set).length) update.$set = Object.fromEntries(Object.entries(set).map(([key, value]) => [`profile.${key}`, value]));
  if (unset.length) update.$unset = Object.fromEntries(unset.map((key) => [`profile.${key}`, '']));
  return update;
}

/** What an Ølbørs customer copies from a profile: every field, with empty ones cleared. */
export function olborsFieldsFrom(user) {
  return Object.fromEntries(PROFILE_FIELD_KEYS.map((key) => [key, user?.profile?.[key] ?? '']));
}
