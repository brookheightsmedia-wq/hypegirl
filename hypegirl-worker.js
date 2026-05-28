const DEFAULT_ALLOWED_ORIGIN = "*";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_CHAT_MODEL = "claude-sonnet-4-6";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = buildCorsHeaders(env, origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, corsHeaders);
    }

    if (!request.headers.get("Authorization")) {
      return json({ error: "Missing Firebase auth token" }, 401, corsHeaders);
    }

    try {
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

      return json({ error: "Unknown action" }, 400, corsHeaders);
    } catch (err) {
      return json({ error: err.message || "Server error" }, err.status || 500, corsHeaders);
    }
  }
};

function buildCorsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const allowOrigin = allowed === "*" || allowed === origin ? (origin || allowed) : allowed;
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
