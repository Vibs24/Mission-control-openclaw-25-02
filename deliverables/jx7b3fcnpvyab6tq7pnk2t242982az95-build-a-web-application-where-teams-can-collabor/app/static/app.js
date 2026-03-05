document.addEventListener('DOMContentLoaded', ()=>{
  let draggedTaskId = null;
  document.querySelectorAll('.task').forEach(el=>{
    el.addEventListener('dragstart', ()=>{ draggedTaskId = el.dataset.taskId; });
  });
  document.querySelectorAll('.column').forEach(col=>{
    col.addEventListener('dragover', (e)=>e.preventDefault());
    col.addEventListener('drop', async (e)=>{
      e.preventDefault();
      if(!draggedTaskId) return;
      const form = new URLSearchParams();
      form.append('status', col.dataset.status);
      await fetch(`/task/${draggedTaskId}/status`, {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
        body: form.toString()
      });
      window.location.reload();
    });
  });
});