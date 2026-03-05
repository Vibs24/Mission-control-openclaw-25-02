const STATUS_META = {
  todo: { label: "To Do", accent: "#3b82f6" },
  in_progress: { label: "In Progress", accent: "#f59e0b" },
  review: { label: "Review", accent: "#14b8a6" },
  done: { label: "Done", accent: "#22c55e" }
};

const PRIORITY_COLORS = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  urgent: "#ef4444"
};

let activeTaskId = null;
let replyParentId = null;
let boardPollTimer = null;
let notifPollTimer = null;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function jget(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`GET failed: ${response.status}`);
  return response.json();
}

async function jpost(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`POST failed: ${response.status} ${body}`);
  }
  return response.json();
}

function relativeTime(iso) {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function cardHTML(task) {
  const assignee = task.assignee
    ? `<span class="assignee-chip"><span class="avatar" style="background:${esc(task.assignee.color)}">${esc(
        task.assignee.initials
      )}</span>${esc(task.assignee.name)}</span>`
    : "Unassigned";

  return `<article class="task-card" draggable="true" data-task-id="${task.id}">
    <div class="task-title">${esc(task.title)}</div>
    <div class="task-meta">
      <span class="priority-dot" style="background:${esc(
        PRIORITY_COLORS[task.priority] || "#94a3b8"
      )}"></span>
      <span class="due ${task.is_overdue ? "overdue" : ""}">${esc(task.due_date || "No due date")}</span>
      <span>${assignee}</span>
      <span class="comment-bubble">${task.comment_count}</span>
    </div>
  </article>`;
}

function renderBoard(payload) {
  const board = document.getElementById("kanban");
  if (!board) return;

  board.innerHTML = Object.keys(STATUS_META)
    .map((status) => {
      const tasks = payload.columns[status] || [];
      const meta = STATUS_META[status];
      return `<section class="column" data-status="${status}">
        <header class="col-head" style="--accent:${meta.accent}">
          <h4>${meta.label}</h4>
          <span class="badge">${tasks.length}</span>
        </header>
        <div class="dropzone">${tasks.map(cardHTML).join("")}</div>
      </section>`;
    })
    .join("");

  wireDnD();
  wireCardOpen();
}

function wireDnD() {
  document.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("task_id", card.dataset.taskId);
    });
  });

  document.querySelectorAll(".dropzone").forEach((zone) => {
    zone.addEventListener("dragover", (event) => event.preventDefault());
    zone.addEventListener("drop", async (event) => {
      event.preventDefault();
      const taskId = event.dataTransfer.getData("task_id");
      const newStatus = zone.closest(".column").dataset.status;
      try {
        await jpost(`/api/task/${taskId}/move`, { status: newStatus });
        await refreshBoard();
      } catch (error) {
        console.error(error);
      }
    });
  });
}

function wireCardOpen() {
  document.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("click", () => {
      openTask(card.dataset.taskId);
    });
  });
}

async function refreshBoard() {
  const search = (document.getElementById("globalSearchInput")?.value || "").trim();
  const data = await jget(`/api/board?q=${encodeURIComponent(search)}`);
  renderBoard(data);
}

function renderCommentTree(comments) {
  const byParent = new Map();
  comments.forEach((comment) => {
    const key = comment.parent_id || 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(comment);
  });

  function renderBranch(parentId, depth) {
    const items = byParent.get(parentId) || [];
    return items
      .map((comment) => {
        const children = renderBranch(comment.id, depth + 1);
        return `<div class="comment ${depth > 0 ? "child" : ""}" data-comment-id="${comment.id}">
          <div class="comment-header">
            <span class="avatar" style="background:${esc(comment.color)}">${esc(comment.initials)}</span>
            <strong>${esc(comment.author)}</strong>
            <small>${relativeTime(comment.created_at)}</small>
          </div>
          <div>${esc(comment.body)}</div>
          <div class="comment-actions"><button type="button" class="reply-btn" data-comment-id="${comment.id}">Reply</button></div>
          ${children}
        </div>`;
      })
      .join("");
  }

  return renderBranch(0, 0);
}

