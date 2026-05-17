require("dotenv").config();

const http = require("http");
const fs = require("fs");
const Groq = require("groq-sdk");
const supabase = require("./supabase");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// ==========================
// HELPER: Body parser
// ==========================

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", chunk => { body += chunk.toString(); });
        req.on("end", () => {
            try { resolve(JSON.parse(body)); }
            catch { reject(new Error("Invalid JSON")); }
        });
    });
}

// ==========================
// CONVERSATION HELPERS
// ==========================

async function getHistory(userId) {
    const { data, error } = await supabase
        .from("conversations")
        .select("role, content")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(20);
    if (error) return [];
    return data || [];
}

async function saveMessage(userId, role, content) {
    await supabase.from("conversations").insert({ user_id: userId, role, content });
}

// ==========================
// SERVER
// ==========================

const server = http.createServer(async (req, res) => {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const respond = (status, data, isJson = false) => {
        res.writeHead(status, {
            "Content-Type": isJson
                ? "application/json; charset=utf-8"
                : "text/plain; charset=utf-8"
        });
        res.end(isJson ? JSON.stringify(data) : data);
    };

    // ==========================
    // STATIC FILES
    // ==========================

    if (req.url === "/" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync("index.html"));
    }

    else if (req.url === "/style.css") {
        res.writeHead(200, { "Content-Type": "text/css" });
        res.end(fs.readFileSync("style.css"));
    }

    else if (req.url === "/script.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(fs.readFileSync("script.js"));
    }

    // ==========================
    // SIGNUP
    // ==========================

    else if (req.url === "/signup" && req.method === "POST") {
        try {
            const { email, password } = await parseBody(req);

            if (!email || !password) return respond(400, "Email va password kiriting ⚠️");
            if (password.length < 6) return respond(400, "Password kamida 6 ta belgi bo'lsin ⚠️");

            const { error } = await supabase.auth.signUp({ email, password });

            if (error) return respond(400, "Xato: " + error.message + " ❌");
            respond(200, "Account yaratildi! Emailni tasdiqlang ✅");

        } catch { respond(500, "Server xato ❌"); }
    }

    // ==========================
    // LOGIN
    // ==========================

    else if (req.url === "/login" && req.method === "POST") {
        try {
            const { email, password } = await parseBody(req);

            if (!email || !password) return respond(400, "Email va password kiriting ⚠️");

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) return respond(400, "Xato: " + error.message + " ❌");
            respond(200, { message: "Xush kelibsiz! ✅", userId: data.user.id, email: data.user.email }, true);

        } catch { respond(500, "Server xato ❌"); }
    }

    // ==========================
    // CHAT
    // ==========================

    else if (req.url === "/chat" && req.method === "POST") {
        try {
            const { text, userId } = await parseBody(req);

            if (!text) return respond(400, "Xabar bo'sh ⚠️");

            const sessionId = userId || "guest";
            const history = await getHistory(sessionId);
            await saveMessage(sessionId, "user", text);

            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `Sen BrainOS nomli aqlli AI yordamchisan. 
                        Doim o'zbek tilida professional va foydali javob ber. 
                        Qisqa va aniq bo'l. Foydalanuvchiga "siz" deb murojaat qil.
                        Oldingi suhbatlarni eslab qol.`
                    },
                    ...history,
                    { role: "user", content: text }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 1024,
                temperature: 0.7,
            });

            const reply = completion.choices[0].message.content;
            await saveMessage(sessionId, "assistant", reply);
            respond(200, reply);

        } catch (e) {
            console.log("Chat xato:", e.message);
            respond(500, "AI javob bera olmadi ❌");
        }
    }

    // ==========================
    // CLEAR CHAT
    // ==========================

    else if (req.url === "/clear" && req.method === "POST") {
        try {
            const { userId } = await parseBody(req);
            const sessionId = userId || "guest";

            const { error } = await supabase
                .from("conversations")
                .delete()
                .eq("user_id", sessionId);

            if (error) return respond(500, "O'chirish xato ❌");
            respond(200, "Suhbat tozalandi ✅");

        } catch { respond(500, "Xato ❌"); }
    }

    // ==========================
    // NOTES — OLISH
    // ==========================

    else if (req.url.startsWith("/notes") && req.method === "GET") {
        try {
            const userId = req.url.split("?userId=")[1] || "guest";

            const { data, error } = await supabase
                .from("notes")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false });

            if (error) return respond(500, "Noteslarni olishda xato ❌");
            respond(200, data, true);

        } catch { respond(500, "Xato ❌"); }
    }

    // ==========================
    // NOTES — YARATISH
    // ==========================

    else if (req.url === "/notes" && req.method === "POST") {
        try {
            const { userId, title, content, category } = await parseBody(req);

            if (!title || !content) return respond(400, "Sarlavha va matn kiriting ⚠️");

            const { data, error } = await supabase
                .from("notes")
                .insert({
                    user_id: userId || "guest",
                    title,
                    content,
                    category: category || "general"
                })
                .select()
                .single();

            if (error) return respond(500, "Saqlashda xato ❌");
            respond(200, data, true);

        } catch { respond(500, "Xato ❌"); }
    }

    // ==========================
    // NOTES — O'CHIRISH
    // ==========================

    else if (req.url.startsWith("/notes/") && req.method === "DELETE") {
        try {
            const noteId = req.url.split("/notes/")[1];

            const { error } = await supabase
                .from("notes")
                .delete()
                .eq("id", noteId);

            if (error) return respond(500, "O'chirishda xato ❌");
            respond(200, "Note o'chirildi ✅");

        } catch { respond(500, "Xato ❌"); }
    }

    // ==========================
    // NOTES — AI TAHLIL
    // ==========================

    else if (req.url === "/notes/analyze" && req.method === "POST") {
        try {
            const { content, userId } = await parseBody(req);

            if (!content) return respond(400, "Matn kiriting ⚠️");

            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "Sen aqlli AI yordamchisan. Foydalanuvchining yozuvini tahlil qilib, qisqa xulosa va tavsiyalar ber. O'zbek tilida javob ber."
                    },
                    {
                        role: "user",
                        content: "Shu yozuvni tahlil qil: " + content
                    }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 512,
            });

            const reply = completion.choices[0].message.content;
            respond(200, reply);

        } catch { respond(500, "AI tahlil qila olmadi ❌"); }
    }

    // 404
    else {
        respond(404, "404 Not Found");
    }

});

server.listen(3000, () => {
    console.log("BrainOS SERVER ISHLADI 🚀 → http://localhost:3000");
});