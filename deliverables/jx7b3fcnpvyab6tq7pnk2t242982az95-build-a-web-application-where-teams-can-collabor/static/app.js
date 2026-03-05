document.addEventListener('DOMContentLoaded',()=>{
  let dragEl=null;
  document.querySelectorAll('.task').forEach(t=>{
    t.addEventListener('dragstart',()=>dragEl=t);
  });
  document.querySelectorAll('.col').forEach(c=>{
    c.addEventListener('dragover',e=>e.preventDefault());
    c.addEventListener('drop',async e=>{e.preventDefault(); if(!dragEl) return; c.appendChild(dragEl); const id=dragEl.dataset.id; const status=c.dataset.status; await fetch(`/task/${id}/move`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});});
  });
});
