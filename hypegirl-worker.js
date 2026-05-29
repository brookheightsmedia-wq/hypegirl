const DEFAULT_ALLOWED_ORIGIN = "https://hypegirl.pages.dev,https://subscription-checkout.hypegirl.pages.dev";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_CHAT_MODEL = "claude-sonnet-4-6";
let firebaseJwksCache = { keys: null, expiresAt: 0 };

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = buildCorsHeaders(env, origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, corsHeaders);
    }

    if (url.pathname === "/stripe-webhook") {
      try {
        return json(await handleStripeWebhook(request, env), 200, corsHeaders);
      } catch (err) {
        return json({ error: err.message || "Webhook error" }, err.status || 500, corsHeaders);
      }
    }

    try {
      const auth = await verifyFirebaseAuth(request, env);
      await enforceRateLimit(request, env);
      const body = await request.json();

      if (body.action === "classify") {
        return json(await classify(body, env), 200, corsHeaders);
      }

      if (body.action === "chat") {
        return json(await chat(body, env), 200, corsHeaders);
      }

      if (body.action === "rewrite_parent") {
        return json(await rewriteParent(body, env), 200, corsHeaders);
      }

      if (body.action === "alert") {
        return json(await sendAlert(body, env), 200, corsHeaders);
      }

      if (body.action === "feedback") {
        return json(await sendFeedback(body, env, auth), 200, corsHeaders);
      }

      if (body.action === "deletion_request") {
        return json(await sendDeletionRequest(body, env, auth), 200, corsHeaders);
      }

      if (body.action === "create_checkout") {
        return json(await createCheckout(body, env, auth), 200, corsHeaders);
      }

      if (body.action === "create_billing_portal") {
        return json(await createBillingPortal(body, env, auth), 200, corsHeaders);
      }

      return json({ error: "Unknown action" }, 400, corsHeaders);
    } catch (err) {
      return json({ error: err.message || "Server error" }, err.status || 500, corsHeaders);
    }
  }
};

function buildCorsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const allowedOrigins = allowed.split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.includes("*") || allowedOrigins.includes(origin)
    ? (origin || allowedOrigins[0])
    : allowedOrigins[0];
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers });
}

async function enforceRateLimit(request, env) {
  if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== "function") return;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const result = await env.RATE_LIMITER.limit({ key: ip });
  if (!result.success) {
    const err = new Error("Too many requests. Please slow down.");
    err.status = 429;
    throw err;
  }
}

async function verifyFirebaseAuth(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error("Missing Firebase auth token");
    err.status = 401;
    throw err;
  }
  return verifyFirebaseIdToken(match[1], env);
}

async function verifyFirebaseIdToken(token, env) {
  const projectId = env.FIREBASE_PROJECT_ID || "hypegirl-ff832";
  const parts = token.split(".");
  if (parts.length !== 3) {
    const err = new Error("Invalid Firebase auth token");
    err.status = 401;
    throw err;
  }

  const header = base64UrlDecodeJson(parts[0]);
  const payload = base64UrlDecodeJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) {
    const err = new Error("Invalid Firebase auth token");
    err.status = 401;
    throw err;
  }

  const now = Math.floor(Date.now() / 1000);
  const issuer = "https://securetoken.google.com/" + projectId;
  if (
    payload.aud !== projectId ||
    payload.iss !== issuer ||
    !payload.sub ||
    payload.exp <= now ||
    payload.iat > now + 300
  ) {
    const err = new Error("Expired or invalid Firebase auth token");
    err.status = 401;
    throw err;
  }

  const jwks = await firebaseJwks();
  const jwk = jwks.find((key) => key.kid === header.kid);
  if (!jwk) {
    const err = new Error("Unknown Firebase auth token key");
    err.status = 401;
    throw err;
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64UrlDecodeBytes(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  if (!ok) {
    const err = new Error("Invalid Firebase auth token signature");
    err.status = 401;
    throw err;
  }

  return {
    uid: payload.sub,
    email: payload.email || "",
    emailVerified: Boolean(payload.email_verified)
  };
}

async function firebaseJwks() {
  const now = Date.now();
  if (firebaseJwksCache.keys && firebaseJwksCache.expiresAt > now) return firebaseJwksCache.keys;

  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.keys)) {
    const err = new Error("Could not load Firebase token keys");
    err.status = 503;
    throw err;
  }

  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600000;
  firebaseJwksCache = {
    keys: data.keys,
    expiresAt: now + Math.max(300000, maxAgeMs - 60000)
  };
  return firebaseJwksCache.keys;
}

