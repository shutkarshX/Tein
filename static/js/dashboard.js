/* =========================================
   PWA & SERVICE WORKER INSTALLATION
   ========================================= */

if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function(err) {
            console.warn("ServiceWorker registration note:", err);
        });
    });
}

let deferredPwaPrompt = null;
window.addEventListener("beforeinstallprompt", function(event) {
    event.preventDefault();
    deferredPwaPrompt = event;
    const installBtn = document.getElementById("pwa-install-btn");
    if (installBtn) {
        installBtn.style.display = "flex";
    }
});

function installPwaApp() {
    if (!deferredPwaPrompt) {
        alert("To install TEIN, tap your browser's menu (⋮ or Share) and select 'Add to Home screen' or 'Install app'.");
        return;
    }
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then(function(choiceResult) {
        if (choiceResult.outcome === "accepted") {
            const installBtn = document.getElementById("pwa-install-btn");
            if (installBtn) {
                installBtn.style.display = "none";
            }
        }
        deferredPwaPrompt = null;
    });
}


/* =========================================
   PROFILE MENU
   ========================================= */

function toggleProfileMenu(event) {
    event.stopPropagation();

    const panel = document.getElementById("profile-menu-panel");
    const trigger = document.querySelector(".profile-menu-trigger");

    if (!panel || !trigger) {
        return;
    }

    const isOpen = panel.classList.toggle("open");
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

document.addEventListener("click", function(event) {
    const menu = document.querySelector(".profile-menu");

    if (!menu || menu.contains(event.target)) {
        return;
    }

    const panel = document.getElementById("profile-menu-panel");
    const trigger = document.querySelector(".profile-menu-trigger");

    if (panel) {
        panel.classList.remove("open");
    }

    if (trigger) {
        trigger.setAttribute("aria-expanded", "false");
    }
});


/* =========================================
   TEIN CLIENT-SIDE GRANULAR LIBRARY (localStorage)
   ========================================= */

const TeinLibrary = {
    getKey: function() {
        const user = (document.body && document.body.dataset && document.body.dataset.studentUsername)
            ? document.body.dataset.studentUsername.trim().toLowerCase()
            : "";
        return user ? ("tein_library_" + user) : "tein_library_default";
    },

    getTodayIso: function() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    },

    getStore: function() {
        try {
            const raw = localStorage.getItem(this.getKey());
            if (!raw) return { subjects: {}, journey: {}, meta: {} };
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return { subjects: {}, journey: {}, meta: {} };
            if (!parsed.subjects) parsed.subjects = {};
            if (!parsed.journey) parsed.journey = {};
            if (!parsed.meta) parsed.meta = {};
            return parsed;
        } catch (e) {
            return { subjects: {}, journey: {}, meta: {} };
        }
    },

    saveStore: function(store) {
        try {
            localStorage.setItem(this.getKey(), JSON.stringify(store));
        } catch (e) {
            console.warn("TeinLibrary localStorage quota exceeded or disabled", e);
        }
    },

    // Subject logs: Sync-driven (permanent until student taps Sync Live)
    getSubject: function(indexOrId) {
        const store = this.getStore();
        const entry = store.subjects[String(indexOrId)];
        if (entry && entry.data) {
            return entry.data;
        }
        return null;
    },

    setSubject: function(indexOrId, data) {
        const store = this.getStore();
        store.subjects[String(indexOrId)] = {
            data: data,
            updated_at: Date.now()
        };
        this.saveStore(store);
    },

    // Daily Journey: Valid for the calendar date. Across midnight, auto-invalidates for the new day.
    getJourney: function(key) {
        const store = this.getStore();
        const entry = store.journey[String(key)];
        if (!entry || !entry.data) return null;

        if (key === "today") {
            const todayIso = this.getTodayIso();
            // If the cached journey date doesn't match today's date, midnight passed!
            if (entry.date_iso && entry.date_iso !== todayIso) {
                return null;
            }
        }
        return entry.data;
    },

    setJourney: function(key, data) {
        const store = this.getStore();
        store.journey[String(key)] = {
            data: data,
            date_iso: data.date || this.getTodayIso(),
            updated_at: Date.now()
        };
        this.saveStore(store);
    },

    clearJourney: function() {
        const store = this.getStore();
        store.journey = {};
        this.saveStore(store);
    },

    clearSubjects: function() {
        const store = this.getStore();
        store.subjects = {};
        this.saveStore(store);
    },

    // Profile Photo: base64 Data URL or null (when student has no uploaded photo)
    getPhoto: function() {
        const store = this.getStore();
        return store.photo; // returns string (data URL), null (no photo), or undefined (not fetched yet)
    },

    setPhoto: function(photoDataUrlOrNull) {
        const store = this.getStore();
        store.photo = photoDataUrlOrNull;
        this.saveStore(store);
    },

    clearPhoto: function() {
        const store = this.getStore();
        delete store.photo;
        this.saveStore(store);
    },

    clearAll: function() {
        try {
            localStorage.removeItem(this.getKey());
        } catch (e) {}
    }
};

window.TeinLibrary = TeinLibrary;

// Multi-tab synchronization: reset in-memory UI panels if another tab syncs
window.addEventListener("storage", function(event) {
    if (event.key && event.key.startsWith("tein_library_")) {
        const container = document.getElementById("subject-attendance-details");
        if (container) {
            container.querySelectorAll("[data-subject-detail]").forEach(function(panel) {
                panel.remove();
            });
        }
    }
});

/* =========================================
   PROFILE PHOTO STORAGE & DISPLAY (0.0ms load)
   ========================================= */

function initProfilePhotoStorage() {
    const avatarImgs = document.querySelectorAll(".profile-avatar, .profile-menu-photo");
    const fallbackSpans = document.querySelectorAll(".profile-avatar-fallback");
    if (!avatarImgs.length && !fallbackSpans.length) return;

    function showPhoto(src) {
        avatarImgs.forEach(function(img) {
            if (img.tagName === "IMG") {
                img.src = src;
                img.style.display = "";
            }
        });
        fallbackSpans.forEach(function(span) {
            span.style.display = "none";
        });
    }

    function showFallback() {
        avatarImgs.forEach(function(img) {
            if (img.tagName === "IMG") {
                img.style.display = "none";
            }
        });
        fallbackSpans.forEach(function(span) {
            span.style.display = "inline-flex";
        });
    }

    // 1. Check client-side Library (localStorage) first! (0.0ms instant load, 0 network requests)
    const cachedPhoto = TeinLibrary.getPhoto();

    if (typeof cachedPhoto === "string" && cachedPhoto.length > 20) {
        showPhoto(cachedPhoto);
        return;
    }

    if (cachedPhoto === null) {
        showFallback();
        return;
    }

    // 2. Not cached in localStorage yet (first load). Fetch /profile-photo in background:
    fetch("/profile-photo")
        .then(function(res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            const avatarType = res.headers.get("X-Avatar-Type");
            const contentType = (res.headers.get("Content-Type") || "").toLowerCase();

            if (avatarType === "default" || contentType.includes("svg")) {
                TeinLibrary.setPhoto(null);
                showFallback();
                return;
            }

            return res.blob().then(function(blob) {
                if (blob.size < 50) {
                    TeinLibrary.setPhoto(null);
                    showFallback();
                    return;
                }
                const reader = new FileReader();
                reader.onloadend = function() {
                    const base64Data = reader.result;
                    if (typeof base64Data === "string" && base64Data.startsWith("data:image")) {
                        TeinLibrary.setPhoto(base64Data);
                        showPhoto(base64Data);
                    } else {
                        TeinLibrary.setPhoto(null);
                        showFallback();
                    }
                };
                reader.readAsDataURL(blob);
            });
        })
        .catch(function(err) {
            console.warn("Could not cache profile photo in TeinLibrary:", err);
        });
}

// Run immediately if DOM is ready, or on DOMContentLoaded
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProfilePhotoStorage);
} else {
    initProfilePhotoStorage();
}

// In-flight request deduplication map
const activeSubjectFetches = new Map();


/* =========================================
   TODAY'S ATTENDANCE
   ========================================= */

let todayAttendanceData = null;
let journeyAbortController = null;
let currentLoadedJourneyTab = null;

async function loadTodayAttendance() {
    return loadAttendanceJourney("/today-attendance", false);
}

async function loadPreviousTeachingDay() {
    return loadAttendanceJourney("/today-attendance?date=previous", true);
}

function applyJourneyData(data, requestedTab) {
    const result = document.getElementById("today-attendance-result");
    const error = document.getElementById("today-attendance-error");
    const dateBadge = document.getElementById("journey-date-badge");
    const card = document.getElementById("today-attendance-card");
    if (!result || !error) return;

    todayAttendanceData = data;
    const pres = data.present != null ? data.present : (data.present_count != null ? data.present_count : 0);
    const abs = data.absent != null ? data.absent : (data.absent_count != null ? data.absent_count : 0);
    const rem = data.remaining != null ? data.remaining : (data.remaining_count != null ? data.remaining_count : 0);
    const presEl = document.getElementById("today-present-count");
    const absEl = document.getElementById("today-absent-count");
    const remEl = document.getElementById("today-remaining-count");
    if (presEl) presEl.textContent = pres + " Present";
    if (absEl) absEl.textContent = abs + " Absent";
    if (remEl) remEl.textContent = rem + " Remaining";

    if (dateBadge) {
        dateBadge.textContent = data.date_label || data.date_display || (data.is_today ? "Today" : "Previous Day");
    }

    const hasClasses = (data.schedule || []).length || (data.classes || []).length;
    const detailsToggle = document.getElementById("today-attendance-details-toggle");
    const detailsEl = document.getElementById("today-attendance-details");

    if (!hasClasses || data.no_classes) {
        if (detailsToggle) detailsToggle.hidden = true;
        if (detailsEl) {
            detailsEl.hidden = false;
            const dateStr = data.date_display || data.date_label || (data.is_today ? "today" : "this day");
            detailsEl.innerHTML = `
                <div class="today-no-classes-card">
                    <span class="no-classes-icon">🏖️</span>
                    <div class="no-classes-content">
                        <strong>No classes scheduled for ${escapeTodayAttendanceText(dateStr)}</strong>
                        <p>No timetable records found on the college ERP. Enjoy your day off!</p>
                    </div>
                </div>`;
        }
    } else {
        if (detailsToggle) {
            detailsToggle.hidden = false;
            const isDetailsOpen = detailsEl && !detailsEl.hidden;
            detailsToggle.textContent = isDetailsOpen ? "Hide journey details" : "View journey details";
        }
        renderTodayAttendanceDetails();
    }

    error.hidden = true;
    result.hidden = false;
    result.style.transition = "opacity 0.22s ease";
    result.style.opacity = "1";
    currentLoadedJourneyTab = requestedTab;

    scrollElementIntoComfortableView(card || result);
}

