import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('prisma/dev.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
let sql = "";

for (const table of tables) {
  const rows = db.prepare(`SELECT * FROM "${table.name}"`).all();
  if (rows.length === 0) continue;
  
  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    const values = columns.map(col => {
      if (row[col] === null) return 'NULL';
      if (typeof row[col] === 'number') return row[col];
      return `'${String(row[col]).replace(/'/g, "''")}'`;
    });
    sql += `INSERT INTO "${table.name}" (${columns.map(c=>`"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
  }
}

fs.writeFileSync('data-inserts.sql', sql);
console.log(`✅ Done! Generated SQL for ${tables.length} tables.`);
db.close();