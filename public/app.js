const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const select = document.querySelector("#industry-select");
const title = document.querySelector("#desk-title");
const button = document.querySelector("#send-button");
const voiceButton = document.querySelector("#voice-input");
const readAloud = document.querySelector("#read-aloud");
const chatStatus = document.querySelector("#chat-status");
const starterPrompts = document.querySelector("#starter-prompts");
const promptList = document.querySelector("#prompt-list");
const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authMode = document.querySelector("#auth-mode");
const authSubmit = document.querySelector("#auth-submit");
const authError = document.querySelector("#auth-error");
const logoutButton = document.querySelector("#logout-button");
let isRegistering = false;
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

const labels = {
  school: "School support",
  clinic: "Clinic support",
  retail: "Retail support",
  restaurant: "Restaurant support",
};

const prompts = {
  school: [
    "How do I pay fees?",
    "What are the school hours?",
    "How do I apply?",
  ],
  clinic: [
    "How do I book an appointment?",
    "What are your hours?",
    "What services do you offer?",
  ],
  retail: [
    "How can I track my order?",
    "What is your return policy?",
    "What payment methods do you accept?",
  ],
  restaurant: [
    "What time do you open?",
    "Do you offer delivery?",
    "Can I book a table?",
  ],
};

function renderPrompts(industry) {
  promptList.replaceChildren();
  for (const prompt of prompts[industry]) {
    const promptButton = document.createElement("button");
    promptButton.type = "button";
    promptButton.className = "prompt-chip";
    promptButton.textContent = prompt;
    promptButton.addEventListener("click", () => {
      input.value = prompt;
      input.focus();
    });
    promptList.append(promptButton);
  }
}

function addMessage(text, role) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  const avatar =
    role === "user"
      ? `<span class="avatar user-avatar">↗</span>`
      : `<img class="avatar-logo" src="/chatbot-mark.svg" alt="" />`;
  wrapper.innerHTML = `${avatar}<div class="bubble"><p></p><time>${role === "user" ? "Just now" : "Prototype reply"}</time></div>`;
  wrapper.querySelector("p").textContent = text;
  messages.append(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function setAuthenticated(token) {
  localStorage.setItem("chatdesk_token", token);
  authPanel.hidden = true;
}

function token() {
  return localStorage.getItem("chatdesk_token");
}

function setVoiceStatus(message) {
  chatStatus.textContent = message;
}

function addTypingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant typing-message";
  wrapper.innerHTML = `<img class="avatar-logo" src="/chatbot-mark.svg" alt="" /><div class="bubble"><span class="typing-dots" role="status" aria-label="Preparing a reply"><i></i><i></i><i></i></span></div>`;
  messages.append(wrapper);
  messages.scrollTop = messages.scrollHeight;
  return wrapper;
}

function addRetryMessage(message, originalQuestion) {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant error-message";
  wrapper.innerHTML = `<img class="avatar-logo" src="/chatbot-mark.svg" alt="" /><div class="bubble"><p></p><button class="retry-button" type="button">Try again</button></div>`;
  wrapper.querySelector("p").textContent = message;
  wrapper.querySelector("button").addEventListener("click", () => {
    wrapper.remove();
    sendMessage(originalQuestion, false);
  });
  messages.append(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.addEventListener("start", () => {
    voiceButton.setAttribute("aria-pressed", "true");
    voiceButton.setAttribute("aria-label", "Stop voice input");
    voiceButton.title = "Stop voice input";
    voiceButton.querySelector("span").textContent = "Stop";
    setVoiceStatus("Listening. Speak now, then review your draft.");
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript.trim();
    if (!transcript) return;
    input.value = [input.value.trim(), transcript].filter(Boolean).join(" ");
    input.focus();
    setVoiceStatus("Voice draft ready. Review it before sending.");
  });

  recognition.addEventListener("error", (event) => {
    setVoiceStatus(
      event.error === "not-allowed"
        ? "Microphone access is blocked. Allow it in your browser settings."
        : "Voice input stopped. You can type your message instead.",
    );
  });

  recognition.addEventListener("end", () => {
    voiceButton.setAttribute("aria-pressed", "false");
    voiceButton.setAttribute("aria-label", "Start voice input");
    voiceButton.title = "Start voice input";
    voiceButton.querySelector("span").textContent = "Dictate";
  });

  voiceButton.addEventListener("click", () => {
    if (voiceButton.getAttribute("aria-pressed") === "true") {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch {
      setVoiceStatus("Voice input is already active. Try again in a moment.");
    }
  });
} else {
  voiceButton.disabled = true;
  voiceButton.title = "Voice input is not supported in this browser";
  voiceButton.setAttribute("aria-label", voiceButton.title);
}

readAloud.addEventListener("change", () => {
  if (!readAloud.checked && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

function speakReply(text) {
  if (!readAloud.checked || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = navigator.language || "en-US";
  window.speechSynthesis.speak(utterance);
}

authMode.addEventListener("click", () => {
  isRegistering = !isRegistering;
  document.querySelector("#auth-title").textContent = isRegistering
    ? "Create your account."
    : "Sign in to chat.";
  authSubmit.querySelector("span").textContent = isRegistering
    ? "Register"
    : "Sign in";
  authMode.textContent = isRegistering
    ? "Already have an account? Sign in"
    : "Create a new account";
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  authSubmit.disabled = true;
  try {
    const response = await fetch(
      `/api/auth/${isRegistering ? "register" : "login"}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.querySelector("#auth-email").value,
          password: document.querySelector("#auth-password").value,
        }),
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Authentication failed");
    setAuthenticated(result.token);
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem("chatdesk_token");
  authPanel.hidden = false;
});

if (token()) authPanel.hidden = true;

renderPrompts(select.value);

select.addEventListener("change", () => {
  title.textContent = labels[select.value];
  renderPrompts(select.value);
  addMessage(
    `You are now chatting with ${labels[select.value].toLowerCase()}.`,
    "assistant",
  );
});

async function sendMessage(message, addUserMessage = true) {
  if (addUserMessage) addMessage(message, "user");
  starterPrompts.hidden = true;
  input.disabled = true;
  button.disabled = true;
  voiceButton.disabled = true;
  const typingIndicator = addTypingIndicator();
  setVoiceStatus("Preparing a sample reply...");

  try {
    const response = await fetch(`/api/${select.value}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ message }),
    });
    if (response.status === 401) {
      localStorage.removeItem("chatdesk_token");
      authPanel.hidden = false;
      throw new Error(
        "Your sign-in expired. Sign in again, then retry your question.",
      );
    }
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "The assistant could not respond.");
    typingIndicator.remove();
    addMessage(result.reply, "assistant");
    speakReply(result.reply);
    setVoiceStatus("Sample reply received.");
  } catch (error) {
    typingIndicator.remove();
    const errorText =
      error.message === "Failed to fetch"
        ? "Could not reach the service. Check your connection and try again."
        : error.message;
    addRetryMessage(errorText, message);
    setVoiceStatus("Message could not be delivered.");
  } finally {
    input.disabled = false;
    button.disabled = false;
    voiceButton.disabled = !recognition;
    input.focus();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  await sendMessage(message);
});