function base64UrlDecodeJson(value) {
  return JSON.parse(atob(base64UrlToBase64(value)));
}

function base64UrlDecodeBytes(value) {
  const binary = atob(base64UrlToBase64(value));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlToBase64(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), "=");
}

async function classify(body, env) {
  const message = String(body.message || "").slice(0, 1200);
  const context = Array.isArray(body.context) ? body.context.slice(-6) : [];

  if (!message.trim()) return { classification: "AMBER" };

  const data = await anthropic(env, {
    model: env.CLASSIFIER_MODEL || DEFAULT_CLASSIFIER_MODEL,
    max_tokens: 12,
    system: classifierPrompt(),
    messages: [{
      role: "user",
      content: [
        "Recent context:",
        JSON.stringify(context),
        "",
        "Classify this latest message:",
        message
      ].join("\n")
    }]
  });

  const raw = extractText(data).toUpperCase();
  const match = raw.match(/\b(RED|AMBER|GREEN)\b/);
  return { classification: match ? match[1] : "AMBER" };
}

async function chat(body, env) {
  const messages = normalizeMessages(body.messages).slice(-12);
  const system = String(body.system || "").slice(0, 2000);
  if (!system || !messages.length) {
    const err = new Error("Missing chat system or messages");
    err.status = 400;
    throw err;
  }

  return anthropic(env, {
    model: env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
    max_tokens: 300,
    system,
    messages
  });
}

async function rewriteParent(body, env) {
  const parentResponse = String(body.parentResponse || "").slice(0, 1200);
  const originalMessage = String(body.originalMessage || "").slice(0, 1200);
  if (!parentResponse.trim()) {
    const err = new Error("Parent response is required");
    err.status = 400;
    throw err;
  }

  const data = await anthropic(env, {
    model: env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
    max_tokens: 240,
    system: [
      "You rewrite a parent's response into Hype Girl's voice.",
      "Keep the meaning, boundaries, and safety guidance intact.",
      "Use pre-teen/tween best-friend language without hiding that trusted adults matter.",
      "Sound like a kind 11-13 year old bestie, not an adult therapist and not a high-school influencer.",
      "Prefer simple words, one playful phrase, and no more than one emoji.",
      "Do not add new promises, medical advice, secrecy, or sexual content.",
      "Keep it under 2-3 short sentences."
    ].join(" "),
    messages: [{
      role: "user",
      content: [
        "Original child message:",
        originalMessage,
        "",
        "Parent response:",
        parentResponse,
        "",
        "Rewrite in Hype Girl's voice."
      ].join("\n")
    }]
  });

  return { text: extractText(data), raw: data };
}

async function sendAlert(body, env) {
  const childName = String(body.childName || "your child").slice(0, 100);
  const parentEmail = String(body.parentEmail || "").slice(0, 254);
  const message = String(body.message || "").slice(0, 2000);
  const classification = String(body.classification || "AMBER").toUpperCase() === "RED" ? "RED" : "AMBER";

  if (!env.RESEND_API_KEY) return { ok: false, skipped: "Missing RESEND_API_KEY" };
  if (!parentEmail || !parentEmail.includes("@")) return { ok: false, skipped: "Missing parent email" };

  const isRed = classification === "RED";
  const subject = isRed
    ? "URGENT: Hype Girl Safety Alert for " + childName
    : "Hype Girl Parent Review Needed for " + childName;

  const html = alertHtml({ childName, message, isRed });
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.ALERT_FROM || "Hype Girl <onboarding@resend.dev>",
      to: [parentEmail],
      subject,
      html
    })
  });

  const emailData = await emailRes.json();
  if (!emailRes.ok) {
    const err = new Error(emailData.message || "Email failed");
    err.status = emailRes.status;
    throw err;
  }

  return { ok: true, email: emailData };
}

