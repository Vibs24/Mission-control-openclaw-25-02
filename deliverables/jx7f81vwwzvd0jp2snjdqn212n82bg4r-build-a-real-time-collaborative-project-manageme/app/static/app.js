const root = document.querySelector('.layout');
if (root) {
  const workspaceId = root.dataset.workspaceId;
  let tasks = [];
  let selectedTaskId = null;

  const board = document.getElementById('board');
  const searchInput = document.getElementById('searchInput');
  const modal = document.getElementById('taskModal');
  const drawer = document.getElementById('drawer');

  async function fetchTasks(q='') {
    const r = await fetch(`/w/${workspaceId}/tasks?q=${encodeURIComponent(q)}`);
    const data = await r.json();
    tasks = data.tasks;
    renderBoard();
  }

  function cardHtml(t){
    const due = t.due_date ? `<span class='due ${t.overdue?'overdue':''}'>${t.due_date}</span>` : '';
    const pr = `<span class='priority ${t.priority.toLowerCase()}'></span>`;
    return `<div class='task-card' draggable='true' data-id='${t.id}'><b>${t.title}</b><div class='meta'>${pr}${t.priority} ${due}</div><div class='meta'>${t.assignee_avatar} ${t.assignee_email} 💬${t.comment_count}</div></div>`;
  }

  function renderBoard(){
    document.querySelectorAll('.column').forEach(col=>{
      const s = col.dataset.status;
      const rows = tasks.filter(t=>t.status===s);
      col.querySelector('.cards').innerHTML = rows.map(cardHtml).join('');
      document.getElementById(`count-${s.replace(/ /g,'-')}`).textContent = rows.length;
    });
    bindDnD(); bindCardClicks();
  }

  function bindDnD(){
    let dragged = null;
    document.querySelectorAll('.task-card').forEach(c=> c.addEventListener('dragstart', ()=> dragged = c.dataset.id));
    document.querySelectorAll('.column').forEach(col=>{
      col.addEventListener('dragover', e=>e.preventDefault());
      col.addEventListener('drop', async e=>{
        e.preventDefault(); if(!dragged) return;
        const t = tasks.find(x=>x.id==dragged);
        const fd = new FormData();
        fd.append('title', t.title); fd.append('description', t.description || ''); fd.append('priority', t.priority);
        fd.append('due_date', t.due_date || ''); fd.append('status', col.dataset.status); fd.append('assignee_id', t.assignee_id || '');
        await fetch(`/task/${dragged}/update`, {method:'POST', body:fd});
        await fetchTasks(searchInput.value);
      });
    });
  }

  function bindCardClicks(){
    document.querySelectorAll('.task-card').forEach(c => c.onclick = ()=>openTaskModal(c.dataset.id));
  }

  async function openTaskModal(id){
    selectedTaskId = id;
    const r = await fetch(`/task/${id}`); const data = await r.json(); const t = data.task;
    document.getElementById('taskTitle').value = t.title;
    document.getElementById('taskDescription').value = t.description || '';
    document.getElementById('taskPriority').value = t.priority;
    document.getElementById('taskDueDate').value = t.due_date || '';
    document.getElementById('taskStatus').value = t.status;
    document.getElementById('taskAssignee').value = t.assignee_id || '';
    document.getElementById('commentsFeed').innerHTML = data.comments.map(c=>`<div> ${c.avatar} <b>${c.author}</b> <small>${c.created_at}</small><p>${c.body}</p></div>`).join('');
    document.getElementById('activityFeed').innerHTML = data.history.map(h=>`<div><small>${h.at}</small> ${h.detail} (${h.field}: ${h.old||'-'} → ${h.new||'-'})</div>`).join('');
    modal.classList.remove('hidden');
  }

  document.getElementById('saveTaskBtn').onclick = async ()=>{
    if(!selectedTaskId) return;
    const fd = new FormData();
    fd.append('title', document.getElementById('taskTitle').value);
    fd.append('description', document.getElementById('taskDescription').value);
    fd.append('priority', document.getElementById('taskPriority').value);
    fd.append('due_date', document.getElementById('taskDueDate').value);
    fd.append('status', document.getElementById('taskStatus').value);
    fd.append('assignee_id', document.getElementById('taskAssignee').value);
    await fetch(`/task/${selectedTaskId}/update`, {method:'POST', body:fd});
    modal.classList.add('hidden');
    await fetchTasks(searchInput.value);
  };
  document.getElementById('closeModalBtn').onclick = ()=>modal.classList.add('hidden');

  document.getElementById('commentForm').onsubmit = async (e)=>{
    e.preventDefault();
    const body = document.getElementById('commentInput').value.trim(); if(!body) return;
    const fd = new FormData(); fd.append('body', body);
    await fetch(`/task/${selectedTaskId}/comment`, {method:'POST', body:fd});
    document.getElementById('commentInput').value='';
    await openTaskModal(selectedTaskId); await fetchTasks(searchInput.value);
  };

  document.getElementById('newTaskBtn').onclick = ()=>drawer.classList.remove('hidden');
  document.getElementById('closeDrawerBtn').onclick = ()=>drawer.classList.add('hidden');
  document.getElementById('newTaskForm').onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    fd.append('status', 'To Do');
    await fetch(`/w/${workspaceId}/tasks`, {method:'POST', body:fd});
    e.target.reset(); drawer.classList.add('hidden');
    await fetchTasks(searchInput.value);
  };

  searchInput.oninput = ()=>fetchTasks(searchInput.value);

  document.getElementById('notifBtn').onclick = async ()=>{
    const p = document.getElementById('notifPanel');
    p.classList.toggle('hidden');
    const r = await fetch('/notifications'); const d = await r.json();
    p.innerHTML = d.notifications.map(n=>`<div><b>${n.title}</b><p>${n.body}</p><small>${n.created_at}</small></div>`).join('') || '<div>No notifications</div>';
  };

  fetchTasks();
}
