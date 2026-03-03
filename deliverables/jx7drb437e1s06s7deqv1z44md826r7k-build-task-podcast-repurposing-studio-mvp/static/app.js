const ids = ['episode_title','guest_name','url','transcript'];
let currentTab='x', generated=null;
const out = document.getElementById('output');

function payload(){
  return Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value.trim()]));
}

function sectionText(){
  if(!generated) return 'No output yet. Click Generate.';
  if(currentTab==='x') return generated.x_posts.map((v,i)=>`${i+1}. ${v}`).join('\n\n');
  if(currentTab==='li') return generated.linkedin_posts.map((v,i)=>`Post ${i+1}\n${v}`).join('\n\n---\n\n');
  if(currentTab==='nl') return generated.newsletter;
  if(currentTab==='clips') return generated.clip_hooks.map((v,i)=>`${i+1}. ${v}`).join('\n');
  if(currentTab==='yt'){
    return `Title options:\n- ${generated.youtube.title_options.join('\n- ')}\n\nDescription:\n${generated.youtube.description}\n\nTimestamps:\n- ${generated.youtube.timestamps.join('\n- ')}\n\nTag ideas:\n${generated.youtube.tag_ideas.join(', ')}`;
  }
}

function render(){ out.textContent = sectionText(); }

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentTab=btn.dataset.tab; render();
}));

document.getElementById('generateBtn').addEventListener('click', async ()=>{
  const p=payload();
  if(!p.transcript){ alert('Transcript is required'); return; }
  const r = await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
  generated = await r.json();
  localStorage.setItem('prs_latest_input', JSON.stringify(p));
  localStorage.setItem('prs_latest_output', JSON.stringify(generated));
  render();
});

document.getElementById('saveBtn').addEventListener('click',()=>{
  localStorage.setItem('prs_latest_input', JSON.stringify(payload()));
  if(generated) localStorage.setItem('prs_latest_output', JSON.stringify(generated));
  alert('Saved locally');
});

document.getElementById('loadBtn').addEventListener('click',()=>{
  const p = JSON.parse(localStorage.getItem('prs_latest_input')||'{}');
  ids.forEach(id=>document.getElementById(id).value=p[id]||'');
  generated = JSON.parse(localStorage.getItem('prs_latest_output')||'null');
  render();
});

document.getElementById('copyBtn').addEventListener('click', async ()=>{
  await navigator.clipboard.writeText(sectionText());
  alert('Copied section');
});

document.getElementById('downloadBtn').addEventListener('click', async ()=>{
  const r = await fetch('/api/export_markdown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())});
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'podcast_repurpose_output.md'; a.click();
});

window.addEventListener('load',()=>{
  const p = JSON.parse(localStorage.getItem('prs_latest_input')||'{}');
  ids.forEach(id=>document.getElementById(id).value=p[id]||'');
  generated = JSON.parse(localStorage.getItem('prs_latest_output')||'null');
  render();
});