async function sendFeedback(body, env, auth) {
  const profile = await requireParentProfile(auth, env);
  const message = String(body.message || "").trim().slice(0, 1000);
  if (!message) {
    const err = new Error("Feedback message is required.");
    err.status = 400;
    throw err;
  }

  if (!env.RESEND_API_KEY) return { ok: false, skipped: "Missing RESEND_API_KEY" };

  const parentEmail = String(profile.email || body.parentEmail || "").slice(0, 254);
  const parentName = String(profile.name || body.parentName || "Parent").slice(0, 100);
  const familyCode = String(profile.familyCode || body.familyCode || "").slice(0, 64);
  const page = String(body.page || "").slice(0, 500);
  const userAgent = String(body.userAgent || "").slice(0, 500);
  const to = String(env.FEEDBACK_TO || "brookheightsmedia@gmail.com").slice(0, 254);
  const html = [
    "<h2>HypeGirl beta feedback</h2>",
    "<p><strong>Parent:</strong> " + escapeHtml(parentName) + "</p>",
    "<p><strong>Email:</strong> " + escapeHtml(parentEmail) + "</p>",
    "<p><strong>Family code:</strong> " + escapeHtml(familyCode) + "</p>",
    "<p><strong>Page:</strong> " + escapeHtml(page) + "</p>",
    "<p><strong>User agent:</strong> " + escapeHtml(userAgent) + "</p>",
    "<hr>",
    "<p>" + escapeHtml(message).replace(/\n/g, "<br>") + "</p>"
  ].join("");

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.ALERT_FROM || "Hype Girl <onboarding@resend.dev>",
      to: [to],
      reply_to: parentEmail && parentEmail.includes("@") ? parentEmail : undefined,
      subject: "HypeGirl beta feedback from " + parentName,
      html
    })
  });

  const emailData = await emailRes.json();
  if (!emailRes.ok) {
    const err = new Error(emailData.message || "Feedback email failed");
    err.status = emailRes.status;
    throw err;
  }

  return { ok: true, email: emailData };
}

async function sendDeletionRequest(body, env, auth) {
  const profile = await requireParentProfile(auth, env);
  if (!env.RESEND_API_KEY) return { ok: false, skipped: "Missing RESEND_API_KEY" };

  const parentEmail = String(profile.email || body.parentEmail || "").slice(0, 254);
  const parentName = String(profile.name || body.parentName || "Parent").slice(0, 100);
  const familyCode = String(profile.familyCode || body.familyCode || "").slice(0, 64);
  const message = String(body.message || "").trim().slice(0, 1000);
  const page = String(body.page || "").slice(0, 500);
  const userAgent = String(body.userAgent || "").slice(0, 500);
  const to = String(env.FEEDBACK_TO || "brookheightsmedia@gmail.com").slice(0, 254);
  const html = [
    "<h2>HypeGirl family data deletion request</h2>",
    "<p><strong>Parent:</strong> " + escapeHtml(parentName) + "</p>",
    "<p><strong>Email:</strong> " + escapeHtml(parentEmail) + "</p>",
    "<p><strong>Family code:</strong> " + escapeHtml(familyCode) + "</p>",
    "<p><strong>Authenticated user:</strong> " + escapeHtml(auth.uid) + "</p>",
    "<p><strong>Page:</strong> " + escapeHtml(page) + "</p>",
    "<p><strong>User agent:</strong> " + escapeHtml(userAgent) + "</p>",
    "<hr>",
    "<p><strong>Parent note:</strong></p>",
    "<p>" + (message ? escapeHtml(message).replace(/\n/g, "<br>") : "No note provided.") + "</p>",
    "<hr>",
    "<p><strong>Beta deletion checklist:</strong></p>",
    "<ul>",
    "<li>Confirm request by replying to the parent email.</li>",
    "<li>Cancel or verify Stripe subscription/customer record if needed.</li>",
    "<li>Delete familyPlans/" + escapeHtml(familyCode) + ".</li>",
    "<li>Delete parent and child user profiles linked to this family code.</li>",
    "<li>Delete child message subcollections.</li>",
    "<li>Delete pending/handled parentQueue items for this family code.</li>",
    "</ul>"
  ].join("");

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.ALERT_FROM || "Hype Girl <onboarding@resend.dev>",
      to: [to],
      reply_to: parentEmail && parentEmail.includes("@") ? parentEmail : undefined,
      subject: "HypeGirl data deletion request for " + familyCode,
      html
    })
  });

  const emailData = await emailRes.json();
  if (!emailRes.ok) {
    const err = new Error(emailData.message || "Deletion request email failed");
    err.status = emailRes.status;
    throw err;
  }

  return { ok: true, email: emailData };
}

