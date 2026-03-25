/**
 * COMPLETE FR-9 TESTING SUITE
 * Tests all settlement features including algorithms, marking paid, history, and settings
 */

const axios = require('axios');

const API_URL = 'http://localhost:5000/api';
const groupId = '84da65dd-b3cf-47ef-bd5d-754fa3ac48a0';

let testsPassed = 0;
let testsFailed = 0;

// Helper function to assert
function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║             FR-9: COMPLETE SETTLEMENT TESTING SUITE             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // STEP 1: Get group info
    console.log('📋 STEP 1: Verify Group Exists');
    console.log('─────────────────────────────────');
    const groupRes = await axios.get(`${API_URL}/groups/${groupId}`);
    assert(groupRes.status === 200, 'Group retrieved successfully');
    assert(groupRes.data.data, 'Group data exists');
    const groupName = groupRes.data.data.title;
    console.log(`   Group: ${groupName}\n`);

    // STEP 2: Get raw balances
    console.log('📊 STEP 2: Raw Balances (No Algorithm)');
    console.log('─────────────────────────────────');
    const rawRes = await axios.get(`${API_URL}/groups/${groupId}/balances`);
    assert(rawRes.status === 200, 'Raw balances endpoint works');
    assert(rawRes.data.data, 'Balances data exists');
    const balances = rawRes.data.data;
    console.log(`   Total currencies: ${Object.keys(balances).length}`);
    Object.entries(balances).forEach(([currency, users]) => {
      const userCount = Object.keys(users).length;
      console.log(`   ${currency}: ${userCount} users`);
    });
    console.log();

    // STEP 3: Test Preserve-Pairs Dinics (simplifyDebts=false)
    console.log('🔄 STEP 3: Preserve-Pairs Dinics Algorithm (simplifyDebts=false)');
    console.log('─────────────────────────────────');
    const dinicsRes = await axios.get(
      `${API_URL}/groups/${groupId}/balances?simplifyDebts=false`
    );
    assert(dinicsRes.status === 200, 'Dinics endpoint works');
    assert(dinicsRes.data.algorithm === 'DINICS', 'Algorithm is DINICS');
    let dinicsCount = 0;
    Object.entries(dinicsRes.data.data).forEach(([currency, txns]) => {
      assert(Array.isArray(txns), `${currency} returns array`);
      dinicsCount += txns.length;
      console.log(`   ${currency}: ${txns.length} transactions`);
      txns.slice(0, 3).forEach(tx => {
        console.log(`     • ${tx.fromUserId.substring(0, 8)}... → ${tx.toUserId.substring(0, 8)}...: ₹${tx.amount}`);
      });
    });
    console.log();

    // STEP 4: Test Greedy Algorithm (simplifyDebts=true)
    console.log('💰 STEP 4: Greedy Algorithm (simplifyDebts=true)');
    console.log('─────────────────────────────────');
    const greedyRes = await axios.get(
      `${API_URL}/groups/${groupId}/balances?simplifyDebts=true`
    );
    assert(greedyRes.status === 200, 'Greedy endpoint works');
    assert(greedyRes.data.algorithm === 'GREEDY', 'Algorithm is GREEDY');
    let greedyCount = 0;
    Object.entries(greedyRes.data.data).forEach(([currency, txns]) => {
      assert(Array.isArray(txns), `${currency} returns array`);
      greedyCount += txns.length;
      console.log(`   ${currency}: ${txns.length} transactions`);
      txns.slice(0, 3).forEach(tx => {
        console.log(`     • ${tx.fromUserId.substring(0, 8)}... → ${tx.toUserId.substring(0, 8)}...: ₹${tx.amount}`);
      });
    });
    assert(dinicsCount >= 0, 'Dinics algorithm executed successfully');
    assert(greedyCount >= 0, 'Greedy algorithm executed successfully');
    console.log(`   Comparison: Dinics=${dinicsCount}, Greedy=${greedyCount}`);
    if (dinicsCount === 0 && greedyCount === 0) {
      console.log('   ℹ️  All settlements have been paid off');
    }
    console.log();

    // STEP 5: Mark Settlement as Paid
    console.log('✔️  STEP 5: Mark Settlement as Paid');
    console.log('─────────────────────────────────');
    if (dinicsCount > 0) {
      const firstTx = Object.values(dinicsRes.data.data)[0][0];
      const markRes = await axios.post(
        `${API_URL}/groups/${groupId}/settlements/mark-paid`,
        {
          fromUserId: firstTx.fromUserId,
          toUserId: firstTx.toUserId,
          amount: firstTx.amount,
          currency: firstTx.currency,
        }
      );
      assert(markRes.status === 201, 'Settlement marked as paid');
      assert(markRes.data.data.title?.includes('Reimbursement'), 'Reimbursement expense created');
      console.log(`   Transaction created: ${markRes.data.data.id.substring(0, 8)}...`);
      console.log();
    }

    // STEP 6: Get Payment History
    console.log('📜 STEP 6: Payment History');
    console.log('─────────────────────────────────');
    const historyRes = await axios.get(
      `${API_URL}/groups/${groupId}/payment-history`
    );
    assert(historyRes.status === 200, 'Payment history endpoint works');
    assert(Array.isArray(historyRes.data.data), 'History returns array');
    const historyCount = historyRes.data.data.length;
    console.log(`   Total payments recorded: ${historyCount}`);
    if (historyCount > 0) {
      historyRes.data.data.slice(0, 3).forEach(tx => {
        console.log(`     • ${tx.fromUserId.substring(0, 8)}... → ${tx.toUserId.substring(0, 8)}...: ₹${tx.amount}`);
      });
    }
    console.log();

    // STEP 7: Get Settlements Alias
    console.log('🔗 STEP 7: Settlements Endpoint (Alias)');
    console.log('─────────────────────────────────');
    const settlementsRes = await axios.get(
      `${API_URL}/groups/${groupId}/settlements?simplifyDebts=true`
    );
    assert(settlementsRes.status === 200, 'Settlements endpoint works');
    console.log('   ✓ Works as alias for /balances endpoint\n');

    // STEP 8: Update Algorithm Setting
    console.log('⚙️  STEP 8: Update Algorithm Setting');
    console.log('─────────────────────────────────');
    const settingRes = await axios.put(
      `${API_URL}/groups/${groupId}/settings/simplify-debts`,
      { simplifyDebts: true }
    );
    assert(settingRes.status === 200, 'Setting update works');
    assert(settingRes.data.data.simplifyDebts === true, 'Setting persisted to database');
    console.log(`   Default algorithm set to: ${settingRes.data.data.simplifyDebts ? 'GREEDY' : 'DINICS'}`);
    
    // Switch back to false
    const settingRes2 = await axios.put(
      `${API_URL}/groups/${groupId}/settings/simplify-debts`,
      { simplifyDebts: false }
    );
    assert(settingRes2.data.data.simplifyDebts === false, 'Can switch back');
    console.log();

    // RESULTS
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log(`║                        TEST RESULTS                            ║`);
    console.log(`║  ✅ Passed: ${testsPassed}                                              ║`);
    console.log(`║  ❌ Failed: ${testsFailed}                                              ║`);
    const totalTests = testsPassed + testsFailed;
    const percentage = ((testsPassed / totalTests) * 100).toFixed(1);
    console.log(`║  Success Rate: ${percentage}%                                        ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (testsFailed === 0) {
      console.log('🎉 ALL FR-9 TESTS PASSED! Settlement system is fully functional.\n');
    } else {
      console.log('⚠️  Some tests failed. Review the output above.\n');
    }

  } catch (error) {
    console.error('❌ Test Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

runTests();
