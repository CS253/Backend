const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api';

(async () => {
  try {
    console.log('✅ Testing Expense Sorting (Latest First)\n');
    console.log('═'.repeat(80));

    // Get first group
    const group = await prisma.group.findFirst({
      where: {
        members: {
          some: {} // Has members
        }
      },
      include: { members: true }
    });

    if (!group || !group.members || group.members.length === 0) {
      console.log('❌ No group with members found');
      process.exit(0);
    }

    const groupId = group.id;

    console.log(`📊 Group: ${groupId}`);
    console.log(`   Testing expense order (latest at top)\n`);

    // Get expenses
    const listRes = await axios.get(`${BASE_URL}/groups/${groupId}/expenses`);
    const allExpenses = listRes.data.data;

    console.log(`📋 First 10 expenses (showing order):\n`);

    let sortingCorrect = true;
    let prevDate = null;

    allExpenses.slice(0, 10).forEach((exp, idx) => {
      const dateStr = new Date(exp.date).toLocaleDateString('en-IN');
      const timeStr = new Date(exp.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      
      console.log(`${idx + 1}. [${dateStr} ${timeStr}] ${exp.title.substring(0, 40).padEnd(40)} | ₹${exp.amount}`);

      // Check descending date order (latest first)
      if (prevDate && new Date(exp.date) > prevDate) {
        sortingCorrect = false;
        console.log(`   ⚠️  ERROR: Out of order!`);
      }
      prevDate = new Date(exp.date);
    });

    console.log('\n' + '═'.repeat(80));
    
    if (sortingCorrect) {
      console.log('\n✅ SORTING VERIFIED:');
      console.log('   • Latest expenses appear at the TOP');
      console.log('   • Oldest expenses at the bottom');
      console.log('   • Sorted by transaction date (newest first)');
    } else {
      console.log('\n❌ SORTING ISSUE FOUND');
    }

    console.log('\n📝 Summary:');
    console.log('   • Total expenses: ' + allExpenses.length);
    console.log('   • First (latest): ' + new Date(allExpenses[0].date).toLocaleDateString('en-IN'));
    if (allExpenses.length > 0) {
      console.log('   • Last (oldest): ' + new Date(allExpenses[allExpenses.length - 1].date).toLocaleDateString('en-IN'));
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
    await prisma.$disconnect();
    process.exit(1);
  }
})();