async function createCheckout(body, env, auth) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    const err = new Error("Stripe checkout is not configured yet.");
    err.status = 500;
    throw err;
  }

  const familyCode = String(body.familyCode || "").slice(0, 64);
  const successUrl = safeCheckoutUrl(body.successUrl, env.CHECKOUT_SUCCESS_URL);
  const cancelUrl = safeCheckoutUrl(body.cancelUrl, env.CHECKOUT_CANCEL_URL);
  const profile = await requireParentProfile(auth, env);

  if (!profile.email || !profile.email.includes("@")) {
    const err = new Error("Parent email is required for checkout.");
    err.status = 400;
    throw err;
  }

  if (!familyCode || familyCode !== profile.familyCode) {
    const err = new Error("This checkout does not match your family code.");
    err.status = 403;
    throw err;
  }

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("customer_email", profile.email);
  params.set("client_reference_id", familyCode);
  params.set("line_items[0][price]", env.STRIPE_PRICE_ID);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("metadata[familyCode]", familyCode);
  params.set("metadata[parentId]", auth.uid);
  params.set("subscription_data[metadata][familyCode]", familyCode);
  params.set("subscription_data[metadata][parentId]", auth.uid);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error && data.error.message ? data.error.message : "Stripe checkout failed");
    err.status = response.status;
    throw err;
  }

  return { url: data.url, id: data.id };
}

async function createBillingPortal(body, env, auth) {
  if (!env.STRIPE_SECRET_KEY) {
    const err = new Error("Stripe billing portal is not configured yet.");
    err.status = 500;
    throw err;
  }

  const profile = await requireParentProfile(auth, env);
  const familyCode = String(body.familyCode || profile.familyCode || "").slice(0, 64);
  if (!familyCode || familyCode !== profile.familyCode) {
    const err = new Error("This billing portal does not match your family code.");
    err.status = 403;
    throw err;
  }

  const familyPlan = await readFirestoreDocument("familyPlans/" + encodeURIComponent(familyCode), env);
  if (!familyPlan || !isActivePlan(familyPlan)) {
    const err = new Error("No active family plan found for this account.");
    err.status = 403;
    throw err;
  }

  if (familyPlan.parentId && familyPlan.parentId !== auth.uid) {
    const err = new Error("This family plan belongs to a different parent account.");
    err.status = 403;
    throw err;
  }

  const customerId = String(body.customerId || "").slice(0, 128);
  const planCustomerId = String(familyPlan.stripeCustomerId || "");
  const returnUrl = safeCheckoutUrl(body.returnUrl, env.CHECKOUT_SUCCESS_URL);
  if (!planCustomerId) {
    const err = new Error("Stripe customer is required for billing.");
    err.status = 400;
    throw err;
  }
  if (customerId && customerId !== planCustomerId) {
    const err = new Error("This Stripe customer does not match your family plan.");
    err.status = 403;
    throw err;
  }

  const params = new URLSearchParams();
  params.set("customer", planCustomerId);
  params.set("return_url", returnUrl);

  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error && data.error.message ? data.error.message : "Stripe billing portal failed");
    err.status = response.status;
    throw err;
  }

  return { url: data.url, id: data.id };
}

function safeCheckoutUrl(value, fallback) {
  const url = String(value || fallback || "https://hypegirl.pages.dev").slice(0, 500);
  if (!url.startsWith("https://") && !url.startsWith("http://localhost")) {
    return "https://hypegirl.pages.dev";
  }
  return url;
}

async function requireParentProfile(auth, env) {
  const profile = await readFirestoreDocument("users/" + encodeURIComponent(auth.uid), env);
  if (!profile || profile.role !== "parent") {
    const err = new Error("Please sign in as a parent to manage billing.");
    err.status = 403;
    throw err;
  }
  if (!profile.familyCode) {
    const err = new Error("Add a family code before managing billing.");
    err.status = 403;
    throw err;
  }
  return profile;
}

