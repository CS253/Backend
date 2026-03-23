const { simplifyDebtsPreservingPairsDinic } = require('../services/debtSimplification');

// The raw debt edges extracted from the actual group's expenses
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

console.log('🔍 DINICS ALGORITHM DEBUG TEST\n');
console.log('═'.repeat(80));
console.log('\n📥 INPUT EDGES (10 total):\n');

rawDebtEdges.forEach((edge, idx) => {
  console.log(`${idx + 1}. ${edge.from} → ${edge.to}: ₹${edge.amount}`);
});

console.log('\n═'.repeat(80));
console.log('\n⚙️  Running DINICS algorithm...\n');

const result = simplifyDebtsPreservingPairsDinic(rawDebtEdges);

console.log('📤 OUTPUT EDGES:\n');

if (result && result.length > 0) {
  result.forEach((edge, idx) => {
    console.log(`${idx + 1}. ${edge.from} → ${edge.to}: ₹${edge.amount}`);
  });
} else {
  console.log('(empty result)');
}

console.log('\n═'.repeat(80));
console.log('\n📊 COMPARISON:\n');

console.log('Expected output (based on balances):');
console.log('  Aniz → Raghav: ₹3009.59');
console.log('  Aniz → Samprit: ₹2455.25');
console.log('  Aniz → Vedant: ₹515.57');

console.log('\nActual DINICS output from API:');
console.log('  Aniz → Raghav: ₹3526');
console.log('  Aniz → Samprit: ₹2453');
console.log('  Raghav → Vedant: ₹515');

console.log('\nThis function output:');
if (result && result.length > 0) {
  result.forEach(edge => {
    console.log(`  ${edge.from} → ${edge.to}: ₹${edge.amount}`);
  });
} else {
  console.log('  (empty)');
}

console.log('\n═'.repeat(80));
console.log('\n🔎 ANALYSIS:\n');

const totalInput = rawDebtEdges.reduce((sum, e) => sum + e.amount, 0);
const totalOutput = result.reduce((sum, e) => sum + e.amount, 0);

console.log(`Total input debt: ₹${totalInput.toFixed(2)}`);
console.log(`Total output debt: ₹${totalOutput.toFixed(2)}`);
console.log(`Edges reduced: ${rawDebtEdges.length} → ${result.length}`);

// Analyze the changes
console.log('\nEdges removed:');
rawDebtEdges.forEach(raw => {
  const inResult = result.some(r => r.from === raw.from && r.to === raw.to);
  if (!inResult) {
    console.log(`  ✓ ${raw.from} → ${raw.to}: ₹${raw.amount}`);
  }
});

console.log('\nEdges added (not in input):');
result.forEach(res => {
  const inInput = rawDebtEdges.some(r => r.from === res.from && r.to === res.to);
  if (!inInput) {
    console.log(`  ✓ ${res.from} → ${res.to}: ₹${res.amount}`);
  }
});

console.log('\nEdges modified (same pair, different amount):');
result.forEach(res => {
  const inInput = rawDebtEdges.find(r => r.from === res.from && r.to === res.to);
  if (inInput && Math.abs(inInput.amount - res.amount) > 0.01) {
    console.log(`  ✓ ${res.from} → ${res.to}: ₹${inInput.amount} → ₹${res.amount}`);
  }
});
