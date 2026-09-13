/**
 * College AI Assistant - Home Page Dynamic Content Controller
 * Manages Previous Year Papers repository, Latest Notices board,
 * filter bars, quick search, and reader modals.
 */

// Helper to escape HTML safely
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// State storage
let allNotices = [];
let activeNoticeCategory = "all";

let allPapers = [];
let activePaperSearch = "";
let activeCourseFilter = "all";
let activeSemesterFilter = "all";
let activeYearFilter = "all";

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initNoticesSection();
  initPapersSection();
  initModalListeners();
});

// Mobile Navigation Toggle
function initMobileNav() {
  const menuBtn = document.getElementById("mobileMenuBtn");
  const navMenu = document.getElementById("navLinksMenu");
  if (!menuBtn || !navMenu) return;

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = navMenu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  document.addEventListener("click", (e) => {
    if (!navMenu.contains(e.target) && !menuBtn.contains(e.target)) {
      navMenu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });

  navMenu.querySelectorAll("a, button").forEach(link => {
    link.addEventListener("click", () => {
      navMenu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    });
  });
}

// --------------------------------------------------------------------------
// 1. LATEST NOTICES CONTROLLER
// --------------------------------------------------------------------------

async function initNoticesSection() {
  const container = document.getElementById("noticesContainer");
  const countBadge = document.getElementById("noticesCountBadge");
  const filterButtons = document.querySelectorAll(".notice-filter-btn");

  if (!container) return;

  filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      filterButtons.forEach(b => {
        b.classList.remove("active");
        b.style.backgroundColor = "transparent";
        b.style.color = "var(--color-text-muted)";
      });
      btn.classList.add("active");
      btn.style.backgroundColor = "var(--color-primary-subtle)";
      btn.style.color = "var(--color-primary)";
      activeNoticeCategory = btn.getAttribute("data-category") || "all";
      renderNotices();
    });
  });

  try {
    const res = await fetch("/api/notices");
    if (res.ok) {
      allNotices = await res.json();
      if (countBadge) countBadge.textContent = `${allNotices.length} Active Notices`;
      renderNotices();
    } else {
      container.innerHTML = `<p style="color: var(--color-error); padding: 1rem;">Failed to load latest notices.</p>`;
    }
  } catch (err) {
    console.error("Error fetching notices:", err);
    container.innerHTML = `<p style="color: var(--color-error); padding: 1rem;">Network error loading notices.</p>`;
  }
}

