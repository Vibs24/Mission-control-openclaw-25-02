import fs from 'fs';
console.log('Apply SQL in src/db/migrations.sql to PostgreSQL using psql or migration runner.');
console.log(fs.readFileSync(new URL('./migrations.sql', import.meta.url), 'utf8').slice(0,120));