async function loadAttendanceJourney(url, isPrevious) {
    const todayTab = document.getElementById("tab-journey-today");
    const prevTab = document.getElementById("tab-journey-previous");
    const result = document.getElementById("today-attendance-result");
    const error = document.getElementById("today-attendance-error");
    const dateBadge = document.getElementById("journey-date-badge");
    const card = document.getElementById("today-attendance-card");
    if (!result || !error) return;

    const requestedTab = isPrevious ? "previous" : "today";

    // If user clicks the tab that is already successfully loaded and visible, ensure it's comfortably in view without re-fetching
    if (currentLoadedJourneyTab === requestedTab && todayAttendanceData && (!result.hidden && error.hidden)) {
        scrollElementIntoComfortableView(card || result);
        return;
    }

    // 1. Check client-side Library (localStorage) first! (0.0ms instant load, 0 server requests)
    const cachedJourney = TeinLibrary.getJourney(requestedTab);
    if (cachedJourney) {
        if (todayTab && prevTab) {
            todayTab.classList.toggle("active", !isPrevious);
            prevTab.classList.toggle("active", isPrevious);
        }
        applyJourneyData(cachedJourney, requestedTab);
        return;
    }

    // Cancel any in-flight request to eliminate race conditions
    if (journeyAbortController) {
        try { journeyAbortController.abort(); } catch (e) {}
    }
    journeyAbortController = new AbortController();

    if (todayTab && prevTab) {
        todayTab.classList.toggle("active", !isPrevious);
        prevTab.classList.toggle("active", isPrevious);
    }

    if (dateBadge) {
        dateBadge.textContent = "Loading...";
    }
    triggerUniversalLoading(null);

    // In-place soft dim: smoothly dim visible content without collapsing container height!
    const activeContent = (!result.hidden && result.innerHTML.trim()) ? result : ((!error.hidden && error.innerHTML.trim()) ? error : null);
    if (activeContent) {
        activeContent.style.transition = "opacity 0.15s ease";
        activeContent.style.opacity = "0.5";
    }

    try {
        const response = await fetch(url, {
            headers: {"Accept": "application/json"},
            cache: "no-store",
            signal: journeyAbortController.signal
        });
        const data = await response.json().catch(function() { return null; });
        const errMsg = (data && data.error) ? data.error : "";
        const isSessionExpired = response.status === 401 || (data && data.session_expired) ||
            errMsg.toLowerCase().includes("expired") ||
            errMsg.toLowerCase().includes("no longer available") ||
            errMsg.toLowerCase().includes("log in") ||
            errMsg.toLowerCase().includes("session");

        if (!response.ok || !data) {
            if (isSessionExpired) {
                updateSessionBadge(false);
                if (typeof showSyncToast === "function") {
                    showSyncToast("🔒 College session timed out. Tap to reconnect.", "error");
                }
                error.innerHTML = `
                    <div class="journey-expired-card">
                        <div class="journey-expired-left">
                            <span class="journey-expired-icon">🔒</span>
                            <div class="journey-expired-text">
                                <strong>College Portal Session Expired</strong>
                                <p>Reconnect your session to view timetable &amp; marked classes.</p>
                            </div>
                        </div>
                        <button type="button" onclick="openQuickReloginModal()" class="journey-reconnect-btn" title="Tap to sign in with college portal">
                            <span class="sync-icon">⚡</span>
                            <span>Reconnect Portal</span>
                        </button>
                    </div>`;
                result.hidden = true;
                error.hidden = false;
                error.style.transition = "opacity 0.22s ease";
                error.style.opacity = "1";
                currentLoadedJourneyTab = requestedTab;
                if (dateBadge) {
                    dateBadge.textContent = isPrevious ? "Previous Day" : "Today";
                }
                scrollElementIntoComfortableView(card || error);
                return;
            }
            throw new Error(errMsg || "Attendance journey could not be loaded.");
        }

        // Live valid response: ensure session badge stays active/green!
        updateSessionBadge(true);

        // Save into client-side Library!
        TeinLibrary.setJourney(requestedTab, data);

        applyJourneyData(data, requestedTab);
    } catch (loadError) {
        if (loadError.name === "AbortError") {
            return;
        }

        // Always restore the date badge so it NEVER stays stuck on "Loading..."!
        if (dateBadge) {
            dateBadge.textContent = isPrevious ? "Previous Day" : "Today";
        }

        // Fallback to offline stored journey in Library if available
        const offlineJourney = TeinLibrary.getJourney(requestedTab);
        if (offlineJourney) {
            applyJourneyData(offlineJourney, requestedTab);
            return;
        }

        // Prefer Reconnect Portal as primary action with a secondary quick retry link
        const retryFn = isPrevious ? "loadPreviousTeachingDay()" : "loadTodayAttendance()";
        updateSessionBadge(false);
        error.innerHTML = `
            <div class="journey-expired-card">
                <div class="journey-expired-left">
                    <span class="journey-expired-icon">🔒</span>
                    <div class="journey-expired-text">
                        <strong>College Portal Connection Inactive</strong>
                        <p>Reconnect your session to view live timetable &amp; marked classes.</p>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button type="button" onclick="openQuickReloginModal()" class="journey-reconnect-btn" title="Tap to sign in with college portal">
                        <span class="sync-icon">⚡</span>
                        <span>Reconnect Portal</span>
                    </button>
                    <button type="button" onclick="${retryFn}" class="attendance-button" style="padding: 6px 12px; font-size: 12px; background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.1); color: inherit;" title="Retry connection without credentials">
                        <span>↻ Retry</span>
                    </button>
                </div>
            </div>`;
        result.hidden = true;
        error.hidden = false;
        error.style.transition = "opacity 0.22s ease";
        error.style.opacity = "1";
        currentLoadedJourneyTab = requestedTab;
        scrollElementIntoComfortableView(card || error);
    } finally {
        stopUniversalLoading(null);
    }
}

function renderTodayAttendanceDetails() {
    const details = document.getElementById("today-attendance-details");
    if (!details || !todayAttendanceData) return;

    const markedClasses = todayAttendanceData.classes || [];
    const schedule = todayAttendanceData.schedule || [];
    const isToday = todayAttendanceData.is_today !== false;
    const dateLabel = todayAttendanceData.date_display || todayAttendanceData.date_label || (isToday ? "Today" : "previous teaching day");

    if (!schedule.length && !markedClasses.length) {
        details.innerHTML = "<p class=\"today-attendance-empty\">No classes were returned for "
            + escapeTodayAttendanceText(dateLabel)
            + ". You can view the previous teaching day instead.</p>";
        return;
    }

    function timeMinutes(value) {
        const match = String(value || "").trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return Number.MAX_SAFE_INTEGER;
        let hour = Number(match[1]);
        const minute = Number(match[2]);
        const period = match[3].toUpperCase();
        if (period === "AM" && hour === 12) hour = 0;
        if (period === "PM" && hour !== 12) hour += 12;
        return hour * 60 + minute;
    }

    function normalizeTime(value) {
        return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
    }

    let rows = [];

    // The actual marked classes for this date are the ground truth for attendance
    if (markedClasses.length) {
        // If timetable schedule exists for this date, map each marked record to its matching scheduled slot if possible
        const usedScheduleIndices = new Set();

        rows = markedClasses.map(function(marked) {
            const markedSubjectId = String(marked.subject_id || "").trim();
            const markedSubject = String(marked.subject || "").trim().toLowerCase();
            const markedTime = normalizeTime(marked.time);

            // Attempt to find a matching slot in the day's schedule
            let matchTime = marked.time;
            for (let i = 0; i < schedule.length; i++) {
                if (usedScheduleIndices.has(i)) continue;
                const slot = schedule[i];
                const slotSubjectId = String(slot.subject_id || "").trim();
                const slotSubject = String(slot.subject || slot.code || "").trim().toLowerCase();
                const slotStart = normalizeTime(slot.start_time);
                const slotEnd = normalizeTime(slot.end_time);

                const idMatches = markedSubjectId && slotSubjectId && markedSubjectId === slotSubjectId;
                const nameMatches = markedSubject && slotSubject && (
                    markedSubject.includes(slotSubject) || slotSubject.includes(markedSubject)
                );
                const timeMatches = !markedTime || (slotStart && markedTime.includes(slotStart)) || (slotEnd && markedTime.includes(slotEnd));

                if ((idMatches || nameMatches) && timeMatches) {
                    usedScheduleIndices.add(i);
                    if (slot.start_time && slot.end_time) {
                        matchTime = slot.start_time + " - " + slot.end_time;
                    }
                    break;
                }
            }

            const timeParts = String(matchTime || "").split(" - ");
            return {
                time: matchTime || "Time not available",
                subject: marked.subject || "Unknown subject",
                statusClass: marked.status === "present" ? "present" : marked.status === "absent" ? "absent" : "unknown",
                statusLabel: marked.status === "present" ? "Present" : marked.status === "absent" ? "Absent" : (marked.status_label || "Not marked"),
                sortKey: timeMinutes(timeParts[0])
            };
        });

        // Only for TODAY do we show un-held classes that are scheduled for later today
        if (isToday && schedule.length) {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            schedule.forEach(function(slot, index) {
                if (!usedScheduleIndices.has(index)) {
                    const time = slot.start_time && slot.end_time
                        ? slot.start_time + " - " + slot.end_time
                        : slot.start_time || slot.end_time || "Time not available";
                    const slotEndMinutes = timeMinutes(slot.end_time || slot.start_time);
                    const hasPassed = slotEndMinutes !== Number.MAX_SAFE_INTEGER && slotEndMinutes <= currentMinutes;
                    const statusLabel = hasPassed ? "Unmarked" : "Upcoming";
                    rows.push({
                        time: time,
                        subject: slot.subject || slot.code || (hasPassed ? "Unmarked class" : "Upcoming class"),
                        statusClass: "unknown",
                        statusLabel: statusLabel,
                        sortKey: timeMinutes(slot.start_time)
                    });
                }
            });
        }
    } else if (schedule.length) {
        // No attendance records marked yet (e.g. earlier today before attendance is posted)
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        rows = schedule.map(function(item) {
            const time = item.start_time && item.end_time
                ? item.start_time + " - " + item.end_time
                : item.start_time || item.end_time || "Time not available";
            let statusLabel = "Not marked";
            if (isToday) {
                const slotEndMinutes = timeMinutes(item.end_time || item.start_time);
                const hasPassed = slotEndMinutes !== Number.MAX_SAFE_INTEGER && slotEndMinutes <= currentMinutes;
                statusLabel = hasPassed ? "Unmarked" : "Upcoming";
            }
            return {
                time: time,
                subject: item.subject || item.code || "Unknown subject",
                statusClass: "unknown",
                statusLabel: statusLabel,
                sortKey: timeMinutes(item.start_time)
            };
        });
    }

    rows.sort(function(a, b) { return a.sortKey - b.sortKey; });

    details.innerHTML = rows.map(function(item) {
        const mascotImg = item.statusClass === "present"
            ? "<img src=\"/static/characters/mascot_present.webp\" alt=\"Present\" class=\"timeline-mascot-sticker present-mascot\">"
            : item.statusClass === "absent"
            ? "<img src=\"/static/characters/mascot_absent.webp\" alt=\"Absent\" class=\"timeline-mascot-sticker absent-mascot\">"
            : (item.statusLabel === "Upcoming"
                ? "<span class=\"timeline-upcoming-dot\">⏳</span>"
                : "<span class=\"timeline-unmarked-dot\">·</span>");

        const statusNote = (item.statusLabel && !["present", "absent", "p", "a"].includes(String(item.statusLabel).trim().toLowerCase()))
            ? "<small>" + escapeTodayAttendanceText(item.statusLabel) + "</small>"
            : "";

        return "<div class=\"today-attendance-timeline-item " + item.statusClass + "\">"
            + "<div class=\"today-attendance-time\">" + escapeTodayAttendanceText(item.time) + "</div>"
            + "<div class=\"today-attendance-tube\"><div class=\"today-attendance-tube-fill\"></div></div>"
            + "<div class=\"today-attendance-class\">"
            + "<div class=\"today-class-title-row\">"
            + mascotImg
            + "<strong>" + escapeTodayAttendanceText(item.subject) + "</strong>"
            + "</div>"
            + statusNote
            + "<span class=\"today-attendance-status " + item.statusClass + "\">"
            + (item.statusClass === "present" ? "✓" : item.statusClass === "absent" ? "✕" : (item.statusLabel === "Upcoming" ? "⏳" : "·"))
            + " " + escapeTodayAttendanceText(item.statusLabel)
            + "</span></div></div>";
    }).join("");
}

