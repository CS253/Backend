/**
 * Test to verify Dinics algorithm is building correct edges
 */

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

console.log('🔍 TESTING EDGE BUILDING LOGIC\n');

const currency = 'INR';
const edges = new Map();

mockExpenses.forEach((expense) => {
  if (expense.currency !== currency) return;

  const payer = expense.paidBy;
  console.log(`Expense: ${payer} paid ₹${expense.amount}`);
  
  expense.splits.forEach((split) => {
    console.log(`  Split: ${split.userId} gets ₹${split.amount}`);
    
    if (split.userId !== payer) {
      const key = `${split.userId}->${payer}`;
      console.log(`    ✓ Edge: ${split.userId} owes ${payer}: ₹${split.amount}`);
      
      if (!edges.has(key)) {
        edges.set(key, { from: split.userId, to: payer, capacity: 0 });
      }
      edges.get(key).capacity += split.amount;
    } else {
      console.log(`    ✗ Skip (payer split)`);
    }
  });
  console.log();
});

console.log('📊 FINAL EDGES:\n');
console.log('Edge                 | Capacity');
console.log('─────────────────────┼──────────');
edges.forEach((edge, key) => {
  console.log(`${key.padEnd(20)} | ₹${edge.capacity}`);
});

console.log('\n✅ EXPECTED EDGES (ALL 8):\n');
console.log('Edge                 | Expected');
console.log('─────────────────────┼──────────');
console.log('bob->alice           | ₹1000');
console.log('charlie->alice       | ₹1000');
console.log('david->alice         | ₹1000');
console.log('alice->bob           | ₹800');
console.log('charlie->bob         | ₹800');
console.log('alice->charlie       | ₹500');
console.log('david->charlie       | ₹1000');
console.log('charlie->david       | ₹600');

console.log('\n🔍 VERIFICATION:\n');
if (edges.size === 8) {
  console.log('✅ All 8 edges present');
} else {
  console.log(`❌ Only ${edges.size} edges, missing ${8 - edges.size}`);
}

const expectedKeys = [
  'bob->alice', 'charlie->alice', 'david->alice',
  'alice->bob', 'charlie->bob',
  'alice->charlie',
  'david->charlie', 'charlie->david'
];

expectedKeys.forEach(key => {
  if (!edges.has(key)) {
    console.log(`❌ MISSING: ${key}`);
  }
});
