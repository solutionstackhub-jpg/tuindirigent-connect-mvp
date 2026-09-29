/**
 * Dutch VAT number (BTW-identificatienummer) handling.
 *
 * Format is NL + 9 digits + B + 2 digits. The 9 digits carry an 11-proof check
 * digit, so an obvious typo is caught before a designer can sell anything.
 * This is a format check, not a VIES lookup - a real VIES call belongs behind
 * the same interface once the client has an account.
 */

const SHAPE = /^NL(\d{9})B(\d{2})$/;

export interface VatCheck {
  valid: boolean;
  normalised: string;
  reason?: string;
}

export function normaliseVatNumber(input: string): string {
  return input.replace(/[\s.\-]/g, '').toUpperCase();
}

export function checkDutchVatNumber(input: string): VatCheck {
  const normalised = normaliseVatNumber(input ?? '');

  const match = SHAPE.exec(normalised);
  if (!match) {
    return {
      valid: false,
      normalised,
      reason: 'A Dutch BTW number looks like NL123456782B01: NL, nine digits, B, two digits.',
    };
  }

  const [, digits, suffix] = match;
  if (suffix === '00') {
    return { valid: false, normalised, reason: 'The two digits after the B start at 01.' };
  }

  // 11-proof: weights 9..2 over the first eight digits, remainder must equal
  // the ninth. A remainder of 10 can never be a check digit.
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    sum += Number(digits[i]) * (9 - i);
  }
  const remainder = sum % 11;
  if (remainder === 10 || remainder !== Number(digits[8])) {
    return { valid: false, normalised, reason: 'That BTW number fails its check digit. Please re-read it.' };
  }

  return { valid: true, normalised };
}