function toggleTodayAttendanceDetails() {
    const details = document.getElementById("today-attendance-details");
    const button = document.getElementById("today-attendance-details-toggle");
    if (!details || !button) return;

    const hidden = details.hidden;
    details.hidden = !hidden;
    const label = todayAttendanceData && todayAttendanceData.is_today === false
        ? "previous day's"
        : "today's";
    button.textContent = hidden ? "Hide " + label + " journey" : "View " + label + " journey";
    if (hidden) {
        details.classList.remove("journey-animated-entry");
        void details.offsetWidth;
        details.classList.add("journey-animated-entry");
        scrollElementIntoComfortableView(details);
    }
}

function escapeTodayAttendanceText(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}


/* =========================================
   SUBJECT ATTENDANCE DETAILS
   ========================================= */


function showEventDetails() {
    const details = document.getElementById("event-details");
    if (details) {
        details.style.display = "block";
        scrollElementIntoViewIfNeeded(details);
    }
}


/* =========================================
   ATTENDANCE BY DATE
   ========================================= */

async function loadAttendanceByDate() {
    const input = document.getElementById("attendance-history-date");
    const button = document.getElementById("load-attendance-date");
    const message = document.getElementById("attendance-date-message");
    const results = document.getElementById("attendance-date-results");
    const selectedHeading = document.getElementById("attendance-date-heading");
    const summary = document.getElementById("attendance-date-summary");
    const rows = document.getElementById("attendance-date-rows");
    if (!input || !button || !message || !results || !summary || !rows) return;

    if (!input.value) {
        message.textContent = "Choose a date first.";
        results.hidden = true;
        return;
    }

    button.disabled = true;
    message.textContent = "Loading attendance for " + input.value + "…";
    results.hidden = true;
    try {
        const response = await fetch("/attendance-by-date?date=" + encodeURIComponent(input.value), {
            headers: {"Accept": "application/json"},
            credentials: "same-origin"
        });
        const data = await response.json().catch(function() { return null; });
        if (!response.ok || !data) {
            if (response.status === 401 || (data && data.session_expired)) {
                updateSessionBadge(false);
                openQuickReloginModal();
                throw new Error("Portal session expired. Please reconnect.");
            }
            throw new Error((data && data.error) || "Could not load attendance for this date.");
        }

        selectedHeading.textContent = "Attendance recorded on " + data.date_label;
        const totals = data.summary || {};
        const cards = [
            ["Present classes", totals.present || 0, "present"],
            ["Absent classes", totals.absent || 0, "absent"],
            ["Unmarked classes", totals.unmarked || 0, "unmarked"],
            ["Subjects with no record", totals.no_record_subjects || 0, "no-record"]
        ];
        summary.innerHTML = cards.map(function(card) {
            return '<div class="date-attendance-stat ' + card[2] + '"><span>' +
                escapeTodayAttendanceText(card[0]) + '</span><strong>' +
                escapeTodayAttendanceText(card[1]) + '</strong></div>';
        }).join("");

        const statusLabels = {present: "Present", absent: "Absent", unmarked: "Unmarked", no_record: "No record", mixed: "Mixed"};
        rows.innerHTML = (data.subjects || []).map(function(subject) {
            const status = subject.status || "no_record";
            return "<tr><td>" + escapeTodayAttendanceText(subject.subject) +
                "</td><td>" + escapeTodayAttendanceText(subject.code || "-") +
                '</td><td><span class="date-attendance-status ' + status + '">' +
                escapeTodayAttendanceText(statusLabels[status] || "Unknown") +
                "</span></td><td>" + escapeTodayAttendanceText(subject.present || 0) +
                "</td><td>" + escapeTodayAttendanceText(subject.absent || 0) +
                "</td><td>" + escapeTodayAttendanceText(subject.unmarked || 0) +
                "</td><td>" + escapeTodayAttendanceText(subject.classes || 0) + "</td></tr>";
        }).join("");
        if (!(data.subjects || []).length) {
            rows.innerHTML = '<tr><td colspan="7">No subjects were returned by the portal.</td></tr>';
        }
        results.hidden = false;
        results.classList.remove("scenario-result-animated-entry");
        void results.offsetWidth;
        results.classList.add("scenario-result-animated-entry");
        message.textContent = "Attendance loaded. Subjects with no record are not counted as absent.";
        glideDownToResult(results);
    } catch (error) {
        message.textContent = error.message || "Could not load attendance for this date.";
    } finally {
        button.disabled = false;
    }
}


function escapeSubjectHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function renderSubjectDetailPanel(index, subjectName, records) {
    const panel = document.createElement("div");
    panel.className = "subject-detail-panel";
    panel.dataset.subjectDetail = String(index);

    let rowsHtml = "";
    if (records && records.length > 0) {
        records.forEach(function(rec, idx) {
            const rawStatus = String(rec.presenty || "").trim().toLowerCase();
            let badgeClass = "badge-pill-unmarked";
            let badgeText = rec.presenty || "Unmarked";
            if (rawStatus === "p" || rawStatus === "present" || rawStatus.includes("present")) {
                badgeClass = "badge-pill-present";
                badgeText = "Present";
            } else if (rawStatus === "a" || rawStatus === "absent" || rawStatus.includes("absent")) {
                badgeClass = "badge-pill-absent";
                badgeText = "Absent";
            }

            const timeRange = (rec.stime && rec.etime) ? `${rec.stime} - ${rec.etime}` : (rec.stime || rec.etime || "-");

            rowsHtml += `
                <tr data-attendance-status="${rawStatus}" data-attendance-row>
                    <td>${idx + 1}</td>
                    <td>${escapeSubjectHtml(rec.Date || "-")}</td>
                    <td>${escapeSubjectHtml(timeRange)}</td>
                    <td>${escapeSubjectHtml(rec.sessionNo || "-")}</td>
                    <td><span class="badge-pill ${badgeClass}">${escapeSubjectHtml(badgeText)}</span></td>
                </tr>
            `;
        });
    }

    panel.innerHTML = `
        <div class="summary subject-detail-header" style="margin-bottom:16px;">
            <div class="subject-detail-heading-row">
                <div>
                    <span class="what-if-kicker">LECTURE LOGS</span>
                    <h2>${escapeSubjectHtml(subjectName)}</h2>
                </div>
                <button type="button" class="subject-detail-close-btn" onclick="closeSubjectDetails()">
                    ✕ Close log
                </button>
            </div>
        </div>

        ${records && records.length > 0 ? `
            <div class="subject-attendance-filter" role="group" aria-label="Attendance filter">
                <button type="button" class="subject-filter-button active" data-filter="all" onclick="filterSubjectAttendance(this, 'all')">
                    All <span>${records.length}</span>
                </button>
                <button type="button" class="subject-filter-button" data-filter="present" onclick="filterSubjectAttendance(this, 'present')">
                    Present <span data-filter-count="present">0</span>
                </button>
                <button type="button" class="subject-filter-button" data-filter="absent" onclick="filterSubjectAttendance(this, 'absent')">
                    Absent <span data-filter-count="absent">0</span>
                </button>
            </div>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Sr. No.</th>
                            <th>Date</th>
                            <th>Lecture Time</th>
                            <th>Session</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        ` : `
            <p style="padding:16px; color:#78716c;">No attendance details were returned for this subject.</p>
        `}
    `;

    return panel;
}


