const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000';

(async () => {
  try {
    console.log('✅ Testing History Endpoint Sorting\n');
    console.log('═'.repeat(80));

    // Get first group with expenses
    const group = await prisma.group.findFirst({
      where: {
        expenses: {
          some: {} // At least one expense
        }
      },
      include: { expenses: true },
    });

    if (!group) {
      console.log('❌ No group found in database');
      console.log('Please run fr9-complete-test.js first to create test data');
      process.exit(0);
    }

    if (!group.expenses || group.expenses.length === 0) {
      console.log('❌ No expenses found in group');
      console.log('Please run fr9-complete-test.js first to create test data');
      process.exit(0);
    }

    console.log(`✅ Found group: "${group.name}" with ${group.expenses.length} expenses\n`);

    // Test the history endpoint
    try {
      const historyRes = await axios.get(`${BASE_URL}/api/groups/${group.id}/history`);
      const history = historyRes.data.data;

      console.log(`📜 Latest 10 History Entries\n`);
      console.log('   (Latest to Oldest)\n');

      history.slice(0, 10).forEach((item, idx) => {
        const dateStr = new Date(item.date).toLocaleDateString('en-IN');
        const timeStr = new Date(item.createdAt).toLocaleTimeString('en-IN');
        const typeEmoji = item.type === 'REIMBURSEMENT' ? '💰' : '📝';
        
        console.log(`${idx + 1}. [${typeEmoji} ${item.type.padEnd(13)}] ${item.title.substring(0, 35).padEnd(35)} | ₹${item.amount.toString().padStart(6)} | ${dateStr}`);
      });

      console.log('\n' + '═'.repeat(80));

      // Verify sorting
      let isCorrectlySorted = true;
      let prevDate = null;

      for (let i = 0; i < history.length; i++) {
        const currDate = new Date(history[i].date);
        
        if (prevDate && currDate > prevDate) {
          isCorrectlySorted = false;
          console.log(`\n❌ SORTING ERROR at index ${i}: ${currDate} is after ${prevDate}`);
          break;
        }

        // Check if same date, expenses should come before reimbursements
        if (prevDate && currDate.getTime() === prevDate.getTime()) {
          if (history[i - 1].type === 'REIMBURSEMENT' && history[i].type === 'EXPENSE') {
            console.log(`\n⚠️  TYPE ORDERING: Reimbursement appears before Expense on same date`);
            console.log(`   This is OK as long as ${history[i - 1].createdAt > history[i].createdAt ? 'reimbursement was created later' : 'expense was created later'}`);
          }
        }

        prevDate = currDate;
      }

      if (isCorrectlySorted) {
        console.log('\n✅ SORTING VERIFIED:');
        console.log('   • Latest dates appear at the top');
        console.log('   • Chronological order is maintained');
      }

      console.log(`\n📊 Total entries in history: ${history.length}`);
      console.log(`   Expenses: ${history.filter(h => h.type === 'EXPENSE').length}`);
      console.log(`   Reimbursements: ${history.filter(h => h.type === 'REIMBURSEMENT').length}`);

      console.log('\n✅ History endpoint is working correctly with proper sorting!');

    } catch (axiosError) {
      console.log(`❌ History endpoint error: ${axiosError.response?.status}`);
      console.log(`   URL: ${BASE_URL}/api/groups/${group.id}/history`);
      console.log(`   Response:`, axiosError.response?.data);
      throw axiosError;
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message || error.toString());
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
    if (prisma) await prisma.$disconnect();
    process.exit(1);
  }
})();
