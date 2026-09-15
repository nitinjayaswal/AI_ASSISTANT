/**
 * College AI Assistant - Administration Portal Controller
 * Manages Previous Year Papers repository, Latest Notices & Circulars,
 * and Official College PDF Knowledge Base.
 */

// Global reference for document, paper, and notice caches
let allLoadedDocuments = [];
let allLoadedPapers = [];
let allLoadedNotices = [];
let itemPendingDelete = null;

/**
 * Modern In-App Toast Notification (bypasses iframe alert/confirm restrictions)
 */
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let iconSvg = "";
  if (type === "success") {
    iconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === "error") {
    iconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else {
    iconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="16"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.5rem;">
      <span style="display: flex; align-items: center;">${iconSvg}</span>
      <span>${escapeHtml(message)}</span>
    </div>
    <button type="button" style="background: none; border: none; font-size: 1.1rem; cursor: pointer; color: inherit; opacity: 0.7; padding-left: 0.5rem;" aria-label="Dismiss">&times;</button>
  `;

  const closeBtn = toast.querySelector("button");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => toast.remove(), 250);
    });
  }

  container.appendChild(toast);

  // Auto-remove after 3.5 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => toast.remove(), 250);
    }
  }, 3500);
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

document.addEventListener("DOMContentLoaded", () => {
  // Ensure Admin Auth Guard
  if (window.CollegeAuth) {
    window.CollegeAuth.requireAuth();
  }

  const logoutBtn = document.getElementById("adminLogoutBtn");
  const adminEmailDisplay = document.getElementById("adminEmailDisplay");

  // Set Admin Email in UI
  if (adminEmailDisplay && window.CollegeAuth && window.CollegeAuth.currentUser) {
    adminEmailDisplay.textContent = window.CollegeAuth.currentUser.email;
  }

  // Logout handler
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.CollegeAuth.logout();
    });
  }

  // Mobile Navigation Toggle
  const adminMenuBtn = document.getElementById("adminMobileMenuBtn");
  const adminNavLinks = document.getElementById("adminNavLinks");
  if (adminMenuBtn && adminNavLinks) {
    adminMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = adminNavLinks.classList.toggle("open");
      adminMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
      if (!adminNavLinks.contains(e.target) && !adminMenuBtn.contains(e.target)) {
        adminNavLinks.classList.remove("open");
        adminMenuBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Initialize tabs and managers
  initAdminTabs();
  initUniversalModals();
  initPapersManager();
  initNoticesManager();
  initKnowledgeBaseManager();

  // Manual Firebase Sync Trigger
  const btnSyncFirebase = document.getElementById("btnSyncFirebase");
  if (btnSyncFirebase) {
    btnSyncFirebase.addEventListener("click", async () => {
      btnSyncFirebase.disabled = true;
      const originalHtml = btnSyncFirebase.innerHTML;
      btnSyncFirebase.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2" style="margin-right: 4px; animation: spin 1s linear infinite;">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        Syncing to Firestore...
      `;
      try {
        const res = await fetch("/api/sync-firebase", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || "All image links, papers, and notices synced to Firebase!", "success");
        } else {
          showToast(data.error || "Failed to sync to Firebase", "error");
        }
      } catch (err) {
        showToast("Error syncing to Firebase: " + err.message, "error");
      } finally {
        btnSyncFirebase.disabled = false;
        btnSyncFirebase.innerHTML = originalHtml;
      }
    });
  }
});

// --------------------------------------------------------------------------
// ADMIN TABS CONTROLLER
// --------------------------------------------------------------------------

function initAdminTabs() {
  const tabButtons = document.querySelectorAll(".admin-tab-btn");
  const tabPanes = {
    papers: document.getElementById("tabContentPapers"),
    notices: document.getElementById("tabContentNotices"),
    docs: document.getElementById("tabContentDocs")
  };

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");

      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      Object.keys(tabPanes).forEach(tabKey => {
        const pane = tabPanes[tabKey];
        if (!pane) return;
        if (tabKey === targetTab) {
          pane.style.display = "block";
          pane.classList.add("active");
        } else {
          pane.style.display = "none";
          pane.classList.remove("active");
        }
      });
    });
  });
}

// --------------------------------------------------------------------------
// 1. PREVIOUS YEAR PAPERS MANAGER
// --------------------------------------------------------------------------