function renderSubjectExpiredCard(index) {
    return `
        <div class="subject-expired-card" style="padding: 20px 16px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 16px; margin: 12px 0; text-align: center; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.06);">
            <div style="font-size: 24px; margin-bottom: 6px;">⏱️</div>
            <div style="font-weight: 700; color: #9f1239; margin-bottom: 4px; font-size: 15px;">College Session Expired</div>
            <div style="font-size: 13px; color: #881337; margin-bottom: 14px; line-height: 1.4;">Your portal session timed out. Enter your password to unlock lecture logs right here:</div>
            
            <form id="inline-relogin-form-${index}" onsubmit="handleInlineRelogin(event, ${index})" style="display:flex; flex-direction:column; gap:8px; max-width:280px; margin:0 auto;">
                <input type="password" id="inline-relogin-pwd-${index}" placeholder="Enter college ERP password" required autocomplete="current-password" style="padding: 10px 14px; border: 1px solid #fca5a5; border-radius: 10px; font-size: 14px; width: 100%; box-sizing: border-box; outline: none; background: #ffffff;">
                <div id="inline-relogin-err-${index}" style="display:none; color:#dc2626; font-size:12px; font-weight:600; margin-top: 2px;"></div>
                <button type="submit" id="inline-relogin-btn-${index}" class="attendance-button" style="padding: 10px 16px; font-size: 13px; font-weight: 600; width: 100%;">
                    Unlock Lecture Logs
                </button>
            </form>
            
            <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed #fecdd3;">
                <a href="/login?next=subjects&reason=expired" style="font-size: 12px; color: #9f1239; text-decoration: underline;">Or sign in on full login page →</a>
            </div>
        </div>
    `;
}

async function handleInlineRelogin(event, index) {
    event.preventDefault();
    const pwdInput = document.getElementById(`inline-relogin-pwd-${index}`);
    const btn = document.getElementById(`inline-relogin-btn-${index}`);
    const errEl = document.getElementById(`inline-relogin-err-${index}`);
    if (!pwdInput || !btn) return;
    
    const password = pwdInput.value;
    if (!password) return;
    
    const username = (document.body.dataset.studentUsername || "").trim();
    
    btn.disabled = true;
    const origBtnText = btn.innerHTML;
    btn.innerHTML = `<span style="display:inline-block; width:13px; height:13px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spinnerRotate 0.6s linear infinite; vertical-align:middle; margin-right:6px;"></span> Unlocking...`;
    if (errEl) errEl.style.display = "none";
    
    try {
        const resp = await fetch("/api/quick-relogin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username, password: password })
        });
        const data = await resp.json().catch(function() { return null; });
        if (resp.ok && data && data.success) {
            btn.innerHTML = `✅ Unlocked! Loading...`;
            updateSessionBadge(true);
            setTimeout(function() {
                showSubjectAttendance(index);
            }, 300);
        } else {
            const msg = (data && data.error) ? data.error : "Could not re-authenticate. Check your password.";
            if (errEl) {
                errEl.textContent = msg;
                errEl.style.display = "block";
            }
            btn.disabled = false;
            btn.innerHTML = origBtnText;
        }
    } catch (e) {
        if (errEl) {
            errEl.textContent = "Network error. Please try again or use the full login page.";
            errEl.style.display = "block";
        }
        btn.disabled = false;
        btn.innerHTML = origBtnText;
    }
}

let currentOpenedSubjectIndex = null;

async function showSubjectAttendance(index) {
    currentOpenedSubjectIndex = index;
    const container = document.getElementById("subject-attendance-details");
    if (!container) {
        return;
    }

    // Hide any loader from a previous click
    const existingLoader = document.getElementById("subject-attendance-lazy-loader");
    if (existingLoader) {
        existingLoader.style.display = "none";
    }

    // Hide all existing panels first
    const panels = container.querySelectorAll("[data-subject-detail]");
    let selectedPanel = null;
    panels.forEach(function(panel) {
        const selected = panel.dataset.subjectDetail === String(index);
        panel.style.display = selected ? "block" : "none";
        if (selected) {
            selectedPanel = panel;
        }
    });

    // If already in DOM (cached), display and smooth glide
    if (selectedPanel) {
        updateSubjectAttendanceCounts(selectedPanel);
        container.style.display = "block";
        glideDownToResult(selectedPanel);
        return;
    }

    const row = document.querySelector(`.subject-attendance-row[data-subject-index="${index}"]`);
    const subjectName = row ? (row.querySelector("td") ? row.querySelector("td").textContent.trim() : `Subject ${index + 1}`) : `Subject ${index + 1}`;

    // 1. Check client-side Library (localStorage) first! (0.0ms instant load, 0 server requests)
    const cachedSubject = TeinLibrary.getSubject(index);
    if (cachedSubject) {
        const newPanel = renderSubjectDetailPanel(index, cachedSubject.subject_name || subjectName, cachedSubject.records || []);
        container.appendChild(newPanel);
        container.style.display = "block";
        newPanel.style.display = "block";
        updateSubjectAttendanceCounts(newPanel);
        newPanel.classList.add("scenario-result-animated-entry");
        glideDownToResult(newPanel);
        return;
    }

    // Otherwise, lazy fetch this single subject on demand with deduplication
    triggerUniversalLoading(null);
    if (row) {
        row.classList.add("loading-active-row");
    }

    try {
        let fetchPromise = activeSubjectFetches.get(index);
        if (!fetchPromise) {
            fetchPromise = fetch(`/subject-details/${index}`).then(function(resp) {
                return resp.json().then(function(data) {
                    return { resp: resp, data: data };
                }).catch(function() {
                    return { resp: resp, data: null };
                });
            }).finally(function() {
                activeSubjectFetches.delete(index);
            });
            activeSubjectFetches.set(index, fetchPromise);
        }

        const result = await fetchPromise;
        const resp = result.resp;
        const data = result.data;
        const errMsg = (data && data.error) ? data.error : "";
        const isSessionExpired = resp.status === 401 || (data && data.expired) || errMsg.toLowerCase().includes("expired") || errMsg.toLowerCase().includes("no longer available") || errMsg.toLowerCase().includes("log in");

        if (!resp.ok || !data || !data.success) {
            if (isSessionExpired) {
                updateSessionBadge(false);
                let loadingEl = document.getElementById("subject-attendance-lazy-loader");
                if (!loadingEl) {
                    loadingEl = document.createElement("div");
                    loadingEl.id = "subject-attendance-lazy-loader";
                    container.appendChild(loadingEl);
                }
                loadingEl.innerHTML = renderSubjectExpiredCard(index);
                loadingEl.style.display = "block";
                container.style.display = "block";
                glideDownToResult(loadingEl);
                return;
            }
            throw new Error(errMsg || "Could not retrieve subject records from college ERP.");
        }

        // Deposit into client-side Library!
        TeinLibrary.setSubject(index, data);

        const newPanel = renderSubjectDetailPanel(index, data.subject_name || subjectName, data.records || []);
        container.appendChild(newPanel);
        container.style.display = "block";
        newPanel.style.display = "block";
        updateSubjectAttendanceCounts(newPanel);
        newPanel.classList.add("scenario-result-animated-entry");
        glideDownToResult(newPanel);
    } catch (err) {
        // Offline fallback to stored subject in Library if available even if stale
        const fallbackSubject = TeinLibrary.getSubject(index, Infinity);
        if (fallbackSubject) {
            const newPanel = renderSubjectDetailPanel(index, fallbackSubject.subject_name || subjectName, fallbackSubject.records || []);
            container.appendChild(newPanel);
            container.style.display = "block";
            newPanel.style.display = "block";
            updateSubjectAttendanceCounts(newPanel);
            newPanel.classList.add("scenario-result-animated-entry");
            glideDownToResult(newPanel);
            return;
        }

        const errText = (err && err.message) ? err.message.toLowerCase() : "";
        let loadingEl = document.getElementById("subject-attendance-lazy-loader");
        if (!loadingEl) {
            loadingEl = document.createElement("div");
            loadingEl.id = "subject-attendance-lazy-loader";
            container.appendChild(loadingEl);
        }
        if (errText.includes("expired") || errText.includes("no longer available") || errText.includes("log in")) {
            loadingEl.innerHTML = renderSubjectExpiredCard(index);
        } else {
            loadingEl.innerHTML = `
                <div style="font-weight: 650; color: #dc2626; margin-bottom: 6px;">⚠️ Could not load lecture logs</div>
                <div style="font-size: 13px; color: #78716c; margin-bottom: 12px;">${escapeSubjectHtml(err.message)}</div>
                <button type="button" class="attendance-button" style="padding: 6px 14px; font-size: 13px;" onclick="showSubjectAttendance(${index})">Retry</button>
            `;
        }
        loadingEl.style.display = "block";
        container.style.display = "block";
        glideDownToResult(loadingEl);
    } finally {
        if (row) {
            row.classList.remove("loading-active-row");
        }
        stopUniversalLoading(null);
    }
}

