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

Status: Approved May 29, 2026

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
LIVE_STRIPE_PRICE_ID=price_1TcW2sKF7IYBssd4FylTeVZp
```

## Gate 3: Configure Live Billing Portal

Status: Approved May 29, 2026

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

Status: Approved May 29, 2026

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
LIVE_STRIPE_WEBHOOK_SECRET=received; do not store in repo
```

## Gate 5: Add Live Cloudflare Secrets

Status: Approved May 29, 2026

Replace Stripe sandbox secrets with live Stripe secrets only when ready.

Cloudflare Worker secrets:

```text
STRIPE_SECRET_KEY=live key configured in Cloudflare; do not store in repo
STRIPE_PRICE_ID=price_1TcW2sKF7IYBssd4FylTeVZp
STRIPE_WEBHOOK_SECRET=live signing secret configured in Cloudflare; do not store in repo
```

Safety checklist:

- Confirm each secret is live mode.
- Confirm the price id belongs to the live product.
- Confirm webhook secret belongs to the live endpoint.
- Do not change Anthropic, Firebase, or Resend secrets during this step.
- Keep the previous sandbox values somewhere private until live testing is complete.

## Gate 6: Live Checkout Smoke Test

Status: Paused May 30, 2026 - pending real payment smoke test

Run one real payment test with a real card.

Checklist:

- Use a fresh free family, or reset an old sandbox-upgraded test family before testing live billing.
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
- This gate is intentionally paused until a real live payment test is approved.

## Gate 7: Live Rollback Plan

Status: Approved May 30, 2026

If live checkout breaks, use this rollback order.

Checklist:

- Revert Cloudflare Worker Stripe secrets to sandbox values, or temporarily remove `STRIPE_PRICE_ID`.
- Confirm Upgrade no longer creates live checkout sessions.
- Check Cloudflare Worker logs for errors.
- Check Stripe webhook delivery logs.
- Restore live secrets only after the cause is understood.

Emergency fallback:

- Hide the Upgrade button in the app until billing is fixed.

Rollback decision tree:

1. If Checkout will not open, check Worker logs first.
2. If Checkout opens but payment/webhook does not activate the plan, check Stripe webhook delivery logs.
3. If live billing needs to be paused immediately, remove or replace `STRIPE_PRICE_ID` in Cloudflare.
4. If a specific deploy introduced the issue, revert the app commit and let Cloudflare Pages redeploy.
5. If a live customer was charged incorrectly, cancel/refund in Stripe before changing Firestore manually.

## Gate 8: Beta Launch Billing Notes

Status: Approved May 30, 2026

Before inviting paying beta families:

- Confirm privacy, terms, and safety pages are visible and scroll correctly.
- Confirm data deletion request emails arrive.
- Confirm Billing Portal opens from Hype HQ.
- Confirm support inbox is monitored.
- Confirm Stripe dashboard is in live mode when checking real customers.
- Confirm a manual refund/cancel process exists.
- Confirm Gate 6 remains unresolved until a real payment smoke test is completed.
- Start paying beta with one trusted family first, not a broad invite.
- Tell beta parents that billing is live and that support can help cancel/refund early beta issues.

## Approval Log

Use this section as we proceed.

```text
Gate 1 approved: May 29, 2026 - $7.99/month, monthly only, no trial/coupon
Gate 2 approved: May 29, 2026 - live monthly price price_1TcW2sKF7IYBssd4FylTeVZp
Gate 3 approved: May 29, 2026 - live Billing Portal configured with card updates, cancellation, and return URL
Gate 4 approved: May 29, 2026 - live webhook created and signing secret received privately
Gate 5 approved: May 29, 2026 - live Stripe key, live price id, and live webhook secret configured in Cloudflare
Gate 6 approved: Paused May 30, 2026 - come back for real payment smoke test
Gate 7 approved: May 30, 2026 - rollback plan documented
Gate 8 approved: May 30, 2026 - beta billing notes documented
```
