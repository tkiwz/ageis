import Database from 'better-sqlite3';
import fs from 'fs';

try {
  console.log("⏳ Reading local database...");
  const db = new Database('prisma/dev.db');
  
  // يصدّر كل البيانات كأوامر SQL
  const sql = db.serialize(); 
  
  fs.writeFileSync('dump.sql', sql);
  console.log("✅ All data exported to dump.sql successfully!");
  db.close();
} catch (e) {
  console.error("❌ Error:", e.message);
}