function closeSubjectDetails() {
    const container = document.getElementById("subject-attendance-details");
    if (container) {
        container.style.display = "none";
        const targetRow = (currentOpenedSubjectIndex !== null)
            ? document.querySelector(`.subject-attendance-row[data-subject-index="${currentOpenedSubjectIndex}"]`)
            : null;
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
            const table = document.querySelector(".subject-overview-table-wrap");
            if (table) {
                table.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
    }
}


/* =========================================
   INITIALIZE SUBJECT ATTENDANCE COUNTS
   ========================================= */

document.querySelectorAll(".subject-detail-panel").forEach(function(panel) {
    updateSubjectAttendanceCounts(panel);
});


/* =========================================
   SUBJECT ATTENDANCE FILTER
   ========================================= */

function isPresentAttendanceStatus(status) {
    status = String(status || "").trim().toLowerCase();
    return status === "p" || status === "present" || status.includes("present");
}


function isAbsentAttendanceStatus(status) {
    status = String(status || "").trim().toLowerCase();
    return status === "a" || status === "absent" || status.includes("absent");
}


function updateSubjectAttendanceCounts(panel) {

    if (!panel) {
        return;
    }

    const rows = panel.querySelectorAll("[data-attendance-row]");
    let presentCount = 0;
    let absentCount = 0;

    rows.forEach(function(row) {
        const status = row.dataset.attendanceStatus || "";

        if (isPresentAttendanceStatus(status)) {
            presentCount += 1;
        } else if (isAbsentAttendanceStatus(status)) {
            absentCount += 1;
        }
    });

    const presentCountElement = panel.querySelector('[data-filter-count="present"]');
    const absentCountElement = panel.querySelector('[data-filter-count="absent"]');

    if (presentCountElement) {
        presentCountElement.textContent = presentCount;
    }

    if (absentCountElement) {
        absentCountElement.textContent = absentCount;
    }
}


function filterSubjectAttendance(button, filter) {

    const panel = button.closest(".subject-detail-panel");

    if (!panel) {
        return;
    }

    panel.querySelectorAll(".subject-filter-button").forEach(function(filterButton) {
        filterButton.classList.toggle(
            "active",
            filterButton.dataset.filter === filter
        );
    });

    const rows = panel.querySelectorAll("[data-attendance-row]");
    let visibleCount = 0;

    rows.forEach(function(row) {
        const status = row.dataset.attendanceStatus || "";

        let visible = true;

        if (filter === "present") {
            visible = isPresentAttendanceStatus(status);
        } else if (filter === "absent") {
            visible = isAbsentAttendanceStatus(status);
        }

        row.style.display = visible ? "" : "none";

        if (visible) {
            visibleCount += 1;
        }
    });

    panel.querySelectorAll("[data-filter-count]").forEach(function(count) {
        const countFilter = count.dataset.filterCount;
        let countValue = 0;

        rows.forEach(function(row) {
            const status = row.dataset.attendanceStatus || "";

            if (
                (countFilter === "present" && isPresentAttendanceStatus(status)) ||
                (countFilter === "absent" && isAbsentAttendanceStatus(status))
            ) {
                countValue += 1;
            }
        });

        count.textContent = countValue;
    });
}


/* =========================================
   FORMAT LEAVE
   ========================================= */

function formatLeave(totalClasses) {

    totalClasses = Math.max(
        0,
        parseInt(totalClasses || "0", 10) || 0
    );

    const days =
        Math.floor(totalClasses / 8);

    const classes =
        totalClasses % 8;

    if (days === 0) {
        return `${classes} class(es)`;
    }

    if (classes === 0) {
        return `${days} day(s)`;
    }

    return `${days} day(s) ${classes} class(es)`;
}


/* =========================================
   GET FORM VALUES
   ========================================= */
function getLeaveValues(form) {

    const daysInput =
        form.querySelector('input[name$="_days"]');

    const classesInput =
        form.querySelector('input[name$="_classes"]');

    let days =
        Math.max(
            0,
            parseInt(daysInput.value || "0", 10) || 0
        );

    let classes =
        Math.max(
            0,
            parseInt(classesInput.value || "0", 10) || 0
        );

    return {
        daysInput,
        classesInput,
        total: days * 8 + classes
    };
}


/* =========================================
   UPDATE PROJECTION
   ========================================= */
function updateProjection(form) {

    const values =        getLeaveValues(form);

    let leave =
        values.total;

    const maximum =
        parseInt(
            form.dataset.maximumClasses || "0",
            10
        ) || 0;

    if (maximum >= 0) {
        leave = Math.min(
            leave,
            maximum
        );
    }

    const attended =
        parseInt(
            form.dataset.attended || "0",
            10
        ) || 0;

    const total =
        parseInt(
            form.dataset.total || "0",
            10
        ) || 0;

    const future =
        parseInt(
            form.dataset.future || "0",
            10
        ) || 0;

    const projectedAttended =
        attended + future - leave;

    const projectedTotal =
        total + future;

    const percentage =
        projectedTotal > 0
            ? (projectedAttended / projectedTotal) * 100
            : 0;

    const preview =
        form.querySelector(".leave-preview strong");

    if (preview) {
        preview.textContent =
            formatLeave(leave);
    }

    const projection =
        form.querySelector(
            '[id^="projection_"]'
        );

    if (projection) {

        projection.textContent =
            `${projectedAttended} / ${projectedTotal} — ${percentage.toFixed(2)}%`;

    }
}


/* =========================================
   UPDATE LEAVE PREVIEW
   ========================================= */

function updateLeavePreview(form) {
    const values = getLeaveValues(form);
    let total = values.total;
    const maximum = parseInt(form.dataset.maximumClasses || "0", 10) || 0;

    if (maximum >= 0) {
        total = Math.min(total, maximum);
    }

    updateProjection(form);
}

function normalizeFormInputs(form) {
    const values = getLeaveValues(form);
    let total = values.total;
    const maximum = parseInt(form.dataset.maximumClasses || "0", 10) || 0;

    if (maximum >= 0) {
        total = Math.min(total, maximum);
    }

    /*
     * Normalize the inputs themselves on blur or submit.
     * Example: 1 day + 10 classes becomes 2 days + 2 classes
     */
    const normalizedDays = Math.floor(total / 8);
    const normalizedClasses = total % 8;

    if (values.daysInput) values.daysInput.value = normalizedDays;
    if (values.classesInput) values.classesInput.value = normalizedClasses;

    updateProjection(form);
}


/* =========================================
   NORMALIZE BEFORE SUBMIT
   ========================================= */

function normalizeLeaveInputs(form) {
    normalizeFormInputs(form);
    return true;
}


/* =========================================
   INPUT LISTENERS
   ========================================= */

document
    .querySelectorAll(
        'form[action^="/sessional-"]'
    )
    .forEach(function(form) {

        const inputs =
            form.querySelectorAll(
                'input[type="number"]'
            );

        inputs.forEach(function(input) {

            input.addEventListener(
                "input",
                function() {
                    updateLeavePreview(form);
                }
            );

            input.addEventListener(
                "blur",
                function() {
                    normalizeFormInputs(form);
                }
            );

        });

        updateLeavePreview(form);

    });


/* =========================================
   LOGIN SUBMISSION
   ========================================= */
function handleLoginSubmit(event) {

    const password = document.querySelector('input[name="password"]');
    const manual = document.getElementById("manual-username-input");
    const error = document.getElementById("login-error");

    if (error) {
        error.style.display = "none";
        error.textContent = "";
    }

    updateManualUsername();
    const username = manual ? manual.value.trim() : "";

    if (!username) {
        event.preventDefault();
        if (error) {
            error.textContent = "Please enter your College ERP first.";
            error.style.display = "block";
        }
        return false;
    }

    if (!password || !password.value) {
        event.preventDefault();
        if (error) {
            error.textContent = "Please enter your college password.";
            error.style.display = "block";
        }
        return false;
    }

    // Seamless UX: remember username so student never has to re-type it if retrying
    try {
        const rawUserInput = document.getElementById("manual-username");
        if (rawUserInput && rawUserInput.value) {
            sessionStorage.setItem("tein_remembered_username", rawUserInput.value.trim());
        }
    } catch(e) {}

    showLoading();
    return true;
}

// Prefill saved ERP ID on load
document.addEventListener("DOMContentLoaded", function() {
    try {
        const saved = sessionStorage.getItem("tein_remembered_username");
        const rawUserInput = document.getElementById("manual-username");
        if (rawUserInput) {
            if (saved && !rawUserInput.value) {
                rawUserInput.value = saved;
            }
            if (rawUserInput.value) {
                updateManualEmailPreview();
            }
        }
    } catch(e) {}
});


/* =========================================
   MANUAL USERNAME
   ========================================= */

function updateManualEmailPreview() {
    const manualUsername = document.getElementById("manual-username");
    const domain = document.getElementById("manual-email-domain");

    if (!manualUsername || !domain) return;
    const val = manualUsername.value.trim();
    // Only show domain suffix if user hasn't already typed an @ domain
    domain.style.display = (val && !val.includes("@")) ? "inline-block" : "none";
    updateManualUsername();
}


function updateManualUsername() {

    const manualUsername =
        document.getElementById("manual-username");

    const hidden =
        document.getElementById("manual-username-input");

    if (!manualUsername || !hidden) {
        return;
    }

    const domainInput =
        document.getElementById("manual-email-domain");

    const value =
        manualUsername.value.trim();

    const domain =
        domainInput ? domainInput.textContent.trim() : "";

    if (!value) {
        hidden.value = "";
        return;
    }

    if (value.includes("@")) {
        hidden.value = value;
    } else if (domain) {
        hidden.value = value + (domain.startsWith("@") ? domain : "@" + domain);
    } else {
        hidden.value = value;
    }
}

function togglePasswordVisibility() {
    const input = document.getElementById("portal-password-input");
    const btn = document.getElementById("password-toggle-btn");
    if (!input || !btn) return;

    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";

    const showIcon = btn.querySelector(".eye-icon-show");
    const hideIcon = btn.querySelector(".eye-icon-hide");

    if (showIcon && hideIcon) {
        showIcon.style.display = isPassword ? "none" : "block";
        hideIcon.style.display = isPassword ? "block" : "none";
    }

    btn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    btn.setAttribute("title", isPassword ? "Hide password" : "Show password");
}
function initMagneticCard() {
    const viewport = document.getElementById("magnetic-card-viewport");
    const card = document.getElementById("magnetic-card");
    const glare = document.getElementById("magnetic-card-glare");
    const idEl = document.getElementById("magnetic-card-user-id");

    if (!viewport || !card) return;

    // Populate actual entered username
    const manualInput = document.getElementById("manual-username");
    if (manualInput && manualInput.value.trim() && idEl) {
        const raw = manualInput.value.trim();
        idEl.textContent = raw.includes("@") ? raw.split("@")[0].toUpperCase() : raw.toUpperCase();
    }

    let isHovered = false;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;
    let rafId = null;

    function updateCardPhysics() {
        // Smooth lerp interpolation for silky organic feel
        currentX += (targetX - currentX) * 0.15;
        currentY += (targetY - currentY) * 0.15;

        card.style.transform = `rotateX(${currentX}deg) rotateY(${currentY}deg)`;

        // Calculate specular glare position
        if (glare) {
            const glareX = 50 + (currentY / 20) * 45;
            const glareY = 50 - (currentX / 20) * 45;
            card.style.setProperty("--glare-x", `${glareX}%`);
            card.style.setProperty("--glare-y", `${glareY}%`);
        }

        if (isHovered || Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
            rafId = requestAnimationFrame(updateCardPhysics);
        } else {
            rafId = null;
        }
    }

    function onPointerMove(e) {
        isHovered = true;
        const rect = viewport.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Max tilt range +- 18 degrees
        targetX = ((y - centerY) / centerY) * -18;
        targetY = ((x - centerX) / centerX) * 18;

        if (!rafId) {
            rafId = requestAnimationFrame(updateCardPhysics);
        }
    }

    function onPointerLeave() {
        isHovered = false;
        targetX = 0;
        targetY = 0;
        if (!rafId) {
            rafId = requestAnimationFrame(updateCardPhysics);
        }
    }

    viewport.addEventListener("mousemove", onPointerMove);
    viewport.addEventListener("mouseleave", onPointerLeave);
    viewport.addEventListener("touchmove", onPointerMove, { passive: true });
    viewport.addEventListener("touchend", onPointerLeave);

    // Subtle gentle ambient float animation when idle
    let floatAngle = 0;
    setInterval(function() {
        if (!isHovered && !rafId) {
            floatAngle += 0.035;
            targetX = Math.sin(floatAngle) * 4;
            targetY = Math.cos(floatAngle * 0.8) * 5;
            rafId = requestAnimationFrame(updateCardPhysics);
        }
    }, 40);
}

function showLoading() {
    const loginSection = document.getElementById("login-section");
    const loadingScreen = document.getElementById("loading-screen");

    if (loginSection) {
        loginSection.style.display = "none";
    }

    if (loadingScreen) {
        loadingScreen.style.display = "flex";
        initMagneticCard();
    }

    const title = document.getElementById("loading-stage-title");
    const desc = document.getElementById("loading-stage-desc");
    const fill = document.getElementById("loading-progress-fill");
    const cardStatus = document.getElementById("magnetic-card-status-text");

    const stages = [
        { progress: "25%", title: "Connecting to NIET...", desc: "Opening secure portal session", status: "Handshake..." },
        { progress: "55%", title: "Verifying Credentials...", desc: "Authenticating with college ERP", status: "Verifying..." },
        { progress: "80%", title: "Retrieving Attendance...", desc: "Reading subject batches and logs", status: "Reading data..." },
        { progress: "95%", title: "Calculating Analytics...", desc: "Almost there, preparing your dashboard", status: "Preparing..." }
    ];

    let currentStage = 0;
    let asymptoticPct = 95;
    const interval = setInterval(function() {
        currentStage++;
        if (currentStage < stages.length) {
            if (title) title.textContent = stages[currentStage].title;
            if (desc) desc.textContent = stages[currentStage].desc;
            if (fill) fill.style.width = stages[currentStage].progress;
            if (cardStatus) cardStatus.textContent = stages[currentStage].status;
        } else {
            // Keep crawling asymptotically (95% -> 96% -> 97% -> 98% -> 99%) so it never halts or looks stuck
            if (asymptoticPct < 99) {
                asymptoticPct += 0.8;
                if (fill) fill.style.width = asymptoticPct + "%";
            }
            if (cardStatus) cardStatus.textContent = "Finalizing session...";
        }
    }, 1400);
}


/* =========================================
   UNIVERSAL TACTILE FEEDBACK & PROGRESS BEAM
   ========================================= */

function triggerUniversalLoading(button, customText) {
    const beam = document.getElementById("app-top-progress");
    if (beam) {
        beam.classList.remove("active", "done");
        void beam.offsetWidth; // Force CSS reflow
        beam.classList.add("active");
    }

    if (button && !button.disabled) {
        button.classList.add("is-calculating");
        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }
        const text = customText || (button.textContent.toLowerCase().includes("calculat") ? "Calculating..." : "Working...");
        button.innerHTML = '<span class="inline-spinner" aria-hidden="true"></span> ' + text;
    }
}