function initPapersManager() {
  const paperForm = document.getElementById("uploadPaperForm");
  const paperTitleInput = document.getElementById("paperTitleInput");
  const paperSubjectInput = document.getElementById("paperSubjectInput");
  const paperDescInput = document.getElementById("paperDescInput");
  const paperCourseInput = document.getElementById("paperCourseInput");
  const paperSemesterInput = document.getElementById("paperSemesterInput");
  const paperYearInput = document.getElementById("paperYearInput");
  const paperExamTypeInput = document.getElementById("paperExamTypeInput");

  const dropzone = document.getElementById("paperDropzone");
  const fileInput = document.getElementById("paperFileInput");
  const selectedFileCard = document.getElementById("paperSelectedFileCard");
  const selectedFileName = document.getElementById("paperSelectedFileName");
  const selectedFileSize = document.getElementById("paperSelectedFileSize");
  const removeFileBtn = document.getElementById("paperRemoveFileBtn");
  const submitBtn = document.getElementById("submitPaperBtn");

  const papersTableBody = document.getElementById("papersTableBody");
  const searchInput = document.getElementById("papersTableSearchInput");
  const resetBtn = document.getElementById("resetPapersBtn");
  const emptyState = document.getElementById("papersTableEmptyState");

  // Mode switcher elements
  const modeFileBtn = document.getElementById("paperModeFileBtn");
  const modeLinkBtn = document.getElementById("paperModeLinkBtn");
  const fileContainer = document.getElementById("paperFileContainer");
  const linkContainer = document.getElementById("paperLinkContainer");
  const imageUrlInput = document.getElementById("paperImageUrlInput");
  const testLinkBtn = document.getElementById("paperTestLinkBtn");
  const imagePreviewBox = document.getElementById("paperImagePreviewBox");
  const imagePreviewImg = document.getElementById("paperImagePreviewImg");
  const previewUrlText = document.getElementById("paperPreviewUrlText");
  const previewOpenLink = document.getElementById("paperPreviewOpenLink");
  const clearLinkBtn = document.getElementById("paperClearLinkBtn");

  let currentAttachmentMode = "file"; // "file" or "link"
  let selectedPaperFile = null;

  // Setup mode toggling
  if (modeFileBtn && modeLinkBtn && fileContainer && linkContainer) {
    modeFileBtn.addEventListener("click", () => {
      currentAttachmentMode = "file";
      modeFileBtn.classList.add("active");
      modeLinkBtn.classList.remove("active");
      fileContainer.style.display = "block";
      linkContainer.style.display = "none";
    });

    modeLinkBtn.addEventListener("click", () => {
      currentAttachmentMode = "link";
      modeLinkBtn.classList.add("active");
      modeFileBtn.classList.remove("active");
      linkContainer.style.display = "block";
      fileContainer.style.display = "none";
      if (imageUrlInput) imageUrlInput.focus();
    });
  }

  let paperPreviewDebounce = null;

  // Handle URL input preview with automatic resolution & proxy fallback
  async function updateImageLinkPreview(url) {
    if (!url || !url.trim()) {
      if (imagePreviewBox) imagePreviewBox.style.display = "none";
      return;
    }
    const cleanUrl = url.trim();
    if (previewUrlText) previewUrlText.textContent = cleanUrl;
    if (previewOpenLink) previewOpenLink.href = cleanUrl;
    if (imagePreviewBox) imagePreviewBox.style.display = "flex";

    const statusContainer = imagePreviewBox.querySelector(".preview-status");
    if (statusContainer) {
      statusContainer.innerHTML = '<span class="preview-dot" style="background: #00B4D8;"></span><span style="font-weight: 600; color: var(--color-primary);">Resolving image link...</span>';
    }

    try {
      const res = await fetch(`/api/resolve-image?url=${encodeURIComponent(cleanUrl)}`);
      const data = await res.json();
      const directUrl = (data && data.directUrl) ? data.directUrl : cleanUrl;

      if (previewOpenLink) previewOpenLink.href = directUrl;

      if (imagePreviewImg) {
        imagePreviewImg.referrerPolicy = "no-referrer";
        imagePreviewImg.crossOrigin = "anonymous";
        imagePreviewImg.dataset.triedProxy = "false";

        imagePreviewImg.onload = () => {
          if (statusContainer) {
            statusContainer.innerHTML = '<span class="preview-dot" style="background: var(--color-success);"></span><span style="font-weight: 600; color: var(--color-success);">Direct Image Preview Active</span>';
          }
        };

        imagePreviewImg.onerror = () => {
          if (imagePreviewImg.dataset.triedProxy !== "true") {
            imagePreviewImg.dataset.triedProxy = "true";
            imagePreviewImg.src = `/api/proxy-image?url=${encodeURIComponent(directUrl)}`;
          } else {
            if (statusContainer) {
              statusContainer.innerHTML = '<span class="preview-dot" style="background: #f59e0b;"></span><span style="font-weight: 600; color: #f59e0b;">External Link (Open Link to view)</span>';
            }
          }
        };

        imagePreviewImg.src = directUrl;
      }
    } catch (err) {
      if (imagePreviewImg) imagePreviewImg.src = cleanUrl;
    }
  }

  if (imageUrlInput) {
    imageUrlInput.addEventListener("input", (e) => {
      const url = e.target.value.trim();
      clearTimeout(paperPreviewDebounce);
      if (url.length > 5) {
        paperPreviewDebounce = setTimeout(() => updateImageLinkPreview(url), 400);
      } else if (!url) {
        if (imagePreviewBox) imagePreviewBox.style.display = "none";
      }
    });

    imageUrlInput.addEventListener("change", (e) => {
      clearTimeout(paperPreviewDebounce);
      updateImageLinkPreview(e.target.value.trim());
    });
  }

  if (testLinkBtn && imageUrlInput) {
    testLinkBtn.addEventListener("click", () => {
      const url = imageUrlInput.value.trim();
      if (!url) {
        showToast("Please enter an image or paper URL first.", "error");
        return;
      }
      clearTimeout(paperPreviewDebounce);
      updateImageLinkPreview(url);
      showToast("Loading and resolving image preview...", "info");
    });
  }

  if (clearLinkBtn && imageUrlInput) {
    clearLinkBtn.addEventListener("click", () => {
      imageUrlInput.value = "";
      if (imagePreviewBox) imagePreviewBox.style.display = "none";
      if (imagePreviewImg) imagePreviewImg.src = "";
    });
  }

  // Dropzone interactions
  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());

    ["dragenter", "dragover"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handlePaperFile(files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handlePaperFile(e.target.files[0]);
      }
    });
  }

  function handlePaperFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    const allowed = ["pdf", "docx", "doc", "png", "jpg", "jpeg"];
    if (!allowed.includes(ext)) {
      showToast("Please upload a PNG image, PDF, or Word question paper file (.png, .pdf, .docx, .doc).", "error");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      showToast("File size exceeds 25MB limit.", "error");
      return;
    }

    selectedPaperFile = file;

    // Auto-fill title if empty
    if (paperTitleInput && !paperTitleInput.value.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      paperTitleInput.value = cleanName;
    }

    if (selectedFileName) selectedFileName.textContent = file.name;
    if (selectedFileSize) selectedFileSize.textContent = `${formatBytes(file.size)} (${ext.toUpperCase()})`;
    if (selectedFileCard) selectedFileCard.style.display = "flex";
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener("click", () => {
      selectedPaperFile = null;
      if (fileInput) fileInput.value = "";
      if (selectedFileCard) selectedFileCard.style.display = "none";
    });
  }

  // Form Submit
  if (paperForm) {
    paperForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = paperTitleInput.value.trim();
      const subject = paperSubjectInput.value.trim();
      const description = paperDescInput.value.trim();
      const course = paperCourseInput.value;
      const semester = paperSemesterInput.value;
      const academicYear = paperYearInput.value;
      const examType = paperExamTypeInput.value;
      const imageUrl = imageUrlInput ? imageUrlInput.value.trim() : "";

      if (!title || !subject || !description) {
        showToast("Please provide Title, Subject, and Description.", "error");
        return;
      }

      if (!selectedPaperFile && !imageUrl) {
        showToast("Please attach a question paper file or provide an image/web link.", "error");
        return;
      }

      const formData = new FormData();
      formData.append("title", title);
      formData.append("subject", subject);
      formData.append("description", description);
      formData.append("course", course);
      formData.append("semester", semester);
      formData.append("academicYear", academicYear);
      formData.append("examType", examType);

      if (imageUrl) {
        formData.append("imageUrl", imageUrl);
        formData.append("linkUrl", imageUrl);
      }

      if (selectedPaperFile) {
        formData.append("paperFile", selectedPaperFile);
        formData.append("file", selectedPaperFile);
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Uploading paper...`;
      }

      try {
        const res = await fetch("/api/papers", {
          method: "POST",
          body: formData
        });

        let data = null;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const text = await res.text().catch(() => "");
          if (!res.ok) {
            if (res.status === 413) {
              throw new Error("File is too large. Please select a file under 50 MB.");
            }
            throw new Error(`Server returned error ${res.status}: ${res.statusText || "Service unavailable"}`);
          }
          throw new Error("Unexpected server response format. Please try again.");
        }

        if (!res.ok || (data && data.error)) {
          throw new Error((data && data.error) || "Failed to upload paper");
        }

        const newPaper = (data && data.paper) || data || {};
        const paperTitle = newPaper.title || title || "Question Paper";
        showToast(`Question Paper "${paperTitle}" uploaded successfully!`, "success");

        // Sync to Firebase Firestore papers & image collections
        const finalImageLink = newPaper.imageUrl || imageUrl || "";
        if (finalImageLink) {
          try {
            await fetch("/api/sync-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: newPaper.id,
                link: finalImageLink,
                imageUrl: finalImageLink,
                title: paperTitle,
                type: "paper",
                subject: newPaper.subject || ""
              })
            });
            console.log("[Firebase] Image link stored in Firestore collection 'image' for paper:", newPaper.id);
          } catch (syncErr) {
            console.warn("[Firebase] /api/sync-image notice:", syncErr.message);
          }
        }

        if (typeof window.firebase !== "undefined" && window.firebase.firestore) {
          try {
            const db = window.firebase.firestore();
            const syncPromises = [
              db.collection("papers").doc(newPaper.id).set({
                id: newPaper.id,
                title: newPaper.title,
                description: newPaper.description,
                subject: newPaper.subject,
                course: newPaper.course,
                semester: newPaper.semester,
                academicYear: newPaper.academicYear,
                examType: newPaper.examType,
                fileName: newPaper.fileName || "",
                imageUrl: finalImageLink,
                linkUrl: finalImageLink,
                downloadCount: newPaper.downloadCount || 0,
                uploadDate: newPaper.uploadDate || new Date().toISOString(),
                createdAt: new Date().toISOString()
              }, { merge: true })
            ];

            if (finalImageLink) {
              syncPromises.push(
                db.collection("image").doc(newPaper.id).set({
                  id: newPaper.id,
                  link: finalImageLink,
                  imageUrl: finalImageLink,
                  title: newPaper.title,
                  type: "paper",
                  createdAt: new Date().toISOString()
                }, { merge: true })
              );
            }

            await Promise.race([
              Promise.all(syncPromises),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore sync timeout")), 2500))
            ]);
            console.log("[Firebase] Synced paper and image link to Firestore:", newPaper.id);
          } catch (fireErr) {
            console.warn("[Firebase] Paper firestore sync notice:", fireErr.message);
          }
        }

        // Reset form
        paperForm.reset();
        selectedPaperFile = null;
        if (fileInput) fileInput.value = "";
        if (selectedFileCard) selectedFileCard.style.display = "none";
        if (imageUrlInput) imageUrlInput.value = "";
        if (imagePreviewBox) imagePreviewBox.style.display = "none";
        if (modeFileBtn) modeFileBtn.click();

        await loadPapers();
      } catch (err) {
        console.error("Paper upload error:", err);
        let errorMsg = err.message || "Failed to upload paper";
        if (errorMsg.includes("Failed to fetch")) {
          errorMsg = "Network connection interrupted or server was reconnecting. Please try again.";
        }
        showToast("Upload failed: " + errorMsg, "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Upload Question Paper
          `;
        }
      }
    });
  }

  // Search filter
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderPapersTable();
    });
  }

  // Reset defaults
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (confirm("Reset Question Papers repository to default university seed papers?")) {
        try {
          const res = await fetch("/api/papers/reset", { method: "POST" });
          if (!res.ok) throw new Error("Reset failed");
          showToast("Question papers repository reset to defaults.", "success");
          await loadPapers();
        } catch (err) {
          showToast("Reset failed: " + err.message, "error");
        }
      }
    });
  }

  // Table event delegation for actions
  if (papersTableBody) {
    papersTableBody.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest('[data-action="delete-paper"]');
      if (deleteBtn) {
        e.preventDefault();
        const id = deleteBtn.getAttribute("data-id");
        const title = deleteBtn.getAttribute("data-title");
        const file = deleteBtn.getAttribute("data-file");
        openDeleteModal(id, title, file, "paper");
      }
    });
  }

  // Initial Load
  loadPapers();
}

