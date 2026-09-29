'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { checkDutchVatNumber } from '@/domain/vat';

export async function saveVatNumber(formData: FormData) {
  const designerId = String(formData.get('designerId'));
  const slug = String(formData.get('slug'));
  const raw = String(formData.get('vatNumber') || '');

  const check = checkDutchVatNumber(raw);

  await prisma.designer.update({
    where: { id: designerId },
    data: {
      vatNumber: check.normalised || null,
      vatNumberValid: check.valid,
      address: String(formData.get('address') || '') || undefined,
    },
  });

  revalidatePath('/studio/onboarding');
  revalidatePath('/studio');
  revalidatePath('/');

  if (!check.valid) {
    redirect(`/studio/onboarding?d=${slug}&vatError=${encodeURIComponent(check.reason ?? 'Ongeldig nummer')}`);
  }
  redirect(`/studio/onboarding?d=${slug}&vatOk=1`);
}

export async function acceptSelfBilling(formData: FormData) {
  const designerId = String(formData.get('designerId'));
  const config = await prisma.config.findFirstOrThrow();

  await prisma.designer.update({
    where: { id: designerId },
    data: { selfBillingAcceptedAt: new Date(), selfBillingVersion: config.selfBillingTerms },
  });

  revalidatePath('/studio/onboarding');
  revalidatePath('/studio');
  revalidatePath('/');
}

export async function setHoldDays(formData: FormData) {
  const designerId = String(formData.get('designerId'));
  const raw = String(formData.get('holdDays') || '');
  await prisma.designer.update({
    where: { id: designerId },
    data: { holdDaysOverride: raw === '' ? null : Number(raw) },
  });
  revalidatePath('/admin');
  revalidatePath('/studio');
}

export async function togglePayoutHold(formData: FormData) {
  const designerId = String(formData.get('designerId'));
  const designer = await prisma.designer.findUniqueOrThrow({ where: { id: designerId } });
  await prisma.designer.update({
    where: { id: designerId },
    data: {
      payoutsOnHold: !designer.payoutsOnHold,
      holdReason: designer.payoutsOnHold ? null : 'Handmatig geblokkeerd door beheer',
    },
  });
  revalidatePath('/admin');
  revalidatePath('/studio');
}

export async function toggleListingFlag() {
  const config = await prisma.config.findFirstOrThrow();
  await prisma.config.update({
    where: { id: config.id },
    data: { hideUnonboardedList: !config.hideUnonboardedList },
  });
  revalidatePath('/admin');
  revalidatePath('/');
}

export async function setVatRate(formData: FormData) {
  const config = await prisma.config.findFirstOrThrow();
  await prisma.config.update({
    where: { id: config.id },
    data: {
      vatRateBp: Math.round(Number(formData.get('vatRate')) * 100),
      designerShareBp: Math.round(Number(formData.get('share')) * 100),
      defaultHoldDays: Number(formData.get('holdDays')),
    },
  });
  revalidatePath('/admin');
  revalidatePath('/');
}
