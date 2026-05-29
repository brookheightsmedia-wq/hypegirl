# HypeGirl Beta Operations Checklist

This is the internal runbook for handling beta support, privacy, billing, and deletion requests. It is not customer-facing legal advice.

## Daily Beta Check

1. Check the support inbox for:
   - `HypeGirl beta feedback`
   - `HypeGirl data deletion request`
   - `Hype Girl Parent Review Needed`
   - `URGENT: Hype Girl Safety Alert`
2. Check Cloudflare Worker logs for errors.
3. Check Stripe test mode for failed checkout or subscription events.
4. Spot-check Firestore `parentQueue` for stuck `pending` RED items.
5. Record product notes from parents and kids while they are fresh.

## Data Deletion Request

Use this when a parent sends a deletion request from Hype HQ or by email.

### 1. Confirm The Request

Reply to the parent email before deleting anything:

```text
Hi [Name],

I received your request to delete your HypeGirl beta family data for family code [CODE].

Before I remove it, please reply "confirm delete" so I know this request came from the correct parent account. Once confirmed, I will remove the beta family data I can identify for that family code and let you know when it is complete.

Thank you,
HypeGirl Support
```

Do not delete data from an unconfirmed request unless there is a clear safety, legal, or abuse reason.

### 2. Identify The Family

Use the family code from the request email.

Check Firestore:

- `familyPlans/{familyCode}`
- `users` where `familyCode == familyCode`
- `parentQueue` where `familyCode == familyCode`

Write down:

- parent uid
- child uid
- parent email
- child display name
- Stripe customer id, if present
- Stripe subscription id, if present

### 3. Check Billing First

If `familyPlans/{familyCode}` has an active Stripe subscription:

1. Open Stripe.
2. Search for the `stripeCustomerId` or `stripeSubscriptionId`.
3. Cancel the subscription if the parent requested account deletion.
4. Note whether cancellation is immediate or at period end.
5. Do not delete the Stripe customer unless you are certain no billing record is needed.

For beta, prefer canceling subscriptions over deleting Stripe customer records.

### 4. Delete Firestore Data

Delete only records tied to the confirmed family code.

Recommended order:

1. Delete child message subcollections:
   - `users/{childUid}/messages/*`
2. Delete parent/child user docs:
   - `users/{parentUid}`
   - `users/{childUid}`
3. Delete queue items:
   - `parentQueue/*` where `familyCode == familyCode`
4. Delete family plan:
   - `familyPlans/{familyCode}`

Do not delete unrelated users, queue items, or family plans with similar names.

### 5. Verify Deletion

After deletion, search Firestore again:

- `users` where `familyCode == familyCode`
- `parentQueue` where `familyCode == familyCode`
- `familyPlans/{familyCode}`

Expected result: no matching app data remains, except any records kept by external processors such as Stripe, Cloudflare logs, Firebase logs, Resend logs, or Anthropic processing records.

### 6. Reply To Parent

```text
Hi [Name],

Your HypeGirl beta family data for family code [CODE] has been removed from the app database.

If there was a subscription attached to the account, it has been [cancelled / checked and no active subscription was found].

Some operational records may remain with service providers such as Stripe, Cloudflare, Firebase, Resend, or Anthropic according to their retention policies.

Thank you for helping test HypeGirl.
```

## Parent Feedback Request

When a parent sends beta feedback:

1. Reply quickly if it is about billing, login, safety, or child trust.
2. Add a short note to product backlog.
3. If it describes a bug, reproduce it before changing code.
4. If it describes a child trust concern, treat it as high priority.

## Safety Alert Handling

For RED alerts:

1. Do not assume the app is handling an emergency.
2. Confirm the parent received the alert if possible.
3. Check Hype HQ queue item status.
4. Do not send crisis guidance beyond what is already in the product unless you are following a reviewed safety policy.
5. Record any false positive/false negative for classifier tuning.

## Manual Firestore Safety

Before deleting anything:

- Confirm the project is `HypeGirl`.
- Confirm the family code exactly.
- Confirm the parent email.
- Confirm whether the child account is linked to the same family code.
- Take a screenshot or note of the records you plan to delete.

Avoid bulk deletes unless the query is narrowly scoped by exact `familyCode`.

## Stripe Beta Checklist

For subscription issues:

1. Search Stripe by customer email, customer id, or subscription id.
2. Confirm whether you are in sandbox or live mode.
3. Check subscription status:
   - `active`
   - `trialing`
   - `past_due`
   - `canceled`
4. Compare Stripe status to Firestore `familyPlans/{familyCode}`.
5. If Stripe is active but Firestore is not, inspect webhook delivery.
6. If Firestore says active but Stripe is canceled, update the Firestore plan after confirming.

## Known Beta Limits

- Deletion is manual during beta.
- Legal pages are starter drafts and need legal review before public launch.
- Parent identity is based on Firebase Auth plus family code; stronger server-side authorization should be added before scale.
- Stripe is still sandbox until live credentials and live webhook are configured.
- The app stores chat history for product function and safety review; a real retention setting should be added before broad launch.

