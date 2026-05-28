# Hype Girl

Hype Girl is a mobile-first AI companion for tween and teen girls with a parent-mediated safety loop.

The product goal is not only "AI chat." It is a supportive chat experience where everyday messages get an immediate Hype Girl response, while sensitive or urgent messages are paused for parent review.

## Product Flow

1. A parent creates an account and gets a family invite code.
2. A child creates an account with that family code.
3. The child chats with Hype Girl.
4. Each child message is classified as `GREEN`, `AMBER`, or `RED`.
5. `GREEN` messages receive an immediate AI response.
6. `AMBER` and `RED` messages are sent to Hype HQ for parent review.
7. Parents can preview a Hype Girl voice rewrite before sending a reply back to the child.
8. `RED` messages also show crisis guidance and trigger an email alert.

## Files

- `index.html` - app shell.
- `styles.css` - mobile-first UI styling.
- `app.js` - Firebase auth, chat, parent queue, usage, avatar, and safety flow.
- `hypegirl-worker.js` - Cloudflare Worker for Anthropic calls and Resend alerts.
- `firestore.rules` - starter Firestore rules for child-owned messages and parent queue access.
- `privacy.html` and `terms.html` - starter trust pages that should be lawyer-reviewed before production.
- `wrangler.toml` - Worker deployment config.

## Local Development

Run a static server from the repo root:

```sh
python -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

The frontend expects the deployed Worker URL in `app.js`:

```js
var WORKER = "https://hypegirl-api.brookheightsmedia.workers.dev";
```

## Cloudflare Worker

Install or use Wrangler, then set secrets:

```sh
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put RESEND_API_KEY
```

Deploy:

```sh
wrangler deploy
```

For production, set `ALLOWED_ORIGIN` in `wrangler.toml` to the exact site origin instead of `*`.

## Firebase

Deploy the starter rules:

```sh
firebase deploy --only firestore:rules
```

The app uses:

- `users/{uid}`
- `users/{uid}/messages/{messageId}`
- `parentQueue/{queueId}`

Parent/child linking should use `familyCode`. The older child-name fallback remains in code only to avoid stranding existing test accounts.

## Safety Notes

- Classification uncertainty defaults to `AMBER`.
- The Worker no longer exposes a generic legacy model proxy.
- Parent replies are previewed before sending.
- User and AI text are rendered with text nodes instead of raw `innerHTML`.
- Local message rendering uses `clientId` plus Firestore document IDs to prevent duplicate chat bubbles.
- The Worker should use `ALLOWED_ORIGIN=https://hypegirl.pages.dev` in production.
- Parent queue items include recent conversation context so parents are not replying blind.

Before production, add:

- verified Firebase Auth domain and app check
- exact Worker CORS origin
- legal review for privacy, terms, and child consent
- stronger Firebase custom-claim or server-side parent authorization
- monitoring for Worker errors and classifier drift
- a verified Resend sender domain instead of `onboarding@resend.dev`
