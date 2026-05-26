export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };

    try {
      const body = await request.json();
      const { action } = body;

      // ── ACTION: classify ──────────────────────────────────────────────
      if (action === 'classify') {
        const { message } = body;
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 10,
            system: 'You are a content classifier. Read the message and return ONLY one word: GREEN, AMBER, or RED. No explanation. GREEN = safe everyday topics. AMBER = sensitive topics needing parent review (romance, relationships, faith, mental health, family conflict, bullying). RED = emergency topics (self-harm, suicide, abuse, danger, sexual content, drugs).',
            messages: [{ role: 'user', content: 'Classify this message: ' + message }]
          })
        });
        const data = await res.json();
        if (!data.content || !data.content[0]) {
          return new Response(JSON.stringify({ classification: 'GREEN' }), { headers: corsHeaders });
        }
        const rawText = data.content[0].text.trim().toUpperCase();
        const match = rawText.match(/\b(RED|AMBER|GREEN)\b/);
        const classification = match ? match[1] : 'GREEN';
        return new Response(JSON.stringify({ classification }), { headers: corsHeaders });
      }

      // ── ACTION: chat ──────────────────────────────────────────────────
      if (action === 'chat') {
        const { messages, system } = body;
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 300,
            system,
            messages
          })
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: corsHeaders });
      }

      // ── ACTION: alert (email parent via Resend) ───────────────────────
      if (action === 'alert') {
        const { childName, parentEmail, message, classification } = body;

        const isRed = classification === 'RED';
        const subject = isRed
          ? '🚨 URGENT: Hype Girl Safety Alert for ' + childName
          : '⚠️ Hype Girl Parent Review Needed for ' + childName;

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${isRed ? '#ff3d3d' : '#ff9900'}; padding: 20px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 22px;">
                ${isRed ? '🚨 Safety Alert' : '⚠️ Message Needs Your Review'}
              </h1>
            </div>
            <div style="background: #fff8fc; padding: 24px; border: 1px solid #ffd6eb; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; color: #333;">Hi there,</p>
              <p style="font-size: 16px; color: #333;">
                ${isRed
                  ? '<strong>' + childName + '</strong> sent a message that may need immediate attention.'
                  : '<strong>' + childName + '</strong> sent a message that may need your review before Hype Girl responds.'}
              </p>
              <div style="background: #fff0f7; border-left: 4px solid ${isRed ? '#ff3d3d' : '#ff9900'}; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-size: 15px; color: #440022; font-style: italic;">"${message}"</p>
              </div>
              ${isRed ? `
              <div style="background: #fff0f0; border: 2px solid #ff3d3d; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #cc0000; font-weight: bold; font-size: 15px;">
                  If your child is in immediate danger, please call 911 or the Crisis Lifeline at 988.
                </p>
              </div>` : ''}
              <p style="font-size: 14px; color: #888; margin-top: 24px;">
                — The Hype Girl Team 💅
              </p>
            </div>
          </div>
        `;

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + env.RESEND_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Hype Girl <onboarding@resend.dev>',
            to: [parentEmail],
            subject,
            html
          })
        });

        const emailData = await emailRes.json();
        return new Response(JSON.stringify({ ok: true, email: emailData }), { headers: corsHeaders });
      }

      // ── LEGACY: plain API proxy ───────────────────────────────────────
      const { model, max_tokens, system, messages } = body;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens, system, messages })
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};
