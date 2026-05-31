require("dotenv").config();

const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const Groq     = require("groq-sdk");
const supabase = require("./supabase");

const app  = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── MIDDLEWARE ───────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "..")));

// ─── GROQ CONFIG ──────────────────────────────
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `Sen BrainOS — aqlli shaxsiy AI yordamchisan.
Foydalanuvchi qaysi tilda yozsa, shu tilda javob ber.
Qisqa, aniq va foydali javob ber. Doim do'stona bo'l.
Kod yozganda markdown formatida yoz.
O'zingni "BrainOS AI" deb tanishtir.`;

async function askGroq(messages, maxTokens = 1024) {
  const res = await groq.chat.completions.create({
    model:       GROQ_MODEL,
    max_tokens:  maxTokens,
    temperature: 0.7,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ],
  });
  return res.choices[0].message.content;
}

// ─── RATE LIMITER ─────────────────────────────
const rateMap = new Map();
function rateLimit(req, res, next) {
  const ip  = req.ip || "unknown";
  const now = Date.now();
  const arr = (rateMap.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= 40) {
    return res.status(429).json({ error: "Juda ko'p so'rov. 1 daqiqa kuting.", reply: "Biroz kuting." });
  }
  arr.push(now);
  rateMap.set(ip, arr);
  next();
}

// ══════════════════════════════════════════════
//  STATIC PAGES
// ══════════════════════════════════════════════
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "..", "index.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "..", "dashboard.html")));
app.get("/chat-page", (req, res) => res.sendFile(path.join(__dirname, "..", "chat.html")));
app.get("/notes-page", (req, res) => res.sendFile(path.join(__dirname, "..", "notes.html")));
app.get("/plan-page", (req, res) => res.sendFile(path.join(__dirname, "..", "plan.html")));
app.get("/finance-page", (req, res) => res.sendFile(path.join(__dirname, "..", "finance.html")));
app.get("/reading-page", (req, res) => res.sendFile(path.join(__dirname, "..", "reading.html")));
app.get("/reminders-page", (req, res) => res.sendFile(path.join(__dirname, "..", "reminders.html")));
app.get("/auth-page", (req, res) => res.sendFile(path.join(__dirname, "..", "auth.html")));
app.get("/business", (req, res) => res.sendFile(path.join(__dirname, "..", "business-dashboard.html")));

// ══════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════

// Ro'yxatdan o'tish
app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password, userType = "personal", company } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: "Barcha maydonlarni to'ldiring" });

    if (password.length < 8)
      return res.status(400).json({ success: false, message: "Parol kamida 8 ta belgi bo'lsin" });

    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, userType, company: company || null } }
    });

    if (error)
      return res.status(400).json({ success: false, message: error.message });

    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id, name, email,
        user_type: userType, company: company || null,
      });
    }

    res.json({
      success:  true,
      message:  "Hisob yaratildi!",
      userType,
      userId:   data.user?.id,
      token:    data.session?.access_token || null,
    });

  } catch (err) {
    console.error("[REGISTER]", err.message);
    res.status(500).json({ success: false, message: "Server xatoligi" });
  }
});

// Kirish
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email va parol kiriting" });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error)
      return res.status(401).json({ success: false, message: "Email yoki parol noto'g'ri" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, user_type, company")
      .eq("id", data.user.id)
      .single();

    res.json({
      success:  true,
      message:  "Muvaffaqiyatli kirildi!",
      token:    data.session.access_token,
      userId:   data.user.id,
      email:    data.user.email,
      name:     profile?.name || email,
      userType: profile?.user_type || "personal",
      company:  profile?.company || null,
    });

  } catch (err) {
    console.error("[LOGIN]", err.message);
    res.status(500).json({ success: false, message: "Server xatoligi" });
  }
});

// Eski login (orqaga mos kelish uchun)
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email va parol kiriting" });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ success: false, message: error.message });
  res.json({ message: "Xush kelibsiz!", userId: data.user.id, email: data.user.email, token: data.session.access_token });
});

