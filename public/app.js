const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const title = document.querySelector("#conversation-title");
const button = document.querySelector("#send-button");
const voiceButton = document.querySelector("#voice-input");
const attachButton = document.querySelector("#attach-button");
const attachmentInput = document.querySelector("#attachment-input");
const attachmentTray = document.querySelector("#attachment-tray");
const readAloud = document.querySelector("#read-aloud");
const chatStatus = document.querySelector("#chat-status");
const historyList = document.querySelector("#chat-history");
const historyCount = document.querySelector("#history-count");
const newChatButton = document.querySelector("#new-chat");
const inviteButton = document.querySelector("#invite-button");
const mobileMenu = document.querySelector("#mobile-menu");
const sidebar = document.querySelector("#sidebar");
const sidebarScrim = document.querySelector("#sidebar-scrim");
const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authMode = document.querySelector("#auth-mode");
const authSubmit = document.querySelector("#auth-submit");
const authError = document.querySelector("#auth-error");
const logoutButton = document.querySelector("#logout-button");
const profileMenuButton = document.querySelector("#profile-menu-button");
const profileMenu = document.querySelector("#profile-menu");
let isRegistering = false;
let currentIndustry = "school";
const storageKey = "moonlit_chats_v1";
let attachments = [];
let threads = [];
let activeThreadId;
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

const labels = {
  school: "School support",
  clinic: "Clinic support",
  retail: "Retail support",
  restaurant: "Restaurant support",
};

function loadThreads() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (Array.isArray(stored) && stored.length) {
      return stored.filter(
        (thread) =>
          thread &&
          typeof thread.id === "string" &&
          labels[thread.industry] &&
          Array.isArray(thread.messages),
      );
    }
  } catch {
    localStorage.removeItem(storageKey);
  }
  return [];
}

function activeThread() {
  return threads.find((thread) => thread.id === activeThreadId);
}

function persistThreads() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(
        threads.map(({ pending, ...thread }) => ({
          ...thread,
          messages: thread.messages.map(
            ({ retryFiles, ...message }) => message,
          ),
        })),
      ),
    );
  } catch {
    setVoiceStatus("Chat history could not be saved in this browser.");
  }
  renderHistory();
}

function createThread(industry = currentIndustry) {
  const thread = {
    id: crypto.randomUUID(),
    title: "New conversation",
    industry,
    updatedAt: Date.now(),
    messages: [],
  };
  threads.unshift(thread);
  activeThreadId = thread.id;
  currentIndustry = industry;
  input.value = "";
  attachments = [];
  renderAttachmentTray();
  renderHistory();
  renderConversation();
  closeSidebar();
  input.focus();
}

function renderHistory() {
  historyList.replaceChildren();
  historyCount.textContent = String(threads.length);
  for (const thread of threads) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "history-item";
    item.classList.toggle("active", thread.id === activeThreadId);
    item.setAttribute(
      "aria-current",
      thread.id === activeThreadId ? "page" : "false",
    );
    item.title = thread.title;
    const name = document.createElement("span");
    name.className = "history-title";
    name.textContent = thread.title;
    const desk = document.createElement("small");
    desk.textContent = labels[thread.industry].replace(" support", "");
    item.append(name, desk);
    item.addEventListener("click", () => openThread(thread.id));
    historyList.append(item);
  }
}

function openThread(id) {
  const thread = threads.find((item) => item.id === id);
  if (!thread) return;
  activeThreadId = id;
  currentIndustry = thread.industry;
  title.textContent = thread.title;
  renderConversation();
  renderAttachmentTray();
  updateComposerState();
  renderHistory();
  closeSidebar();
}

function openSidebar() {
  sidebar.classList.add("open");
  sidebarScrim.hidden = false;
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarScrim.hidden = true;
}

