const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const select = document.querySelector("#industry-select");
const title = document.querySelector("#desk-title");
const button = document.querySelector("#send-button");
const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authMode = document.querySelector("#auth-mode");
const authSubmit = document.querySelector("#auth-submit");
const authError = document.querySelector("#auth-error");
const logoutButton = document.querySelector("#logout-button");
let isRegistering = false;

const labels = {
  school: "School support",
  clinic: "Clinic support",
  retail: "Retail support",
  restaurant: "Restaurant support",
};

function addMessage(text, role) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  const avatar =
    role === "user"
      ? `<span class="avatar user-avatar">↗</span>`
      : `<img class="avatar-logo" src="/chatbot-logo.svg" alt="" />`;
  wrapper.innerHTML = `${avatar}<div class="bubble"><p></p><time>${role === "user" ? "Just now" : "Local assistant"}</time></div>`;
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

select.addEventListener("change", () => {
  title.textContent = labels[select.value];
  addMessage(
    `You are now chatting with ${labels[select.value].toLowerCase()}.`,
    "assistant",
  );
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  addMessage(message, "user");
  input.value = "";
  input.disabled = true;
  button.disabled = true;

  try {
    const response = await fetch(`/api/${select.value}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ message }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "The assistant could not respond.");
    addMessage(result.reply, "assistant");
  } catch (error) {
    addMessage(error.message, "assistant");
  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
  }
});
