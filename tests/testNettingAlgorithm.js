const fs = require('fs');

// Simple test of the new netting algorithm
function netBidirectionalDebts(debtGraph) {
  const processed = new Set();
  
  for (const [person1, creditorMap] of debtGraph) {
    for (const [person2, amount1] of creditorMap) {
      const pairKey = [person1, person2].sort().join('|');
      if (processed.has(pairKey)) continue;
      
      // Check if the reverse edge exists
      if (debtGraph.has(person2) && debtGraph.get(person2).has(person1)) {
        const amount2 = debtGraph.get(person2).get(person1);
        
        // Net the two amounts
        if (amount1 > amount2) {
          // person1 still owes more
          debtGraph.get(person1).set(person2, amount1 - amount2);
          debtGraph.get(person2).delete(person1);
        } else if (amount2 > amount1) {
          // person2 still owes more (reverse the obligation)
          debtGraph.get(person2).set(person1, amount2 - amount1);
          debtGraph.get(person1).delete(person2);
        } else {
          // They cancel out exactly
          debtGraph.get(person1).delete(person2);
          debtGraph.get(person2).delete(person1);
        }
      }
      
      processed.add(pairKey);
    }
  }
}

// Input debt edges (from expenses)
const rawDebtEdges = [
  { from: 'Raghav', to: 'Vedant', amount: 811.08 },
  { from: 'Samprit', to: 'Vedant', amount: 430.75 },
  { from: 'Aniz', to: 'Vedant', amount: 811.08 },
  { from: 'Vedant', to: 'Raghav', amount: 82.67 },
  { from: 'Aniz', to: 'Raghav', amount: 5192.67 },
  { from: 'Raghav', to: 'Samprit', amount: 962 },
  { from: 'Aniz', to: 'Samprit', amount: 962 },
  { from: 'Vedant', to: 'Samprit', amount: 962 },
  { from: 'Raghav', to: 'Aniz', amount: 492.66 },
  { from: 'Vedant', to: 'Aniz', amount: 492.66 }
];

console.log('🔧 TESTING NEW NETTING ALGORITHM\n');
console.log('═'.repeat(80));
console.log('\n📥 INPUT EDGES (from raw expenses):\n');

let inputTotal = 0;
rawDebtEdges.forEach((edge, idx) => {
  console.log(`${idx + 1}. ${edge.from} → ${edge.to}: ₹${edge.amount}`);
  inputTotal += edge.amount;
});

console.log(`\nTotal input debt: ₹${inputTotal.toFixed(2)}`);

// Build debt graph
const debtGraph = new Map();
rawDebtEdges.forEach(edge => {
  if (!debtGraph.has(edge.from)) {
    debtGraph.set(edge.from, new Map());
  }
  const current = debtGraph.get(edge.from).get(edge.to) || 0;
  debtGraph.get(edge.from).set(edge.to, current + edge.amount);
});

console.log('\n═'.repeat(80));
console.log('\n⚙️  BEFORE NETTING:\n');
printGraph(debtGraph);

// Apply netting
netBidirectionalDebts(debtGraph);

console.log('\n═'.repeat(80));
console.log('\n✅ AFTER NETTING:\n');
printGraph(debtGraph);

// Calculate totals
let outputTotal = 0;
const settlements = [];
for (const [debtor, creditorMap] of debtGraph) {
  for (const [creditor, amount] of creditorMap) {
    if (amount > 0.01) {
      outputTotal += amount;
      settlements.push({
        debtor,
        creditor,
        amount: Math.round(amount * 100) / 100
      });
    }
  }
}

console.log('\n═'.repeat(80));
console.log('\n📊 FINAL SETTLEMENTS:\n');
settlements.forEach((settlement, idx) => {
  console.log(`${idx + 1}. ${settlement.debtor} → ${settlement.creditor}: ₹${settlement.amount}`);
});

console.log('\n═'.repeat(80));
console.log('\n📈 ANALYSIS:\n');
console.log(`Input total debt:  ₹${inputTotal.toFixed(2)}`);
console.log(`Output total debt: ₹${outputTotal.toFixed(2)}`);
console.log(`Difference:        ₹${(inputTotal - outputTotal).toFixed(2)}`);
console.log(`Status: ${Math.abs(inputTotal - outputTotal) < 1 ? '✅ CORRECT' : '❌ ERROR'}`);

console.log('\nExpected balance-based settlements:');
console.log('  Aniz → Raghav: ₹3009.59');
console.log('  Aniz → Samprit: ₹2455.25');
console.log('  Aniz → Vedant: ₹515.57');

console.log('\nActual settlements from netting:');
settlements
  .sort((a, b) => (b.debtor === 'Aniz' ? -1 : 1))
  .forEach(s => {
    console.log(`  ${s.debtor} → ${s.creditor}: ₹${s.amount}`);
  });

function printGraph(graph) {
  const edges = [];
  for (const [debtor, creditorMap] of graph) {
    for (const [creditor, amount] of creditorMap) {
      if (amount > 0.01) {
        edges.push(`${debtor} → ${creditor}: ₹${amount.toFixed(2)}`);
      }
    }
  }
  edges.sort();
  edges.forEach(e => console.log(`  ${e}`));
  if (edges.length === 0) {
    console.log('  (none)');
  }
}
