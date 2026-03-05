let dragId=null;
document.querySelectorAll('.task').forEach(t=>{t.addEventListener('dragstart',()=>dragId=t.dataset.id)});
document.querySelectorAll('.col').forEach(c=>{c.addEventListener('dragover',e=>e.preventDefault());c.addEventListener('drop',async()=>{if(!dragId) return;const status=c.dataset.status;await fetch(`/task/${dragId}/move`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});location.reload();});});
