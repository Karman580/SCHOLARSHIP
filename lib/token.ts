import { randomInt } from 'node:crypto';

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/** 16 chars from a 32-symbol alphabet: unguessable, not secret. Say so on screen. */
export function newToken(len = 16): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function isTokenShaped(t: string): boolean {
  return typeof t === 'string' && t.length === 16 && [...t].every((c) => ALPHABET.includes(c));
}
