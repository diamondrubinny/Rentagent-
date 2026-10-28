import { capturePayPalOrder, completePayment, PayPalError } from '@rentagent/billing';
import { getServerEnv } from '@rentagent/core';
import { isSupportedLocale } from '@rentagent/shared';
import { audit } from '@/lib/server/audit';
import { emitPaymentEvent, getBillingConfig } from '@/lib/server/billing';
import { db, logger } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/**
 * PayPal sends the payer back here after approval. The order is captured
 * server-side and credited to the account that created it (not to whoever
 * opens this URL); repeating the request changes nothing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') ?? '';
  const lang = isSupportedLocale(locale) ? locale : 'en';
  const back = (query: string) =>
    Response.redirect(
      `${getServerEnv().APP_URL.replace(/\/$/, '')}/${lang}/account/billing?${query}`,
      303,
    );
  const orderId = url.searchParams.get('token') ?? '';
  const billing = await getBillingConfig();
  if (!billing.paypal || !/^[A-Za-z0-9-]{5,64}$/.test(orderId)) return back('canceled=1');

  const payment = await db().payment.findUnique({
    where: { gateway_gatewayRef: { gateway: 'PAYPAL', gatewayRef: orderId } },
  });
  if (!payment) return back('canceled=1');
  if (payment.status === 'SUCCEEDED') return back('paid=1');
  try {
    const capture = await capturePayPalOrder(billing.paypal, orderId);
    if (capture.status !== 'COMPLETED') return back('pending=1');
    const result = await completePayment(db(), 'PAYPAL', orderId, {
      amountMinor: capture.amountMinor,
      currency: capture.currency,
      chargeRef: capture.captureId,
    });
    if (result === 'credited') {
      await audit('billing.payment_succeeded', {
        actorId: payment.userId ?? undefined,
        target: `payment:${payment.id}`,
        meta: { gateway: 'paypal' },
      });
      await emitPaymentEvent('payment.succeeded', payment);
    }
    if (result === 'mismatch') {
      logger().error({ orderId }, 'paypal capture does not match the top-up');
      return back('failed=1');
    }
    return back('paid=1');
  } catch (error) {
    logger().warn(
      { orderId, issue: error instanceof PayPalError ? error.issue : 'unknown' },
      'paypal capture failed',
    );
    return back('failed=1');
  }
}