function renderNotices() {
  const container = document.getElementById("noticesContainer");
  if (!container) return;

  let filtered = allNotices;
  if (activeNoticeCategory !== "all") {
    filtered = allNotices.filter(n => (n.category || "").toLowerCase() === activeNoticeCategory.toLowerCase());
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2.5rem 1.5rem; color: var(--color-text-muted);">
        <p style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">No circulars found in this category.</p>
        <p style="font-size: 0.85rem;">Check back later or select "All Circulars" to see all college announcements.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(notice => {
    const isUrgent = notice.important;
    const attachmentUrl = `/api/notices/${encodeURIComponent(notice.id)}/attachment`;
    const formattedDate = notice.publishedDate ? new Date(notice.publishedDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }) : "Recent";

    return `
      <div class="notice-card ${isUrgent ? "is-important" : ""}" id="notice-${escapeHtml(notice.id)}">
        <div class="notice-card-header">
          <div class="notice-badge-group">
            ${isUrgent ? `
              <span class="badge-urgent">
                <span class="pulse-dot"></span>
                Urgent &bull; Action Required
              </span>
            ` : ""}
            <span class="notice-category-pill">${escapeHtml(notice.category || "General")}</span>
          </div>
          <div class="notice-date">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${formattedDate}
          </div>
        </div>

        <h4 class="notice-title">${escapeHtml(notice.title)}</h4>
        <p class="notice-description">${escapeHtml(notice.description)}</p>

        <div class="notice-actions">
          <div style="font-size: 0.8rem; color: var(--color-text-muted); display: flex; align-items: center; gap: 0.4rem;">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" style="color: var(--color-success);">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Verified Office Circular
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button type="button" class="btn btn-outline btn-sm view-notice-btn" data-id="${escapeHtml(notice.id)}">
              Read Full Notice
            </button>
            <a href="${attachmentUrl}" download="${escapeHtml(notice.attachmentName || 'Notice.pdf')}" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 0.35rem;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download Circular (PDF)
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Attach modal trigger listeners
  container.querySelectorAll(".view-notice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const notice = allNotices.find(n => n.id === id);
      if (notice) openNoticeModal(notice);
    });
  });
}

// --------------------------------------------------------------------------
// 2. PREVIOUS YEAR PAPERS CONTROLLER
// --------------------------------------------------------------------------

async function initPapersSection() {
  const container = document.getElementById("papersContainer");
  const countBadge = document.getElementById("papersCountBadge");
  const searchInput = document.getElementById("paperSearchInput");
  const courseSelect = document.getElementById("paperCourseSelect");
  const semesterSelect = document.getElementById("paperSemesterSelect");
  const yearSelect = document.getElementById("paperYearSelect");
  const resetFiltersBtn = document.getElementById("resetPaperFiltersBtn");

  if (!container) return;

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      activePaperSearch = e.target.value.trim().toLowerCase();
      renderPapers();
    });
  }

  if (courseSelect) {
    courseSelect.addEventListener("change", (e) => {
      activeCourseFilter = e.target.value;
      renderPapers();
    });
  }

  if (semesterSelect) {
    semesterSelect.addEventListener("change", (e) => {
      activeSemesterFilter = e.target.value;
      renderPapers();
    });
  }

  if (yearSelect) {
    yearSelect.addEventListener("change", (e) => {
      activeYearFilter = e.target.value;
      renderPapers();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      activePaperSearch = "";
      activeCourseFilter = "all";
      activeSemesterFilter = "all";
      activeYearFilter = "all";
      if (searchInput) searchInput.value = "";
      if (courseSelect) courseSelect.value = "all";
      if (semesterSelect) semesterSelect.value = "all";
      if (yearSelect) yearSelect.value = "all";
      renderPapers();
    });
  }

  // Click delegation for opening papers
  if (container) {
    container.addEventListener("click", (e) => {
      const trigger = e.target.closest(".btn-open-paper") || e.target.closest(".paper-open-trigger");
      if (trigger) {
        e.preventDefault();
        const paperId = trigger.dataset.id;
        const paper = allPapers.find(p => p.id === paperId);
        if (paper) {
          openPaperModal(paper);
        }
      }
    });
  }

  try {
    const res = await fetch("/api/papers");
    if (res.ok) {
      allPapers = await res.json();
      if (countBadge) countBadge.textContent = `${allPapers.length} Question Papers`;
      populatePaperFilterOptions();
      renderPapers();
    } else {
      container.innerHTML = `<p style="color: var(--color-error); padding: 1rem;">Failed to load previous year papers.</p>`;
    }
  } catch (err) {
    console.error("Error fetching papers:", err);
    container.innerHTML = `<p style="color: var(--color-error); padding: 1rem;">Network error loading question papers.</p>`;
  }
}

function populatePaperFilterOptions() {
  const courseSelect = document.getElementById("paperCourseSelect");
  const semesterSelect = document.getElementById("paperSemesterSelect");
  const yearSelect = document.getElementById("paperYearSelect");

  if (!courseSelect || !semesterSelect || !yearSelect) return;

  const courses = Array.from(new Set(allPapers.map(p => p.course).filter(Boolean)));
  const semesters = Array.from(new Set(allPapers.map(p => p.semester).filter(Boolean)));
  const years = Array.from(new Set(allPapers.map(p => p.academicYear).filter(Boolean)));

  courses.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    courseSelect.appendChild(opt);
  });

  semesters.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    semesterSelect.appendChild(opt);
  });

  years.forEach(y => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = `Year ${y}`;
    yearSelect.appendChild(opt);
  });
}

function renderPapers() {
  const container = document.getElementById("papersContainer");
  const emptyState = document.getElementById("papersEmptyState");
  if (!container) return;

  let filtered = allPapers.filter(paper => {
    const matchesSearch = !activePaperSearch || 
      paper.title.toLowerCase().includes(activePaperSearch) ||
      (paper.description && paper.description.toLowerCase().includes(activePaperSearch)) ||
      (paper.subject && paper.subject.toLowerCase().includes(activePaperSearch)) ||
      (paper.course && paper.course.toLowerCase().includes(activePaperSearch));

    const matchesCourse = activeCourseFilter === "all" || paper.course === activeCourseFilter;
    const matchesSemester = activeSemesterFilter === "all" || paper.semester === activeSemesterFilter;
    const matchesYear = activeYearFilter === "all" || paper.academicYear === activeYearFilter;

    return matchesSearch && matchesCourse && matchesSemester && matchesYear;
  });

  if (filtered.length === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  container.innerHTML = filtered.map(paper => {
    const downloadUrl = `/api/papers/${encodeURIComponent(paper.id)}/download`;
    const openUrl = `/api/papers/${encodeURIComponent(paper.id)}/file?view=inline`;
    const askAiUrl = `/chat.html?q=${encodeURIComponent("I am preparing for " + paper.title + " (" + paper.subject + "). Can you summarize key questions, topics, and preparation tips from this previous year paper?")}`;
    const ext = (paper.fileName || "").split(".").pop().toLowerCase();
    const isPng = ext === "png";
    const badgeBg = isPng ? "#fef3c7" : "#dbeafe";
    const badgeColor = isPng ? "#d97706" : "#1d4ed8";
    const badgeLabel = isPng ? "PNG PAPER" : "PDF PAPER";

    return `
      <div class="paper-card" id="paper-${escapeHtml(paper.id)}">
        <div class="paper-card-top">
          <div class="paper-meta-row">
            <span class="paper-exam-type">${escapeHtml(paper.examType || "End Semester")}</span>
            <span class="paper-year-pill">${escapeHtml(paper.academicYear || "2024")}</span>
            <span class="paper-format-badge ${isPng ? 'png' : 'pdf'}" style="background-color: ${badgeBg}; color: ${badgeColor}; font-weight: 700;">
              ${badgeLabel}
            </span>
          </div>
          <h4 class="paper-title paper-open-trigger" data-id="${escapeHtml(paper.id)}" style="cursor: pointer; transition: color var(--transition-fast);" title="Click to open question paper">
            ${escapeHtml(paper.title)}
          </h4>
          <div class="paper-subject">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" style="display: inline-block; vertical-align: -2px; margin-right: 4px;">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            ${escapeHtml(paper.subject || "Academic Paper")}
          </div>
          <p class="paper-description">${escapeHtml(paper.description || "Official university question paper.")}</p>

          <div class="paper-tags">
            <span class="paper-tag">${escapeHtml(paper.course || "General")}</span>
            <span class="paper-tag">${escapeHtml(paper.semester || "Semester 1")}</span>
          </div>
        </div>

        <div class="paper-card-footer">
          <div class="paper-file-info" title="${escapeHtml(paper.fileName)}">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>${formatBytes(paper.fileSize)} &bull; ${paper.downloadCount || 0} dl</span>
          </div>

          <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary btn-sm btn-open-paper" data-id="${escapeHtml(paper.id)}" title="Open question paper in viewer" style="display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 700;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Open Paper
            </button>
            <a href="${downloadUrl}" download="${escapeHtml(paper.fileName)}" class="btn btn-outline btn-sm" title="Download paper file" style="display: inline-flex; align-items: center; gap: 0.35rem;">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </a>
            <a href="${askAiUrl}" class="btn btn-outline btn-sm" title="Ask AI about this paper topics" style="padding: 0.35rem 0.5rem; font-size: 0.775rem;">
              🤖 Ask AI
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// --------------------------------------------------------------------------
// 3. MODAL HANDLERS (NOTICES & QUESTION PAPERS)
// --------------------------------------------------------------------------

function initModalListeners() {
  // Notice modal listeners
  const noticeModal = document.getElementById("homeReaderModal");
  const noticeCloseBtn = document.getElementById("homeReaderCloseBtn");
  if (noticeCloseBtn && noticeModal) {
    noticeCloseBtn.addEventListener("click", () => {
      noticeModal.classList.remove("active");
    });
    noticeModal.addEventListener("click", (e) => {
      if (e.target === noticeModal) noticeModal.classList.remove("active");
    });
  }

  // Paper modal listeners
  const paperModal = document.getElementById("homePaperModal");
  const paperCloseBtn = document.getElementById("homePaperCloseBtn");
  if (paperCloseBtn && paperModal) {
    paperCloseBtn.addEventListener("click", () => {
      paperModal.classList.remove("active");
    });
    paperModal.addEventListener("click", (e) => {
      if (e.target === paperModal) paperModal.classList.remove("active");
    });
  }

  // Keyboard Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (noticeModal && noticeModal.classList.contains("active")) {
        noticeModal.classList.remove("active");
      }
      if (paperModal && paperModal.classList.contains("active")) {
        paperModal.classList.remove("active");
      }
    }
  });
}