// Eski signup
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email va password kiriting" });
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "Hisob yaratildi! Emailni tasdiqlang." });
});

// Chiqish
app.post("/auth/logout", async (req, res) => {
  await supabase.auth.signOut();
  res.json({ success: true, message: "Chiqildi" });
});

// ══════════════════════════════════════════════
//  CHAT
// ══════════════════════════════════════════════

async function getHistory(userId) {
  const { data } = await supabase
    .from("conversations")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(20);
  return data || [];
}

async function saveMessage(userId, role, content) {
  await supabase.from("conversations").insert({ user_id: userId, role, content });
}

// STREAMING CHAT
app.post("/chat/stream", rateLimit, async (req, res) => {
  const { message, history = [], userId } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Xabar bo'sh" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const messages = [
      ...history.slice(-10).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 2000),
      })),
      { role: "user", content: message.trim() },
    ];

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2048,
      temperature: 0.7,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
    });

    let fullReply = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullReply += delta;
        res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
      }
    }

    // Supabase ga saqlash
    if (userId && userId !== "guest") {
      await saveMessage(userId, "user", message.trim());
      await saveMessage(userId, "assistant", fullReply);
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (err) {
    console.error("[STREAM ERROR]", err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

app.post("/chat", rateLimit, async (req, res) => {
  try {
    const { message, text, history = [], userId } = req.body;
    const userMsg = (message || text || "").trim();

    if (!userMsg)
      return res.status(400).json({ error: "Xabar bo'sh", reply: "Xabar kiriting" });

    const sessionId = userId || "guest";
    let dbHistory   = [];

    if (userId && userId !== "guest") {
      dbHistory = await getHistory(sessionId);
      await saveMessage(sessionId, "user", userMsg);
    }

    const messages = [
      ...dbHistory.slice(-10),
      ...history.slice(-10).map(m => ({
        role:    m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 2000),
      })),
      { role: "user", content: userMsg },
    ].slice(-20);

    const reply = await askGroq(messages);

    if (userId && userId !== "guest") {
      await saveMessage(sessionId, "assistant", reply);
    }

    res.json({ reply, success: true });

  } catch (err) {
    console.error("[CHAT]", err.message);
    res.status(500).json({ error: err.message, reply: "AI javob bera olmadi. Keyinroq urinib ko'ring." });
  }
});

// Suhbatni tozalash
app.post("/clear", async (req, res) => {
  try {
    const sessionId = req.body.userId || "guest";
    await supabase.from("conversations").delete().eq("user_id", sessionId);
    res.json({ success: true, message: "Suhbat tozalandi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Tozalashda xato" });
  }
});

// ══════════════════════════════════════════════
//  NOTES
// ══════════════════════════════════════════════

// Qaydlarni olish
app.get("/notes", async (req, res) => {
  try {
    const userId   = req.query.userId || "guest";
    const category = req.query.category;

    let query = supabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (category && category !== "all") query = query.eq("category", category);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data: data || [] });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Qayd yaratish
app.post("/notes", async (req, res) => {
  try {
    const { userId, title, content, category = "general", pinned = false } = req.body;
    if (!title || !content)
      return res.status(400).json({ error: "Sarlavha va matn kiriting" });

    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: userId || "guest", title, content, category, pinned })
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Qaydni yangilash
app.put("/notes/:id", async (req, res) => {
  try {
    const { title, content, category, pinned } = req.body;
    const { data, error } = await supabase
      .from("notes")
      .update({ title, content, category, pinned })
      .eq("id", req.params.id)
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Qaydni o'chirish
app.delete("/notes/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("notes").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: "Qayd o'chirildi" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Notes AI tahlil
app.post("/notes/analyze", rateLimit, async (req, res) => {
  try {
    const { content, action = "summarize" } = req.body;
    if (!content) return res.status(400).json({ error: "Matn kiriting" });

    const prompts = {
      summarize: `Quyidagi matnni 3-5 gapda xulosala:\n\n${content}`,
      fix:       `Grammatika xatolarini tuzat:\n\n${content}`,
      expand:    `G'oyalarni kengaytir:\n\n${content}`,
      translate: `Ingliz tiliga tarjima qil:\n\n${content}`,
      format:    `Sarlavhalar va ro'yxatlar bilan formatlat:\n\n${content}`,
    };

    const reply = await askGroq([{ role: "user", content: prompts[action] || prompts.summarize }], 512);
    res.json({ success: true, reply });

  } catch (err) {
    res.status(500).json({ error: err.message, reply: "AI tahlil qila olmadi" });
  }
});

// ══════════════════════════════════════════════
//  AI ENDPOINTS
// ══════════════════════════════════════════════

// Tezkor javob
app.post("/ai/quick", rateLimit, async (req, res) => {
  try {
    const { prompt, context = "" } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: "Prompt bo'sh" });
    const content = context ? `${prompt}\n\nMa'lumot:\n${context.slice(0, 2000)}` : prompt;
    const reply   = await askGroq([{ role: "user", content }], 500);
    res.json({ reply, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message, reply: "Xatolik yuz berdi." });
  }
});

// Matn tahlili
app.post("/ai/analyze", rateLimit, async (req, res) => {
  try {
    const { action, text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "Matn bo'sh" });

    const prompts = {
      summarize: `Xulosala (o'zbek tilida):\n\n${text}`,
      translate: `Ingliz tiliga tarjima:\n\n${text}`,
      fix:       `Xatolarni tuzat:\n\n${text}`,
      expand:    `Kengaytir:\n\n${text}`,
      format:    `Formatlat:\n\n${text}`,
    };

    const reply = await askGroq([{ role: "user", content: prompts[action] || text }], 800);
    res.json({ reply, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message, reply: "Tahlil qilib bo'lmadi." });
  }
});

// Moliya tahlili
app.post("/ai/finance", rateLimit, async (req, res) => {
  try {
    const { transactions, question } = req.body;
    if (!transactions) return res.status(400).json({ error: "Ma'lumot yo'q" });

    const prompt = `Moliya maslahatchi sifatida tahlil qil.\n\nTranzaksiyalar:\n${JSON.stringify(transactions).slice(0, 2000)}\n\nSavol: ${question || "3 ta tejash maslahat ber."}`;
    const reply  = await askGroq([{ role: "user", content: prompt }], 600);
    res.json({ reply, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message, reply: "Moliya tahlili qilib bo'lmadi." });
  }
});

// Kunlik reja
app.post("/ai/plan", rateLimit, async (req, res) => {
  try {
    const { tasks = [], goals = "", date = "bugun" } = req.body;
    const prompt = `Kunlik reja tuz.\nSana: ${date}\nMaqsadlar: ${goals}\nVazifalar: ${JSON.stringify(tasks)}\n\nTop-3 vazifa, optimal tartib va motivatsion xabar ber. (O'zbek tilida)`;
    const reply  = await askGroq([{ role: "user", content: prompt }], 700);
    res.json({ reply, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message, reply: "Reja tuzib bo'lmadi." });
  }
});

// ══════════════════════════════════════════════
//  HEALTH CHECK
// ══════════════════════════════════════════════
app.get("/health", (req, res) => {
  res.json({
    status:   "ok",
    service:  "BrainOS Server",
    model:    GROQ_MODEL,
    provider: "Groq",
    time:     new Date().toISOString(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Topilmadi", path: req.path });
});

// Global xato
app.use((err, req, res, next) => {
  console.error("[ERROR]", err);
  res.status(500).json({ error: "Server ichki xatosi" });
});

// ─── START ────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🧠 BrainOS Server ishga tushdi!");
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  ⚡ Groq: ${GROQ_MODEL}`);
  console.log("  ✅ Endpoints:");
  console.log("     Auth:    /auth/register  /auth/login");
  console.log("     Chat:    /chat  /clear");
  console.log("     Notes:   /notes  (GET/POST/PUT/DELETE)");
  console.log("     AI:      /ai/quick  /ai/analyze  /ai/finance  /ai/plan");
  console.log("     Health:  /health");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});