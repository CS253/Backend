/**
 * SIMPLE TEST: Direct API test for settlement algorithms
 * No authentication, just data flow testing
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';
let testGroupId = null;
let userIds = {};

const timestamp = Date.now();
const users = [
  { name: 'Alice', email: `alice_${timestamp}@test.com`, password: 'pass123' },
  { name: 'Bob', email: `bob_${timestamp}@test.com`, password: 'pass123' },
  { name: 'Charlie', email: `charlie_${timestamp}@test.com`, password: 'pass123' }
];

async function createOrGetUser(user) {
  try {
    const res = await axios.post(`${BASE_URL}/users`, user);
    return res.data.data.userId;
  } catch (err) {
    if (err.response?.status === 400 && err.response?.data?.error?.includes('already exists')) {
      console.log(`  Already exists: ${user.name}`);
      return null; // Will try to find later
    }
    throw err;
  }
}

async function setup() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         SETTLEMENT ALGORITHMS - LIVE TEST (No Auth)             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Create users
    console.log('📝 Creating/getting test users...\n');
    for (const user of users) {
      const userId = await createOrGetUser(user);
      if (userId) {
        userIds[user.name] = userId;
        console.log(`  ✓ Created ${user.name}: ${userId.substring(0, 8)}...`);
      }
    }

    if (Object.keys(userIds).length < 3) {
      console.error('\n❌ Could not create/find all users');
      process.exit(1);
    }

    console.log(`\n📁 Creating test group...`);
    const groupRes = await axios.post(`${BASE_URL}/groups`, {
      title: 'Settlement Test ' + Date.now(),
      currency: 'INR',
      createdBy: userIds.Alice
    });
    testGroupId = groupRes.data.data.groupId;
    console.log(`✓ Group ID: ${testGroupId}\n`);

    // Add members to group
    console.log('👥 Adding members to group...');
    for (const name of ['Bob', 'Charlie']) {
      await axios.post(`${BASE_URL}/groups/${testGroupId}/members`, {
        userId: userIds[name]
      });
      console.log(`  ✓ Added ${name}`);
    }

    // ============ TEST CASE 1 ============
    console.log('\n\n' + '='.repeat(65));
    console.log('TEST CASE 1: Simple Hub Pattern');
    console.log('='.repeat(65));
    console.log('\n📊 Scenario:');
    console.log('   Bob paid ₹2200 for dinner');
    console.log('   Alice gets ₹800 worth');
    console.log('   Charlie gets ₹1400 worth');
    console.log('\n   Net Balances:');
    console.log('   Alice:   +₹800 (owed money)');
    console.log('   Charlie: +₹1400 (owed money)');
    console.log('   Bob:     -₹2200 (owes money)\n');

    const expense1 = await axios.post(
      `${BASE_URL}/groups/${testGroupId}/expenses`,
      {
        title: 'Group Dinner',
        amount: 2200,
        currency: 'INR',
        paidBy: userIds.Bob,
        split: {
          type: 'CUSTOM',
          splits: [
            { userId: userIds.Alice, amount: 800 },
            { userId: userIds.Charlie, amount: 1400 }
          ]
        }
      }
    );
    console.log(`✓ Expense created\n`);

    // Test Dinics
    console.log('🔵 DINICS (Preserves relationships):');
    await axios.put(`${BASE_URL}/groups/${testGroupId}/settings/simplify-debts`, {
      simplifyDebts: false
    });
    let res = await axios.get(`${BASE_URL}/groups/${testGroupId}/balances?simplifyDebts=false`);
    printSettlements(res.data, userIds);

    // Test Greedy
    console.log('\n🟢 GREEDY (Minimizes transactions):');
    await axios.put(`${BASE_URL}/groups/${testGroupId}/settings/simplify-debts`, {
      simplifyDebts: true
    });
    res = await axios.get(`${BASE_URL}/groups/${testGroupId}/balances?simplifyDebts=true`);
    printSettlements(res.data, userIds);

    // ============ TEST CASE 2 ============
    console.log('\n\n' + '='.repeat(65));
    console.log('TEST CASE 2: Multiple Expenses, Mixed Flow');
    console.log('='.repeat(65));
    console.log('\n📊 Scenario:');
    console.log('   Event 1: Bob paid ₹2200 (Alice: ₹800, Charlie: ₹1400)');
    console.log('   Event 2: Alice paid ₹400 (Bob: ₹200, Charlie: ₹200)');
    console.log('   Event 3: Charlie paid ₹1000 (Alice: ₹500, Bob: ₹500)\n');

    const expense2a = await axios.post(`${BASE_URL}/groups/${testGroupId}/expenses`, {
      title: 'Movie tickets for Bob & Charlie',
      amount: 400,
      currency: 'INR',
      paidBy: userIds.Alice,
      split: {
        type: 'CUSTOM',
        splits: [
          { userId: userIds.Bob, amount: 200 },
          { userId: userIds.Charlie, amount: 200 }
        ]
      }
    });

    const expense2b = await axios.post(`${BASE_URL}/groups/${testGroupId}/expenses`, {
      title: 'Groceries for Alice & Bob',
      amount: 1000,
      currency: 'INR',
      paidBy: userIds.Charlie,
      split: {
        type: 'CUSTOM',
        splits: [
          { userId: userIds.Alice, amount: 500 },
          { userId: userIds.Bob, amount: 500 }
        ]
      }
    });
    console.log(`✓ Additional expenses added\n`);

    // Calculate expected balances manually
    console.log('📈 Manual Calculation:');
    console.log('   Alice:   Paid=400, Owed=(800+500)=1300, Net=-900');
    console.log('   Bob:     Paid=0,   Owed=(200+500)=700,  Net=-700');
    console.log('   Charlie: Paid=1000+1400=2400, Owed=(1400+200)=1600, Net=+800\n');

    console.log('Correction:');
    console.log('   Alice:   Paid=400, Owed=(800+500)=1300, Net=-900 (owes)');
    console.log('   Bob:     Paid=0,   Owed=(200+500)=700,  Net=-700 (owes)');
    console.log('   Charlie: Paid=(2200+1400+1000)=4600... wait let me recalc');
    console.log('   Charlie: Paid=2200 (part) + 1000=3200, Owed=(1400+200)=1600, Net=+1600\n');

    // Test Dinics
    console.log('🔵 DINICS (Preserves relationships):');
    await axios.put(`${BASE_URL}/groups/${testGroupId}/settings/simplify-debts`, {
      simplifyDebts: false
    });
    res = await axios.get(`${BASE_URL}/groups/${testGroupId}/balances?simplifyDebts=false`);
    printSettlements(res.data, userIds);

    // Test Greedy
    console.log('\n🟢 GREEDY (Minimizes transactions):');
    await axios.put(`${BASE_URL}/groups/${testGroupId}/settings/simplify-debts`, {
      simplifyDebts: true
    });
    res = await axios.get(`${BASE_URL}/groups/${testGroupId}/balances?simplifyDebts=true`);
    printSettlements(res.data, userIds);

    // Show final balances
    console.log('\n\n📊 RAW BALANCES (no algorithm):');
    res = await axios.get(`${BASE_URL}/groups/${testGroupId}/balances`);
    if (res.data.data.INR) {
      console.log('\n💰 INR Balances:');
      Object.entries(res.data.data.INR).forEach(([userId, balance]) => {
        const name = Object.keys(userIds).find(k => userIds[k] === userId) || userId;
        const net = balance.balance;
        const sign = net >= 0 ? '+' : '';
        console.log(`   ${name.padEnd(10)}: Paid=${balance.paid.toString().padEnd(5)} Owed=${balance.owed.toString().padEnd(5)} Net=${sign}${net}`);
      });
    }

    console.log('\n\n✅ TEST COMPLETE - Check results above');
    console.log('='.repeat(65) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error.response?.data?.error || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

function printSettlements(data, userIds) {
  if (!data.data || Object.keys(data.data).length === 0) {
    console.log('  ℹ️  No settlements needed (perfectly balanced)');
    return;
  }

  Object.entries(data.data).forEach(([currency, settlements]) => {
    if (Array.isArray(settlements) && settlements.length > 0) {
      console.log(`  ${currency}:`);
      settlements.forEach((txn, idx) => {
        const fromName = Object.keys(userIds).find(k => userIds[k] === txn.fromUserId) || txn.fromUserId.substring(0, 4);
        const toName = Object.keys(userIds).find(k => userIds[k] === txn.toUserId) || txn.toUserId.substring(0, 4);
        console.log(`    ${idx + 1}. ${fromName.padEnd(10)} → ${toName.padEnd(10)}: ₹${txn.amount}`);
      });
      console.log(`  📌 Total: ${settlements.length} transaction(s)`);
    } else {
      console.log(`  ℹ️  No settlements for ${currency}`);
    }
  });
}

// Run
setup().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
