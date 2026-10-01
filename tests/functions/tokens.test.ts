import { describe, expect, it } from 'vitest';
import { MANAGE_TOKEN_LENGTH, PARTICIPANT_TOKEN_LENGTH, hashToken, isTokenShape, newToken, openToken, sealToken } from '../../functions/_shared/tokens';

const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

describe('tokens', () => {
  it('makes base62 tokens of the requested length', () => {
    const token = newToken(PARTICIPANT_TOKEN_LENGTH);
    expect(token).toMatch(/^[0-9A-Za-z]{10}$/);
    expect(isTokenShape(token, PARTICIPANT_TOKEN_LENGTH)).toBe(true);
    expect(newToken(MANAGE_TOKEN_LENGTH)).toHaveLength(22);
  });

  it('does not repeat itself', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => newToken(10)));
    expect(tokens.size).toBe(1000);
  });

  it('rejects malformed tokens', () => {
    expect(isTokenShape('short', 10)).toBe(false);
    expect(isTokenShape('abc/def-gh', 10)).toBe(false);
  });

  it('hashes deterministically to hex', async () => {
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('seals and opens', async () => {
    const sealed = await sealToken('Abc123XYZ0', KEY);
    expect(sealed).not.toContain('Abc123XYZ0');
    expect(await openToken(sealed, KEY)).toBe('Abc123XYZ0');
  });

  it('fails to open with another key', async () => {
    const sealed = await sealToken('Abc123XYZ0', KEY);
    await expect(openToken(sealed, 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=')).rejects.toThrow();
  });
});
