/** Normalize clipboard formatting without changing any Base58 key characters. */
export function normalizeRecoveryKey(value: string): string {
  const key = value.normalize('NFKC').replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu, '');
  if (!key) throw new Error('Lim inn Matrix-gjenopprettingsnøkkelen din.');
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(key)) throw new Error('Dette er ikke en gyldig Matrix-gjenopprettingsnøkkel. Bruk nøkkelen fra sikkerhetsinnstillingene i Matrix-klienten, ikke kontopassordet. Har du et gjenopprettingspassord, velg «Passord» i stedet.');
  return key;
}