function isActivePlan(plan) {
  return plan && (plan.status === "active" || plan.status === "trialing");
}

async function readFirestoreDocument(path, env) {
  const projectId = env.FIREBASE_PROJECT_ID || "hypegirl-ff832";
  const token = await firebaseAccessToken(env);
  const url = "https://firestore.googleapis.com/v1/projects/" + projectId +
    "/databases/(default)/documents/" + path;
  const response = await fetch(url, {
    method: "GET",
    headers: { "Authorization": "Bearer " + token }
  });
  const data = await response.json();
  if (response.status === 404) return null;
  if (!response.ok) {
    const err = new Error(data.error && data.error.message ? data.error.message : "Could not read Firestore document");
    err.status = response.status;
    throw err;
  }
  return firestoreFields(data.fields || {});
}

function firestoreFields(fields) {
  const result = {};
  Object.keys(fields).forEach((key) => {
    result[key] = firestoreValue(fields[key]);
  });
  return result;
}

function firestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(firestoreValue);
  if ("mapValue" in value) return firestoreFields(value.mapValue.fields || {});
  return null;
}

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    const err = new Error("Stripe webhook is not configured yet.");
    err.status = 500;
    throw err;
  }

  const signature = request.headers.get("Stripe-Signature") || "";
  const payload = await request.text();
  const ok = await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) {
    const err = new Error("Invalid Stripe webhook signature.");
    err.status = 400;
    throw err;
  }

  const event = JSON.parse(payload);
  if (event.type === "checkout.session.completed") {
    await activateFamilyPlan(event.data && event.data.object, env);
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    await syncSubscriptionStatus(event.data && event.data.object, env);
  }

  return { received: true };
}

async function verifyStripeSignature(payload, header, secret) {
  const parts = header.split(",").reduce((acc, item) => {
    const idx = item.indexOf("=");
    if (idx > -1) {
      const key = item.slice(0, idx);
      const value = item.slice(idx + 1);
      if (key === "v1") {
        acc.v1.push(value);
      } else {
        acc[key] = value;
      }
    }
    return acc;
  }, { v1: [] });

  if (!parts.t || parts.v1.length === 0) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) return false;

  const signedPayload = parts.t + "." + payload;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = hex(digest);
  return parts.v1.some((signature) => timingSafeEqual(expected, signature));
}

function hex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function activateFamilyPlan(session, env) {
  if (!session) return;
  const familyCode = session.metadata && session.metadata.familyCode
    ? String(session.metadata.familyCode)
    : String(session.client_reference_id || "");
  if (!familyCode) return;

  await updateFamilyPlan(familyCode, {
    familyCode,
    status: "active",
    plan: "family",
    parentId: String(session.metadata && session.metadata.parentId || ""),
    stripeCustomerId: String(session.customer || ""),
    stripeSubscriptionId: String(session.subscription || ""),
    lastCheckoutSessionId: String(session.id || "")
  }, env);
}

async function syncSubscriptionStatus(subscription, env) {
  if (!subscription || !subscription.metadata || !subscription.metadata.familyCode) return;
  const familyCode = String(subscription.metadata.familyCode);
  const status = normalizeSubscriptionStatus(subscription.status);
  await updateFamilyPlan(familyCode, {
    familyCode,
    status,
    plan: status === "active" || status === "trialing" ? "family" : "free",
    parentId: String(subscription.metadata.parentId || ""),
    stripeCustomerId: String(subscription.customer || ""),
    stripeSubscriptionId: String(subscription.id || "")
  }, env);
}

function normalizeSubscriptionStatus(status) {
  if (status === "active" || status === "trialing") return status;
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  return "canceled";
}

async function updateFamilyPlan(familyCode, values, env) {
  const projectId = env.FIREBASE_PROJECT_ID || "hypegirl-ff832";
  const token = await firebaseAccessToken(env);
  const encodedFamilyCode = encodeURIComponent(familyCode);
  const mask = Object.keys(values).map((key) => "updateMask.fieldPaths=" + encodeURIComponent(key)).join("&");
  const url = "https://firestore.googleapis.com/v1/projects/" + projectId +
    "/databases/(default)/documents/familyPlans/" + encodedFamilyCode + "?" + mask;

  const fields = {};
  Object.keys(values).forEach((key) => {
    fields[key] = { stringValue: values[key] };
  });
  fields.updatedAt = { timestampValue: new Date().toISOString() };

  const response = await fetch(url + "&updateMask.fieldPaths=updatedAt", {
    method: "PATCH",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error && data.error.message ? data.error.message : "Could not update family plan");
    err.status = response.status;
    throw err;
  }
  return data;
}

