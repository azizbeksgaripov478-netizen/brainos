const API_URL = "https://brainos-production.up.railway.app";

const input = document.getElementById("input");
const button = document.getElementById("button");
const clear = document.getElementById("clear");
const chatBox = document.getElementById("chat-box");
const themeToggle = document.getElementById("theme-toggle");

// AUTH
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signupBtn = document.getElementById("signup");
const loginBtn = document.getElementById("login");

// NOTES
const noteTitle = document.getElementById("note-title");
const noteContent = document.getElementById("note-content");
const noteCategory = document.getElementById("note-category");
const noteSave = document.getElementById("note-save");
const noteAnalyze = document.getElementById("note-ai-analyze");
const notesList = document.getElementById("notes-list");
const noteAiResult = document.getElementById("note-ai-result");
const noteAiText = document.getElementById("note-ai-text");

// ==========================
// USER SESSION
// ==========================

let currentUserId = localStorage.getItem("userId") || "guest";

// ==========================
// LOAD THEME
// ==========================

if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
    themeToggle.innerHTML = "☀️";
}

// ==========================
// SIGN UP
// ==========================

signupBtn?.addEventListener("click", async () => {

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showNotif("Email va password kiriting ⚠️", "warn");
        return;
    }

    signupBtn.disabled = true;
    signupBtn.textContent = "Yuklanmoqda...";

    try {
        const response = await fetch(`${API_URL}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.text();
        showNotif(data, response.ok ? "success" : "error");

    } catch {
        showNotif("Server bilan bog'lanib bo'lmadi ❌", "error");
    } finally {
        signupBtn.disabled = false;
        signupBtn.textContent = "Ro'yxatdan o'tish";
    }
});

// ==========================
// LOGIN
// ==========================

loginBtn?.addEventListener("click", async () => {

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showNotif("Email va password kiriting ⚠️", "warn");
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Kirish...";

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const text = await response.text();

        if (response.ok) {
            const data = JSON.parse(text);
            currentUserId = data.userId;
            localStorage.setItem("userId", currentUserId);
            showNotif("Xush kelibsiz! " + data.email + " ✅", "success");
            document.querySelector(".auth").style.display = "none";
            loadNotes();
        } else {
            showNotif(text, "error");
        }

    } catch {
        showNotif("Server bilan bog'lanib bo'lmadi ❌", "error");
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Kirish";
    }
});

// ==========================
// SEND MESSAGE
// ==========================

async function sendMessage() {

    const userText = input.value.trim();
    if (userText === "") return;

    addMessage(userText, "user");
    input.value = "";
    scrollBottom();

    const loadingEl = addMessage("AI yozmoqda...", "bot loading");

    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: userText, userId: currentUserId }),
        });

        const data = await response.text();
        loadingEl.remove();
        addBotMessage(data);

    } catch {
        loadingEl.remove();
        addMessage("Server bilan bog'lanib bo'lmadi ❌", "bot");
    }
}

button?.addEventListener("click", sendMessage);
input?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});

// ==========================
// ADD MESSAGE
// ==========================

function addMessage(text, type) {
    const div = document.createElement("div");
    div.classList.add("message");
    type.split(" ").forEach(c => div.classList.add(c));
    div.textContent = text;
    chatBox.appendChild(div);
    scrollBottom();
    return div;
}

// ==========================
// BOT MESSAGE
// ==========================

function addBotMessage(text) {

    const wrapper = document.createElement("div");
    wrapper.classList.add("bot-wrapper");

    const botMsg = document.createElement("div");
    botMsg.classList.add("message", "bot");

    const actions = document.createElement("div");
    actions.classList.add("actions");
    actions.innerHTML = `
        <button class="action-btn copy-btn">📋</button>
        <button class="action-btn speak-btn">🔊</button>
        <button class="action-btn like-btn">👍</button>
        <button class="action-btn dislike-btn">👎</button>
    `;

    wrapper.appendChild(botMsg);
    wrapper.appendChild(actions);
    chatBox.appendChild(wrapper);

    let index = 0;
    const typing = setInterval(() => {
        botMsg.textContent += text.charAt(index);
        index++;
        scrollBottom();
        if (index >= text.length) clearInterval(typing);
    }, 15);

    actions.querySelector(".copy-btn").addEventListener("click", () => {
        navigator.clipboard.writeText(text);
        showNotif("Nusxa olindi ✅", "success");
    });

    actions.querySelector(".speak-btn").addEventListener("click", () => {
        const speech = new SpeechSynthesisUtterance(text);
        speech.lang = "uz-UZ";
        speechSynthesis.speak(speech);
    });

    actions.querySelector(".like-btn").addEventListener("click", (e) => {
        e.target.style.color = "cyan";
    });

    actions.querySelector(".dislike-btn").addEventListener("click", (e) => {
        e.target.style.color = "red";
    });
}

// ==========================
// CLEAR CHAT
// ==========================

clear?.addEventListener("click", async () => {
    chatBox.innerHTML = `<div class="message bot">Yangi suhbat boshlandi 👋 Nima haqida gaplashamiz?</div>`;
    try {
        await fetch(`${API_URL}/clear`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: currentUserId }),
        });
    } catch {}
});

// ==========================
// THEME TOGGLE
// ==========================

themeToggle?.addEventListener("click", () => {
    document.body.classList.toggle("light-mode");
    if (document.body.classList.contains("light-mode")) {
        localStorage.setItem("theme", "light");
        themeToggle.innerHTML = "☀️";
    } else {
        localStorage.setItem("theme", "dark");
        themeToggle.innerHTML = "🌙";
    }
});

// ==========================
// NOTES — YUKLASH
// ==========================

async function loadNotes() {
    if (!notesList) return;

    try {
        const res = await fetch(`${API_URL}/notes?userId=${currentUserId}`);
        const notes = await res.json();
        renderNotes(notes);
    } catch (e) {
        console.log("Notes yuklanmadi:", e);
    }
}

// ==========================
// NOTES — CHIZISH
// ==========================

function renderNotes(notes) {
    if (!notesList) return;

    if (!notes || notes.length === 0) {
        notesList.innerHTML = `
            <div class="notes-empty">
                <span>📝</span>
                <p>Hozircha notes yo'q. Birinchi yozuvingizni qo'shing!</p>
            </div>`;
        return;
    }

    const categoryLabels = {
        general: "📌 Umumiy",
        work: "💼 Ish",
        study: "📚 O'qish",
        personal: "👤 Shaxsiy",
        idea: "💡 G'oya"
    };

    notesList.innerHTML = notes.map(note => `
        <div class="note-card" data-category="${note.category}" data-id="${note.id}">
            <div class="note-card-header">
                <div class="note-card-title">${note.title}</div>
                <button class="note-card-delete" onclick="deleteNote('${note.id}')">🗑️</button>
            </div>
            <div class="note-card-content">${note.content}</div>
            <div class="note-card-footer">
                <span class="note-card-category">${categoryLabels[note.category] || "📌 Umumiy"}</span>
                <span class="note-card-date">${new Date(note.created_at).toLocaleDateString('uz-UZ')}</span>
            </div>
        </div>
    `).join("");
}

// ==========================
// NOTES — SAQLASH
// ==========================

noteSave?.addEventListener("click", async () => {

    const title = noteTitle.value.trim();
    const content = noteContent.value.trim();
    const category = noteCategory.value;

    if (!title || !content) {
        showNotif("Sarlavha va matn kiriting ⚠️", "warn");
        return;
    }

    noteSave.disabled = true;
    noteSave.textContent = "Saqlanmoqda...";

    try {
        const res = await fetch(`${API_URL}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: currentUserId, title, content, category }),
        });

        if (res.ok) {
            showNotif("Note saqlandi ✅", "success");
            noteTitle.value = "";
            noteContent.value = "";
            noteCategory.value = "general";
            await loadNotes();
        } else {
            showNotif("Saqlashda xato ❌", "error");
        }

    } catch {
        showNotif("Server bilan bog'lanib bo'lmadi ❌", "error");
    } finally {
        noteSave.disabled = false;
        noteSave.textContent = "💾 Saqlash";
    }
});

