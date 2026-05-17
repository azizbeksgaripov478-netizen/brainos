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

// ==========================
// USER SESSION
// ==========================

let currentUserId =
localStorage.getItem("userId") || "guest";

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

    const email =
    emailInput.value.trim();

    const password =
    passwordInput.value.trim();

    if (!email || !password) {

        showNotif(
            "Email va password kiriting ⚠️",
            "warn"
        );

        return;

    }

    try {

        const response =
        await fetch(`${API_URL}/signup`, {

            method: "POST",

            headers: {
                "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
                email,
                password
            }),

        });

        const data =
        await response.text();

        showNotif(
            data,
            response.ok
            ? "success"
            : "error"
        );

    } catch {

        showNotif(
            "Server bilan bog'lanib bo'lmadi ❌",
            "error"
        );

    }

});

// ==========================
// LOGIN
// ==========================

loginBtn?.addEventListener("click", async () => {

    const email =
    emailInput.value.trim();

    const password =
    passwordInput.value.trim();

    if (!email || !password) {

        showNotif(
            "Email va password kiriting ⚠️",
            "warn"
        );

        return;

    }

    try {

        const response =
        await fetch(`${API_URL}/login`, {

            method: "POST",

            headers: {
                "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
                email,
                password
            }),

        });

        const text =
        await response.text();

        if (response.ok) {

            const data =
            JSON.parse(text);

            currentUserId =
            data.userId;

            localStorage.setItem(
                "userId",
                currentUserId
            );

            showNotif(
                "Xush kelibsiz ✅",
                "success"
            );

            document.querySelector(".auth").style.display =
            "none";

        } else {

            showNotif(text, "error");

        }

    } catch {

        showNotif(
            "Server bilan bog'lanib bo'lmadi ❌",
            "error"
        );

    }

});

// ==========================
// SEND MESSAGE
// ==========================

async function sendMessage() {

    const userText =
    input.value.trim();

    if (userText === "") return;

    addMessage(userText, "user");

    input.value = "";

    scrollBottom();

    const loadingEl =
    addMessage(
        "AI yozmoqda...",
        "bot loading"
    );

    try {

        const response =
        await fetch(`${API_URL}/chat`, {

            method: "POST",

            headers: {
                "Content-Type":
                "application/json"
            },

            body: JSON.stringify({

                text: userText,

                userId: currentUserId

            }),

        });

        const data =
        await response.text();

        loadingEl.remove();

        addBotMessage(data);

    } catch {

        loadingEl.remove();

        addMessage(
            "Server bilan bog'lanib bo'lmadi ❌",
            "bot"
        );

    }

}

button?.addEventListener(
    "click",
    sendMessage
);

input?.addEventListener(
    "keypress",
    (e) => {

        if (e.key === "Enter") {

            sendMessage();

        }

    }
);

// ==========================
// ADD MESSAGE
// ==========================

function addMessage(text, type) {

    const div =
    document.createElement("div");

    div.classList.add("message");

    type.split(" ").forEach(c =>
        div.classList.add(c)
    );

    div.textContent = text;

    chatBox.appendChild(div);

    scrollBottom();

    return div;

}

// ==========================
// BOT MESSAGE
// ==========================

function addBotMessage(text) {

    const wrapper =
    document.createElement("div");

    wrapper.classList.add(
        "bot-wrapper"
    );

    const botMsg =
    document.createElement("div");

    botMsg.classList.add(
        "message",
        "bot"
    );

    const actions =
    document.createElement("div");

    actions.classList.add(
        "actions"
    );

    actions.innerHTML = `
        <button class="copy-btn">📋</button>
        <button class="speak-btn">🔊</button>
        <button class="like-btn">👍</button>
        <button class="dislike-btn">👎</button>
    `;

    wrapper.appendChild(botMsg);

    wrapper.appendChild(actions);

    chatBox.appendChild(wrapper);

    let index = 0;

    const typing =
    setInterval(() => {

        botMsg.textContent +=
        text.charAt(index);

        index++;

        scrollBottom();

        if (index >= text.length) {

            clearInterval(typing);

        }

    }, 15);

    // COPY

    actions.querySelector(
        ".copy-btn"
    ).addEventListener(
        "click",
        () => {

            navigator.clipboard
            .writeText(text);

            showNotif(
                "Nusxa olindi ✅",
                "success"
            );

        }
    );

    // SPEAK

    actions.querySelector(
        ".speak-btn"
    ).addEventListener(
        "click",
        () => {

            const speech =
            new SpeechSynthesisUtterance(text);

            speech.lang = "uz-UZ";

            speech.rate = 1;

            speechSynthesis.speak(speech);

        }
    );

}

// ==========================
// CLEAR CHAT
// ==========================

clear?.addEventListener(
    "click",
    async () => {

        chatBox.innerHTML = `
        <div class="message bot">
            Yangi suhbat boshlandi 👋
        </div>
        `;

        try {

            await fetch(
                `${API_URL}/clear`,
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                        "application/json"
                    },

                    body: JSON.stringify({
                        userId:
                        currentUserId
                    }),

                }
            );

        } catch {}

    }
);

// ==========================
// THEME TOGGLE
// ==========================

themeToggle?.addEventListener(
    "click",
    () => {

        document.body.classList.toggle(
            "light-mode"
        );

        if (
            document.body.classList.contains(
                "light-mode"
            )
        ) {

            localStorage.setItem(
                "theme",
                "light"
            );

            themeToggle.innerHTML =
            "☀️";

        } else {

            localStorage.setItem(
                "theme",
                "dark"
            );

            themeToggle.innerHTML =
            "🌙";

        }

    }
);

// ==========================
// NOTIFICATION
// ==========================

function showNotif(
    msg,
    type = "success"
) {

    const notif =
    document.createElement("div");

    notif.textContent = msg;

    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #111;
        color: white;
        padding: 12px 18px;
        border-radius: 10px;
        z-index: 9999;
        font-size: 14px;
    `;

    document.body.appendChild(
        notif
    );

    setTimeout(() => {

        notif.remove();

    }, 3000);

}

// ==========================
// AUTO SCROLL
// ==========================

function scrollBottom() {

    chatBox.scrollTop =
    chatBox.scrollHeight;

}