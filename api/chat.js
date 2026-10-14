/* =========================================================
   Nay Naing | Portfolio: AI assistant endpoint (Vercel serverless)

   POST /api/chat
   Body:    { "messages": [{ "role": "user" | "model", "text": "..." }, ...] }
   Returns: { "reply": "..." }  or  { "error": "..." } with a 4xx/5xx status

   The Gemini key never reaches the browser: it is read from the
   GEMINI_API_KEY environment variable (set it in the Vercel dashboard,
   or in .env.local when running `vercel dev`).
   ========================================================= */

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MAX_MESSAGES = 12;    // conversation turns sent to the model
const MAX_CHARS    = 1000;  // per message
const RATE_LIMIT   = 20;    // requests per IP per minute (per warm instance, best effort)

const SYSTEM_PROMPT = `You are the official AI assistant representing Nay Naing on his personal portfolio website.
Background Info about Nay Naing:
- Name: Nay Naing
- Age: 20
- Major: 2nd-year CEIT student at Kyaukse Technological University (KTU)
- Core Tech Stack & Skills: C, JavaScript (Strongest), Java, SQL, MongoDB, React, Node.js/Express (MERN Stack), Tailwind CSS
- Projects: Movie discovery app (React/Firebase), Virtual try-on & booking app (MERN), LMS platform (MERN/Tailwind)
- Tone & Personality: Helpful, professional yet friendly developer persona.
- Rules: Answer visitors' questions accurately about Nay Naing's skills, background, projects, and education in both English and Burmese based on how the user asks. If asked about unrelated personal/private topics, politely redirect back to Nay Naing's professional developer background.

Formatting: keep answers short (a few sentences or a short list). Plain text only; you may use **bold** and "- " bullet lines. Never invent facts that are not listed above; if you don't know, say so and suggest the Contact section of the website.`;

const hits = new Map(); // ip -> { count, resetAt }

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

// Keep only well-formed turns, trim them, and make sure the last one is the visitor's
function cleanMessages(input) {
  if (!Array.isArray(input)) return null;
  const messages = input
    .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string')
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.text)
    .slice(-MAX_MESSAGES);

  // Gemini expects the conversation to start with a user turn
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return null;
  return messages;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'The assistant is not configured yet.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages. Please wait a minute and try again.' });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const messages = cleanMessages(body && body.messages);
  if (!messages) {
    return res.status(400).json({ error: 'Please send a message.' });
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 600,
          thinkingConfig: { thinkingBudget: 0 }, // short chat answers: skip "thinking" for speed and free-tier quota
        },
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Gemini error', response.status, data && data.error && data.error.message);
      const status = response.status === 429 ? 429 : 502;
      const error = status === 429
        ? 'The assistant is busy right now (free-tier limit). Please try again shortly.'
        : 'The assistant could not answer right now. Please try again.';
      return res.status(status).json({ error });
    }

    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const reply = parts.map((p) => p.text || '').join('').trim();

    if (!reply) {
      return res.status(200).json({
        reply: "Sorry, I can't help with that one. Feel free to ask about Nay Naing's skills, projects or studies!",
      });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat handler failed', err);
    return res.status(502).json({ error: 'The assistant could not be reached. Please try again.' });
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
