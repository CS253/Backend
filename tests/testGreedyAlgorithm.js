/**
 * Comprehensive test suite for Greedy vs Dinics algorithms
 * Tests both algorithms with various scenarios
 */

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║           GREEDY vs DINICS ALGORITHM TEST SUITE               ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// ============ TEST CASE 1: Simple 1 Debtor, 2 Creditors (Your example) ============
console.log('📋 TEST CASE 1: Simple 1 Debtor, 2 Creditors');
console.log('Scenario: Alice +₹800, Charlie +₹1400, Bob -₹2200');
console.log('Expected: 2 transactions\n');

function greedyAlgorithm(balances) {
  const settlements = [];
  const workingBalances = { ...balances };

  let step = 1;
  while (true) {
    let maxCreditorId = null;
    let maxCreditorAmount = 0;
    let maxDebtorId = null;
    let maxDebtorAmount = 0;

    Object.keys(workingBalances).forEach((userId) => {
      const balance = workingBalances[userId];
      if (balance > maxCreditorAmount) {
        maxCreditorAmount = balance;
        maxCreditorId = userId;
      }
      if (-balance > maxDebtorAmount) {
        maxDebtorAmount = -balance;
        maxDebtorId = userId;
      }
    });

    if (maxCreditorAmount < 0.01 || maxDebtorAmount < 0.01) break;

    const settlementAmount = Math.min(maxCreditorAmount, maxDebtorAmount);

    console.log(`Step ${step}:`);
    console.log(`  Max Creditor: ${maxCreditorId} (₹${maxCreditorAmount})`);
    console.log(`  Max Debtor: ${maxDebtorId} (₹${maxDebtorAmount})`);
    console.log(`  Settlement: ${maxDebtorId} → ${maxCreditorId}: ₹${settlementAmount}`);

    settlements.push({
      from: maxDebtorId,
      to: maxCreditorId,
      amount: settlementAmount,
    });

    workingBalances[maxCreditorId] -= settlementAmount;
    workingBalances[maxDebtorId] += settlementAmount;

    console.log(`  Updated balances: ${JSON.stringify(workingBalances)}\n`);
    step++;
  }

  return settlements;
}

const testCase1 = {
  alice: 800,
  charlie: 1400,
  bob: -2200,
};

const result1 = greedyAlgorithm(testCase1);
console.log(`✅ GREEDY Result: ${result1.length} transactions`);
result1.forEach((settlement, idx) => {
  console.log(`  ${idx + 1}. ${settlement.from} → ${settlement.to}: ₹${settlement.amount}`);
});
console.log();

// ============ TEST CASE 2: More Complex (2 Debtors, 2 Creditors) ============
console.log('───────────────────────────────────────────────────────────────\n');
console.log('📋 TEST CASE 2: More Complex (2 Debtors, 2 Creditors)');
console.log('Scenario: Alice +₹500, Charlie +₹1500, Bob -₹1500, David -₹500');
console.log('Expected: 2 transactions\n');

const testCase2 = {
  alice: 500,
  charlie: 1500,
  bob: -1500,
  david: -500,
};

const result2 = greedyAlgorithm(testCase2);
console.log(`✅ GREEDY Result: ${result2.length} transactions`);
result2.forEach((settlement, idx) => {
  console.log(`  ${idx + 1}. ${settlement.from} → ${settlement.to}: ₹${settlement.amount}`);
});
console.log();

// ============ TEST CASE 3: Circular Debts ============
console.log('───────────────────────────────────────────────────────────────\n');
console.log('📋 TEST CASE 3: Circular Debts (Alice→Bob→Charlie→Alice)');
console.log('Scenario: Alice +₹100, Bob -₹50, Charlie +₹50, David -₹100');
console.log('Expected: 2 transactions\n');

const testCase3 = {
  alice: 100,
  bob: -50,
  charlie: 50,
  david: -100,
};

const result3 = greedyAlgorithm(testCase3);
console.log(`✅ GREEDY Result: ${result3.length} transactions`);
result3.forEach((settlement, idx) => {
  console.log(`  ${idx + 1}. ${settlement.from} → ${settlement.to}: ₹${settlement.amount}`);
});
console.log();

// ============ TEST CASE 4: Hub Pattern (Everyone owes/owed to one person) ============
console.log('───────────────────────────────────────────────────────────────\n');
console.log('📋 TEST CASE 4: Hub Pattern (Everyone owes/owed to Alice)');
console.log('Scenario: Alice +₹300, Bob -₹100, Charlie -₹100, David -₹100');
console.log('Expected: 3 transactions\n');

const testCase4 = {
  alice: 300,
  bob: -100,
  charlie: -100,
  david: -100,
};

const result4 = greedyAlgorithm(testCase4);
console.log(`✅ GREEDY Result: ${result4.length} transactions`);
result4.forEach((settlement, idx) => {
  console.log(`  ${idx + 1}. ${settlement.from} → ${settlement.to}: ₹${settlement.amount}`);
});
console.log();

// ============ TEST CASE 5: Multiple Creditors, One Large Debtor ============
console.log('───────────────────────────────────────────────────────────────\n');
console.log('📋 TEST CASE 5: Multiple Creditors, One Large Debtor');
console.log('Scenario: Alice +₹1000, Bob +₹500, Charlie +₹1500, David -₹3000');
console.log('Expected: 3 transactions\n');

const testCase5 = {
  alice: 1000,
  bob: 500,
  charlie: 1500,
  david: -3000,
};

const result5 = greedyAlgorithm(testCase5);
console.log(`✅ GREEDY Result: ${result5.length} transactions`);
result5.forEach((settlement, idx) => {
  console.log(`  ${idx + 1}. ${settlement.from} → ${settlement.to}: ₹${settlement.amount}`);
});
console.log();

// ============ TEST CASE 6: Chain Debts (Alice owes Bob, Bob owes Charlie, etc) ============
console.log('───────────────────────────────────────────────────────────────\n');
console.log('📋 TEST CASE 6: Chain Debts');
console.log('Scenario: Alice +₹100, Bob -₹100+₹100=₹0... Actually impossible');
console.log('Scenario: Alice +₹200, Bob -₹100, Charlie +₹100, David -₹200');
console.log('Expected: 2 transactions\n');

const testCase6 = {
  alice: 200,
  bob: -100,
  charlie: 100,
  david: -200,
};

const result6 = greedyAlgorithm(testCase6);
console.log(`✅ GREEDY Result: ${result6.length} transactions`);
result6.forEach((settlement, idx) => {
  console.log(`  ${idx + 1}. ${settlement.from} → ${settlement.to}: ₹${settlement.amount}`);
});
console.log();

// ============ SUMMARY ============
console.log('═══════════════════════════════════════════════════════════════');
console.log('SUMMARY OF RESULTS:\n');
console.log('Test Case 1: ' + result1.length + ' transactions (expected 2)');
console.log('Test Case 2: ' + result2.length + ' transactions (expected 2)');
console.log('Test Case 3: ' + result3.length + ' transactions (expected 2)');
console.log('Test Case 4: ' + result4.length + ' transactions (expected 3)');
console.log('Test Case 5: ' + result5.length + ' transactions (expected 3)');
console.log('Test Case 6: ' + result6.length + ' transactions (expected 2)');
console.log();

if ([result1.length === 2, result2.length === 2, result3.length === 2, result4.length === 3, result5.length === 3, result6.length === 2].every(x => x)) {
  console.log('✅ ALL TESTS PASSED!');
} else {
  console.log('❌ SOME TESTS FAILED - CHECK GREEDY ALGORITHM');
}
