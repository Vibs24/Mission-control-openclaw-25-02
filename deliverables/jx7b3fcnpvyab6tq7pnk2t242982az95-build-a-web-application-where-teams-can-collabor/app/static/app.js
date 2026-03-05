document.querySelectorAll('.task').forEach(t=>{t.addEventListener('dragstart',e=>e.dataTransfer.setData('id',t.dataset.task));});