function renderActivity(activity) {
  if (!activity.length) return "<li class=\"muted\">No activity yet.</li>";
  return activity
    .map(
      (item) => `<li>
      <strong>${esc(item.actor)}</strong>
      <span>${esc(item.field_name)}</span>
      <div class="diff-row"><span class="old">${esc(item.old_value || "∅")}</span><span class="arrow">→</span><span class="new">${esc(
        item.new_value || "∅"
      )}</span></div>
      <small>${relativeTime(item.created_at)}</small>
    </li>`
    )
    .join("");
}

async function openTask(taskId) {
  activeTaskId = taskId;
  replyParentId = null;

  const payload = await jget(`/api/task/${taskId}`);
  const task = payload.task;
  const left = document.getElementById("taskLeft");
  const right = document.getElementById("taskRight");
  const modal = document.getElementById("taskModal");

  const memberOptions = [`<option value="">Unassigned</option>`]
    .concat(
      payload.members.map(
        (member) => `<option value="${member.id}" ${task.assignee_id === member.id ? "selected" : ""}>${esc(member.name)}</option>`
      )
    )
    .join("");

  left.innerHTML = `<h2>Task #${task.id}</h2>
    <label>Title</label>
    <input id="taskTitle" class="task-title-input" value="${esc(task.title)}" />
    <label>Description</label>
    <textarea id="taskDesc" class="rich-input">${esc(task.description || "")}</textarea>
    <label>Preview</label>
    <div class="preview" id="taskPreview">${esc(task.description || "").replace(/\n/g, "<br>")}</div>
    <label>Priority</label>
    <select id="taskPriority">
      <option value="low" ${task.priority === "low" ? "selected" : ""}>Low</option>
      <option value="medium" ${task.priority === "medium" ? "selected" : ""}>Medium</option>
      <option value="high" ${task.priority === "high" ? "selected" : ""}>High</option>
      <option value="urgent" ${task.priority === "urgent" ? "selected" : ""}>Urgent</option>
    </select>
    <label>Due Date</label>
    <input id="taskDue" type="date" value="${esc(task.due_date || "")}" />
    <label>Assignee</label>
    <select id="taskAssignee">${memberOptions}</select>
    <button id="saveTaskBtn" type="button">Save Task</button>`;

  right.innerHTML = `<h3>Threaded Comments</h3>
    <div class="thread">${renderCommentTree(payload.comments)}</div>
    <div id="replyHint" class="muted">Replying to: none</div>
    <div class="row">
      <input id="commentInput" placeholder="Add a comment" />
      <button id="commentBtn" type="button">Send</button>
    </div>
    <h3>Activity Timeline</h3>
    <ul class="activity">${renderActivity(payload.activity)}</ul>`;

  const preview = document.getElementById("taskPreview");
  document.getElementById("taskDesc").addEventListener("input", (event) => {
    preview.innerHTML = esc(event.target.value).replace(/\n/g, "<br>");
  });

  document.querySelectorAll(".reply-btn").forEach((button) => {
    button.addEventListener("click", () => {
      replyParentId = Number(button.dataset.commentId);
      document.getElementById("replyHint").textContent = `Replying to comment #${replyParentId}`;
      document.getElementById("commentInput").focus();
    });
  });

  document.getElementById("commentBtn").addEventListener("click", async () => {
    const body = document.getElementById("commentInput").value.trim();
    if (!body) return;
    await jpost(`/api/task/${taskId}/comment`, { body, parent_id: replyParentId });
    await openTask(taskId);
    await refreshBoard();
  });

  document.getElementById("saveTaskBtn").addEventListener("click", async () => {
    await jpost(`/api/task/${taskId}/update`, {
      title: document.getElementById("taskTitle").value.trim(),
      description: document.getElementById("taskDesc").value,
      priority: document.getElementById("taskPriority").value,
      due_date: document.getElementById("taskDue").value,
      assignee_id: document.getElementById("taskAssignee").value || null
    });
    await openTask(taskId);
    await refreshBoard();
  });

  modal.classList.remove("hidden");
}

function closeModal() {
  const modal = document.getElementById("taskModal");
  if (modal) modal.classList.add("hidden");
  activeTaskId = null;
  replyParentId = null;
}

