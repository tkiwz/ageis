const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();

(async () => {
  const user = await db.user.findUnique({
    where: { email: 'admin@aegis.local' }
  });
  
  if (!user) {
    console.log('User NOT found');
    process.exit(1);
  }
  
  console.log('User found:', user.email);
  console.log('Hash starts:', user.passwordHash.substring(0, 30));
  console.log('');
  
  const tests = ['password123', 'ChangeMe123!', 'admin'];
  for (const p of tests) {
    const match = await bcrypt.compare(p, user.passwordHash);
    console.log(p.padEnd(20), '->', match ? '✅ MATCH' : '❌ no');
  }
  
  await db.$disconnect();
})();