function openNoticeModal(notice) {
  const modal = document.getElementById("homeReaderModal");
  const title = document.getElementById("homeReaderTitle");
  const meta = document.getElementById("homeReaderMeta");
  const content = document.getElementById("homeReaderContent");
  const downloadBtn = document.getElementById("homeReaderDownloadBtn");
  const openTabBtn = document.getElementById("homeReaderOpenTabBtn");

  if (!modal) return;

  const fileName = notice.attachmentName || "Notice.pdf";
  const ext = fileName.split(".").pop().toLowerCase();
  const isImage = ["png", "jpg", "jpeg"].includes(ext);
  const fileUrl = `/api/notices/${encodeURIComponent(notice.id)}/file?view=inline`;
  const downloadUrl = `/api/notices/${encodeURIComponent(notice.id)}/attachment?download=true`;

  title.textContent = notice.title;
  meta.innerHTML = `
    <span class="notice-category-pill">${escapeHtml(notice.category || "General")}</span>
    <span style="font-size: 0.85rem; color: var(--color-text-muted);">Published: ${escapeHtml(notice.publishedDate || "Recent")}</span>
    ${notice.important ? `<span class="badge-urgent"><span class="pulse-dot"></span>Urgent Circular</span>` : ""}
    <span class="paper-format-badge ${isImage ? 'png' : 'pdf'}">${isImage ? 'PNG Image' : 'PDF Document'}</span>
  `;

  content.innerHTML = `
    <div style="font-size: 1rem; line-height: 1.7; color: var(--color-text-main); white-space: pre-line; margin-bottom: 1.25rem;">
      ${escapeHtml(notice.description)}
    </div>

    ${isImage ? `
      <div class="paper-viewer-container" style="margin-top: 1rem;">
        <div class="paper-viewer-toolbar">
          <span>Official Circular Image: ${escapeHtml(fileName)}</span>
          <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">
            Open Image in New Tab &nearr;
          </a>
        </div>
        <div class="paper-preview-img-wrap">
          <img src="${fileUrl}" alt="${escapeHtml(notice.title)}" class="paper-preview-img" loading="lazy" />
        </div>
      </div>
    ` : `
      <div style="background-color: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 1rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div>
          <div style="font-weight: 600; font-size: 0.875rem;">Official Circular Attachment (${escapeHtml(ext.toUpperCase())})</div>
          <div style="font-size: 0.775rem; color: var(--color-text-muted);">${escapeHtml(fileName)}</div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">
            View Online &nearr;
          </a>
          <a href="${downloadUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-sm">
            Download
          </a>
        </div>
      </div>
    `}
  `;

  if (openTabBtn) {
    openTabBtn.href = fileUrl;
  }
  if (downloadBtn) {
    downloadBtn.href = downloadUrl;
    downloadBtn.download = fileName;
  }

  modal.classList.add("active");
}