async function loadPapers() {
  try {
    const res = await fetch("/api/papers");
    if (!res.ok) throw new Error("Failed to fetch papers");
    allLoadedPapers = await res.json();

    const statTotalPapers = document.getElementById("statTotalPapers");
    const tabPapersBadge = document.getElementById("tabPapersBadge");
    if (statTotalPapers) statTotalPapers.textContent = allLoadedPapers.length;
    if (tabPapersBadge) tabPapersBadge.textContent = allLoadedPapers.length;

    renderPapersTable();
  } catch (err) {
    console.error("Error loading papers:", err);
    showToast("Error loading question papers: " + err.message, "error");
  }
}

function renderPapersTable() {
  const tbody = document.getElementById("papersTableBody");
  const emptyState = document.getElementById("papersTableEmptyState");
  const searchInput = document.getElementById("papersTableSearchInput");
  if (!tbody) return;

  const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const filtered = allLoadedPapers.filter(p => {
    if (!q) return true;
    return (p.title || "").toLowerCase().includes(q) ||
           (p.subject || "").toLowerCase().includes(q) ||
           (p.course || "").toLowerCase().includes(q) ||
           (p.semester || "").toLowerCase().includes(q) ||
           (p.academicYear || "").toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  tbody.innerHTML = filtered.map(paper => {
    const hasImageLink = Boolean(paper.imageUrl);
    const downloadUrl = `/api/papers/${encodeURIComponent(paper.id)}/download`;
    const openUrl = paper.imageUrl ? paper.imageUrl : `/api/papers/${encodeURIComponent(paper.id)}/file?view=inline`;
    const isPng = (paper.fileName || "").toLowerCase().endsWith(".png") || (paper.imageUrl && paper.imageUrl.toLowerCase().includes(".png"));
    const badgeBg = hasImageLink ? "#E0F2FE" : "#CAF0F8";
    const badgeColor = hasImageLink ? "#0369A1" : (isPng ? "#03045E" : "#023EBA");
    const badgeLabel = hasImageLink ? "IMAGE LINK 🔗" : (isPng ? "PNG" : "PDF");

    return `
      <tr>
        <td class="doc-name-cell">
          <span class="pdf-badge" style="background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid #00B4D8; font-weight: 700;">${badgeLabel}</span>
          <div>
            <strong>${escapeHtml(paper.title)}</strong>
            <div style="font-size: 0.75rem; color: var(--color-primary-light); font-weight: 600;">
              ${escapeHtml(paper.subject || "Academic Subject")}
            </div>
          </div>
        </td>
        <td>
          <div style="font-size: 0.85rem; font-weight: 600;">${escapeHtml(paper.course || "General")}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">${escapeHtml(paper.semester || "Semester 1")}</div>
        </td>
        <td style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-main);">
          ${escapeHtml(paper.academicYear || "2024")}
        </td>
        <td>
          <span class="category-tag">${escapeHtml(paper.examType || "End Semester")}</span>
        </td>
        <td style="font-size: 0.8rem; color: var(--color-text-muted);">
          ${hasImageLink ? `
            <a href="${paper.imageUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 0.35rem; color: var(--color-primary); font-weight: 600; text-decoration: underline;" title="${escapeHtml(paper.imageUrl)}">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              <span>Image Link &nearr;</span>
            </a>
          ` : `
            <div style="font-family: monospace; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(paper.fileName)}
            </div>
            <div>${formatBytes(paper.fileSize)}</div>
          `}
        </td>
        <td style="font-size: 0.85rem; font-weight: 600; text-align: center;">
          ${paper.downloadCount || 0}
        </td>
        <td class="actions-cell">
          <a href="${openUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" title="Open and preview paper" style="padding: 0.35rem 0.6rem; color: var(--color-primary); font-weight: 600;">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" style="margin-right: 3px; vertical-align: -1px;">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            ${hasImageLink ? 'View Link' : 'Open'}
          </a>
          <a href="${downloadUrl}" download="${escapeHtml(paper.fileName || 'paper.pdf')}" class="btn btn-outline btn-sm" title="Download paper" style="padding: 0.35rem 0.6rem;">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" style="margin-right: 3px; vertical-align: -1px;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download
          </a>
          <button 
            type="button" 
            class="btn btn-danger btn-sm" 
            data-action="delete-paper" 
            data-id="${escapeHtml(paper.id)}" 
            data-title="${escapeHtml(paper.title)}" 
            data-file="${escapeHtml(paper.fileName)}"
            style="padding: 0.35rem 0.6rem;"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" style="margin-right: 3px; vertical-align: -1px;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

// --------------------------------------------------------------------------
// 2. LATEST NOTICES & CIRCULARS MANAGER
// --------------------------------------------------------------------------

function initNoticesManager() {
  const noticeForm = document.getElementById("uploadNoticeForm");
  const noticeTitleInput = document.getElementById("noticeTitleInput");
  const noticeCategoryInput = document.getElementById("noticeCategoryInput");
  const noticeDescInput = document.getElementById("noticeDescInput");
  const noticeImportantInput = document.getElementById("noticeImportantInput");

  const dropzone = document.getElementById("noticeDropzone");
  const fileInput = document.getElementById("noticeFileInput");
  const selectedFileCard = document.getElementById("noticeSelectedFileCard");
  const selectedFileName = document.getElementById("noticeSelectedFileName");
  const selectedFileSize = document.getElementById("noticeSelectedFileSize");
  const removeFileBtn = document.getElementById("noticeRemoveFileBtn");
  const submitBtn = document.getElementById("submitNoticeBtn");

  const noticesTableBody = document.getElementById("noticesTableBody");
  const searchInput = document.getElementById("noticesTableSearchInput");
  const resetBtn = document.getElementById("resetNoticesBtn");
  const emptyState = document.getElementById("noticesTableEmptyState");

  // Mode switcher elements
  const modeFileBtn = document.getElementById("noticeModeFileBtn");
  const modeLinkBtn = document.getElementById("noticeModeLinkBtn");
  const fileContainer = document.getElementById("noticeFileContainer");
  const linkContainer = document.getElementById("noticeLinkContainer");
  const imageUrlInput = document.getElementById("noticeImageUrlInput");
  const testLinkBtn = document.getElementById("noticeTestLinkBtn");
  const imagePreviewBox = document.getElementById("noticeImagePreviewBox");
  const imagePreviewImg = document.getElementById("noticeImagePreviewImg");
  const previewUrlText = document.getElementById("noticePreviewUrlText");
  const previewOpenLink = document.getElementById("noticePreviewOpenLink");
  const clearLinkBtn = document.getElementById("noticeClearLinkBtn");

  let currentAttachmentMode = "file"; // "file" or "link"
  let selectedNoticeFile = null;

  // Setup mode toggling
  if (modeFileBtn && modeLinkBtn && fileContainer && linkContainer) {
    modeFileBtn.addEventListener("click", () => {
      currentAttachmentMode = "file";
      modeFileBtn.classList.add("active");
      modeLinkBtn.classList.remove("active");
      fileContainer.style.display = "block";
      linkContainer.style.display = "none";
    });

    modeLinkBtn.addEventListener("click", () => {
      currentAttachmentMode = "link";
      modeLinkBtn.classList.add("active");
      modeFileBtn.classList.remove("active");
      linkContainer.style.display = "block";
      fileContainer.style.display = "none";
      if (imageUrlInput) imageUrlInput.focus();
    });
  }

  let noticePreviewDebounce = null;

  // Handle URL input preview with automatic resolution & proxy fallback
  async function updateNoticeImageLinkPreview(url) {
    if (!url || !url.trim()) {
      if (imagePreviewBox) imagePreviewBox.style.display = "none";
      return;
    }
    const cleanUrl = url.trim();
    if (previewUrlText) previewUrlText.textContent = cleanUrl;
    if (previewOpenLink) previewOpenLink.href = cleanUrl;
    if (imagePreviewBox) imagePreviewBox.style.display = "flex";

    const statusContainer = imagePreviewBox.querySelector(".preview-status");
    if (statusContainer) {
      statusContainer.innerHTML = '<span class="preview-dot" style="background: #00B4D8;"></span><span style="font-weight: 600; color: var(--color-primary);">Resolving image link...</span>';
    }

    try {
      const res = await fetch(`/api/resolve-image?url=${encodeURIComponent(cleanUrl)}`);
      const data = await res.json();
      const directUrl = (data && data.directUrl) ? data.directUrl : cleanUrl;

      if (previewOpenLink) previewOpenLink.href = directUrl;

      if (imagePreviewImg) {
        imagePreviewImg.referrerPolicy = "no-referrer";
        imagePreviewImg.crossOrigin = "anonymous";
        imagePreviewImg.dataset.triedProxy = "false";

        imagePreviewImg.onload = () => {
          if (statusContainer) {
            statusContainer.innerHTML = '<span class="preview-dot" style="background: var(--color-success);"></span><span style="font-weight: 600; color: var(--color-success);">Direct Image Preview Active</span>';
          }
        };

        imagePreviewImg.onerror = () => {
          if (imagePreviewImg.dataset.triedProxy !== "true") {
            imagePreviewImg.dataset.triedProxy = "true";
            imagePreviewImg.src = `/api/proxy-image?url=${encodeURIComponent(directUrl)}`;
          } else {
            if (statusContainer) {
              statusContainer.innerHTML = '<span class="preview-dot" style="background: #f59e0b;"></span><span style="font-weight: 600; color: #f59e0b;">External Link (Open Link to view)</span>';
            }
          }
        };

        imagePreviewImg.src = directUrl;
      }
    } catch (err) {
      if (imagePreviewImg) imagePreviewImg.src = cleanUrl;
    }
  }

  if (imageUrlInput) {
    imageUrlInput.addEventListener("input", (e) => {
      const url = e.target.value.trim();
      clearTimeout(noticePreviewDebounce);
      if (url.length > 5) {
        noticePreviewDebounce = setTimeout(() => updateNoticeImageLinkPreview(url), 400);
      } else if (!url) {
        if (imagePreviewBox) imagePreviewBox.style.display = "none";
      }
    });

    imageUrlInput.addEventListener("change", (e) => {
      clearTimeout(noticePreviewDebounce);
      updateNoticeImageLinkPreview(e.target.value.trim());
    });
  }

  if (testLinkBtn && imageUrlInput) {
    testLinkBtn.addEventListener("click", () => {
      const url = imageUrlInput.value.trim();
      if (!url) {
        showToast("Please enter an image or document URL first.", "error");
        return;
      }
      clearTimeout(noticePreviewDebounce);
      updateNoticeImageLinkPreview(url);
      showToast("Loading and resolving image preview...", "info");
    });
  }

  if (clearLinkBtn && imageUrlInput) {
    clearLinkBtn.addEventListener("click", () => {
      imageUrlInput.value = "";
      if (imagePreviewBox) imagePreviewBox.style.display = "none";
      if (imagePreviewImg) imagePreviewImg.src = "";
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());

    ["dragenter", "dragover"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleNoticeFile(files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleNoticeFile(e.target.files[0]);
      }
    });
  }

  function handleNoticeFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    const allowed = ["pdf", "docx", "doc", "png", "jpg", "jpeg"];
    if (!allowed.includes(ext)) {
      showToast("Please upload a PDF circular document or PNG image (.png, .pdf, .docx, .doc).", "error");
      return;
    }

    selectedNoticeFile = file;
    if (selectedFileName) selectedFileName.textContent = file.name;
    if (selectedFileSize) selectedFileSize.textContent = `${formatBytes(file.size)} (${ext.toUpperCase()})`;
    if (selectedFileCard) selectedFileCard.style.display = "flex";
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener("click", () => {
      selectedNoticeFile = null;
      if (fileInput) fileInput.value = "";
      if (selectedFileCard) selectedFileCard.style.display = "none";
    });
  }

  if (noticeForm) {
    noticeForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = noticeTitleInput.value.trim();
      const description = noticeDescInput.value.trim();
      const category = noticeCategoryInput.value;
      const important = noticeImportantInput.checked;
      const imageUrl = imageUrlInput ? imageUrlInput.value.trim() : "";

      if (!title || !description) {
        showToast("Please provide Notice Title and Description.", "error");
        return;
      }

      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("category", category);
      formData.append("important", important ? "true" : "false");
      if (imageUrl) {
        formData.append("imageUrl", imageUrl);
        formData.append("linkUrl", imageUrl);
      }

      if (selectedNoticeFile) {
        formData.append("attachmentFile", selectedNoticeFile);
        formData.append("file", selectedNoticeFile);
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Publishing notice...`;
      }

      try {
        const res = await fetch("/api/notices", {
          method: "POST",
          body: formData
        });

        let data = null;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const text = await res.text().catch(() => "");
          if (!res.ok) {
            if (res.status === 413) {
              throw new Error("Attachment is too large. Please select a file under 50 MB.");
            }
            throw new Error(`Server returned error ${res.status}: ${res.statusText || "Service unavailable"}`);
          }
          throw new Error("Unexpected server response format. Please try again.");
        }

        if (!res.ok || (data && data.error)) {
          throw new Error((data && data.error) || "Failed to publish notice");
        }

        const newNotice = (data && data.notice) || data || {};
        const noticeTitle = newNotice.title || title || "Notice";
        showToast(`Notice "${noticeTitle}" published successfully!`, "success");

        // Sync notice to Firebase Firestore notices & image collections
        const finalNoticeImageLink = newNotice.imageUrl || imageUrl || "";
        if (finalNoticeImageLink) {
          try {
            await fetch("/api/sync-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: newNotice.id,
                link: finalNoticeImageLink,
                imageUrl: finalNoticeImageLink,
                title: noticeTitle,
                type: "notice",
                category: newNotice.category || ""
              })
            });
            console.log("[Firebase] Notice image link stored in Firestore collection 'image':", newNotice.id);
          } catch (syncErr) {
            console.warn("[Firebase] /api/sync-image notice:", syncErr.message);
          }
        }

        if (typeof window.firebase !== "undefined" && window.firebase.firestore) {
          try {
            const db = window.firebase.firestore();
            const noticePromises = [
              db.collection("notices").doc(newNotice.id).set({
                id: newNotice.id,
                title: newNotice.title,
                description: newNotice.description,
                category: newNotice.category,
                important: Boolean(newNotice.important),
                publishedDate: newNotice.publishedDate || new Date().toISOString().split("T")[0],
                imageUrl: finalNoticeImageLink,
                linkUrl: finalNoticeImageLink,
                attachmentName: newNotice.attachmentName || "",
                createdAt: new Date().toISOString()
              }, { merge: true })
            ];

            if (finalNoticeImageLink) {
              noticePromises.push(
                db.collection("image").doc(newNotice.id).set({
                  id: newNotice.id,
                  link: finalNoticeImageLink,
                  imageUrl: finalNoticeImageLink,
                  title: newNotice.title,
                  type: "notice",
                  createdAt: new Date().toISOString()
                }, { merge: true })
              );
            }

            await Promise.race([
              Promise.all(noticePromises),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore sync timeout")), 2500))
            ]);
            console.log("[Firebase] Synced notice and image link to Firestore:", newNotice.id);
          } catch (fireErr) {
            console.warn("[Firebase] Notice firestore sync notice:", fireErr.message);
          }
        }

        // Reset form
        noticeForm.reset();
        selectedNoticeFile = null;
        if (fileInput) fileInput.value = "";
        if (selectedFileCard) selectedFileCard.style.display = "none";
        if (imageUrlInput) imageUrlInput.value = "";
        if (imagePreviewBox) imagePreviewBox.style.display = "none";
        if (modeFileBtn) modeFileBtn.click();

        await loadNotices();
      } catch (err) {
        console.error("Notice publish error:", err);
        let errorMsg = err.message || "Failed to publish notice";
        if (errorMsg.includes("Failed to fetch")) {
          errorMsg = "Network connection interrupted or server was reconnecting. Please try again.";
        }
        showToast("Publish failed: " + errorMsg, "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Publish Notice to Board
          `;
        }
      }
    });
  }

  // Search filter
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderNoticesTable();
    });
  }

  // Reset defaults
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (confirm("Reset Latest Notices board to default university circulars?")) {
        try {
          const res = await fetch("/api/notices/reset", { method: "POST" });
          if (!res.ok) throw new Error("Reset failed");
          showToast("Notices board reset to defaults.", "success");
          await loadNotices();
        } catch (err) {
          showToast("Reset failed: " + err.message, "error");
        }
      }
    });
  }

  // Table event delegation for actions
  if (noticesTableBody) {
    noticesTableBody.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest('[data-action="delete-notice"]');
      if (deleteBtn) {
        e.preventDefault();
        const id = deleteBtn.getAttribute("data-id");
        const title = deleteBtn.getAttribute("data-title");
        const file = deleteBtn.getAttribute("data-file");
        openDeleteModal(id, title, file, "notice");
      }
    });
  }

  // Initial Load
  loadNotices();
}

async function loadNotices() {
  try {
    const res = await fetch("/api/notices");
    if (!res.ok) throw new Error("Failed to fetch notices");
    allLoadedNotices = await res.json();

    const statTotalNotices = document.getElementById("statTotalNotices");
    const tabNoticesBadge = document.getElementById("tabNoticesBadge");
    if (statTotalNotices) statTotalNotices.textContent = allLoadedNotices.length;
    if (tabNoticesBadge) tabNoticesBadge.textContent = allLoadedNotices.length;

    renderNoticesTable();
  } catch (err) {
    console.error("Error loading notices:", err);
    showToast("Error loading notices: " + err.message, "error");
  }
}

function renderNoticesTable() {
  const tbody = document.getElementById("noticesTableBody");
  const emptyState = document.getElementById("noticesTableEmptyState");
  const searchInput = document.getElementById("noticesTableSearchInput");
  if (!tbody) return;

  const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const filtered = allLoadedNotices.filter(n => {
    if (!q) return true;
    return (n.title || "").toLowerCase().includes(q) ||
           (n.category || "").toLowerCase().includes(q) ||
           (n.description || "").toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  tbody.innerHTML = filtered.map(notice => {
    const hasImageLink = Boolean(notice.imageUrl);
    const downloadUrl = `/api/notices/${encodeURIComponent(notice.id)}/attachment?download=true`;
    const openUrl = notice.imageUrl ? notice.imageUrl : `/api/notices/${encodeURIComponent(notice.id)}/file?view=inline`;
    const isPng = (notice.attachmentName || "").toLowerCase().endsWith(".png") || (notice.imageUrl && notice.imageUrl.toLowerCase().includes(".png"));
    const badgeBg = hasImageLink ? "#E0F2FE" : "#CAF0F8";
    const badgeColor = hasImageLink ? "#0369A1" : (isPng ? "#023EBA" : "#03045E");
    const badgeLabel = hasImageLink ? "IMAGE LINK 🔗" : (isPng ? "PNG NOTICE" : "CIRCULAR");

    const formattedDate = notice.publishedDate ? new Date(notice.publishedDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }) : "Recent";

    return `
      <tr>
        <td class="doc-name-cell">
          <span class="pdf-badge" style="background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid #00B4D8; font-weight: 700;">${badgeLabel}</span>
          <div>
            <strong>${escapeHtml(notice.title)}</strong>
            <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 2px;">
              ${notice.important ? `
                <span class="badge-urgent" style="font-size: 0.675rem; padding: 0.1rem 0.4rem;">
                  <span class="pulse-dot" style="width: 5px; height: 5px;"></span>
                  URGENT
                </span>
              ` : `
                <span style="font-size: 0.725rem; color: var(--color-text-muted);">Standard Notice</span>
              `}
            </div>
          </div>
        </td>
        <td>
          <span class="category-tag">${escapeHtml(notice.category || "General")}</span>
        </td>
        <td style="font-size: 0.85rem; color: var(--color-text-main);">
          ${formattedDate}
        </td>
        <td style="font-size: 0.8rem; color: var(--color-text-muted);">
          ${hasImageLink ? `
            <a href="${notice.imageUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 0.35rem; color: var(--color-primary); font-weight: 600; text-decoration: underline;" title="${escapeHtml(notice.imageUrl)}">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              <span>Image Link &nearr;</span>
            </a>
          ` : `
            <div style="font-family: monospace; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(notice.attachmentName || "Notice.pdf")}
            </div>
          `}
        </td>
        <td class="actions-cell">
          <a href="${openUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" title="View circular document/image" style="padding: 0.35rem 0.6rem; color: var(--color-primary); font-weight: 600;">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" style="margin-right: 3px; vertical-align: -1px;">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            ${hasImageLink ? 'View Link' : 'View'}
          </a>
          <a href="${downloadUrl}" download="${escapeHtml(notice.attachmentName || 'Notice.pdf')}" class="btn btn-outline btn-sm" title="Download circular" style="padding: 0.35rem 0.6rem;">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" style="margin-right: 3px; vertical-align: -1px;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download
          </a>
          <button 
            type="button" 
            class="btn btn-danger btn-sm" 
            data-action="delete-notice" 
            data-id="${escapeHtml(notice.id)}" 
            data-title="${escapeHtml(notice.title)}" 
            data-file="${escapeHtml(notice.attachmentName || 'Circular.pdf')}"
            style="padding: 0.35rem 0.6rem;"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" style="margin-right: 3px; vertical-align: -1px;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

// --------------------------------------------------------------------------
// 3. KNOWLEDGE BASE PDFS MANAGER (PRESERVED & INTEGRATED)
// --------------------------------------------------------------------------

function initKnowledgeBaseManager() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const uploadForm = document.getElementById("uploadMetaForm");
  const docCategory = document.getElementById("docCategory");
  const docTitleInput = document.getElementById("docTitle");
  const progressContainer = document.getElementById("progressContainer");
  const progressBarFill = document.getElementById("progressBarFill");
  const progressPercentage = document.getElementById("progressPercentage");
  const progressStatus = document.getElementById("progressStatus");
  const docsTableBody = document.getElementById("docsTableBody");
  const emptyState = document.getElementById("emptyState");
  const tableSearchInput = document.getElementById("tableSearchInput");
  const resetDocsBtn = document.getElementById("resetDocsBtn");

  const statTotalDocs = document.getElementById("statTotalDocs");
  const statTotalChunks = document.getElementById("statTotalChunks");
  const tabDocsBadge = document.getElementById("tabDocsBadge");

  let selectedFile = null;

  // Search filter
  if (tableSearchInput) {
    tableSearchInput.addEventListener("input", () => {
      applyFilterAndRender();
    });
  }

  // Event delegation on table body for actions (Delete, Inspect)
  if (docsTableBody) {
    docsTableBody.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest('[data-action="delete"]');
      if (deleteBtn) {
        e.preventDefault();
        const docId = deleteBtn.getAttribute("data-id");
        const docTitle = deleteBtn.getAttribute("data-title");
        const docFile = deleteBtn.getAttribute("data-filename");
        openDeleteModal(docId, docTitle, docFile, "document");
        return;
      }

      const inspectBtn = e.target.closest('[data-action="inspect"]');
      if (inspectBtn) {
        e.preventDefault();
        const docId = inspectBtn.getAttribute("data-id");
        inspectDocumentChunks(docId);
        return;
      }
    });
  }

  // Dropzone click & drag handlers
  if (dropzone && fileInput) {
    dropzone.addEventListener("click", (e) => {
      if (e.target !== fileInput) {
        fileInput.click();
      }
    });

    fileInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    ["dragenter", "dragover"].forEach(event => {
      dropzone.addEventListener(event, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach(event => {
      dropzone.addEventListener(event, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileSelection(files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelection(e.target.files[0]);
      }
    });
  }

  function handleFileSelection(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    const supportedExts = ["pdf", "txt", "text", "md", "csv", "doc", "docx"];

    if (!supportedExts.includes(ext)) {
      showToast("Please upload an official college document (.pdf, .txt, .md).", "error");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      showToast("File size exceeds 25MB limit.", "error");
      return;
    }

    selectedFile = file;

    // Auto-fill title if empty
    if (docTitleInput && !docTitleInput.value.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      docTitleInput.value = cleanName;
    }

    // Update dropzone UI
    const dropzoneTitle = dropzone.querySelector("h4");
    if (dropzoneTitle) {
      dropzoneTitle.textContent = `Selected: ${file.name} (${formatBytes(file.size)})`;
    }
  }

  // Upload Form Submit
  if (uploadForm) {
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!selectedFile) {
        showToast("Please select a PDF file first.", "info");
        return;
      }

      const title = docTitleInput.value.trim() || selectedFile.name;
      const category = docCategory.value || "General";

      try {
        await processAndUploadPDF(selectedFile, title, category);
      } catch (err) {
        console.error("Upload error:", err);
        showToast("Failed to process and upload PDF: " + err.message, "error");
        hideProgress();
      }
    });
  }

  async function processAndUploadPDF(file, title, category) {
    showProgress();
    updateProgress(15, "Reading PDF file buffer...");

    let extractedChunks = [];

    // Check if client PDF.js is available for fast client extraction
    if (window.pdfjsLib) {
      try {
        updateProgress(35, "Extracting pages using PDF Parser...");
        extractedChunks = await extractTextClientSide(file);
      } catch (pdfErr) {
        console.warn("Client PDF extraction failed, falling back to server:", pdfErr);
      }
    }

    updateProgress(65, "Syncing document and chunks to Firestore Knowledge Base...");

    const formData = new FormData();
    formData.append("pdfFile", file);
    formData.append("title", title);
    formData.append("category", category);
    if (extractedChunks.length > 0) {
      formData.append("chunks", JSON.stringify(extractedChunks));
    }

    const res = await fetch("/api/uploadPDF", {
      method: "POST",
      body: formData
    });

    let responseData = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      responseData = await res.json();
    } else {
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error("File is too large. Please select a document under 50 MB.");
        }
        throw new Error(`Server returned error ${res.status}: ${res.statusText || "Service unavailable"}`);
      }
      throw new Error("Unexpected server response format. Please try again.");
    }

    if (!res.ok || (responseData && responseData.error)) {
      throw new Error((responseData && responseData.error) || "Upload failed on server");
    }

    updateProgress(100, `Complete! Successfully indexed ${responseData.chunksCount || 0} chunks.`);
    showToast(`Successfully indexed "${title}" with ${responseData.chunksCount || 0} chunks!`, "success");

    setTimeout(() => {
      hideProgress();
      selectedFile = null;
      if (fileInput) fileInput.value = "";
      if (docTitleInput) docTitleInput.value = "";
      const dropzoneTitle = dropzone.querySelector("h4");
      if (dropzoneTitle) dropzoneTitle.textContent = "Drop your college PDF here, or click to browse";
      loadDocuments();
    }, 1200);
  }

  async function extractTextClientSide(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const chunks = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();

      if (pageText.length > 20) {
        const words = pageText.split(" ");
        const chunkSize = 350;
        const overlap = 50;

        if (words.length <= chunkSize) {
          chunks.push({
            pageNumber: pageNum,
            text: pageText,
            chunkIndex: chunks.length
          });
        } else {
          for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
            const chunkWords = words.slice(i, i + chunkSize);
            if (chunkWords.length > 30) {
              chunks.push({
                pageNumber: pageNum,
                text: chunkWords.join(" "),
                chunkIndex: chunks.length
              });
            }
          }
        }
      }
    }

    return chunks;
  }

  async function loadDocuments() {
    try {
      const response = await fetch("/api/documents");
      if (!response.ok) throw new Error("Could not fetch documents");
      allLoadedDocuments = await response.json();

      applyFilterAndRender();
      updateDashboardStats(allLoadedDocuments);
    } catch (e) {
      console.error("Error loading documents:", e);
      showToast("Could not load knowledge base documents: " + e.message, "error");
    }
  }

  function applyFilterAndRender() {
    const filterText = tableSearchInput ? tableSearchInput.value.toLowerCase().trim() : "";
    if (!filterText) {
      renderDocumentsTable(allLoadedDocuments);
      return;
    }

    const filtered = allLoadedDocuments.filter(doc => {
      const title = (doc.title || doc.name || "").toLowerCase();
      const orig = (doc.originalName || "").toLowerCase();
      const category = (doc.category || "").toLowerCase();
      return title.includes(filterText) || orig.includes(filterText) || category.includes(filterText);
    });

    renderDocumentsTable(filtered);
  }

  function renderDocumentsTable(docs) {
    if (!docsTableBody) return;
    docsTableBody.innerHTML = "";

    if (!docs || docs.length === 0) {
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    docs.forEach(doc => {
      const tr = document.createElement("tr");

      const uploadDate = doc.uploadDate 
        ? new Date(doc.uploadDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "Official Handbook";

      const sizeFormatted = doc.fileSize 
        ? formatBytes(doc.fileSize)
        : "Standard";

      const titleEsc = escapeHtml(doc.title || doc.name);
      const originalNameEsc = escapeHtml(doc.originalName || doc.name || "");
      const docIdEsc = escapeHtml(doc.id);
      const chunksCount = doc.chunksCount || (doc.chunks ? doc.chunks.length : 0);

      tr.innerHTML = `
        <td class="doc-name-cell">
          <span class="pdf-badge">PDF</span>
          <div>
            <strong>${titleEsc}</strong>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">${originalNameEsc}</div>
          </div>
        </td>
        <td>
          <span class="category-tag">${escapeHtml(doc.category || "General")}</span>
        </td>
        <td>
          <span style="font-family: monospace; font-size: 0.8rem; font-weight: 600;">
            ${chunksCount} chunks
          </span>
        </td>
        <td style="color: var(--color-text-muted); font-size: 0.825rem;">
          ${sizeFormatted}
        </td>
        <td style="color: var(--color-text-muted); font-size: 0.825rem;">
          ${uploadDate}
        </td>
        <td class="actions-cell">
          <button 
            type="button" 
            class="btn btn-outline btn-sm" 
            data-action="inspect" 
            data-id="${docIdEsc}"
          >
            Inspect Chunks
          </button>
          <button 
            type="button" 
            class="btn btn-danger btn-sm" 
            data-action="delete" 
            data-id="${docIdEsc}" 
            data-title="${titleEsc}" 
            data-filename="${originalNameEsc}"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" style="margin-right: 3px; vertical-align: -1px;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete
          </button>
        </td>
      `;

      docsTableBody.appendChild(tr);
    });
  }

  function updateDashboardStats(docs) {
    if (!docs) return;
    const totalDocs = docs.length;
    let totalChunks = 0;
    docs.forEach(d => {
      totalChunks += (d.chunksCount || (d.chunks ? d.chunks.length : 0));
    });

    if (statTotalDocs) statTotalDocs.textContent = totalDocs;
    if (tabDocsBadge) tabDocsBadge.textContent = totalDocs;
    if (statTotalChunks) statTotalChunks.textContent = totalChunks;
  }

  function showProgress() {
    if (progressContainer) progressContainer.classList.add("active");
  }

  function hideProgress() {
    if (progressContainer) progressContainer.classList.remove("active");
  }

  function updateProgress(percent, statusText) {
    if (progressBarFill) progressBarFill.style.width = percent + "%";
    if (progressPercentage) progressPercentage.textContent = percent + "%";
    if (progressStatus) progressStatus.textContent = statusText;
  }

  // Reset defaults handler
  if (resetDocsBtn) {
    resetDocsBtn.addEventListener("click", () => {
      const resetModal = document.getElementById("resetConfirmModal");
      if (resetModal) resetModal.classList.add("active");
    });
  }

  // Load knowledge base docs
  loadDocuments();

  // Expose reload
  window.reloadDocumentsList = loadDocuments;
}

// --------------------------------------------------------------------------
// 4. UNIVERSAL MODALS CONTROLLER (DELETE & CHUNKS)
// --------------------------------------------------------------------------

function initUniversalModals() {
  const deleteModal = document.getElementById("deleteConfirmModal");
  const deleteCloseBtn = document.getElementById("deleteModalCloseBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

  const resetModal = document.getElementById("resetConfirmModal");
  const resetCloseBtn = document.getElementById("resetModalCloseBtn");
  const cancelResetBtn = document.getElementById("cancelResetBtn");
  const confirmResetBtn = document.getElementById("confirmResetBtn");

  const chunkModal = document.getElementById("chunkModal");
  const chunkCloseBtn = document.getElementById("modalCloseBtn");

  // Close handlers
  if (deleteCloseBtn) deleteCloseBtn.addEventListener("click", closeDeleteModal);
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", closeDeleteModal);

  if (chunkCloseBtn) {
    chunkCloseBtn.addEventListener("click", () => {
      if (chunkModal) chunkModal.classList.remove("active");
    });
  }

  if (resetCloseBtn) {
    resetCloseBtn.addEventListener("click", () => {
      if (resetModal) resetModal.classList.remove("active");
    });
  }
  if (cancelResetBtn) {
    cancelResetBtn.addEventListener("click", () => {
      if (resetModal) resetModal.classList.remove("active");
    });
  }

  if (confirmResetBtn) {
    confirmResetBtn.addEventListener("click", async () => {
      confirmResetBtn.disabled = true;
      confirmResetBtn.textContent = "Restoring...";
      try {
        const res = await fetch("/api/documents/reset", { method: "POST" });
        if (!res.ok) throw new Error("Failed to reset knowledge base");
        if (resetModal) resetModal.classList.remove("active");
        showToast("Restored official seed documents successfully!", "success");
        if (typeof window.reloadDocumentsList === "function") {
          await window.reloadDocumentsList();
        }
      } catch (err) {
        showToast("Error restoring documents: " + err.message, "error");
      } finally {
        confirmResetBtn.disabled = false;
        confirmResetBtn.textContent = "Restore Defaults";
      }
    });
  }

  // Universal Delete Confirmation Handler
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      if (!itemPendingDelete) return;

      const { id, title, type } = itemPendingDelete;
      confirmDeleteBtn.disabled = true;
      const confirmDeleteBtnText = document.getElementById("confirmDeleteBtnText");
      if (confirmDeleteBtnText) confirmDeleteBtnText.textContent = "Deleting...";

      try {
        let endpoint = `/api/documents/${encodeURIComponent(id)}`;
        if (type === "paper") {
          endpoint = `/api/papers/${encodeURIComponent(id)}`;
        } else if (type === "notice") {
          endpoint = `/api/notices/${encodeURIComponent(id)}`;
        }

        const res = await fetch(endpoint, { method: "DELETE" });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to delete item from server");
        }

        closeDeleteModal();
        showToast(`"${title}" deleted successfully.`, "success");

        if (type === "paper") {
          await loadPapers();
        } else if (type === "notice") {
          await loadNotices();
        } else {
          if (typeof window.reloadDocumentsList === "function") {
            await window.reloadDocumentsList();
          }
        }
      } catch (err) {
        console.error("Delete error:", err);
        showToast("Delete failed: " + err.message, "error");
        confirmDeleteBtn.disabled = false;
        if (confirmDeleteBtnText) confirmDeleteBtnText.textContent = "Delete Item";
      }
    });
  }

  // Keyboard and outside click
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDeleteModal();
      if (chunkModal) chunkModal.classList.remove("active");
      if (resetModal) resetModal.classList.remove("active");
    }
  });

  [deleteModal, chunkModal, resetModal].forEach(modal => {
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("active");
          if (modal === deleteModal) itemPendingDelete = null;
        }
      });
    }
  });
}

