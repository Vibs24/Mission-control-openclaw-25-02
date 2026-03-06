export async function triageTicket(title:string,description:string){
  // Claude API adapter boundary (replace with SDK call)
  const text=(title+' '+description).toLowerCase();
  const priority=text.includes('down')||text.includes('urgent')?'critical':'medium';
  const category=text.includes('vpn')?'network':'general';
  return {priority,category};
}