// ==========================
// NOTES — AI TAHLIL
// ==========================

noteAnalyze?.addEventListener("click", async () => {

    const content = noteContent.value.trim();

    if (!content) {
        showNotif("Avval matn kiriting ⚠️", "warn");
        return;
    }

    noteAnalyze.disabled = true;
    noteAnalyze.textContent = "Tahlil qilinmoqda...";

    try {
        const res = await fetch(`${API_URL}/notes/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, userId: currentUserId }),
        });

        const text = await res.text();
        noteAiText.textContent = text;
        noteAiResult.style.display = "block";
        noteAiResult.scrollIntoView({ behavior: "smooth", block: "nearest" });

    } catch {
        showNotif("AI tahlil qila olmadi ❌", "error");
    } finally {
        noteAnalyze.disabled = false;
        noteAnalyze.textContent = "🤖 AI Tahlil";
    }
});

// ==========================
// NOTES — O'CHIRISH
// ==========================

async function deleteNote(id) {
    if (!confirm("Ushbu noteni o'chirasizmi?")) return;

    try {
        const res = await fetch(`${API_URL}/notes/${id}`, {
            method: "DELETE",
        });

        if (res.ok) {
            showNotif("Note o'chirildi ✅", "success");
            await loadNotes();
        } else {
            showNotif("O'chirishda xato ❌", "error");
        }
    } catch {
        showNotif("Server bilan bog'lanib bo'lmadi ❌", "error");
    }
}

// ==========================
// NOTIFICATION
// ==========================

function showNotif(msg, type = "success") {
    const notif = document.createElement("div");
    notif.textContent = msg;
    notif.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 14px 20px;
        border-radius: 10px;
        font-size: 15px;
        z-index: 9999;
        animation: fadeIn 0.3s ease;
        max-width: 300px;
        background: ${type === "success" ? "#00c853" : type === "warn" ? "#ff6f00" : "#d32f2f"};
        color: white;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

// ==========================
// AUTO SCROLL
// ==========================

function scrollBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ==========================
// SAHIFA YUKLANGANDA
// ==========================

loadNotes();