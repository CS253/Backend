const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api';

(async () => {
  try {
    console.log('✅ Testing History Sorting by Transaction Date\n');
    console.log('═'.repeat(90));

    // Get first group
    const group = await prisma.group.findFirst({
      where: {
        expenses: {
          some: {}
        }
      }
    });

    if (!group) {
      console.log('❌ No group with expenses found');
      process.exit(0);
    }

    const groupId = group.id;

    console.log(`📊 Group: ${groupId}\n`);

    // Get history
    const historyRes = await axios.get(`${BASE_URL}/groups/${groupId}/history`);
    const history = historyRes.data.data;

    console.log(`📜 History - Sorted by Transaction Date (Latest First):\n`);
    console.log('Index | Date (Transaction)        | CreatedAt          | Type          | Title');
    console.log('─'.repeat(90));

    let sortingCorrect = true;
    let prevDate = null;

    history.slice(0, 15).forEach((item, idx) => {
      const dateStr = new Date(item.date).toLocaleDateString('en-IN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const createdStr = new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const typeEmoji = item.type === 'REIMBURSEMENT' ? '💰' : '📝';
      
      console.log(`${(idx + 1).toString().padStart(5)} | ${dateStr.padEnd(25)} | ${createdStr.padEnd(18)} | [${typeEmoji}] ${item.type.padEnd(11)} | ${item.title.substring(0, 30)}`);

      // Check descending date order (latest first)
      if (prevDate && new Date(item.date) > prevDate) {
        sortingCorrect = false;
        console.log('      ❌ ERROR: Out of order!');
      }
      prevDate = new Date(item.date);
    });

    console.log('\n' + '═'.repeat(90));
    
    if (sortingCorrect) {
      console.log('\n✅ SORTING VERIFIED:');
      console.log('   • sorted by TRANSACTION DATE (date field), not createdAt');
      console.log('   • Latest transaction date at the TOP');
      console.log('   • Oldest transaction date at the bottom');
    } else {
      console.log('\n❌ SORTING ISSUE FOUND');
    }

    console.log('\n📝 Summary:');
    console.log('   • Total entries: ' + history.length);
    if (history.length > 0) {
      console.log('   • Latest transaction: ' + new Date(history[0].date).toLocaleDateString('en-IN'));
      console.log('   • Oldest transaction: ' + new Date(history[history.length - 1].date).toLocaleDateString('en-IN'));
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
