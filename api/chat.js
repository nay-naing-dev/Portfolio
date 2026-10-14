/* =========================================================
   Nay Naing | Portfolio: AI assistant endpoint (Vercel serverless)

   POST /api/chat
   Body:    { "messages": [{ "role": "user" | "model", "text": "..." }, ...] }
   Returns: { "reply": "..." }  or  { "error": "..." } with a 4xx/5xx status

   The Gemini key never reaches the browser: it is read from the
   GEMINI_API_KEY environment variable (set it in the Vercel dashboard,
   or in .env.local when running `vercel dev`).
   ========================================================= */

// Tried in order: when a model is overloaded (503), retired (404) or out of free
// quota (429), the next one answers instead. GEMINI_MODEL, if set, goes first.
// Lite models lead: they answer in ~1-2s and have a bigger free-tier quota
// (the full Flash models allow only ~20 free requests a day).
const MODELS = [...new Set([
  process.env.GEMINI_MODEL,
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
].filter(Boolean))];
const RETRY_NEXT_MODEL = new Set([404, 429, 500, 502, 503, 504]);
const apiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Gemini 2.x models take a token budget; Gemini 3+ models take a level instead
const thinkingFor = (model) => (model.startsWith('gemini-2') ? { thinkingBudget: 0 } : { thinkingLevel: 'low' });

const MAX_MESSAGES = 12;    // conversation turns sent to the model
const MAX_CHARS    = 1000;  // per message
const RATE_LIMIT   = 20;    // requests per IP per minute (per warm instance, best effort)

const SYSTEM_PROMPT = `You are the official AI assistant representing Nay Naing on his personal portfolio website.

Developer Profile & Background Info:
- Name: Nay Naing
- Age: 20
- Major: 2nd-year CEIT student at Kyaukse Technological University (KTU)
- Primary/Strongest Language: JavaScript
- Core Tech Stack & Skills: C, JavaScript, Java, SQL, MongoDB, React, Vue.js, Next.js, Node.js/Express.js (MERN Stack), Tailwind CSS
- Projects: Movie discovery web app (Vue.js/Tailwind CSS/Firebase, using a movie API), Virtual try-on & appointment booking system (MERN), Learning Management System (MERN/Tailwind)
- Favorite Football Club: Arsenal (Gunner ပီပီ အသင်းကို အရမ်းအားပေးတယ်)
- Girlfriend's Name: စုမြတ်ကြည်စင် (Su Myat Kyi Zin)
- Quirky Hobby: သူများကို blame ရတာ ဝါသနာပါတယ်။ (Answer this strictly as a joke/humorous banter!)

Strict Special Rules & Custom Q&A Behaviors:
1. **Appearance / Handsome Questions:** If a visitor asks if Nay Naing is handsome (e.g., "ချောလား", "Is he handsome?"), always reply enthusiastically and playfully: "အရမ်းချောပါတယ်ဗျာ!"
2. **Relationship Status Questions:** If a visitor asks if he has a girlfriend or partner (e.g., "ရည်းစားရှိလား", "ချစ်သူရှိလား"), reply warmly and proudly mentioning her name: "အရမ်းချစ်စရာကောင်းတဲ့ ကောင်မလေး 'စုမြတ်ကြည်စင်' ဆိုတာ ရှိပါတယ်ဗျ!"
3. **Football / Arsenal Questions:** If asked about football, sports, or his favorite team, proudly state that he is a die-hard Arsenal fan.
4. **Hobby / Free Time / Blame Questions:** If asked about his hobbies or what he likes to do for fun, playfully and jokingly mention that his biggest hobby is blaming others ("သူများကို blame ရတာ ဝါသနာပါတယ်။ 😆").
5. **Unknown / Unrelated Questions (Fallback Rule):** If a visitor asks anything completely unrelated to Nay Naing, his skills, projects, background, or these custom personality topics (or asks general random knowledge outside your scope), strictly reply in Burmese with: "ဘာတွေလာမေးနေတာလဲကြောင်နေတာလား"

Tone & General Rules:
- Answer visitors' questions accurately about Nay Naing's skills, background, projects, and education.
- Match the user's language (reply in Burmese if asked in Burmese, English if asked in English, unless applying Rule 5).
- Maintain a helpful, witty, friendly, and professional developer persona.
- Greetings, and questions about contacting, hiring or working with Nay Naing, or about this website, are related topics (not Rule 5): answer them and point to the Contact section of the website.

Formatting: keep answers short (a few sentences or a short list). Plain text only; you may use **bold** and "- " bullet lines. Never invent facts about Nay Naing that are not listed above; if a related question isn't covered, say you don't know and suggest the Contact section.`;

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

  // Clean up common paste mistakes in the dashboard: surrounding spaces/newlines/quotes,
  // or the whole "GEMINI_API_KEY=..." line pasted into the value box
  const apiKey = String(process.env.GEMINI_API_KEY || '')
    .trim()
    .replace(/^GEMINI_API_KEY\s*=\s*/, '')
    .replace(/^["']+|["']+$/g, '');
  if (!apiKey) {
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

  const contents = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  try {
    let response;
    let data = {};

    for (const model of MODELS) {
      response = await fetch(apiUrl(model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 1024,
            thinkingConfig: thinkingFor(model), // short chat answers: keep "thinking" minimal for speed and quota
          },
        }),
        signal: AbortSignal.timeout(15_000),
      }).catch((err) => {
        console.error('Gemini request failed', model, err.name);
        return { ok: false, status: 504, json: async () => ({}) };
      });

      data = await response.json().catch(() => ({}));
      if (response.ok) break;

      console.error('Gemini error', model, response.status, data && data.error && data.error.message);
      if (!RETRY_NEXT_MODEL.has(response.status)) break; // e.g. a bad key: another model won't help
    }

    if (!response.ok) {
      const busy = response.status === 429 || response.status === 503;
      const error = busy
        ? 'The assistant is busy right now. Please try again in a minute.'
        : `The assistant could not answer right now (Gemini ${response.status}${data.error && data.error.status ? ` ${data.error.status}` : ''}). Please try again.`;
      return res.status(busy ? 503 : 502).json({ error });
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