function openPaperModal(paper) {
  const modal = document.getElementById("homePaperModal");
  const title = document.getElementById("homePaperTitle");
  const meta = document.getElementById("homePaperMeta");
  const body = document.getElementById("homePaperBody");
  const openTabBtn = document.getElementById("homePaperOpenTabBtn");
  const downloadBtn = document.getElementById("homePaperDownloadBtn");
  const askAiBtn = document.getElementById("homePaperAskAiBtn");
  const fileInfo = document.getElementById("homePaperFileInfo");

  if (!modal) return;

  const fileName = paper.fileName || `${paper.title}.pdf`;
  const ext = fileName.split(".").pop().toLowerCase();
  const isImage = ["png", "jpg", "jpeg"].includes(ext);
  const fileUrl = `/api/papers/${encodeURIComponent(paper.id)}/file?view=inline`;
  const downloadUrl = `/api/papers/${encodeURIComponent(paper.id)}/download`;
  const askAiUrl = `/chat.html?q=${encodeURIComponent("I am preparing for " + paper.title + " (" + paper.subject + "). Can you explain key question patterns and topics from this previous year paper?")}`;

  title.textContent = paper.title;
  meta.innerHTML = `
    <span class="paper-exam-type">${escapeHtml(paper.examType || "End Semester")}</span>
    <span class="paper-year-pill">${escapeHtml(paper.academicYear || "2024")}</span>
    <span class="paper-tag">${escapeHtml(paper.course || "B.Tech")}</span>
    <span class="paper-tag">${escapeHtml(paper.semester || "Semester")}</span>
    <span class="paper-format-badge ${isImage ? 'png' : 'pdf'}">${isImage ? 'PNG Image Paper' : 'PDF Document'}</span>
  `;

  body.innerHTML = `
    <div style="background-color: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
      <div style="font-weight: 700; color: var(--color-primary); font-size: 1rem; margin-bottom: 0.25rem;">
        ${escapeHtml(paper.subject || "Academic Subject")} &bull; ${escapeHtml(paper.course || "")} (${escapeHtml(paper.semester || "")})
      </div>
      <div style="font-size: 0.875rem; color: var(--color-text-main); line-height: 1.5;">
        ${escapeHtml(paper.description || "")}
      </div>
    </div>

    <div class="paper-viewer-container">
      <div class="paper-viewer-toolbar">
        <span>Previewing ${escapeHtml(fileName)} (${isImage ? 'PNG Image' : 'PDF Document'})</span>
        <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">
          Open in Full Tab &nearr;
        </a>
      </div>
      ${isImage ? `
        <div class="paper-preview-img-wrap">
          <img src="${fileUrl}" alt="${escapeHtml(paper.title)}" class="paper-preview-img" loading="lazy" />
        </div>
      ` : `
        <iframe src="${fileUrl}" class="paper-viewer-frame" title="${escapeHtml(paper.title)}"></iframe>
      `}
    </div>
  `;

  if (fileInfo) {
    fileInfo.innerHTML = `<span>${formatBytes(paper.fileSize)} &bull; ${escapeHtml(fileName)}</span>`;
  }
  if (openTabBtn) {
    openTabBtn.href = fileUrl;
  }
  if (downloadBtn) {
    downloadBtn.href = downloadUrl;
    downloadBtn.download = fileName;
  }
  if (askAiBtn) {
    askAiBtn.href = askAiUrl;
  }

  modal.classList.add("active");
}
