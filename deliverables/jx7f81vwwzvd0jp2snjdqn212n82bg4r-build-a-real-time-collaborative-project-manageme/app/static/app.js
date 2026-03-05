const STATUS_META = {
  todo: { label: 'To Do', accent: '#3b82f6' },
  in_progress: { label: 'In Progress', accent: '#f59e0b' },
  review: { label: 'Review', accent: '#a855f7' },
  done: { label: 'Done', accent: '#22c55e' }
};
const PRIORITY_COLORS = { low: '#22c55e', medium: '#eab308', high: '#f97316', urgent: '#ef4444' };

async function jget(url){ const r=await fetch(url); return r.json(); }
async function jpost(url,payload){ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) throw new Error('Request failed'); return r.json(); }

function relativeTime(iso){ const d=new Date(iso); const diff=Math.floor((Date.now()-d)/60000); if(diff<1) return 'just now'; if(diff<60) return `${diff}m ago`; if(diff<1440) return `${Math.floor(diff/60)}h ago`; return `${Math.floor(diff/1440)}d ago`; }

function cardHTML(t){
  return `<div class="task-card" draggable="true" data-task-id="${t.id}">
    <div class="task-title">${t.title}</div>
    <div class="task-meta">
      <span class="priority-dot" style="background:${PRIORITY_COLORS[t.priority]||'#999'}"></span>
      <span class="due ${t.is_overdue ? 'overdue' : ''}">${t.due_date || 'No due date'}</span>
      <span class="assignee">${t.assignee ? `<span class="avatar" style="background:${t.assignee.color}"></span>${t.assignee.name}` : 'Unassigned'}</span>
      <span class="comment-bubble">💬 ${t.comment_count}</span>
    </div>
  </div>`;
}

function renderBoard(data){
  const root = document.getElementById('kanban'); if(!root) return;
  root.innerHTML = Object.keys(STATUS_META).map(status => {
    const items = data.columns[status] || [];
    return `<div class="column" data-status="${status}">
      <div class="col-head" style="--accent:${STATUS_META[status].accent}">
        <h4>${STATUS_META[status].label}</h4><span class="badge">${items.length}</span>
      </div>
      <div class="dropzone">${items.map(cardHTML).join('')}</div>
    </div>`;
  }).join('');
  wireDrag(); wireCardOpen();
}

function wireDrag(){
  document.querySelectorAll('.task-card').forEach(c=>{
    c.addEventListener('dragstart', e => e.dataTransfer.setData('task_id', c.dataset.taskId));
  });
  document.querySelectorAll('.dropzone').forEach(zone=>{
    zone.addEventListener('dragover',e=>e.preventDefault());
    zone.addEventListener('drop', async e=>{
      e.preventDefault();
      const taskId = e.dataTransfer.getData('task_id');
      const newStatus = zone.parentElement.dataset.status;
      await jpost(`/api/task/${taskId}/move`,{status:newStatus});
      await refreshBoard();
    });
  });
}

function wireCardOpen(){
  document.querySelectorAll('.task-card').forEach(c=> c.addEventListener('click',()=>openTask(c.dataset.taskId)));
}

async function refreshBoard(){
  const q = (document.getElementById('searchInput')?.value || '').trim();
  const data = await jget(`/api/board?q=${encodeURIComponent(q)}`);
  renderBoard(data);
}

async function openTask(id){
  const data = await jget(`/api/task/${id}`);
  const modal = document.getElementById('taskModal');
  const left = document.getElementById('taskLeft');
  const right = document.getElementById('taskRight');
  const t = data.task;
  left.innerHTML = `<h2 contenteditable="true" id="taskTitle">${t.title}</h2>
    <textarea id="taskDesc" class="rich-input">${t.description || ''}</textarea>
    <div class="preview">${(t.description || '').replace(/\n/g,'<br>')}</div>
    <label>Priority <select id="taskPriority"><option ${t.priority==='low'?'selected':''}>low</option><option ${t.priority==='medium'?'selected':''}>medium</option><option ${t.priority==='high'?'selected':''}>high</option><option ${t.priority==='urgent'?'selected':''}>urgent</option></select></label>
    <label>Due date <input type="date" id="taskDue" value="${t.due_date || ''}"></label>
    <label>Assignee <input id="taskAssignee" value="${t.assignee_id || ''}" placeholder="User ID"></label>
    <button id="saveTaskBtn">Save</button>`;
  right.innerHTML = `<h3>Comments</h3><div class="thread">${data.comments.map(c=>`<div class="comment ${c.parent_id ? 'child' : ''}"><span class="avatar" style="background:${c.color}"></span><b>${c.author}</b> ${c.body}<small>${relativeTime(c.created_at)}</small></div>`).join('')}</div>
    <div class="row"><input id="commentInput" placeholder="Write a comment"><button id="commentBtn">Send</button></div>
    <h3>Activity</h3><ul class="activity">${data.activity.map(a=>`<li><b>${a.actor}</b> ${a.detail} <small>${relativeTime(a.created_at)}</small></li>`).join('')}</ul>`;
  document.getElementById('commentBtn').onclick = async ()=>{ const body=document.getElementById('commentInput').value.trim(); if(body){ await jpost(`/api/task/${id}/comment`,{body}); await openTask(id); refreshBoard(); } };
  document.getElementById('saveTaskBtn').onclick = async ()=>{
    await jpost(`/api/task/${id}/update`, {
      title: document.getElementById('taskTitle').innerText.trim(),
      description: document.getElementById('taskDesc').value,
      priority: document.getElementById('taskPriority').value,
      due_date: document.getElementById('taskDue').value,
      assignee_id: document.getElementById('taskAssignee').value || null
    });
    await openTask(id); await refreshBoard();
  };
  modal.classList.remove('hidden');
}

function closeModal(){ document.getElementById('taskModal')?.classList.add('hidden'); }

async function refreshNotifications(){
  const panel=document.getElementById('notifPanel'); if(!panel) return;
  const data = await jget('/api/notifications');
  panel.innerHTML = data.items.map(n=>`<div class="notif"><b>${n.actor}</b> ${n.body}<small>${relativeTime(n.created_at)}</small></div>`).join('') || '<p>No notifications</p>';
}

function init(){
  if(!document.querySelector('[data-board="1"]')) return;
  refreshBoard(); refreshNotifications();
  setInterval(refreshBoard, 5000); setInterval(refreshNotifications, 10000);
  document.getElementById('searchInput').addEventListener('input', refreshBoard);
  document.getElementById('notifBtn').onclick = ()=> document.getElementById('notifPanel').classList.toggle('hidden');
  document.getElementById('newTaskBtn').onclick = ()=> document.getElementById('taskDrawer').classList.toggle('hidden');
  document.getElementById('createTaskForm').onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    await jpost('/api/task', Object.fromEntries(fd.entries()));
    e.target.reset(); document.getElementById('taskDrawer').classList.add('hidden');
    refreshBoard();
  };
  window.CollabUI = { closeModal };
}

document.addEventListener('DOMContentLoaded', init);
