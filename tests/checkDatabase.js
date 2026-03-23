const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const groups = await prisma.group.findMany({
    include: { expenses: true }
  });
  console.log('Total groups:', groups.length);
  groups.forEach(g => {
    console.log(`  Group: ${g.name} (${g.id})`);
    console.log(`    Expenses: ${g.expenses?.length || 0}`);
  });
  await prisma.$disconnect();
})();