function stopUniversalLoading(button) {
    const beam = document.getElementById("app-top-progress");
    if (beam) {
        beam.classList.remove("active");
        beam.classList.add("done");
        setTimeout(function() {
            beam.classList.remove("done");
        }, 400);
    }

    if (button) {
        button.classList.remove("is-calculating");
        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
            delete button.dataset.originalHtml;
        }
    }

    document.querySelectorAll(".is-calculating").forEach(function(btn) {
        if (!button || btn === button) {
            btn.classList.remove("is-calculating");
            btn.disabled = false;
            if (btn.dataset.originalHtml) {
                btn.innerHTML = btn.dataset.originalHtml;
                delete btn.dataset.originalHtml;
            }
        }
    });

    document.querySelectorAll(".calculating-shimmer").forEach(function(el) {
        el.classList.remove("calculating-shimmer");
    });
}

window.addEventListener("pageshow", function() {
    stopUniversalLoading(null);
});

// Hook all calculator forms across the dashboard
document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll("form").forEach(function(form) {
        if (form.id === "login-form" || form.getAttribute("action") === "/get-attendance") return;
        // Skip forms handled with smooth in-place AJAX
        if (form.matches && form.matches("#target-scenario-form, .today-stepper-form, #date-plan-form, .safe-leaves-shell form")) return;

        form.addEventListener("submit", function() {
            const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
            triggerUniversalLoading(submitBtn);

            // Give subtle soft shimmer to target results cards
            const parentCard = form.closest(".what-if-card, .summary");
            if (parentCard) {
                parentCard.classList.add("calculating-shimmer");
            }
        });
    });
});


/* =========================================
   ONE-TAP LIVE ATTENDANCE SYNC
   ========================================= */

function showSyncToast(message, type) {
    type = type || "success";
    let toast = document.getElementById("tein-sync-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "tein-sync-toast";
        toast.className = "tein-sync-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = "tein-sync-toast show " + type;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function() {
        toast.classList.remove("show");
    }, 3800);
}

function applySyncedStats(data) {
    if (!data) return;
    const sitePct = document.getElementById("stat-site-pct");
    const siteCount = document.getElementById("stat-site-count");
    const unmarkedCount = document.getElementById("stat-unmarked-count");
    const effPct = document.getElementById("stat-effective-pct");
    const effCount = document.getElementById("stat-effective-count");
    const effIndicator = document.getElementById("stat-effective-indicator");
    const effMargin = document.getElementById("stat-effective-margin-pill");

    if (sitePct && data.site_percentage != null) sitePct.textContent = data.site_percentage + "%";
    if (siteCount && data.site_present != null) siteCount.textContent = data.site_present + " / " + data.site_total;
    if (unmarkedCount && data.unmarked != null) unmarkedCount.textContent = data.unmarked;
    if (effPct && data.effective_percentage != null) effPct.textContent = data.effective_percentage + "%";
    if (effCount && data.effective_present != null) effCount.textContent = data.effective_present + " / " + data.effective_total + " classes";

    if (effIndicator && data.is_safe != null) {
        effIndicator.className = "safe-indicator " + (data.is_safe ? "safe" : "warning");
        effIndicator.innerHTML = data.is_safe ? "✓ Safe &ge; 75%" : "⚠ Need Recovery";
    }

    if (effMargin && data.margin_text) {
        effMargin.className = "stat-margin-pill " + data.margin_type;
        effMargin.textContent = data.margin_text;
        effMargin.style.display = "";
    }

    // Flash pulse highlight on stat cards
    document.querySelectorAll(".stat-card").forEach(function(card) {
        card.classList.remove("stat-card-synced");
        void card.offsetWidth;
        card.classList.add("stat-card-synced");
    });
}

async function refreshLiveAttendance() {
    if (!navigator.onLine) {
        showSyncToast("📶 You are offline. Connect to the internet to sync live with NIET.", "error");
        return;
    }

    const buttons = document.querySelectorAll(".attendance-sync-btn");
    buttons.forEach(function(btn) {
        btn.classList.add("syncing");
        const label = btn.querySelector(".sync-label");
        if (label) {
            btn.dataset.prevLabel = label.textContent;
            label.textContent = "Syncing...";
        }
    });

    const beam = document.getElementById("app-top-progress");
    if (beam) {
        beam.classList.remove("active", "done");
        void beam.offsetWidth;
        beam.classList.add("active");
    }

    try {
        const resp = await fetch("/sync-attendance", {
            method: "POST",
            headers: {
                "Accept": "application/json",
            },
        });

        const data = await resp.json().catch(function() { return null; });

        if (beam) {
            beam.classList.add("done");
            setTimeout(function() { beam.classList.remove("active", "done"); }, 400);
        }

        if (!resp.ok || !data || !data.success) {
            const isExpired = resp.status === 401 || (data && (data.error === "expired" || String(data.message || "").toLowerCase().includes("expired")));
            if (isExpired) {
                updateSessionBadge(false);
                showSyncToast("⚠️ College portal session expired. Please reconnect.", "error");
                openQuickReloginModal();
            } else {
                const errMsg = (data && data.message) ? data.message : "Sync failed. Please try again.";
                showSyncToast("⚠️ " + errMsg, "error");
            }
            return;
        }

        updateSessionBadge(true);

        // If user is currently on /subjects, reload to display fresh subject rows
        if (window.location.pathname.includes("/subjects")) {
            showSyncToast("✨ Attendance updated! Refreshing subject logs...", "success");
            setTimeout(function() {
                window.location.reload();
            }, 600);
            return;
        }

        // If user is currently on /what-if, reload to refresh planning baseline
        if (window.location.pathname.includes("/what-if")) {
            showSyncToast("✨ Attendance updated! Refreshing planner...", "success");
            setTimeout(function() {
                window.location.reload();
            }, 600);
            return;
        }

        // Update home dashboard stat cards in-place
        applySyncedStats(data);

        showSyncToast("✨ Live attendance synced with NIET ERP!", "success");

        // Invalidate stale daily journey and subjects in client-side Library so fresh live data is fetched
        if (typeof TeinLibrary !== "undefined") {
            TeinLibrary.clearJourney();
            TeinLibrary.clearSubjects();
        }

        // Reload active daily journey tab with freshly synced timetable & marked classes
        if (currentLoadedJourneyTab === "previous" && typeof loadPreviousTeachingDay === "function") {
            loadPreviousTeachingDay().catch(function() {});
        } else if (typeof loadTodayAttendance === "function") {
            loadTodayAttendance().catch(function() {});
        }

    } catch (err) {
        if (beam) beam.classList.remove("active", "done");
        if (!navigator.onLine) {
            showSyncToast("📶 Offline · Connect to internet to sync live with NIET.", "error");
        } else {
            showSyncToast("⚠️ Connection error while syncing attendance.", "error");
        }
    } finally {
        buttons.forEach(function(btn) {
            btn.classList.remove("syncing");
            const label = btn.querySelector(".sync-label");
            if (label && btn.dataset.prevLabel) {
                label.textContent = btn.dataset.prevLabel;
            }
        });
    }
}