function renderAttachmentTray() {
  attachmentTray.replaceChildren();
  attachments.forEach((attachment, index) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";
    if (attachment.data) {
      const preview = document.createElement("img");
      preview.src = attachment.data;
      preview.alt = "";
      chip.append(preview);
    } else {
      const icon = document.createElement("span");
      icon.className = "file-icon";
      icon.textContent = attachment.type.startsWith("text/") ? "TXT" : "FILE";
      chip.append(icon);
    }
    const name = document.createElement("span");
    name.textContent = attachment.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-attachment";
    remove.setAttribute("aria-label", `Remove ${attachment.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      attachments.splice(index, 1);
      renderAttachmentTray();
    });
    chip.append(name, remove);
    attachmentTray.append(chip);
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    if (file.type.startsWith("image/")) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

async function handleFiles(files) {
  const selectedFiles = Array.from(files);
  const remaining = Math.max(0, 4 - attachments.length);
  if (selectedFiles.length > remaining) {
    setVoiceStatus("You can attach up to 4 files per message.");
  }
  for (const file of selectedFiles.slice(0, remaining)) {
    if (file.size > 1024 * 1024) {
      setVoiceStatus(`${file.name} is over the 1 MB attachment limit.`);
      continue;
    }
    const isImage = ["image/png", "image/jpeg", "image/webp"].includes(
      file.type,
    );
    const isTextFile =
      file.type.startsWith("text/") || file.type === "application/json";
    if (!isImage && !isTextFile) {
      setVoiceStatus(`${file.name} is not a supported image or text file.`);
      continue;
    }
    try {
      const content = await readFile(file);
      attachments.push({
        name: file.name,
        type: file.type,
        ...(file.type.startsWith("image/")
          ? { data: content }
          : { text: String(content).slice(0, 30000) }),
      });
    } catch (error) {
      setVoiceStatus(error.message);
    }
  }
  renderAttachmentTray();
  attachmentInput.value = "";
}

function replyText(reply) {
  if (typeof reply === "string") return reply;
  if (!reply || typeof reply !== "object") return String(reply ?? "");
  return [
    reply.summary,
    ...(reply.details || []),
    ...(reply.nextSteps || []),
    reply.caveat,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderReplyContent(container, reply) {
  const paragraph = document.createElement("p");
  paragraph.textContent = replyText(reply);
  container.append(paragraph);
}

function addMessage(
  text,
  role,
  threadId = activeThreadId,
  messageAttachments = [],
  persist = true,
) {
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;
  if (persist) {
    const isFirstUserMessage = role === "user" && thread.messages.length === 0;
    thread.messages.push({
      text,
      role,
      attachments: messageAttachments.map(({ name, type }) => ({ name, type })),
    });
    if (isFirstUserMessage && threadId === activeThreadId) {
      messages.querySelector(".welcome-state")?.remove();
    }
    thread.updatedAt = Date.now();
    if (role === "user" && thread.title === "New conversation") {
      thread.title = (
        text ||
        messageAttachments[0]?.name ||
        "File attachment"
      ).slice(0, 44);
      if (threadId === activeThreadId) title.textContent = thread.title;
    }
    persistThreads();
  }
  if (threadId !== activeThreadId) return;

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  const avatar =
    role === "user"
      ? `<span class="avatar user-avatar">↗</span>`
      : `<img class="avatar-logo" src="/chatbot-mark.svg" alt="" />`;
  wrapper.innerHTML = `${avatar}<div class="bubble"><div class="reply-content"></div><time>${role === "user" ? "Just now" : "AI response"}</time></div>`;
  const content = wrapper.querySelector(".reply-content");
  if (role === "assistant") renderReplyContent(content, text);
  else {
    if (text) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      content.append(paragraph);
    }
    for (const file of messageAttachments) {
      const item = document.createElement("div");
      item.className = "message-attachment";
      if (file.data) {
        const image = document.createElement("img");
        image.src = file.data;
        image.alt = file.name;
        item.append(image);
      }
      const fileName = document.createElement("span");
      fileName.textContent = file.name;
      item.append(fileName);
      content.append(item);
    }
  }
  messages.append(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function renderConversation() {
  const thread = activeThread();
  if (!thread) return;
  messages.replaceChildren();
  title.textContent = thread.title;
  if (!thread.messages.length) {
    const intro = document.createElement("div");
    intro.className = "welcome-state";
    intro.innerHTML = `<img src="/chatbot-mark.svg" alt="" /><p class="eyebrow">Moonlit assistant</p><h2>What are we working on?</h2><p>Ask a question or attach a file.</p>`;
    messages.append(intro);
  }
  for (const message of thread.messages) {
    if (message.role === "error") {
      addRetryMessage(
        message.text,
        message.originalQuestion,
        thread.id,
        false,
        message.retryFiles || [],
      );
    } else {
      addMessage(
        message.text,
        message.role,
        thread.id,
        message.attachments || [],
        false,
      );
    }
  }
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

function updateComposerState() {
  const pending = Boolean(activeThread()?.pending);
  input.disabled = pending;
  button.disabled = pending;
  voiceButton.disabled = pending || !recognition;
  attachButton.disabled = pending;
}

function addTypingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant typing-message";
  wrapper.innerHTML = `<img class="avatar-logo" src="/chatbot-mark.svg" alt="" /><div class="bubble"><span class="typing-dots" role="status" aria-label="Preparing a reply"><i></i><i></i><i></i></span></div>`;
  messages.append(wrapper);
  messages.scrollTop = messages.scrollHeight;
  return wrapper;
}

function addRetryMessage(
  message,
  originalQuestion,
  threadId = activeThreadId,
  persist = true,
  retryFiles = [],
) {
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;
  if (persist) {
    thread.messages.push({
      text: message,
      role: "error",
      originalQuestion,
      retryFiles,
    });
    persistThreads();
  }
  if (threadId !== activeThreadId) return;

  const wrapper = document.createElement("div");
  wrapper.className = "message assistant error-message";
  wrapper.innerHTML = `<img class="avatar-logo" src="/chatbot-mark.svg" alt="" /><div class="bubble"><p></p><button class="retry-button" type="button">Try again</button></div>`;
  wrapper.querySelector("p").textContent = message;
  wrapper.querySelector("button").addEventListener("click", () => {
    const errorIndex = thread.messages.findIndex(
      (entry) =>
        entry.role === "error" &&
        entry.text === message &&
        entry.originalQuestion === originalQuestion,
    );
    if (errorIndex >= 0) thread.messages.splice(errorIndex, 1);
    persistThreads();
    wrapper.remove();
    sendMessage(originalQuestion, retryFiles, false, threadId);
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

threads = loadThreads();
if (!threads.length) {
  threads = [
    {
      id: crypto.randomUUID(),
      title: "New conversation",
      industry: currentIndustry,
      updatedAt: Date.now(),
      messages: [],
    },
  ];
}
activeThreadId = threads[0].id;
currentIndustry = activeThread().industry;
renderConversation();
renderHistory();
persistThreads();

newChatButton.addEventListener("click", () => createThread(currentIndustry));
inviteButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    setVoiceStatus("Invite link copied to clipboard.");
  } catch {
    setVoiceStatus("Copy the page link from your browser to invite someone.");
  }
});
mobileMenu.addEventListener("click", openSidebar);
sidebarScrim.addEventListener("click", closeSidebar);
function closeProfileMenu(restoreFocus = false) {
  profileMenu.hidden = true;
  profileMenuButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) profileMenuButton.focus();
}

profileMenuButton.addEventListener("click", () => {
  const opening = profileMenu.hidden;
  profileMenu.hidden = !opening;
  profileMenuButton.setAttribute("aria-expanded", String(opening));
  if (opening) profileMenu.querySelector('[role="menuitem"]').focus();
});

profileMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  closeProfileMenu();
  if (action === "new-chat") createThread(currentIndustry);
  if (action === "invite") inviteButton.click();
  if (action === "sign-out") logoutButton.click();
});

document.addEventListener("click", (event) => {
  if (
    !profileMenu.hidden &&
    !profileMenu.contains(event.target) &&
    !profileMenuButton.contains(event.target)
  ) {
    closeProfileMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    createThread(currentIndustry);
  }
  if (event.key === "Escape") {
    closeSidebar();
    if (!profileMenu.hidden) closeProfileMenu(true);
  }
});

attachButton.addEventListener("click", () => attachmentInput.click());
attachmentInput.addEventListener("change", () =>
  handleFiles(attachmentInput.files),
);

form.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  form.classList.add("is-dragging");
});

form.addEventListener("dragleave", (event) => {
  if (!form.contains(event.relatedTarget)) {
    form.classList.remove("is-dragging");
  }
});

form.addEventListener("drop", (event) => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  form.classList.remove("is-dragging");
  handleFiles(event.dataTransfer.files);
});

async function sendMessage(
  message,
  messageAttachments = attachments,
  addUserMessage = true,
  threadId = activeThreadId,
) {
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;
  const industry = thread.industry;
  if (!message && !messageAttachments.length) return;
  if (addUserMessage) addMessage(message, "user", threadId, messageAttachments);
  if (threadId !== activeThreadId) return;
  thread.pending = true;
  updateComposerState();
  const typingIndicator = addTypingIndicator();
  setVoiceStatus("Preparing your answer...");

  try {
    const response = await fetch(`/api/${industry}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ message, attachments: messageAttachments }),
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
    addMessage(result.reply, "assistant", threadId);
    if (threadId === activeThreadId) {
      speakReply(replyText(result.reply));
      setVoiceStatus("Answer received.");
    }
  } catch (error) {
    if (threadId === activeThreadId) typingIndicator.remove();
    const errorText =
      error.message === "Failed to fetch"
        ? "Could not reach the service. Check your connection and try again."
        : error.message;
    addRetryMessage(errorText, message, threadId, true, messageAttachments);
    if (threadId === activeThreadId)
      setVoiceStatus("Message could not be delivered.");
  } finally {
    thread.pending = false;
    if (threadId === activeThreadId) {
      updateComposerState();
      input.focus();
    }
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message && !attachments.length) return;
  const filesToSend = attachments.slice();
  const text =
    message ||
    `Please review the attached file${filesToSend.length > 1 ? "s" : ""}.`;
  input.value = "";
  attachments = [];
  renderAttachmentTray();
  await sendMessage(text, filesToSend);
});
