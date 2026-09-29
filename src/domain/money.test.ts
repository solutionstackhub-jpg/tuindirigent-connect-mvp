import { describe, expect, it } from 'vitest';
import {
  CommissionConfigError,
  computeSplit,
  planReversal,
  realisedMargin,
  settleCarriedBalance,
  shareCost,
} from './money';

const NL = { vatRateBp: 2100, designerShareBp: 7000 };

describe('computeSplit', () => {
  it('splits the worked example from the spec', () => {
    const s = computeSplit(12_100, NL);
    expect(s.netCents).toBe(10_000);
    expect(s.vatCents).toBe(2_100);
    expect(s.designerNetCents).toBe(7_000);
    expect(s.designerVatCents).toBe(1_470);
    expect(s.transferCents).toBe(8_470);
    expect(s.applicationFeeCents).toBe(3_630);
    expect(s.platformMarginCents).toBe(3_000);
  });

  it('never loses a cent: net + VAT is exactly what the buyer paid', () => {
    for (let gross = 1; gross <= 5_000; gross += 7) {
      const s = computeSplit(gross, NL);
      expect(s.netCents + s.vatCents).toBe(gross);
      expect(s.transferCents + s.applicationFeeCents).toBe(gross);
    }
  });

  it('refuses a commission that would pay out more than the buyer paid', () => {
    expect(() => computeSplit(12_100, { vatRateBp: 2100, designerShareBp: 10_500 })).toThrow(
      /above 100%/,
    );
  });

  it('a 100% share is allowed and still balances to the cent', () => {
    const s = computeSplit(12_100, { vatRateBp: 2100, designerShareBp: 10_000 });
    expect(s.transferCents).toBeLessThanOrEqual(s.grossCents);
    expect(s.platformMarginCents).toBe(0);
  });

  it('refuses nonsense configuration rather than guessing', () => {
    expect(() => computeSplit(0, NL)).toThrow(CommissionConfigError);
    expect(() => computeSplit(12_100, { vatRateBp: -1, designerShareBp: 7000 })).toThrow(CommissionConfigError);
    expect(() => computeSplit(12_100, { vatRateBp: 2100, designerShareBp: 10_001 })).toThrow(
      CommissionConfigError,
    );
    expect(() => computeSplit(12.5, NL)).toThrow(CommissionConfigError);
  });
});

describe('the platform-margin invariant', () => {
  it("the designer's VAT passes straight through and never touches the margin", () => {
    const rates = [0, 900, 2100, 2500];
    const amounts = [199, 1_000, 4_999, 12_100, 89_950, 250_000, 1_234_567];

    for (const vatRateBp of rates) {
      for (const gross of amounts) {
        const s = computeSplit(gross, { ...NL, vatRateBp });
        expect(realisedMargin(s)).toBe(s.platformMarginCents);
        expect(s.platformMarginCents).toBe(s.netCents - s.designerNetCents);
      }
    }
  });

  it('holds after a full refund: everything returns to zero', () => {
    const s = computeSplit(12_100, NL);
    const plan = planReversal(s.grossCents, { ...s, refundedCents: 0 });
    expect(plan.reversalCents).toBe(s.transferCents);
    expect(plan.platformGivesBackCents).toBe(s.applicationFeeCents);
  });

  it('holds after a partial refund: margin scales with what is kept', () => {
    const s = computeSplit(12_100, NL);
    const refund = 6_050; // exactly half
    const plan = planReversal(refund, { ...s, refundedCents: 0 });
    expect(plan.reversalCents).toBe(4_235); // half of 84,70

    const keptGross = s.grossCents - refund;
    const kept = computeSplit(keptGross, NL);
    // What the platform is left holding matches a sale of the retained amount,
    // to within the single cent that rounding can move.
    const heldMargin = s.platformMarginCents - (kept.platformMarginCents + (s.netCents - kept.netCents - (s.designerNetCents - kept.designerNetCents)));
    expect(Math.abs(heldMargin)).toBeLessThanOrEqual(1);
  });
});

describe('planReversal', () => {
  it('reverses on the VAT-inclusive amount that was transferred', () => {
    const s = computeSplit(24_200, NL); // transfer 169,40
    expect(planReversal(24_200, { ...s, refundedCents: 0 }).reversalCents).toBe(16_940);
    expect(planReversal(12_100, { ...s, refundedCents: 0 }).reversalCents).toBe(8_470);
    expect(planReversal(6_050, { ...s, refundedCents: 0 }).reversalCents).toBe(4_235);
  });

  it('will not refund more than is left', () => {
    const s = computeSplit(12_100, NL);
    expect(() => planReversal(6_051, { ...s, refundedCents: 6_050 })).toThrow(CommissionConfigError);
  });

  it('a sequence of partial refunds never over-reverses the transfer', () => {
    const s = computeSplit(9_999, NL);
    let refunded = 0;
    let reversed = 0;
    for (const slice of [1_000, 2_500, 3_333, 3_166]) {
      const plan = planReversal(slice, { ...s, refundedCents: refunded });
      refunded += slice;
      reversed += plan.reversalCents;
    }
    expect(refunded).toBe(s.grossCents);
    expect(Math.abs(reversed - s.transferCents)).toBeLessThanOrEqual(2);
  });
});

describe('shareCost', () => {
  it('splits a retained Stripe fee on the same commission split', () => {
    expect(shareCost(300, 7000)).toEqual({ designerCents: 210, platformCents: 90 });
  });

  it('splits a dispute fee and always re-adds to the whole', () => {
    for (let cost = 0; cost <= 2_500; cost += 13) {
      const s = shareCost(cost, 7000);
      expect(s.designerCents + s.platformCents).toBe(cost);
    }
  });
});

describe('settleCarriedBalance', () => {
  it('takes the whole balance when the next sale covers it', () => {
    expect(settleCarriedBalance(8_470, 2_000)).toEqual({
      transferCents: 6_470,
      settledCents: 2_000,
      remainingBalanceCents: 0,
    });
  });

  it('takes what it can and carries the rest', () => {
    expect(settleCarriedBalance(3_000, 8_470)).toEqual({
      transferCents: 0,
      settledCents: 3_000,
      remainingBalanceCents: 5_470,
    });
  });

  it('is a no-op when nothing is owed', () => {
    expect(settleCarriedBalance(8_470, 0).transferCents).toBe(8_470);
  });
});
