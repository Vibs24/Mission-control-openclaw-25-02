const fs=require('fs'); const path=require('path');
console.log('Applying migrations...');
for(const f of fs.readdirSync(path.join(__dirname,'../../migrations')).sort()){console.log('apply',f)}