/**
 * Open universal delete modal for document, paper, or notice
 */
window.openDeleteModal = function(id, title, file, type = "document") {
  const modal = document.getElementById("deleteConfirmModal");
  const heading = document.getElementById("deleteModalHeading");
  const subheading = document.getElementById("deleteModalSubheading");
  const titleEl = document.getElementById("deleteTargetTitle");
  const fileEl = document.getElementById("deleteTargetFile");
  const impactEl = document.getElementById("deleteTargetImpact");
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const confirmBtnText = document.getElementById("confirmDeleteBtnText");

  if (!modal) return;

  itemPendingDelete = {
    id,
    title: title || "Selected Item",
    file: file || "-",
    type
  };

  let typeLabel = "Document";
  let impactText = "This document and its indexed page chunks will be permanently removed from the knowledge base.";

  if (type === "paper") {
    typeLabel = "Question Paper";
    impactText = "This examination paper will be permanently removed from the student repository.";
  } else if (type === "notice") {
    typeLabel = "Notice Circular";
    impactText = "This announcement will be removed from the official student notice board.";
  }

  if (heading) heading.textContent = `Delete ${typeLabel}`;
  if (subheading) subheading.textContent = `Remove ${typeLabel.toLowerCase()} from portal`;
  if (titleEl) titleEl.textContent = itemPendingDelete.title;
  if (fileEl) fileEl.textContent = itemPendingDelete.file;
  if (impactEl) impactEl.textContent = impactText;
  if (confirmBtn) confirmBtn.disabled = false;
  if (confirmBtnText) confirmBtnText.textContent = `Delete ${typeLabel}`;

  modal.classList.add("active");
};