async function firebaseAccessToken(env) {
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    const err = new Error("Firebase service account is not configured yet.");
    err.status = 500;
    throw err;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt({
    alg: "RS256",
    typ: "JWT"
  }, {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }, env.FIREBASE_PRIVATE_KEY);

  const params = new URLSearchParams();
  params.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  params.set("assertion", assertion);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error_description || data.error || "Could not authorize Firebase service account");
    err.status = response.status;
    throw err;
  }
  return data.access_token;
}

async function signJwt(header, payload, privateKeyPem) {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const input = encodedHeader + "." + encodedPayload;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(input)
  );
  return input + "." + base64UrlEncodeBytes(signature);
}

async function importPrivateKey(privateKeyPem) {
  const normalized = privateKeyPem.replace(/\\n/g, "\n");
  const pem = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const raw = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64UrlEncode(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeBytes(value) {
  let binary = "";
  const bytes = new Uint8Array(value);
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function anthropic(env, payload) {
  if (!env.ANTHROPIC_API_KEY) {
    const err = new Error("Missing ANTHROPIC_API_KEY");
    err.status = 500;
    throw err;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error && data.error.message ? data.error.message : "Anthropic request failed");
    err.status = response.status;
    throw err;
  }
  return data;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant"))
    .map((msg) => ({
      role: msg.role,
      content: String(msg.content || "").slice(0, 2000)
    }))
    .filter((msg) => msg.content.trim());
}

function extractText(data) {
  if (data && data.content && data.content[0] && data.content[0].text) return data.content[0].text.trim();
  return "";
}

function classifierPrompt() {
  return [
    "You are a content safety classifier for a chat app used by girls aged 10-16.",
    "Reply with exactly one word: GREEN, AMBER, or RED.",
    "",
    "GREEN: everyday safe topics like homework, tests, teachers, hobbies, sports, music, food, movies, TV, fashion, hanging out with friends, pets, feeling tired, or feeling bored.",
    "",
    "AMBER: sensitive topics a parent should see, including negative feelings about family, fights with parents, feeling unseen or unloved by family, crushes, dating, heartbreak, bullying, being left out, social cruelty, persistent sadness, anxiety, hopelessness, worthlessness, body image concerns, faith or religion questions, or curiosity about alcohol/drugs without active use.",
    "",
    "RED: urgent emergencies, including self-harm, cutting, suicidal thoughts, not wanting to be alive, physical or sexual abuse, explicit sexual content involving a minor, active drug or alcohol use, or immediate danger.",
    "",
    "If uncertain, choose AMBER. Never choose GREEN for possible self-harm, abuse, active substance use, sexual exploitation, or immediate danger."
  ].join("\n");
}

function alertHtml({ childName, message, isRed }) {
  const color = isRed ? "#ef4444" : "#f59e0b";
  const escapedName = escapeHtml(childName);
  const escapedMessage = escapeHtml(message);
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${color}; padding: 20px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">
          ${isRed ? "Safety Alert" : "Message Needs Your Review"}
        </h1>
      </div>
      <div style="background: #fff8fc; padding: 24px; border: 1px solid #ffd6eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #333;">Hi there,</p>
        <p style="font-size: 16px; color: #333;">
          <strong>${escapedName}</strong> sent a message that ${isRed ? "may need immediate attention." : "needs your review before Hype Girl responds."}
        </p>
        <div style="background: #fff0f7; border-left: 4px solid ${color}; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-size: 15px; color: #440022; font-style: italic;">"${escapedMessage}"</p>
        </div>
        ${isRed ? `<div style="background: #fff0f0; border: 2px solid #ef4444; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #b91c1c; font-weight: bold; font-size: 15px;">
            If your child is in immediate danger, call 911. For crisis support in the U.S., call or text 988.
          </p>
        </div>` : ""}
        <p style="font-size: 14px; color: #888; margin-top: 24px;">The Hype Girl Team</p>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
