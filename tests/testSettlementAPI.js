/**
 * TEST: Direct API calls to verify settlement calculation
 * Creates test group with exact test case data, tests both algorithms
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';
let testGroupId = null;
let userIds = {};

const users = [
  { name: 'Alice', email: 'alice@test.com', password: 'pass123' },
  { name: 'Bob', email: 'bob@test.com', password: 'pass123' },
  { name: 'Charlie', email: 'charlie@test.com', password: 'pass123' }
];

async function setup() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     SETTLEMENT ALGORITHM - FULL API TEST                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    // Create users
    console.log('📝 Creating test users...');
    for (const user of users) {
      try {
        const res = await axios.post(`${BASE_URL}/users`, {
          email: user.email,
          name: user.name,
          password: user.password
        });
        userIds[user.name] = res.data.data.userId;
        console.log(`  ✓ ${user.name}: ${res.data.data.userId}`);
      } catch (err) {
        if (err.response?.status === 400 && err.response?.data?.error?.includes('already exists')) {
          // User exists, that's okay
          console.log(`  ⚠️  ${user.name} already exists`);
        } else {
          throw err;
        }
      }
    }

    // If no users were created (all existed), fetch them by email
    if (Object.keys(userIds).length === 0) {
      console.log('\n📝 Fetching existing users...');
      for (const user of users) {
        const searchRes = await axios.get(`${BASE_URL}/users?email=${user.email}`);
        if (searchRes.data.data && searchRes.data.data.length > 0) {
          userIds[user.name] = searchRes.data.data[0].id;
        }
      }
    }

    // Create group (Alice creates it)
    console.log('\n📁 Creating test group...');
    const groupRes = await axios.post(`${BASE_URL}/groups`, {
      name: 'Test Settlement Group',
      description: 'Testing Dinics vs Greedy'
    });
    testGroupId = groupRes.data.data.groupId || groupRes.data.data.id;
    console.log(`  ✓ Group created: ${testGroupId}\n`);

    // Add all users to group
    console.log('👥 Adding users to group...');
    for (const name of ['Bob', 'Charlie']) {
      if (userIds[name]) {
        await axios.post(
          `${BASE_URL}/groups/${testGroupId}/members`,
          { userId: userIds[name] }
        );
        console.log(`  ✓ Added ${name}`);
      }
    }

    // TEST CASE 1: Alice +₹800, Charlie +₹1400, Bob -₹2200
    console.log('\n\n📊 TEST CASE 1: Bob paid for Alice & Charlie');
    console.log('   INPUT: Alice +₹800, Charlie +₹1400, Bob -₹2200');
    console.log('   EXPECTED: 2 transactions (both ways) OR 3 (Dinics)\n');

    // Scenario: Bob paid ₹2200 for a group dinner
    // The bill was split: Alice gets ₹800 worth, Charlie gets ₹1400 worth
    const expense1 = await axios.post(
      `${BASE_URL}/groups/${testGroupId}/expenses`,
      {
        description: 'Group Dinner',
        amount: 2200,
        currency: 'INR',
        paidBy: userIds.Bob,
        splits: [
          { userId: userIds.Alice, amount: 800, splitType: 'CUSTOM' },
          { userId: userIds.Charlie, amount: 1400, splitType: 'CUSTOM' }
        ]
      },
      { headers: { Authorization: `Bearer ${userIds.Bob}` } }
    );
    console.log(`✓ Expense created: Bob paid ₹2200\n`);

    // Test both algorithms
    await testAlgorithm('Dinics', false);
    await testAlgorithm('Greedy', true);

    // TEST CASE 2: More complex scenario
    console.log('\n\n📊 TEST CASE 2: Multiple expenses, multiple creditors');
    console.log('   Alice pays for Bob and Charlie');
    console.log('   Charlie pays for Alice\n');

    const expense2 = await axios.post(
      `${BASE_URL}/groups/${testGroupId}/expenses`,
      {
        description: 'Movie tickets for 2',
        amount: 400,
        currency: 'INR',
        paidBy: userIds.Alice,
        splits: [
          { userId: userIds.Bob, amount: 200, splitType: 'CUSTOM' },
          { userId: userIds.Charlie, amount: 200, splitType: 'CUSTOM' }
        ]
      },
      { headers: { Authorization: `Bearer ${userIds.Alice}` } }
    );
    console.log(`✓ Expense 2 created: Alice paid ₹400\n`);

    const expense3 = await axios.post(
      `${BASE_URL}/groups/${testGroupId}/expenses`,
      {
        description: 'Groceries',
        amount: 1000,
        currency: 'INR',
        paidBy: userIds.Charlie,
        splits: [
          { userId: userIds.Alice, amount: 500, splitType: 'CUSTOM' },
          { userId: userIds.Bob, amount: 500, splitType: 'CUSTOM' }
        ]
      },
      { headers: { Authorization: `Bearer ${userIds.Charlie}` } }
    );
    console.log(`✓ Expense 3 created: Charlie paid ₹1000\n`);

    await testAlgorithm('Dinics', false);
    await testAlgorithm('Greedy', true);

    // Get balances
    console.log('\n\n📈 FINAL BALANCES:');
    const balanceRes = await axios.get(
      `${BASE_URL}/groups/${testGroupId}/balances`,
      { headers: { Authorization: `Bearer ${userIds.Alice}` } }
    );
    console.log(JSON.stringify(balanceRes.data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

async function testAlgorithm(name, isGreedy) {
  try {
    console.log(`\n🔄 Setting algorithm to ${name}...`);
    
    const setting = await axios.put(
      `${BASE_URL}/groups/${testGroupId}/settings/simplify-debts`,
      { simplifyDebts: isGreedy },
      { headers: { Authorization: `Bearer ${userIds.Alice}` } }
    );
    console.log(`✓ Algorithm set: simplifyDebts=${isGreedy}\n`);

    console.log(`📊 ${name} Settlements:`);
    const settlementRes = await axios.get(
      `${BASE_URL}/groups/${testGroupId}/balances?simplifyDebts=${isGreedy}`,
      { headers: { Authorization: `Bearer ${userIds.Alice}` } }
    );

    const settlements = settlementRes.data;
    let txnCount = 0;

    if (!settlements || Object.keys(settlements).length === 0) {
      console.log('  ✓ No settlements needed (all balanced)');
    } else {
      Object.entries(settlements).forEach(([currency, txns]) => {
        console.log(`\n  Currency: ${currency}`);
        if (Array.isArray(txns)) {
          txns.forEach((txn, idx) => {
            // Get names
            const fromName = Object.keys(userIds).find(k => userIds[k] === txn.fromUserId) || txn.fromUserId;
            const toName = Object.keys(userIds).find(k => userIds[k] === txn.toUserId) || txn.toUserId;
            
            console.log(`    ${idx + 1}. ${fromName} → ${toName}: ₹${txn.amount}`);
            txnCount++;
          });
        } else {
          console.log(`  ${JSON.stringify(txns)}`);
        }
      });
    }

    console.log(`\n  📌 Total Transactions: ${txnCount}`);
    return txnCount;

  } catch (error) {
    console.error(`❌ ${name} Error:`, error.response?.data?.message || error.message);
  }
}

// Run setup
setup().catch(console.error);
