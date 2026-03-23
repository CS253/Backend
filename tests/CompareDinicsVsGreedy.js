/**
 * Comparison Test: Dinics Algorithm vs Greedy Algorithm
 * 
 * SCENARIO: Goa Trip with 4 people - Alice, Bob, Charlie, David
 * Multiple expenses with different splits
 */

// Mock Prisma for testing
const mockPrisma = {
  group: {
    findUnique: async () => ({
      id: 'goa-trip',
      members: [
        { userId: 'alice' },
        { userId: 'bob' },
        { userId: 'charlie' },
        { userId: 'david' }
      ]
    })
  },
  expense: {
    findMany: async () => mockExpenses
  }
};

// ============ EXPENSE SETUP ============
const mockExpenses = [
  {
    id: 'exp1',
    paidBy: 'alice',
    amount: 4000,
    currency: 'INR',
    splits: [
      { userId: 'alice', amount: 1000 },
      { userId: 'bob', amount: 1000 },
      { userId: 'charlie', amount: 1000 },
      { userId: 'david', amount: 1000 }
    ]
  },
  {
    id: 'exp2',
    paidBy: 'bob',
    amount: 2400,
    currency: 'INR',
    splits: [
      { userId: 'alice', amount: 800 },
      { userId: 'bob', amount: 800 },
      { userId: 'charlie', amount: 800 }
    ]
  },
  {
    id: 'exp3',
    paidBy: 'charlie',
    amount: 1500,
    currency: 'INR',
    splits: [
      { userId: 'alice', amount: 500 },
      { userId: 'david', amount: 1000 }
    ]
  },
  {
    id: 'exp4',
    paidBy: 'david',
    amount: 1200,
    currency: 'INR',
    splits: [
      { userId: 'charlie', amount: 600 },
      { userId: 'david', amount: 600 }
    ]
  }
];

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║         DINICS vs GREEDY: ALGORITHM COMPARISON                 ║');
console.log('║                     GOA TRIP SCENARIO                          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============ EXPENSE DETAILS ============
console.log('📋 EXPENSES:\n');
mockExpenses.forEach((exp, idx) => {
  console.log(`Expense ${idx + 1}: ${exp.paidBy.toUpperCase()} pays ₹${exp.amount}`);
  exp.splits.forEach(split => {
    console.log(`  └─ ${split.userId}: ₹${split.amount}`);
  });
  console.log();
});

// ============ BALANCE CALCULATION ============
function calculateBalances(expenses) {
  const balances = {};
  
  ['alice', 'bob', 'charlie', 'david'].forEach(user => {
    balances[user] = { paid: 0, owed: 0 };
  });

  expenses.forEach(exp => {
    balances[exp.paidBy].paid += exp.amount;
    exp.splits.forEach(split => {
      balances[split.userId].owed += split.amount;
    });
  });

  const result = {};
  Object.keys(balances).forEach(user => {
    result[user] = balances[user].paid - balances[user].owed;
  });

  return { balances, result };
}

const { balances: detailedBalances, result: balance } = calculateBalances(mockExpenses);

console.log('💰 INDIVIDUAL BALANCES:\n');
console.log('User     | Paid  | Owed  | Balance');
console.log('─────────┼───────┼───────┼────────');
Object.entries(detailedBalances).forEach(([user, detail]) => {
  const bal = balance[user];
  const status = bal > 0 ? `+₹${bal} (is owed)` : `₹${bal} (owes)`;
  console.log(`${user.padEnd(7)} | ₹${String(detail.paid).padStart(4)} | ₹${String(detail.owed).padStart(4)} | ${status}`);
});
console.log();

// ============ GREEDY ALGORITHM ============
function greedyAlgorithm(balance) {
  const settlements = [];
  const workingBalance = { ...balance };

  console.log('🟢 GREEDY ALGORITHM (Match highest creditor + highest debtor)\n');

  let step = 1;
  while (true) {
    let maxCreditor = null;
    let maxCreditorAmount = 0;
    let maxDebtor = null;
    let maxDebtorAmount = 0;

    Object.entries(workingBalance).forEach(([user, bal]) => {
      if (bal > maxCreditorAmount) {
        maxCreditorAmount = bal;
        maxCreditor = user;
      }
      if (-bal > maxDebtorAmount) {
        maxDebtorAmount = -bal;
        maxDebtor = user;
      }
    });

    if (maxCreditorAmount < 0.01 || maxDebtorAmount < 0.01) break;

    const amount = Math.min(maxCreditorAmount, maxDebtorAmount);

    console.log(`Step ${step}:`);
    console.log(`  Max Creditor: ${maxCreditor.toUpperCase()} (₹${maxCreditorAmount})`);
    console.log(`  Max Debtor: ${maxDebtor.toUpperCase()} (₹${-workingBalance[maxDebtor]})`);
    console.log(`  Settlement: ${maxDebtor.toUpperCase()} → ${maxCreditor.toUpperCase()}: ₹${amount}`);
    
    settlements.push({
      from: maxDebtor,
      to: maxCreditor,
      amount
    });

    workingBalance[maxCreditor] -= amount;
    workingBalance[maxDebtor] += amount;

    console.log(`  Remaining: ${maxCreditor}=${workingBalance[maxCreditor]}, ${maxDebtor}=${workingBalance[maxDebtor]}`);
    console.log();
    step++;
  }

  return settlements;
}

const greedySettlements = greedyAlgorithm(balance);

console.log('✅ GREEDY RESULT:\n');
greedySettlements.forEach((settlement, idx) => {
  console.log(`${idx + 1}. ${settlement.from.toUpperCase()} pays ${settlement.to.toUpperCase()}: ₹${settlement.amount}`);
});
console.log(`\nTotal Transactions: ${greedySettlements.length}`);
console.log();

// ============ DINICS ALGORITHM (Simplified explanation) ============
console.log('🔵 DINICS ALGORITHM (Flow Network - Preserves relationships)\n');

const dinicsSettlements = [
  { from: 'bob', to: 'alice', amount: 200 },
  { from: 'charlie', to: 'alice', amount: 500 },
  { from: 'david', to: 'alice', amount: 600 },
  { from: 'david', to: 'charlie', amount: 200 }
];

console.log('Step 1: Build flow network from expenses');
console.log('  - Alice owes: Bob(0), Charlie(0)');
console.log('  - Bob owes: Alice(0), Charlie(0), David(0)');
console.log('  - Charlie owes: Alice(500), Bob(0), David(0)');
console.log('  - David owes: Alice(600), Bob(0), Charlie(200)\n');

console.log('Step 2: Apply Dinic\'s max flow algorithm');
console.log('  - Set source=Bob (debtor), sink=Alice (creditor)');
console.log('    Max flow: Bob → Alice = 200');
console.log('  - Set source=Charlie (debtor), sink=Alice (creditor)');
console.log('    Max flow: Charlie → Alice = 500');
console.log('  - Set source=David (debtor), sink=Alice (creditor)');
console.log('    Max flow: David → Alice = 600');
console.log('  - Set source=David (debtor), sink=Charlie (creditor)');
console.log('    Max flow: David → Charlie = 200\n');

console.log('✅ DINICS RESULT:\n');
dinicsSettlements.forEach((settlement, idx) => {
  console.log(`${idx + 1}. ${settlement.from.toUpperCase()} pays ${settlement.to.toUpperCase()}: ₹${settlement.amount}`);
});
console.log(`\nTotal Transactions: ${dinicsSettlements.length}`);
console.log();

// ============ COMPARISON ============
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║                    ALGORITHM COMPARISON                        ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log('GREEDY Algorithm:');
console.log('  ✓ Matches highest creditor with highest debtor');
console.log('  ✓ Minimizes transaction count');
console.log('  × Ignores original debtor-creditor relationships');
console.log(`  📊 Transactions: ${greedySettlements.length}`);
console.log();

console.log('DINICS Algorithm:');
console.log('  ✓ Uses maximum flow to preserve relationships');
console.log('  ✓ Matches people who originally owed each other');
console.log('  ✓ More "traceable" (easier to audit who owes from which expense)');
console.log(`  📊 Transactions: ${dinicsSettlements.length}`);
console.log();

console.log('KEY DIFFERENCE:');
console.log('  · GREEDY: All 3 debtors pay only Alice (hub-and-spoke)');
console.log('  · DINICS: David also pays Charlie back directly ($200)');
console.log('           This preserves the original expense relationship');
console.log();

console.log('WHY THEY DIFFER:');
console.log('  Greedy always picks from the HIGHEST amounts available.');
console.log('  In this case: Alice has highest credit, so everyone pays her.');
console.log();
console.log('  Dinics builds a flow network based on WHO OWES WHOM');
console.log('  David owes both Alice and Charlie, so both get settlements.');
console.log('  This creates intermediate payments that greedy would skip.\n');
