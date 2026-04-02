/**
 * Integration test: Use the new debt simplification algorithm with your group data
 */

const { simplifyDebtsPreservingPairsDinic } = require('../services/debtSimplification');

async function testWithGroupData() {
  const axios = require('axios');

  try {
    const groupId = '84da65dd-b3cf-47ef-bd5d-754fa3ac48a0';
    
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  TESTING NEW DEBT SIMPLIFICATION ALGORITHM           ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // Get group data
    console.log('📊 Fetching group data...');
    const groupRes = await axios.get(
      `http://localhost:5000/api/groups/${groupId}`
    );
    const group = groupRes.data.data;
    console.log(`Group: ${group.title || 'Unknown'}`);

    // Get expenses
    console.log('\n📝 Fetching expenses...');
    const expensesRes = await axios.get(
      `http://localhost:5000/api/groups/${groupId}/expenses`
    );
    const expenses = expensesRes.data.data || [];
    console.log(`Found ${expenses.length} expenses\n`);

    // Build transactions array (debtor -> creditor)
    console.log('🔗 Building transaction edges from expenses:');
    const transactions = [];
    const userNames = {}; // Cache for user IDs

    // Get all group members for names
    const membersRes = await axios.get(
      `http://localhost:5000/api/groups/${groupId}`
    );
    
    expenses.forEach((expense) => {
      const payer = expense.paidBy;
      
      if (expense.splits && Array.isArray(expense.splits)) {
        expense.splits.forEach((split) => {
          if (split.userId !== payer && split.amount > 0) {
            // This person owes the payer
            transactions.push({
              from: split.userId,
              to: payer,
              amount: Math.floor(split.amount)
            });
            
            console.log(
              `  ${split.userId.substring(0, 8)}... → ${payer.substring(0, 8)}...: ₹${split.amount}`
            );
          }
        });
      }
    });

    if (transactions.length === 0) {
      console.log('  No transactions to simplify');
      return;
    }

    console.log(`\n📊 Input: ${transactions.length} debt edges`);
    transactions.forEach(t => {
      console.log(`  ${t.from.substring(0, 8)}... → ${t.to.substring(0, 8)}...: ₹${t.amount}`);
    });

    // Run simplification
    console.log('\n⚙️  Running debt simplification algorithm...');
    const simplified = simplifyDebtsPreservingPairsDinic(transactions);

    console.log(`\n✅ Output: ${simplified.length} debt edges (compressed from ${transactions.length})`);
    simplified.forEach(t => {
      console.log(`  ${t.from.substring(0, 8)}... → ${t.to.substring(0, 8)}...: ₹${t.amount}`);
    });

    // Calculate compression ratio
    const ratio = transactions.length > 0 ? 
      ((transactions.length - simplified.length) / transactions.length * 100).toFixed(1) : 
      0;
    console.log(`\n📈 Compression: ${transactions.length} → ${simplified.length} edges (${ratio}% reduction)`);

    console.log('\n✅ Integration test completed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
  }
}

testWithGroupData();