async function refreshNotifications() {
  const panel = document.getElementById("notifPanel");
  const badge = document.getElementById("notifBadge");
  if (!panel || !badge) return;

  const payload = await jget("/api/notifications");
  const unread = payload.unread_count || 0;

  badge.textContent = String(unread);
  badge.classList.toggle("hidden", unread === 0);

  const rows = payload.items
    .map(
      (item) => `<div class="notif ${item.is_read ? "" : "unread"}" data-notif-id="${item.id}">
      <div><strong>${esc(item.actor)}</strong> ${esc(item.body)}</div>
      <time>${relativeTime(item.created_at)}</time>
      ${item.is_read ? "" : `<button type=\"button\" class=\"mark-read-btn ghost-btn\" data-notif-id=\"${item.id}\">Mark read</button>`}
    </div>`
    )
    .join("");

  panel.innerHTML = `<div class="notif-head"><strong>Notifications</strong><button id="markAllReadBtn" type="button" class="ghost-btn">Mark all read</button></div>${
    rows || '<p class="muted">No notifications.</p>'
  }`;

  panel.querySelectorAll(".mark-read-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await jpost(`/api/notifications/${button.dataset.notifId}/read`, {});
      await refreshNotifications();
    });
  });

  const markAll = document.getElementById("markAllReadBtn");
  if (markAll) {
    markAll.addEventListener("click", async () => {
      await jpost("/api/notifications/read-all", {});
      await refreshNotifications();
    });
  }
}

function initTopNav() {
  const notifBtn = document.getElementById("notifBtn");
  const notifPanel = document.getElementById("notifPanel");
  const avatarBtn = document.getElementById("avatarMenuBtn");
  const avatarMenu = document.getElementById("avatarMenu");

  if (notifBtn && notifPanel) {
    notifBtn.addEventListener("click", async () => {
      notifPanel.classList.toggle("hidden");
      if (!notifPanel.classList.contains("hidden")) {
        await refreshNotifications();
      }
    });
  }

  if (avatarBtn && avatarMenu) {
    avatarBtn.addEventListener("click", () => avatarMenu.classList.toggle("hidden"));
  }

  document.addEventListener("click", (event) => {
    if (notifPanel && notifBtn && !notifPanel.contains(event.target) && !notifBtn.contains(event.target)) {
      notifPanel.classList.add("hidden");
    }
    if (avatarMenu && avatarBtn && !avatarMenu.contains(event.target) && !avatarBtn.contains(event.target)) {
      avatarMenu.classList.add("hidden");
    }
  });
}

function initBoardView() {
  if (!document.querySelector('[data-board="1"]')) return;

  const searchInput = document.getElementById("globalSearchInput");
  const drawer = document.getElementById("taskDrawer");
  const newTaskBtn = document.getElementById("newTaskBtn");
  const closeDrawerBtn = document.getElementById("closeDrawerBtn");
  const createTaskForm = document.getElementById("createTaskForm");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      refreshBoard().catch((error) => console.error(error));
    });
  }

  if (newTaskBtn && drawer) {
    newTaskBtn.addEventListener("click", () => {
      drawer.classList.remove("hidden");
    });
  }

  if (closeDrawerBtn && drawer) {
    closeDrawerBtn.addEventListener("click", () => {
      drawer.classList.add("hidden");
    });
  }

  if (createTaskForm) {
    createTaskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(createTaskForm);
      const payload = Object.fromEntries(formData.entries());
      await jpost("/api/task", payload);
      createTaskForm.reset();
      if (drawer) drawer.classList.add("hidden");
      await refreshBoard();
    });
  }

  window.CollabUI = { closeModal };
  refreshBoard().catch((error) => console.error(error));

  if (boardPollTimer) clearInterval(boardPollTimer);
  boardPollTimer = setInterval(() => {
    refreshBoard().catch(() => {});
  }, 7000);
}

function initNotificationsPolling() {
  if (!document.getElementById("notifBtn")) return;
  refreshNotifications().catch(() => {});
  if (notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(() => {
    refreshNotifications().catch(() => {});
  }, 12000);
}

document.addEventListener("DOMContentLoaded", () => {
  initTopNav();
  initBoardView();
  initNotificationsPolling();

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
});