/* =========================================
   OFFLINE DETECTION & CAMPUS FALLBACK
   ========================================= */

function updateOnlineStatus() {
    const banner = document.getElementById("offline-status-banner");
    const text = document.getElementById("offline-banner-text");
    if (!banner) return;

    if (!navigator.onLine) {
        banner.classList.remove("online");
        banner.classList.add("offline", "show");
        if (text) text.textContent = "📶 Offline Mode · Showing last synced attendance";
    } else if (banner.classList.contains("offline")) {
        banner.classList.remove("offline");
        banner.classList.add("online");
        if (text) text.textContent = "🟢 Back Online · Tap Sync Live to refresh";
        setTimeout(function() {
            banner.classList.remove("show", "online");
        }, 4000);
    }
}

window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
document.addEventListener("DOMContentLoaded", updateOnlineStatus);


/* =========================================
   INSTANT SEARCH & HEALTH FILTER (ON /SUBJECTS)
   ========================================= */

let currentSubjectFilter = "all";
let currentSubjectQuery = "";

function applySubjectFilters() {
    const rows = document.querySelectorAll(".subject-attendance-row");
    const countEl = document.getElementById("subject-match-count");
    const noMatchesRow = document.getElementById("subject-no-matches-row");
    const query = currentSubjectQuery.trim().toLowerCase();
    let visibleCount = 0;

    rows.forEach(function(row) {
        const name = (row.dataset.subjectName || "").toLowerCase();
        const code = (row.dataset.subjectCode || "").toLowerCase();
        const status = row.dataset.subjectStatus || "";

        const matchesFilter = (currentSubjectFilter === "all") || (status === currentSubjectFilter);
        const matchesQuery = !query || name.includes(query) || code.includes(query);

        if (matchesFilter && matchesQuery) {
            row.style.display = "";
            visibleCount++;
        } else {
            row.style.display = "none";
        }
    });

    if (noMatchesRow) {
        noMatchesRow.style.display = (visibleCount === 0 && rows.length > 0) ? "" : "none";
    }

    if (countEl) {
        if (query || currentSubjectFilter !== "all") {
            countEl.textContent = "Showing " + visibleCount + " of " + rows.length;
            countEl.style.display = "inline-block";
        } else {
            countEl.style.display = "none";
        }
    }
}

function filterOverviewSubjects(filterType, buttonEl) {
    currentSubjectFilter = filterType;
    document.querySelectorAll(".subject-summary-pill").forEach(function(btn) {
        btn.classList.remove("active");
    });
    if (buttonEl) {
        buttonEl.classList.add("active");
    }
    applySubjectFilters();
}

function onSubjectSearchInput(val) {
    currentSubjectQuery = val || "";
    const clearBtn = document.getElementById("subject-search-clear");
    if (clearBtn) {
        clearBtn.style.display = currentSubjectQuery ? "inline-flex" : "none";
    }
    applySubjectFilters();
}

function clearSubjectSearch() {
    const input = document.getElementById("subject-search-input");
    if (input) {
        input.value = "";
        input.focus();
    }
    onSubjectSearchInput("");
}


/* =========================================
   QUICK RECONNECT MODAL & PORTAL AUTH
   ========================================= */

function openQuickReloginModal() {
    const modal = document.getElementById("quick-reconnect-modal");
    if (!modal) return;
    const userInput = document.getElementById("reconnect-username-input");
    const pwdInput = document.getElementById("reconnect-password-input");
    const errEl = document.getElementById("quick-reconnect-error");

    const username = (document.body.dataset.studentUsername || sessionStorage.getItem("tein_remembered_username") || "").trim();
    if (userInput) userInput.value = username;
    if (pwdInput) {
        pwdInput.value = "";
        setTimeout(function() { pwdInput.focus(); }, 120);
    }
    if (errEl) errEl.style.display = "none";
    modal.hidden = false;
    document.body.classList.add("modal-open");
}

function closeQuickReloginModal() {
    const modal = document.getElementById("quick-reconnect-modal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-open");
}

function toggleReconnectPasswordVisibility() {
    const pwd = document.getElementById("reconnect-password-input");
    const btn = document.querySelector(".toggle-pwd-btn");
    if (!pwd) return;
    if (pwd.type === "password") {
        pwd.type = "text";
        if (btn) btn.textContent = "🙈 Hide";
    } else {
        pwd.type = "password";
        if (btn) btn.textContent = "👁️ Show";
    }
}

function updateSessionBadge(isActive) {
    const badge = document.getElementById("attendance-session-badge");
    if (!badge) return;
    if (isActive) {
        badge.className = "attendance-status-badge active";
        badge.title = "Live portal session is active";
        badge.onclick = null;
        const text = badge.querySelector(".status-badge-text");
        if (text) text.textContent = "Session Active";
    } else {
        badge.className = "attendance-status-badge expired";
        badge.title = "ERP session expired. Tap to reconnect without leaving this page";
        badge.onclick = openQuickReloginModal;
        const text = badge.querySelector(".status-badge-text");
        if (text) text.textContent = "Session Expired · Reconnect";
    }
}

async function handleQuickReconnect(event) {
    event.preventDefault();
    const userInput = document.getElementById("reconnect-username-input");
    const pwdInput = document.getElementById("reconnect-password-input");
    const remInput = document.getElementById("reconnect-remember-me");
    const btn = document.getElementById("quick-reconnect-submit-btn");
    const errEl = document.getElementById("quick-reconnect-error");
    if (!pwdInput || !btn) return;

    const username = (userInput && userInput.value ? userInput.value : (document.body.dataset.studentUsername || "")).trim();
    const password = pwdInput.value;
    const rememberMe = remInput ? remInput.checked : true;

    if (!username || !password) {
        if (errEl) {
            errEl.textContent = "Please enter your portal password.";
            errEl.style.display = "block";
        }
        return;
    }

    btn.disabled = true;
    const origText = btn.innerHTML;
    btn.innerHTML = `<span style="display:inline-block; width:13px; height:13px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spinnerRotate 0.6s linear infinite; vertical-align:middle; margin-right:6px;"></span> Connecting...`;
    if (errEl) errEl.style.display = "none";

    try {
        const resp = await fetch("/api/quick-relogin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: username,
                password: password,
                remember_me: rememberMe
            })
        });

        const data = await resp.json().catch(function() { return null; });
        if (resp.ok && data && data.success) {
            btn.innerHTML = `✅ Connected!`;
            closeQuickReloginModal();
            updateSessionBadge(true);
            showSyncToast("✨ Portal reconnected! Syncing live attendance...", "success");

            // If on /what-if or /subjects, reload to display fresh session attendance
            if (window.location.pathname.includes("/what-if") || window.location.pathname.includes("/subjects")) {
                setTimeout(function() {
                    window.location.reload();
                }, 400);
            } else {
                applySyncedStats(data);
                showSyncToast("✨ Portal reconnected! Live attendance synced.", "success");
                if (typeof TeinLibrary !== "undefined") {
                    TeinLibrary.clearJourney();
                    TeinLibrary.clearSubjects();
                }
                if (currentLoadedJourneyTab === "previous" && typeof loadPreviousTeachingDay === "function") {
                    loadPreviousTeachingDay().catch(function() {});
                } else if (typeof loadTodayAttendance === "function") {
                    loadTodayAttendance().catch(function() {});
                }
            }
        } else {
            const msg = (data && data.error) ? data.error : "Could not re-authenticate. Check your password.";
            if (errEl) {
                errEl.textContent = msg;
                errEl.style.display = "block";
            }
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    } catch (e) {
        if (errEl) {
            errEl.textContent = "Network error while connecting to college portal. Please try again.";
            errEl.style.display = "block";
        }
        btn.disabled = false;
        btn.innerHTML = origText;
    }
}

// Global modal dismiss listeners
window.addEventListener("click", function(event) {
    const modal = document.getElementById("quick-reconnect-modal");
    if (modal && event.target === modal) {
        closeQuickReloginModal();
    }
});

window.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
        closeQuickReloginModal();
    }
});

/* =========================================
   RESPONSIVE SMART SCROLL & RESULT POSITIONING
   ========================================= */

function scrollElementIntoComfortableView(el) {
    if (!el) return;
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            try {
                const rect = el.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const vh = window.innerHeight || document.documentElement.clientHeight;
                const isMobile = window.innerWidth <= 768;
                const topClearance = isMobile ? 70 : 85;
                const bottomNavHeight = isMobile ? 75 : 25;

                // DEADBAND RULE:
                // If already comfortably visible within viewport boundaries, do NOT move
                if (rect.top >= (topClearance - 25) && rect.bottom <= (vh - bottomNavHeight + 25)) {
                    return;
                }

                let targetScrollY;
                if (rect.top < topClearance) {
                    // Clipped above: align top comfortably below header
                    targetScrollY = scrollTop + rect.top - topClearance - 10;
                } else if (rect.height <= (vh - topClearance - bottomNavHeight)) {
                    // Fits on screen: bring bottom comfortably above bottom nav with 14px breathing room
                    targetScrollY = scrollTop + rect.bottom - (vh - bottomNavHeight) + 14;
                } else {
                    // Taller than screen: align top of card comfortably below top header
                    targetScrollY = scrollTop + rect.top - topClearance - 10;
                }

                // Don't scroll for microscopic distances (<15px) to eliminate jitter
                if (Math.abs(targetScrollY - scrollTop) < 15) {
                    return;
                }

                window.scrollTo({
                    top: Math.max(0, Math.round(targetScrollY)),
                    behavior: "smooth"
                });
            } catch (e) {}
        });
    });
}

