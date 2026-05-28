const express = require("express");
const cors    = require("cors");
const path    = require("path");
require("dotenv").config();

const app = express();

// ─── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "..")));

// ─── RATE LIMITER ─────────────────────────────────────────────
const rateMap = new Map();
function rateLimit(req, res, next) {
  const ip  = req.ip || "unknown";
  const now = Date.now();
  const arr = (rateMap.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= 40) {
    return res.status(429).json({
      error: "Juda ko'p so'rov. 1 daqiqa kuting.",
      reply: "Juda ko'p so'rov yuborildi. Biroz kuting."
    });
  }
  arr.push(now);
  rateMap.set(ip, arr);
  next();
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen BrainOS — aqlli shaxsiy AI yordamchisan. Groq tomonidan quvvatlanasan.

BrainOS modullari:
- AI Chat: har qanday savollarga javob
- Qaydlar: aqlli eslatmalar va g'oyalar  
- Kunlik reja: vazifalar va maqsadlar
- Eslatmalar: muhim voqealar
- Moliya: daromad va xarajat nazorati
- O'qish rejasi: kitob kuzatuvi
- Biznes: loyihalar, xodimlar, mijozlar

Qoidalar:
1. Foydalanuvchi qaysi tilda yozsa, shu tilda javob ber
2. Qisqa, aniq va foydali javob ber
3. Kod yozganda markdown formatida yoz
4. Doim do'stona va professional bo'l
5. O'zingni "BrainOS AI yordamchisi" deb tanishtir`;

// ─── GROQ API ─────────────────────────────────────────────────
const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function callGroq(messages, maxTokens = 1024) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY topilmadi .env faylida");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      max_tokens:  maxTokens,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API xatolik: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Javob olinmadi.";
}

// ─── ROUTES ───────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({
    status:   "ok",
    service:  "BrainOS AI Server",
    model:    GROQ_MODEL,
    provider: "Groq",
    time:     new Date().toISOString(),
  });
});

// Asosiy chat
app.post("/chat", rateLimit, async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: "Xabar bo'sh bo'lmasin" });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: "Xabar juda uzun (maks 4000 belgi)" });
  }

  try {
    const messages = [
      ...history
        .filter(m => m.role && m.content)
        .slice(-20)
        .map(m => ({
          role:    m.role === "assistant" ? "assistant" : "user",
          content: String(m.content).slice(0, 2000),
        })),
      { role: "user", content: message.trim() },
    ];

    const reply = await callGroq(messages);
    res.json({ reply, success: true });

  } catch (error) {
    console.error("[CHAT ERROR]", error.message);
    const msg = error.message || "";

    if (msg.includes("401") || msg.includes("API key")) {
      return res.status(401).json({
        error: "API kalit xatosi",
        reply: "GROQ_API_KEY noto'g'ri. .env faylini tekshiring."
      });
    }
    if (msg.includes("429") || msg.includes("rate")) {
      return res.status(429).json({
        error: "API limit",
        reply: "Groq API limiti. Biroz kuting."
      });
    }

    res.status(500).json({
      error: "Server xatoligi",
      reply: "Xatolik yuz berdi. Keyinroq urinib ko'ring."
    });
  }
});

// Tezkor javob (notes, reminders uchun)
app.post("/ai/quick", rateLimit, async (req, res) => {
  const { prompt, context = "" } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: "Prompt bo'sh" });

  try {
    const content = context
      ? `${prompt.trim()}\n\nMa'lumot:\n${context.slice(0, 2000)}`
      : prompt.trim();

    const reply = await callGroq([{ role: "user", content }], 500);
    res.json({ reply, success: true });
  } catch (err) {
    console.error("[QUICK ERROR]", err.message);
    res.status(500).json({ error: err.message, reply: "Xatolik yuz berdi." });
  }
});

