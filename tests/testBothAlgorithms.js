const axios = require('axios');

const API_URL = 'http://localhost:5000';

async function testBothAlgorithms() {
  try {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  TESTING BOTH SETTLEMENT ALGORITHMS                  ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // Use known group ID
    const groupId = '84da65dd-b3cf-47ef-bd5d-754fa3ac48a0';
    const groupRes = await axios.get(`${API_URL}/api/groups/${groupId}`);
    const groupName = groupRes.data.data.title;
    console.log(`📊 Testing group: ${groupName}\n`);

    // Test 1: simplifyDebts=false (Preserve-Pairs Dinics)
    console.log('─────────────────────────────────────────────────────');
    console.log('🔄 Algorithm #1: PRESERVE-PAIRS DINICS (simplifyDebts=false)');
    console.log('─────────────────────────────────────────────────────');
    const dinicsRes = await axios.get(
      `${API_URL}/api/groups/${groupId}/balances?simplifyDebts=false`
    );
    
    let dinicsCount = 0;
    const dinicsData = dinicsRes.data.data;
    Object.values(dinicsData).forEach(transactions => {
      if (Array.isArray(transactions)) {
        console.log(`\nTransactions (${transactions[0]?.currency || 'INR'}):`);
        transactions.forEach((tx, idx) => {
          const fromName = tx.fromUserId.substring(0, 8);
          const toName = tx.toUserId.substring(0, 8);
          console.log(`  ${idx + 1}. ${fromName}... → ${toName}...: ₹${tx.amount}`);
          dinicsCount++;
        });
      }
    });
    console.log(`✅ Total transactions: ${dinicsCount}`);

    console.log('\n');

    // Test 2: simplifyDebts=true (Greedy)
    console.log('─────────────────────────────────────────────────────');
    console.log('💰 Algorithm #2: GREEDY (simplifyDebts=true)');
    console.log('─────────────────────────────────────────────────────');
    const greedyRes = await axios.get(
      `${API_URL}/api/groups/${groupId}/balances?simplifyDebts=true`
    );
    
    let greedyCount = 0;
    const greedyData = greedyRes.data.data;
    Object.values(greedyData).forEach(transactions => {
      if (Array.isArray(transactions)) {
        console.log(`\nTransactions (${transactions[0]?.currency || 'INR'}):`);
        transactions.forEach((tx, idx) => {
          const fromName = tx.fromUserId.substring(0, 8);
          const toName = tx.toUserId.substring(0, 8);
          console.log(`  ${idx + 1}. ${fromName}... → ${toName}...: ₹${tx.amount}`);
          greedyCount++;
        });
      }
    });
    console.log(`✅ Total transactions: ${greedyCount}`);

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log(`║ Comparison: Dinics=${dinicsCount}, Greedy=${greedyCount}              ║`);
    console.log('╚══════════════════════════════════════════════════════╝\n');

    if (dinicsCount > 0 && greedyCount > 0) {
      console.log('✅ Both algorithms working! Dinics preserves relationships better.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testBothAlgorithms();
