async function refreshTasks(){
  try{
    const res = await fetch('/api/tasks');
    if(!res.ok) return;
    const data = await res.json();
    const tbody = document.querySelector('#taskTable tbody');
    if(!tbody) return;
    // Live board indicator only (does not clobber active forms)
    document.title = `Reliability Dashboard (${data.length})`;
  }catch(e){}
}
setInterval(refreshTasks, 10000);
refreshTasks();