window.closeDeleteModal = function() {
  const modal = document.getElementById("deleteConfirmModal");
  if (modal) modal.classList.remove("active");
  itemPendingDelete = null;
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const confirmBtnText = document.getElementById("confirmDeleteBtnText");
  if (confirmBtn) confirmBtn.disabled = false;
  if (confirmBtnText) confirmBtnText.textContent = "Delete Item";
};

// Global fallback for deleteDocument
window.deleteDocument = async function(docId) {
  window.openDeleteModal(docId, "Selected Document", "document.pdf", "document");
};

/**
 * Inspect chunks modal launcher
 */
window.inspectDocumentChunks = async function(docId) {
  const modal = document.getElementById("chunkModal");
  const modalTitle = document.getElementById("modalDocTitle");
  const chunkList = document.getElementById("modalChunkList");
  if (!modal || !chunkList) return;

  chunkList.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--color-text-muted);">Loading indexed chunks...</div>`;
  modal.classList.add("active");

  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/chunks`);
    if (!res.ok) throw new Error("Failed to load chunks");
    const data = await res.json();

    if (modalTitle) modalTitle.textContent = data.documentName || "Document Chunks";

    if (!data.chunks || data.chunks.length === 0) {
      chunkList.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--color-text-muted);">No chunks found for this document.</div>`;
      return;
    }

    chunkList.innerHTML = "";
    data.chunks.forEach((chunk, idx) => {
      const card = document.createElement("div");
      card.className = "chunk-card";
      card.innerHTML = `
        <div class="chunk-header">
          <span>Chunk #${idx + 1} &bull; Page ${chunk.pageNumber || 1}</span>
          <span>${chunk.text ? chunk.text.length : 0} characters</span>
        </div>
        <div class="chunk-text">${escapeHtml(chunk.text || "")}</div>
      `;
      chunkList.appendChild(card);
    });
  } catch (err) {
    chunkList.innerHTML = `<div style="color: var(--color-error); padding: 1.5rem;">Error loading chunks: ${escapeHtml(err.message)}</div>`;
  }
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
