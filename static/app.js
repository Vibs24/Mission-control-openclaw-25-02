function addLine(){
  const first=document.querySelector('#lines .line');
  const clone=first.cloneNode(true);
  clone.querySelector('input[name="qty"]').value=1;
  document.getElementById('lines').appendChild(clone);
}
