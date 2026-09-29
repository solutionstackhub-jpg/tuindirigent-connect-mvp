import { describe, expect, it } from 'vitest';
import { checkDutchVatNumber, normaliseVatNumber } from './vat';

describe('checkDutchVatNumber', () => {
  it('accepts well-formed numbers that pass the 11-proof', () => {
    for (const n of ['NL123456782B01', 'NL810123459B01', 'NL820456780B01', 'NL998877669B01']) {
      expect(checkDutchVatNumber(n).valid).toBe(true);
    }
  });

  it('tolerates the way people actually type them', () => {
    expect(checkDutchVatNumber('nl 1234 5678 2 b01').valid).toBe(true);
    expect(normaliseVatNumber('NL.123456782-B01')).toBe('NL123456782B01');
  });

  it('rejects the wrong shape with an explanation a designer can act on', () => {
    const r = checkDutchVatNumber('BE123456782B01');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('NL123456782B01');
  });

  it('catches a single-digit typo through the check digit', () => {
    expect(checkDutchVatNumber('NL123456783B01').valid).toBe(false);
  });

  it('rejects the B00 suffix', () => {
    expect(checkDutchVatNumber('NL123456782B00').valid).toBe(false);
  });

  it('rejects empty and rubbish input without throwing', () => {
    expect(checkDutchVatNumber('').valid).toBe(false);
    expect(checkDutchVatNumber('not a vat number').valid).toBe(false);
  });
});
