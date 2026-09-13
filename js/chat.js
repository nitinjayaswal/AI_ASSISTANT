/**
 * College AI Assistant - Student Chatbot Logic
 * Controls message flow, streaming/loading states, citations, and quick prompts.
 */

document.addEventListener("DOMContentLoaded", () => {
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const clearChatBtn = document.getElementById("clearChatBtn");
  const quickChips = document.querySelectorAll(".quick-chip");

  // Mobile Navigation Toggle
  const chatMenuBtn = document.getElementById("chatMobileMenuBtn");
  const chatNavLinks = document.getElementById("chatNavLinks");
  if (chatMenuBtn && chatNavLinks) {
    chatMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = chatNavLinks.classList.toggle("open");
      chatMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
      if (!chatNavLinks.contains(e.target) && !chatMenuBtn.contains(e.target)) {
        chatNavLinks.classList.remove("open");
        chatMenuBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  let isSubmitting = false;

  // Auto-resize textarea
  if (chatInput) {
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
      if (sendBtn) {
        sendBtn.disabled = !chatInput.value.trim() || isSubmitting;
      }
    });

    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
          handleChatSubmit();
        }
      }
    });
  }

  // Quick suggestion chips
  quickChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const promptText = chip.getAttribute("data-prompt") || chip.textContent.trim();
      chatInput.value = promptText;
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
      if (sendBtn) sendBtn.disabled = false;
      handleChatSubmit();
    });
  });

  // Clear chat
  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", () => {
      sessionStorage.removeItem("college_chat_history");
      chatMessages.innerHTML = "";
      renderWelcomeGreeting();
    });
  }

  // Load chat history if stored
  loadChatHistory();

  // Check URL query parameters (e.g. from Home portal or quick suggestion links)
  const urlParams = new URLSearchParams(window.location.search);
  const initialQuery = urlParams.get("q") || urlParams.get("query") || urlParams.get("question");
  if (initialQuery && initialQuery.trim()) {
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (_) {}
    setTimeout(() => {
      handleChatSubmit(initialQuery.trim());
    }, 200);
  }

  if (chatForm) {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleChatSubmit();
    });
  }

  async function handleChatSubmit(queryOverride) {
    const question = (typeof queryOverride === "string" ? queryOverride : chatInput.value).trim();
    if (!question || isSubmitting) return;

    isSubmitting = true;
    chatInput.value = "";
    chatInput.style.height = "auto";
    sendBtn.disabled = true;

    // 1. Append User Message
    appendMessage("user", question);
    saveChatHistory();

    // 2. Append Loading Indicator
    const loadingId = appendLoadingIndicator("Searching college documents...");

    try {
      // 3. Step 1: Document Retrieval with BM25 Multi-Chunk Ranking
      const relevantChunks = await window.CollegeSearch.searchDocuments(question, 6);

      // Update loading text
      updateLoadingText(loadingId, "Analyzing with Gemini...");

      // 4. Step 2: Answer Generation with Gemini
      const result = await window.CollegeGemini.generateAnswer(question, relevantChunks);

      // 5. Remove Loading Indicator
      removeLoadingIndicator(loadingId);

      // 6. Append Assistant Message with Citation
      appendMessage("assistant", result.answer, result);
      saveChatHistory();
    } catch (error) {
      console.error("[Chat Error]:", error);
      removeLoadingIndicator(loadingId);

      const isHighDemand =
        error?.isHighDemand ||
        error?.status === 503 ||
        (error?.message && (
          error.message.includes("503") ||
          error.message.includes("high demand") ||
          error.message.includes("UNAVAILABLE")
        ));

      if (isHighDemand) {
        appendHighDemandMessage(question);
      } else {
        appendMessage("assistant", "I encountered a communication error while querying the knowledge base. Please check the connection or try again.", {
          unavailable: true,
          sourceDocument: "System Error",
          pageNumber: "N/A",
          confidence: 0
        });
      }
      saveChatHistory();
    } finally {
      isSubmitting = false;
      if (chatInput) {
        chatInput.focus();
        sendBtn.disabled = !chatInput.value.trim();
      }
    }
  }

  /**
   * Appends an interactive high-demand retry banner
   */
  function appendHighDemandMessage(failedQuestion) {
    const row = document.createElement("div");
    row.className = "message-row assistant";

    const avatar = document.createElement("div");
    avatar.className = "message-sender-avatar";
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const retryId = "retry_" + Date.now();
    bubble.innerHTML = `
      <p>The AI model is currently experiencing peak demand. Demand spikes are usually temporary and resolve quickly.</p>
      <div class="retry-error-card">
        <div class="retry-error-header">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>Model Busy (503 Service Unavailable)</span>
        </div>
        <p style="margin: 0; font-size: 0.8rem; color: #78350f;">
          Your query: <em>"${escapeHtml(failedQuestion)}"</em>
        </p>
        <button type="button" id="${retryId}" class="retry-error-btn">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <polyline points="23 20 23 14 17 14"></polyline>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
          </svg>
          <span>Retry Question Now</span>
        </button>
      </div>
    `;

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatMessages.appendChild(row);

    const btn = document.getElementById(retryId);
    if (btn) {
      btn.addEventListener("click", () => {
        chatInput.value = failedQuestion;
        handleChatSubmit();
      });
    }

    scrollToBottom();
  }

  /**
   * Appends a message bubble into the conversation with collegiate formatting and citations
   */
  function appendMessage(sender, text, meta = {}) {
    const row = document.createElement("div");
    row.className = `message-row ${sender}`;

    const avatar = document.createElement("div");
    avatar.className = "message-sender-avatar";

    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (sender === "user") {
      avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      bubble.innerHTML = `<p style="margin: 0;">${escapeHtml(text)}</p><span class="message-time">${timestamp}</span>`;
      row.appendChild(avatar);
      row.appendChild(bubble);
      chatMessages.appendChild(row);
      scrollToBottom();
      return;
    }

    // Assistant Message: Official Collegiate Presentation Card
    avatar.innerHTML = `<img src="/assets/uiet_logo.svg" alt="UIET Crest" style="width: 26px; height: 26px; object-fit: contain;" />`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble assistant-answer-bubble";

    const uniqueId = "ans_" + Date.now() + "_" + Math.floor(Math.random() * 10000);

    // Key highlights
    const keyHighlights = Array.isArray(meta.keyHighlights) ? meta.keyHighlights : [];
    const suggestedFollowUps = Array.isArray(meta.suggestedFollowUps) ? meta.suggestedFollowUps : [];

    let highlightsHtml = "";
    if (keyHighlights.length > 0) {
      highlightsHtml = `
        <div class="answer-highlights-card">
          <div class="answer-highlights-header">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span>Executive Takeaways &amp; Key Highlights</span>
          </div>
          <div class="answer-highlights-grid">
            ${keyHighlights.map(h => `
              <div class="highlight-chip">
                <span class="highlight-bullet">&bull;</span>
                <span class="highlight-text">${escapeHtml(h)}</span>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    // Citations & Document Evidence
    let citationHtml = "";
    if (meta.sourceDocument && meta.sourceDocument !== "College Handbook / Circulars") {
      const confScore = typeof meta.confidence === "number" ? Math.round(meta.confidence * 100) : 95;
      const confClass = confScore >= 80 ? "high" : confScore >= 50 ? "medium" : "low";
      const evidenceId = `ev_${uniqueId}`;

      citationHtml = `
        <div class="citation-card">
          <div class="citation-header">
            <span class="citation-title">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              Authoritative Source Reference
            </span>
            <span class="confidence-badge ${confClass}">${confScore}% Verified Grounding</span>
          </div>
          <div class="citation-meta-grid">
            <div class="citation-meta-item">
              <span class="citation-label">Verified Document</span>
              <span class="citation-value">${escapeHtml(meta.sourceDocument)}</span>
            </div>
            <div class="citation-meta-item">
              <span class="citation-label">Gazette / Page Reference</span>
              <span class="citation-value">Page ${escapeHtml(String(meta.pageNumber || "1"))}</span>
            </div>
          </div>
          ${meta.evidenceSnippet ? `
            <button type="button" class="citation-evidence-toggle" onclick="window.toggleEvidence('${evidenceId}', this)">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>Show Document Excerpt</span>
            </button>
            <div class="citation-evidence-content" id="${evidenceId}">${escapeHtml(meta.evidenceSnippet)}</div>
          ` : ""}
        </div>
      `;
    }

    // Suggested Follow-ups
    let followUpsHtml = "";
    if (suggestedFollowUps.length > 0) {
      followUpsHtml = `
        <div class="answer-followups-container">
          <div class="answer-followups-header">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>Related Student Inquiries:</span>
          </div>
          <div class="answer-followups-pills">
            ${suggestedFollowUps.map(f => `
              <button type="button" class="followup-query-btn" data-query="${escapeHtml(f)}">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                <span>${escapeHtml(f)}</span>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    // Body content formatted with academic typography
    const formattedBody = formatAcademicMarkdown(text);

    bubble.innerHTML = `
      <div class="answer-header-bar">
        <div class="answer-header-left">
          <span class="answer-authority-tag">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Official University Guidance
          </span>
          <span class="answer-authority-sub">Panjab University UIET Regulations</span>
        </div>
        <div class="answer-header-right">
          <span class="answer-timestamp">${timestamp}</span>
          <div class="answer-actions-group">
            <button type="button" class="answer-tool-btn copy-btn" id="${uniqueId}_copy" title="Copy answer text">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
            <button type="button" class="answer-tool-btn listen-btn" id="${uniqueId}_listen" title="Read answer aloud">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              <span>Listen</span>
            </button>
            <button type="button" class="answer-tool-btn print-btn" id="${uniqueId}_print" title="Print document">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              <span>Print</span>
            </button>
          </div>
        </div>
      </div>

      ${highlightsHtml}

      <div class="answer-body-content" id="${uniqueId}_body">
        ${formattedBody}
      </div>

      ${citationHtml}

      ${followUpsHtml}

      <div class="answer-footer-bar">
        <div class="answer-footer-disclaimer">
          <span>Official Student Advisory &bull; Panjab University UIET Regulations</span>
        </div>
        <div class="answer-feedback-group" id="${uniqueId}_feedback">
          <span class="feedback-prompt">Helpful?</span>
          <button type="button" class="feedback-vote-btn" data-vote="yes" title="Helpful answer">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
            </svg>
            <span>Yes</span>
          </button>
          <button type="button" class="feedback-vote-btn" data-vote="no" title="Needs clarification">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
            </svg>
            <span>Clarify</span>
          </button>
        </div>
      </div>
    `;

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatMessages.appendChild(row);

    // Bind event handlers for action buttons, feedback, and followups
    bindAnswerActionHandlers(uniqueId, text, bubble);

    scrollToBottom();
  }

  /**
   * Binds actions for Copy, Read Aloud, Print, Follow-ups, and Feedback
   */
  function bindAnswerActionHandlers(id, rawText, bubbleElement) {
    const copyBtn = document.getElementById(`${id}_copy`);
    const listenBtn = document.getElementById(`${id}_listen`);
    const printBtn = document.getElementById(`${id}_print`);

    // 1. Copy Answer
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(rawText);
          const originalHtml = copyBtn.innerHTML;
          copyBtn.classList.add("copied");
          copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Copied!</span>
          `;
          setTimeout(() => {
            copyBtn.classList.remove("copied");
            copyBtn.innerHTML = originalHtml;
          }, 2000);
        } catch (err) {
          console.warn("Clipboard copy failed:", err);
        }
      });
    }

    // 2. Read Aloud (Text to Speech)
    if (listenBtn && "speechSynthesis" in window) {
      listenBtn.addEventListener("click", () => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          listenBtn.classList.remove("active");
          listenBtn.querySelector("span").textContent = "Listen";
          return;
        }

        // Clean text for speech
        const speechText = rawText.replace(/[*_#`[\]|]/g, " ").replace(/\s+/g, " ").trim();
        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
          listenBtn.classList.add("active");
          listenBtn.querySelector("span").textContent = "Stop";
        };

        utterance.onend = () => {
          listenBtn.classList.remove("active");
          listenBtn.querySelector("span").textContent = "Listen";
        };

        utterance.onerror = () => {
          listenBtn.classList.remove("active");
          listenBtn.querySelector("span").textContent = "Listen";
        };

        window.speechSynthesis.speak(utterance);
      });
    } else if (listenBtn) {
      listenBtn.style.display = "none";
    }

    // 3. Print Guidance
    if (printBtn) {
      printBtn.addEventListener("click", () => {
        const bodyContent = bubbleElement.querySelector(".answer-body-content");
        if (!bodyContent) return;
        const printWindow = window.open("", "_blank", "width=800,height=600");
        if (!printWindow) return;

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>UIET Hoshiarpur - Official Academic Advisory</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; padding: 2.5rem; max-width: 800px; margin: 0 auto; }
                .print-header { border-bottom: 2px solid #1e3a8a; padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; }
                .print-header h1 { font-size: 1.25rem; color: #1e3a8a; margin: 0; }
                .print-header p { font-size: 0.85rem; color: #64748b; margin: 0.25rem 0 0 0; }
                .print-date { font-size: 0.8rem; color: #64748b; }
                .print-body { font-size: 0.95rem; }
                .print-body h3, .print-body h4 { color: #1e3a8a; }
                .answer-step-row { display: flex; gap: 0.75rem; margin: 0.5rem 0; padding: 0.5rem; background: #f8fafc; border: 1px solid #e2e8f0; }
                .answer-step-badge { font-weight: bold; }
                .answer-callout-box { background: #eff6ff; border-left: 4px solid #2563eb; padding: 0.75rem; margin: 1rem 0; }
                table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
                th, td { border: 1px solid #cbd5e1; padding: 0.5rem 0.75rem; text-align: left; }
                th { background: #f1f5f9; }
                .print-footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #cbd5e1; font-size: 0.75rem; color: #94a3b8; text-align: center; }
              </style>
            </head>
            <body>
              <div class="print-header">
                <div>
                  <h1>Panjab University UIET Hoshiarpur</h1>
                  <p>Official Student Academic Advisory Record</p>
                </div>
                <div class="print-date">Generated: ${new Date().toLocaleDateString()}</div>
              </div>
              <div class="print-body">
                ${bodyContent.innerHTML}
              </div>
              <div class="print-footer">
                Panjab University Swami Sarvanand Giri Regional Centre, Hoshiarpur &bull; For administrative verification, visit the Academic Office
              </div>
              <script>
                window.onload = function() { window.print(); }
              <\/script>
            </body>
          </html>
        `);
        printWindow.document.close();
      });
    }

    // 4. Follow-up query buttons
    const followUpBtns = bubbleElement.querySelectorAll(".followup-query-btn");
    followUpBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const query = btn.getAttribute("data-query");
        if (query) {
          chatInput.value = query;
          chatInput.style.height = "auto";
          chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
          handleChatSubmit();
        }
      });
    });

    // 5. Feedback buttons
    const feedbackBtns = bubbleElement.querySelectorAll(".feedback-vote-btn");
    feedbackBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        feedbackBtns.forEach(b => {
          b.disabled = true;
          b.style.opacity = "0.5";
        });
        btn.classList.add("voted");
        btn.style.opacity = "1";
        const vote = btn.getAttribute("data-vote");
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>${vote === "yes" ? "Acknowledged" : "Noted"}</span>
        `;
      });
    });
  }

  /**
   * Append loading indicator
   */
  function appendLoadingIndicator(initialText) {
    const id = "loading_" + Date.now();
    const row = document.createElement("div");
    row.className = "message-row assistant loading-row";
    row.id = id;

    row.innerHTML = `
      <div class="message-sender-avatar">
        <img src="/assets/uiet_logo.svg" alt="UIET Crest" style="width: 26px; height: 26px; object-fit: contain;" />
      </div>
      <div class="loading-bubble">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
        <span class="loading-text" id="${id}_text">${escapeHtml(initialText)}</span>
      </div>
    `;

    chatMessages.appendChild(row);
    scrollToBottom();
    return id;
  }

  function updateLoadingText(id, newText) {
    const el = document.getElementById(`${id}_text`);
    if (el) el.textContent = newText;
  }

  function removeLoadingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /**
   * Renders structured academic markdown (steps, tables, callouts, bold, lists)
   */
  function formatAcademicMarkdown(text) {
    if (!text) return "";
    let clean = escapeHtml(text);

    // Convert bold: **text**
    clean = clean.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Inline code: `code`
    clean = clean.replace(/`([^`]+)`/g, "<code class='answer-inline-code'>$1</code>");

    const lines = clean.split("\n");
    const output = [];
    let inList = false; // "ul" or "ol"
    let inTable = false;
    let tableRows = [];

    function closeOpenBlocks() {
      if (inList === "ul") {
        output.push("</ul>");
        inList = false;
      } else if (inList === "ol") {
        output.push("</div>");
        inList = false;
      }
      if (inTable) {
        output.push(renderMarkdownTable(tableRows));
        inTable = false;
        tableRows = [];
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for Table Row
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        if (/^\|[-:\s|]+\|$/.test(trimmed)) {
          // Table header separator row (e.g. |---|---|)
          continue;
        }
        if (!inTable) {
          closeOpenBlocks();
          inTable = true;
          tableRows = [];
        }
        tableRows.push(trimmed);
        continue;
      } else if (inTable) {
        closeOpenBlocks();
      }

      // Check for Headings
      if (trimmed.startsWith("### ")) {
        closeOpenBlocks();
        const headingText = trimmed.replace(/^###\s+/, "");
        output.push(`<div class="answer-section-header"><h4>${headingText}</h4></div>`);
        continue;
      }
      if (trimmed.startsWith("## ")) {
        closeOpenBlocks();
        const headingText = trimmed.replace(/^##\s+/, "");
        output.push(`<div class="answer-section-header main"><h3>${headingText}</h3></div>`);
        continue;
      }

      // Check for Callout Quotes
      if (trimmed.startsWith("&gt; ") || trimmed.startsWith("> ")) {
        closeOpenBlocks();
        const calloutText = trimmed.replace(/^(&gt;|>)\s*/, "");
        output.push(`
          <div class="answer-callout-box">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" class="callout-icon">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div class="callout-body">${calloutText}</div>
          </div>
        `);
        continue;
      }

      // Check for Numbered Steps (e.g. "1. **Submit application**...")
      const stepMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (stepMatch) {
        if (inList !== "ol") {
          closeOpenBlocks();
          inList = "ol";
          output.push("<div class=\"answer-steps-container\">");
        }
        const stepNum = stepMatch[1];
        const stepContent = stepMatch[2];
        output.push(`
          <div class="answer-step-row">
            <div class="answer-step-badge">${stepNum}</div>
            <div class="answer-step-text">${stepContent}</div>
          </div>
        `);
        continue;
      }

      // Check for Bullet Points (* or -)
      if (trimmed.startsWith("* ") || trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        if (inList !== "ul") {
          closeOpenBlocks();
          inList = "ul";
          output.push("<ul class=\"answer-bullet-list\">");
        }
        const itemContent = trimmed.replace(/^(\*|-|•)\s+/, "");
        output.push(`<li>${itemContent}</li>`);
        continue;
      }

      // Regular Paragraph or Spacing
      closeOpenBlocks();
      if (trimmed.length > 0) {
        output.push(`<p class="answer-paragraph">${trimmed}</p>`);
      }
    }

    closeOpenBlocks();
    return output.join("");
  }

  function renderMarkdownTable(rows) {
    if (!rows || rows.length === 0) return "";
    let html = '<div class="answer-table-wrapper"><table class="answer-table">';
    rows.forEach((rowStr, idx) => {
      const cells = rowStr.split("|").slice(1, -1).map(c => c.trim());
      if (cells.length === 0) return;
      if (idx === 0) {
        html += "<thead><tr>";
        cells.forEach(c => {
          html += `<th>${c}</th>`;
        });
        html += "</tr></thead><tbody>";
      } else {
        html += "<tr>";
        cells.forEach(c => {
          html += `<td>${c}</td>`;
        });
        html += "</tr>";
      }
    });
    html += "</tbody></table></div>";
    return html;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function saveChatHistory() {
    const messages = [];
    const rows = chatMessages.querySelectorAll(".message-row:not(.loading-row)");
    rows.forEach(r => {
      const isUser = r.classList.contains("user");
      const bubble = r.querySelector(".message-bubble");
      if (bubble) {
        messages.push({
          sender: isUser ? "user" : "assistant",
          html: bubble.innerHTML
        });
      }
    });
    sessionStorage.setItem("college_chat_history", JSON.stringify(messages.slice(-25)));
  }

  function loadChatHistory() {
    try {
      const stored = sessionStorage.getItem("college_chat_history");
      if (stored) {
        const messages = JSON.parse(stored);
        if (messages.length > 0) {
          chatMessages.innerHTML = "";
          messages.forEach(m => {
            const row = document.createElement("div");
            row.className = `message-row ${m.sender}`;
            const avatar = document.createElement("div");
            avatar.className = "message-sender-avatar";
            avatar.innerHTML = m.sender === "user" 
              ? `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
              : `<img src="/assets/uiet_logo.svg" alt="UIET Crest" style="width: 26px; height: 26px; object-fit: contain;" />`;
            
            const bubble = document.createElement("div");
            bubble.className = m.sender === "user" ? "message-bubble" : "message-bubble assistant-answer-bubble";
            bubble.innerHTML = m.html;

            row.appendChild(avatar);
            row.appendChild(bubble);
            chatMessages.appendChild(row);

            // Re-bind actions if assistant message
            if (m.sender === "assistant") {
              const body = bubble.querySelector(".answer-body-content");
              const rawText = body ? body.innerText : "";
              const id = "reloaded_" + Math.floor(Math.random() * 100000);
              bindAnswerActionHandlers(id, rawText, bubble);
            }
          });
          scrollToBottom();
          return;
        }
      }
    } catch (e) {
      console.warn("Could not load chat history:", e);
    }

    renderWelcomeGreeting();
  }

  function renderWelcomeGreeting() {
    appendMessage(
      "assistant",
      "Welcome to the **UIET Academic Helpdesk**.\n\nI can assist you with official circulars, procedures, and regulations regarding:\n* **Academic & Bonafide:** Application procedures, transcript requests, and syllabus verification.\n* **Examinations:** Semester registration, date sheets, and reappear guidelines.\n* **Hostel & Mess:** Room allotment rules, fee schedules, and campus curfew ordinances.\n* **Scholarships & Fees:** Government concessions, tuition fee payment schedules, and installment requests.\n\nPlease ask any question, or select one of the frequently consulted topics above.",
      {
        keyHighlights: [
          "Information verified against Panjab University ordinances",
          "Includes administrative office window locations & fee schedules",
          "Click any suggested query to get direct step-by-step guidance"
        ],
        suggestedFollowUps: [
          "How do I apply for a bonafide certificate?",
          "What is the hostel fee structure?",
          "How can I register for semester examinations?"
        ]
      }
    );
  }
});

// Global function to toggle document evidence snippet
window.toggleEvidence = function(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.classList.contains("open");
  if (isOpen) {
    el.classList.remove("open");
    btn.querySelector("span").textContent = "Show Document Excerpt";
  } else {
    el.classList.add("open");
    btn.querySelector("span").textContent = "Hide Document Excerpt";
  }
};