function glideDownToResult(resultEl) {
    if (!resultEl) return;

    // Use double requestAnimationFrame to ensure DOM reflow and animations have fully started
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            try {
                const rect = resultEl.getBoundingClientRect();
                const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
                const vh = window.innerHeight || document.documentElement.clientHeight;
                const isMobile = window.innerWidth <= 768;
                const topClearance = isMobile ? 70 : 85;
                const bottomNavHeight = isMobile ? 75 : 25;

                // DEADBAND RULE:
                // If the entire result card is already comfortably inside the viewport above bottom nav, do NOT move
                if (rect.top >= topClearance && rect.bottom <= (vh - bottomNavHeight)) {
                    return;
                }

                // If result bottom is clipped below screen/nav, glide down just enough to show the full card
                let targetY;
                if (rect.height <= (vh - topClearance - bottomNavHeight)) {
                    // Fits on screen: bring bottom comfortably above bottom nav with 14px breathing room
                    targetY = currentScrollY + rect.bottom - (vh - bottomNavHeight) + 14;
                } else {
                    // Taller than screen: align top of card comfortably below top header
                    targetY = currentScrollY + rect.top - topClearance - 12;
                }

                // STRICT DOWNWARD INVARIANT:
                // Never jump or twitch backward/upward.
                if (targetY < currentScrollY) {
                    targetY = currentScrollY;
                }

                // Ignore microscopic distances (<15px) to eliminate jitter
                if (Math.abs(targetY - currentScrollY) < 15) {
                    return;
                }

                window.scrollTo({
                    top: Math.round(targetY),
                    behavior: "smooth"
                });
            } catch (e) {}
        });
    });
}

function scrollElementIntoViewIfNeeded(el) {
    scrollElementIntoComfortableView(el);
}

function autoScrollToResults() {
    // If URL has an anchor hash, clean it so it doesn't linger in browser history
    if (window.location.hash) {
        try {
            history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch (e) {}
    }

    const shouldScroll = sessionStorage.getItem("tein_scroll_to_result") === "true";
    if (!shouldScroll) return;

    sessionStorage.removeItem("tein_scroll_to_result");
    const target = document.querySelector("#scenario-result") ||
                 document.querySelector(".what-if-result") ||
                 document.querySelector(".what-if-error") ||
                 document.querySelector("#sessional-active-form");

    if (target) {
        glideDownToResult(target);
    }
}

function initSmoothScenarioCalculations() {
    const forms = document.querySelectorAll(
        "#target-scenario-form, .today-stepper-form, #date-plan-form, .safe-leaves-shell form, form[action^='/sessional-'], form[action='/planner-target']"
    );

    forms.forEach(function(form) {
        if (form.dataset.ajaxAttached) return;
        form.dataset.ajaxAttached = "true";

        form.addEventListener("submit", async function(event) {
            // Check HTML5 validity before preventing default
            if (typeof form.checkValidity === "function" && !form.checkValidity()) {
                return;
            }

            event.preventDefault();
            const submitBtn = form.querySelector("button[type='submit'], input[type='submit']");

            // Activate progress beam, card shimmer, and spinner
            triggerUniversalLoading(submitBtn);

            const parentCard = form.closest(".what-if-card, .summary, .what-if-scenario-box, .bunk-card");
            if (parentCard) {
                parentCard.classList.add("calculating-shimmer");
            }

            try {
                const formData = new FormData(form);
                const resp = await fetch(form.action, {
                    method: "POST",
                    body: formData,
                    headers: { "Accept": "text/html" }
                });

                if (!resp.ok) {
                    stopUniversalLoading(submitBtn);
                    form.submit();
                    return;
                }

                const html = await resp.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");

                // Check for Sessional multi-step form transition
                const isSessionalAction = (form.action || "").includes("sessional") || (form.action || "").includes("planner-target");
                if (isSessionalAction) {
                    const newSection = doc.querySelector("#what-if-planner-section");
                    const currentSection = document.querySelector("#what-if-planner-section");
                    if (newSection && currentSection) {
                        currentSection.innerHTML = newSection.innerHTML;
                        initSmoothScenarioCalculations();
                        attachSmoothResetHandlers();
                        const nextTarget = currentSection.querySelector("#sessional-active-form") ||
                                           currentSection.querySelector("#scenario-result") ||
                                           currentSection.querySelector(".sessional-layout-grid") ||
                                           currentSection;
                        glideDownToResult(nextTarget);
                        return;
                    }
                }

                const newResult = doc.querySelector("#scenario-result") || doc.querySelector(".what-if-result") || doc.querySelector(".what-if-error");
                const newResetInHeader = doc.querySelector(".scenario-heading-actions .scenario-reset-btn");

                if (newResult) {
                    const currentResult = document.querySelector("#scenario-result") || document.querySelector(".what-if-result") || document.querySelector(".what-if-error");
                    if (currentResult) {
                        currentResult.replaceWith(newResult);
                    } else {
                        form.insertAdjacentElement("afterend", newResult);
                    }

                    // Update header reset button if needed
                    const headerActions = document.querySelector(".scenario-heading-actions");
                    if (headerActions && newResetInHeader && !headerActions.querySelector(".scenario-reset-btn")) {
                        headerActions.appendChild(newResetInHeader);
                    }

                    newResult.classList.remove("scenario-result-animated-entry");
                    void newResult.offsetWidth; // trigger reflow
                    newResult.classList.add("scenario-result-animated-entry");

                    attachSmoothResetHandlers();
                    glideDownToResult(newResult);
                } else {
                    stopUniversalLoading(submitBtn);
                    form.submit();
                    return;
                }
            } catch (err) {
                console.error("AJAX scenario calculation failed, falling back to standard submit:", err);
                stopUniversalLoading(submitBtn);
                form.submit();
                return;
            } finally {
                stopUniversalLoading(submitBtn);
            }
        });
    });

    attachSmoothResetHandlers();
}

function attachSmoothResetHandlers() {
    document.querySelectorAll(".result-card-reset-btn, .scenario-reset-btn").forEach(function(btn) {
        if (btn.dataset.ajaxAttached) return;
        btn.dataset.ajaxAttached = "true";

        btn.addEventListener("click", function(event) {
            if (!btn.href || !btn.href.includes("scenario=")) return;
            event.preventDefault();

            // Clear any active loading state across UI
            stopUniversalLoading(null);

            // Clean any dirty URL hashes immediately
            if (window.location.hash) {
                try {
                    history.replaceState(null, "", window.location.pathname + window.location.search);
                } catch (e) {}
            }
            sessionStorage.removeItem("tein_scroll_to_result");

            const isSessional = btn.href.includes("scenario=sessional");
            if (isSessional) {
                sessionStorage.setItem("tein_reset_scrolled_top", "true");
                window.location.href = btn.href;
                return;
            }

            const resultCard = document.querySelector("#scenario-result") || document.querySelector(".what-if-result") || document.querySelector(".what-if-error");
            const topReset = document.querySelector(".scenario-reset-btn");
            const formCard = document.querySelector(".what-if-card, .what-if-scenario-box");

            // Tactile feedback on the header Reset button: spin the icon once
            if (topReset) {
                const icon = topReset.querySelector(".reset-icon");
                if (icon) {
                    icon.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
                    icon.style.transform = "rotate(-360deg)";
                    setTimeout(function() {
                        icon.style.transition = "none";
                        icon.style.transform = "rotate(0deg)";
                    }, 420);
                }
            }

            // ACCORDION DISSOLVE FOR RESULT CARD:
            // Smoothly collapse its height and fade it out over 250ms
            if (resultCard) {
                resultCard.style.overflow = "hidden";
                resultCard.style.maxHeight = resultCard.offsetHeight + "px";
                resultCard.style.transition = "opacity 0.22s ease, max-height 0.26s cubic-bezier(0.16, 1, 0.3, 1), margin 0.26s ease, padding 0.26s ease";
                void resultCard.offsetHeight; // Force reflow
                resultCard.style.opacity = "0";
                resultCard.style.maxHeight = "0px";
                resultCard.style.marginTop = "0px";
                resultCard.style.marginBottom = "0px";
                resultCard.style.paddingTop = "0px";
                resultCard.style.paddingBottom = "0px";
            }

            fetch(btn.href, { headers: { "Accept": "text/html" } }).catch(function() {});

            setTimeout(function() {
                if (resultCard) resultCard.remove();
                // CRITICAL INVARIANT: DO NOT REMOVE topReset! It stays permanently next to Sync Live!

                const targetInput = document.getElementById("target_attendance_scenario") || document.getElementById("safe_target_attendance");
                if (targetInput) targetInput.value = "75";
                const attendInput = document.getElementById("scenario_attended");
                const leaveInput = document.getElementById("scenario_leave");
                if (attendInput) attendInput.value = "0";
                if (leaveInput) leaveInput.value = "0";

                // ON RESET: Keep user on the form.
                // Never scroll downward. Only if the form card scrolled off above top header, gently align its top.
                if (formCard) {
                    const rect = formCard.getBoundingClientRect();
                    const topClearance = (window.innerWidth <= 768) ? 70 : 85;
                    if (rect.top < (topClearance - 30)) {
                        window.scrollTo({
                            top: Math.round(window.pageYOffset + rect.top - topClearance),
                            behavior: "smooth"
                        });
                    }
                }
            }, 270);
        });
    });
}

document.addEventListener("DOMContentLoaded", function() {
    if (sessionStorage.getItem("tein_reset_scrolled_top") === "true") {
        sessionStorage.removeItem("tein_reset_scrolled_top");
        if ("scrollRestoration" in history) {
            history.scrollRestoration = "manual";
        }
        window.scrollTo(0, 0);
    } else {
        autoScrollToResults();
    }
    initSmoothScenarioCalculations();
});


