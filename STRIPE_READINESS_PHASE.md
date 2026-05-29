# Stripe Readiness Phase

Use this checklist to move HypeGirl from sandbox billing to live billing without mixing test and live Stripe resources.

Each gate should be approved before moving to the next one.

## Gate 1: Decide Live Offer

Status: Approved May 29, 2026

Decide the paid offer that will appear in the app and Stripe.

Checklist:

- Monthly price: `$7.99/month`.
- Yearly billing: not included in first live launch.
- Product name: `HypeGirl Family`.
- Plan promise: unlimited HypeGirl messages for the family plus parent safety dashboard.
- Trial/coupon: no trial or coupon for the first live smoke test.

Approved beta launch offer:

- Monthly: `$7.99/month`
- Yearly: wait until annual billing support/refund expectations are clearer
- Trial: none for first live test, because sandbox already tested the flow

## Gate 2: Create Live Stripe Product And Price

Status: Ready for approval

Create these in Stripe live mode, not sandbox mode.

Checklist:

- Switch Stripe dashboard to live mode.
- Create product: `HypeGirl Family`.
- Add product description: `Unlimited HypeGirl messages for your family, plus a parent safety dashboard for sensitive or urgent messages.`
- Create monthly recurring price.
- Copy the live `price_...` id.
- Do not reuse sandbox price ids.

Output needed:

```text
LIVE_STRIPE_PRICE_ID=
```

## Gate 3: Configure Live Billing Portal

Status: Pending Gate 2

Parents need to manage cards, cancellations, and subscription details without manual support.

Checklist:

- Enable Stripe Billing Portal in live mode.
- Allow payment method updates.
- Allow subscription cancellation.
- Set return URL to:

```text
https://hypegirl.pages.dev/
```

- Save Billing Portal settings.

## Gate 4: Configure Live Webhook

Status: Pending Gate 2

The webhook is what turns a successful payment into an active HypeGirl family plan.

Webhook endpoint:

```text
https://hypegirl-api.brookheightsmedia.workers.dev/stripe-webhook
```

Events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Output needed:

```text
LIVE_STRIPE_WEBHOOK_SECRET=
```

## Gate 5: Add Live Cloudflare Secrets

Status: Pending Gates 2 and 4

Replace Stripe sandbox secrets with live Stripe secrets only when ready.

Cloudflare Worker secrets:

```text
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Safety checklist:

- Confirm each secret is live mode.
- Confirm the price id belongs to the live product.
- Confirm webhook secret belongs to the live endpoint.
- Do not change Anthropic, Firebase, or Resend secrets during this step.
- Keep the previous sandbox values somewhere private until live testing is complete.

## Gate 6: Live Checkout Smoke Test

Status: Pending Gate 5

Run one real payment test with a real card.

Checklist:

- Parent starts on free plan.
- Parent clicks Upgrade.
- Stripe Checkout opens.
- Payment succeeds.
- Parent returns to HypeGirl.
- Firestore `familyPlans/{familyCode}` becomes `active`.
- Parent Hype HQ shows active plan.
- Child account shows unlimited family plan active.
- Child can send messages beyond the free limit.
- Manage button opens Stripe Billing Portal.

Important:

- Stripe test cards will not work in live mode.
- Use a real payment method.
- Refund/cancel after the smoke test if desired.

## Gate 7: Live Rollback Plan

Status: Pending Gate 5

If live checkout breaks, use this rollback order.

Checklist:

- Revert Cloudflare Worker Stripe secrets to sandbox values, or temporarily remove `STRIPE_PRICE_ID`.
- Confirm Upgrade no longer creates live checkout sessions.
- Check Cloudflare Worker logs for errors.
- Check Stripe webhook delivery logs.
- Restore live secrets only after the cause is understood.

Emergency fallback:

- Hide the Upgrade button in the app until billing is fixed.

## Gate 8: Beta Launch Billing Notes

Status: Pending Gate 6

Before inviting paying beta families:

- Confirm privacy, terms, and safety pages are visible and scroll correctly.
- Confirm data deletion request emails arrive.
- Confirm Billing Portal opens from Hype HQ.
- Confirm support inbox is monitored.
- Confirm Stripe dashboard is in live mode when checking real customers.
- Confirm a manual refund/cancel process exists.

## Approval Log

Use this section as we proceed.

```text
Gate 1 approved: May 29, 2026 - $7.99/month, monthly only, no trial/coupon
Gate 2 approved:
Gate 3 approved:
Gate 4 approved:
Gate 5 approved:
Gate 6 approved:
Gate 7 approved:
Gate 8 approved:
```
