'use server';

import { randomUUID } from 'node:crypto';
import {
  createPayPalOrder,
  createStripeCheckout,
  decimalToMinor,
  PayPalError,
} from '@rentagent/billing';
import { getServerEnv, rateLimit } from '@rentagent/core';
import { isSupportedLocale } from '@rentagent/shared';
import { audit } from '@/lib/server/audit';
import { getBillingConfig } from '@/lib/server/billing';
import { db, logger, redis } from '@/lib/server/runtime';
import { getCurrentUser } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';

export type TopUpResult = { ok: true; url: string } | { ok: false; error: string };

const AMOUNT = /^\d{1,7}(?:\.\d{1,2})?$/;

/**
 * Starts a top-up: the amount must be one of the operator's packs or inside the
 * custom range (never a price chosen by the browser). Returns the gateway URL.
 */
export async function startTopUp(
  gateway: 'stripe' | 'paypal',
  amount: string,
  locale: string,
): Promise<TopUpResult> {
  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE') return { ok: false, error: 'signedOut' };
  const billing = await getBillingConfig();
  if (!billing.settings.enabled) return { ok: false, error: 'disabled' };
  const connection =
    gateway === 'stripe' ? billing.stripe : gateway === 'paypal' ? billing.paypal : null;
  if (!connection) return { ok: false, error: 'gatewayUnavailable' };
  const limit = await rateLimit(redis(), `topup:${user.id}`, 10, 60 * 60);
  if (!limit.allowed) return { ok: false, error: 'rateLimited' };

  const { currency, settings } = billing;
  if (typeof amount !== 'string' || !AMOUNT.test(amount.trim()))
    return { ok: false, error: 'invalidAmount' };
  let amountMinor: bigint;
  try {
    amountMinor = decimalToMinor(amount.trim(), currency);
  } catch {
    return { ok: false, error: 'invalidAmount' };
  }
  const isPack = settings.packs.some((pack) => decimalToMinor(pack, currency) === amountMinor);
  const inRange =
    amountMinor >= decimalToMinor(settings.customMin, currency) &&
    amountMinor <= decimalToMinor(settings.customMax, currency);
  if (!isPack && !inRange) return { ok: false, error: 'invalidAmount' };

  const lang = isSupportedLocale(locale) ? locale : 'en';
  const appUrl = getServerEnv().APP_URL.replace(/\/$/, '');
  const paymentId = randomUUID();
  const site = await getSiteConfig();
  try {
    let gatewayRef: string;
    let url: string;
    if (gateway === 'stripe' && billing.stripe) {
      const session = await createStripeCheckout(billing.stripe, {
        paymentId,
        userId: user.id,
        email: user.email,
        amountMinor,
        currency,
        productName: `${site.name} — credits`,
        successUrl: `${appUrl}/${lang}/account/billing?paid=1`,
        cancelUrl: `${appUrl}/${lang}/account/billing?canceled=1`,
        automaticTax: billing.stripe.automaticTax,
      });
      gatewayRef = session.id;
      url = session.url;
    } else if (billing.paypal) {
      const order = await createPayPalOrder(billing.paypal, {
        paymentId,
        amountMinor,
        currency,
        description: `${site.name} — credits`,
        brandName: site.name,
        returnUrl: `${appUrl}/api/billing/paypal/return?locale=${lang}`,
        cancelUrl: `${appUrl}/${lang}/account/billing?canceled=1`,
      });
      gatewayRef = order.id;
      url = order.approveUrl;
    } else {
      return { ok: false, error: 'gatewayUnavailable' };
    }
    await db().payment.create({
      data: {
        id: paymentId,
        userId: user.id,
        gateway: gateway === 'stripe' ? 'STRIPE' : 'PAYPAL',
        gatewayRef,
        amountMinor,
        currency,
      },
    });
    await audit('billing.topup_started', {
      actorId: user.id,
      target: `payment:${paymentId}`,
      meta: { gateway, amountMinor: amountMinor.toString(), currency },
    });
    return { ok: true, url };
  } catch (error) {
    logger().error(
      {
        gateway,
        err:
          error instanceof PayPalError
            ? error.issue
            : error instanceof Error
              ? error.message
              : 'unknown',
      },
      'top-up could not be started',
    );
    return { ok: false, error: 'gatewayError' };
  }
}
