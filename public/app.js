const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const select = document.querySelector("#industry-select");
const title = document.querySelector("#conversation-title");
const button = document.querySelector("#send-button");
const voiceButton = document.querySelector("#voice-input");
const attachButton = document.querySelector("#attach-button");
const attachmentInput = document.querySelector("#attachment-input");
const attachmentTray = document.querySelector("#attachment-tray");
const readAloud = document.querySelector("#read-aloud");
const chatStatus = document.querySelector("#chat-status");
const starterPrompts = document.querySelector("#starter-prompts");
const promptList = document.querySelector("#prompt-list");
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
let isRegistering = false;
let currentIndustry = select.value;
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
  select.value = industry;
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
  select.value = currentIndustry;
  title.textContent = thread.title;
  renderPrompts(currentIndustry);
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
  const remaining = Math.max(0, 4 - attachments.length);
  for (const file of Array.from(files).slice(0, remaining)) {
    if (file.size > 1024 * 1024) {
      setVoiceStatus(`${file.name} is over the 1 MB attachment limit.`);
      continue;
    }
    const isTextFile =
      file.type.startsWith("text/") || file.type === "application/json";
    if (!file.type.startsWith("image/") && !isTextFile) {
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
  return [
    reply.summary,
    reply.reasoning,
    ...(reply.details || []),
    ...(reply.nextSteps || []),
    ...(reply.table?.rows?.flat() || []),
    ...(reply.chart?.labels || []),
    reply.caveat,
  ]
    .filter(Boolean)
    .join(" ");
}

function renderReplyContent(container, reply) {
  const structured = typeof reply === "object" && reply !== null;
  if (!structured) {
    const paragraph = document.createElement("p");
    paragraph.textContent = reply;
    container.append(paragraph);
    return;
  }

  const summary = document.createElement("p");
  summary.className = "reply-summary";
  summary.textContent = reply.summary;
  container.append(summary);

  if (reply.reasoning) {
    const reasoning = document.createElement("p");
    reasoning.className = "reply-reasoning";
    reasoning.textContent = reply.reasoning;
    container.append(reasoning);
  }

  const sections = [
    ["Details", reply.details, "reply-details"],
    ["Next steps", reply.nextSteps, "reply-next-steps"],
  ];
  for (const [heading, items, className] of sections) {
    if (!items?.length) continue;
    const section = document.createElement("section");
    section.className = `reply-section ${className}`;
    const label = document.createElement("h3");
    label.textContent = heading;
    const list = document.createElement("ul");
    for (const item of items) {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      list.append(listItem);
    }
    section.append(label, list);
    container.append(section);
  }

  if (reply.table?.columns?.length && reply.table.rows?.length) {
    const section = document.createElement("section");
    section.className = "reply-section reply-table-section";
    const label = document.createElement("h3");
    label.textContent = reply.table.title || "Data";
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const column of reply.table.columns) {
      const cell = document.createElement("th");
      cell.textContent = column;
      headerRow.append(cell);
    }
    head.append(headerRow);
    const body = document.createElement("tbody");
    for (const row of reply.table.rows) {
      const tableRow = document.createElement("tr");
      for (const value of row) {
        const cell = document.createElement("td");
        cell.textContent = value;
        tableRow.append(cell);
      }
      body.append(tableRow);
    }
    table.append(head, body);
    section.append(label, table);
    container.append(section);
  }

  if (reply.chart?.labels?.length && reply.chart.values?.length) {
    const section = document.createElement("section");
    section.className = "reply-section reply-chart-section";
    const label = document.createElement("h3");
    label.textContent = reply.chart.title || "Overview";
    const chart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chart.setAttribute("viewBox", "0 0 420 190");
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", label.textContent);
    const maximum = Math.max(...reply.chart.values, 1);
    const count = Math.min(reply.chart.values.length, 8);
    const slot = 390 / count;
    for (let index = 0; index < count; index += 1) {
      const value = reply.chart.values[index];
      const barHeight = Math.max(3, (value / maximum) * 125);
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      rect.setAttribute("x", String(18 + index * slot));
      rect.setAttribute("y", String(140 - barHeight));
      rect.setAttribute("width", String(Math.max(10, slot - 12)));
      rect.setAttribute("height", String(barHeight));
      rect.setAttribute("rx", "5");
      rect.setAttribute("class", "chart-bar");
      const caption = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      caption.setAttribute("x", String(18 + index * slot + (slot - 12) / 2));
      caption.setAttribute("y", "164");
      caption.setAttribute("text-anchor", "middle");
      caption.textContent = String(reply.chart.labels[index] || "").slice(
        0,
        12,
      );
      chart.append(rect, caption);
    }
    section.append(label, chart);
    container.append(section);
  }

  if (reply.caveat) {
    const caveat = document.createElement("p");
    caveat.className = "reply-caveat";
    caveat.textContent = reply.caveat;
    container.append(caveat);
  }
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
      starterPrompts.hidden = true;
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
    intro.innerHTML = `<img src="/chatbot-mark.svg" alt="" /><p class="eyebrow">Moonlit assistant</p><h2>What are we working on?</h2><p>Ask a question, attach a file, or choose a starting point.</p>`;
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
  starterPrompts.hidden = thread.messages.length > 0;
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
select.value = currentIndustry;
renderPrompts(currentIndustry);
renderConversation();
renderHistory();
persistThreads();

select.addEventListener("change", () => {
  currentIndustry = select.value;
  const thread = activeThread();
  if (thread?.messages.length) {
    createThread(currentIndustry);
    return;
  }
  if (thread) thread.industry = currentIndustry;
  renderPrompts(currentIndustry);
  renderConversation();
  persistThreads();
  updateComposerState();
  setVoiceStatus(`${labels[currentIndustry]} desk ready.`);
});

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
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    createThread(currentIndustry);
  }
  if (event.key === "Escape") closeSidebar();
});

attachButton.addEventListener("click", () => attachmentInput.click());
attachmentInput.addEventListener("change", () =>
  handleFiles(attachmentInput.files),
);

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
  if (thread.messages.length === 1) starterPrompts.hidden = true;
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