// Matn tahlili (notes uchun)
app.post("/ai/analyze", rateLimit, async (req, res) => {
  const { action, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Matn bo'sh" });

  const prompts = {
    summarize: `Quyidagi matnni 3-5 gapda xulosala (o'zbek tilida):\n\n${text}`,
    translate:  `Ingliz tiliga tarjima qil:\n\n${text}`,
    fix:        `Grammatika va uslub xatolarini tuzat:\n\n${text}`,
    expand:     `G'oyalarni kengaytir va batafsil tushuntir:\n\n${text}`,
    format:     `Sarlavhalar va ro'yxatlar bilan formatlat:\n\n${text}`,
    keywords:   `Asosiy kalit so'zlarni ro'yxat qilib ber:\n\n${text}`,
  };

  const prompt = prompts[action];
  if (!prompt) return res.status(400).json({ error: `Noma'lum action: ${action}` });

  try {
    const reply = await callGroq([{ role: "user", content: prompt }], 800);
    res.json({ reply, success: true });
  } catch (err) {
    console.error("[ANALYZE ERROR]", err.message);
    res.status(500).json({ error: err.message, reply: "Tahlil qilib bo'lmadi." });
  }
});

// Moliya tahlili
app.post("/ai/finance", rateLimit, async (req, res) => {
  const { transactions, question } = req.body;
  if (!transactions) return res.status(400).json({ error: "Tranzaksiyalar yo'q" });

  try {
    const prompt = `Moliya maslahatchi sifatida quyidagi tranzaksiyalarni tahlil qil.

Tranzaksiyalar:
${JSON.stringify(transactions).slice(0, 2000)}

Savol: ${question || "Moliyaviy holatni tahlil qil va 3 ta tejash bo'yicha maslahat ber."}

Qisqa va amaliy javob ber (o'zbek tilida).`;

    const reply = await callGroq([{ role: "user", content: prompt }], 600);
    res.json({ reply, success: true });
  } catch (err) {
    console.error("[FINANCE ERROR]", err.message);
    res.status(500).json({ error: err.message, reply: "Moliya tahlili qilib bo'lmadi." });
  }
});

// Kunlik reja
app.post("/ai/plan", rateLimit, async (req, res) => {
  const { tasks = [], goals = "", date = "bugun" } = req.body;

  try {
    const prompt = `Kunlik reja tuz.

Sana: ${date}
Maqsadlar: ${goals || "ko'rsatilmagan"}
Vazifalar: ${tasks.length ? JSON.stringify(tasks) : "yo'q"}

Quyidagilarni ber:
1. Top-3 muhim vazifa
2. Optimal ish tartibi
3. Qisqa motivatsion xabar

(O'zbek tilida, qisqa)`;

    const reply = await callGroq([{ role: "user", content: prompt }], 700);
    res.json({ reply, success: true });
  } catch (err) {
    console.error("[PLAN ERROR]", err.message);
    res.status(500).json({ error: err.message, reply: "Reja tuzib bo'lmadi." });
  }
});

// Kitob tahlili
app.post("/ai/book", rateLimit, async (req, res) => {
  const { title, author, note, action = "recommend" } = req.body;

  const prompts = {
    recommend: `Men "${title}" kabi kitoblarni yaxshi ko'raman. 3 ta o'xshash kitob tavsiya qil (nom, muallif, ta'rif).`,
    summarize: `"${title}" (${author}) kitobining asosiy g'oyalarini 5 nuqtada xulosala.`,
    note:      `Kitob: "${title}" — ${author}\nQayd: ${note}\n\nBu g'oyani kengaytir va amaliy misol kel.`,
  };

  const prompt = prompts[action];
  if (!prompt) return res.status(400).json({ error: "Noma'lum action" });

  try {
    const reply = await callGroq([{ role: "user", content: prompt }], 600);
    res.json({ reply, success: true });
  } catch (err) {
    console.error("[BOOK ERROR]", err.message);
    res.status(500).json({ error: err.message, reply: "Kitob tahlili qilib bo'lmadi." });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint topilmadi", path: req.path });
});

// Global xato
app.use((err, req, res, next) => {
  console.error("[GLOBAL ERROR]", err);
  res.status(500).json({ error: "Server ichki xatosi" });
});

// ─── START ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🧠 BrainOS AI Server ishga tushdi!");
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  ⚡ Model: ${GROQ_MODEL} (Groq)`);
  console.log("  📡 Endpoints:");
  console.log("     POST /chat         — AI suhbat");
  console.log("     POST /ai/quick     — Tezkor javob");
  console.log("     POST /ai/analyze   — Matn tahlili");
  console.log("     POST /ai/finance   — Moliya tahlili");
  console.log("     POST /ai/plan      — Reja generatsiya");
  console.log("     POST /ai/book      — Kitob tahlili");
  console.log("     GET  /health       — Server holati");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});