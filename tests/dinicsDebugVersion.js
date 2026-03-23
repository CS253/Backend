/**
 * DEBUG VERSION OF DINICS - with detailed logging
 */

function simplifyDebtsPreservingPairsDinicDEBUG(transactions, options = {}) {
  const defaults = {
    strictImproveOnly: true,
    restartAfterCommit: true,
    sortByCurrentAmountDesc: true,
    maxPasses: 100000
  };
  const opts = { ...defaults, ...options };

  console.log('\n🔧 DINICS DEBUG MODE\n');
  console.log('📥 Input transactions:', transactions.length);
  transactions.forEach(tx => {
    console.log(`   ${tx.from} → ${tx.to}: ₹${tx.amount}`);
  });

  // ===== STEP 1: NORMALIZE INPUT =====
  const { workingGraph, allowedPairs, nodes } = normalizeTransactionsDebug(transactions);

  let totalBefore = calculateTotalDebt(workingGraph);
  console.log(`\n✅ After normalize: ${countActiveEdges(workingGraph)} edges, total debt: ₹${totalBefore.toFixed(2)}`);
  printEdges(workingGraph, 'Normalized edges');

  // ===== STEP 2: ITERATIVELY COMPRESS USING MAX FLOW =====
  let passCount = 0;
  let improved = true;

  while (improved && passCount < opts.maxPasses) {
    improved = false;
    passCount++;

    const candidates = Array.from(allowedPairs)
      .map((pair) => {
        const [from, to] = pair.split('|');
        const currentAmount = workingGraph.get(from)?.get(to) || 0;
        return { from, to, currentAmount };
      });

    if (opts.sortByCurrentAmountDesc) {
      candidates.sort((a, b) => {
        if (b.currentAmount !== a.currentAmount) {
          return b.currentAmount - a.currentAmount;
        }
        if (a.from !== b.from) return a.from.localeCompare(b.from);
        return a.to.localeCompare(b.to);
      });
    }

    for (const { from, to, currentAmount } of candidates) {
      if (passCount === 1 && currentAmount > 0) {
        console.log(`\n🔄 Pass ${passCount}: Trying to compress ${from} → ${to} (current: ₹${currentAmount})`);
      }
      const compressed = tryCompressPairDebug(workingGraph, allowedPairs, from, to, nodes, passCount);
      if (compressed) {
        improved = true;
        if (opts.restartAfterCommit) {
          break;
        }
      }
    }
  }

  let totalAfter = calculateTotalDebt(workingGraph);
  const diff = totalBefore - totalAfter;
  if (diff > 0.01) {
    console.log(`\n⚠️  DEBT LOSS DETECTED: ₹${totalBefore.toFixed(2)} → ₹${totalAfter.toFixed(2)} (lost ₹${diff.toFixed(2)})`);
  }

  return exportEdgeList(workingGraph);
}

function calculateTotalDebt(graph) {
  let total = 0;
  for (const neighbors of graph.values()) {
    for (const amount of neighbors.values()) {
      total += amount;
    }
  }
  return total;
}

function printEdges(graph, label = 'Edges') {
  console.log(`\n  ${label}:`);
  const edges = [];
  for (const [from, neighbors] of graph) {
    for (const [to, amount] of neighbors) {
      if (amount > 0) {
        edges.push(`${from}→${to}: ₹${amount.toFixed(2)}`);
      }
    }
  }
  if (edges.length === 0) {
    console.log('    (none)');
  } else {
    edges.forEach(e => console.log(`    ${e}`));
  }
}

function normalizeTransactionsDebug(transactions) {
  const workingGraph = new Map();
  const nodes = new Set();
  const allowedPairsSet = new Set();

  console.log('\n1️⃣  NORMALIZE STEP:');

  for (const tx of transactions) {
    if (!tx.from || !tx.to || typeof tx.amount !== 'number') {
      throw new Error('Invalid transaction format');
    }

    const amount = Math.floor(tx.amount);
    if (amount < 0) {
      throw new Error('Negative amounts not allowed');
    }
    if (amount === 0) {
      continue;
    }
    if (tx.from === tx.to) {
      continue;
    }

    nodes.add(tx.from);
    nodes.add(tx.to);

    if (!workingGraph.has(tx.from)) {
      workingGraph.set(tx.from, new Map());
    }

    const current = workingGraph.get(tx.from).get(tx.to) || 0;
    workingGraph.get(tx.from).set(tx.to, current + amount);

    allowedPairsSet.add(`${tx.from}|${tx.to}`);
  }

  console.log('   Before cancelReversePairs:', countActiveEdges(workingGraph), 'edges');
  printEdges(workingGraph, 'Before cancel');

  cancelReversePairsDebug(workingGraph);

  console.log('   After cancelReversePairs:', countActiveEdges(workingGraph), 'edges');
  printEdges(workingGraph, 'After cancel');

  return {
    workingGraph,
    allowedPairs: allowedPairsSet,
    nodes
  };
}

function cancelReversePairsDebug(graph) {
  const nodesToProcess = Array.from(graph.keys());
  const cancelledPairs = [];

  for (const u of nodesToProcess) {
    if (!graph.has(u)) continue;
    const neighbors = graph.get(u);

    for (const v of neighbors.keys()) {
      if (!graph.has(v)) continue;
      const reverseNeighbors = graph.get(v);

      if (reverseNeighbors.has(u)) {
        const forward = neighbors.get(v);
        const reverse = reverseNeighbors.get(u);

        if (forward > reverse) {
          neighbors.set(v, forward - reverse);
          reverseNeighbors.delete(u);
          cancelledPairs.push(`${u}→${v}: ${forward} cancel ${reverse} = ${forward - reverse}`);
        } else if (reverse > forward) {
          reverseNeighbors.set(u, reverse - forward);
          neighbors.delete(v);
          cancelledPairs.push(`${u}→${v}: ${forward} cancel ${reverse} reverse = ${reverse - forward} (reversed)`);
        } else {
          neighbors.delete(v);
          reverseNeighbors.delete(u);
          cancelledPairs.push(`${u}→${v}: ${forward} fully cancelled by ${reverse}`);
        }
      }
    }
  }

  if (cancelledPairs.length > 0) {
    console.log('   Cancelled pairs:');
    cancelledPairs.forEach(p => console.log(`     ${p}`));
  }
}

function tryCompressPairDebug(workingGraph, allowedPairs, from, to, nodes, pass) {
  const edgeCountBefore = countActiveEdges(workingGraph);

  const direct = workingGraph.get(from)?.get(to) || 0;
  if (direct === 0) {
    return false;
  }

  const flowNetwork = buildFlowNetworkExcludingPair(workingGraph, from, to, nodes);

  if (!flowNetwork || flowNetwork.nodes.size === 0) {
    if (pass === 1) console.log(`     No alternate paths found`);
    return false;
  }

  const { DinicMaxFlow } = require('../services/debtSimplification');
  const dinic = new DinicMaxFlow(flowNetwork.nodes);
  for (const [u, neighbors] of flowNetwork.edges) {
    for (const [v, cap] of neighbors) {
      dinic.addEdge(u, v, cap);
    }
  }

  const maxFlowValue = dinic.maxFlow(from, to);
  if (pass === 1) {
    console.log(`     Max flow from ${from} to ${to} (without direct): ₹${maxFlowValue}`);
  }
  if (maxFlowValue <= 0) {
    if (pass === 1) console.log(`     No flow found`);
    return false;
  }

  const usedFlows = dinic.getUsedForwardFlows();
  if (pass === 1) {
    console.log(`     Used flows:`);
    usedFlows.forEach(f => {
      console.log(`       ${f.fromNode} → ${f.toNode}: ₹${f.usedAmount}`);
    });
  }

  const trialGraph = cloneGraph(workingGraph);
  let totalLost = 0;

  for (const { fromNode, toNode, usedAmount } of usedFlows) {
    if (trialGraph.has(fromNode) && trialGraph.get(fromNode).has(toNode)) {
      const current = trialGraph.get(fromNode).get(toNode);
      const newAmount = current - usedAmount;
      if (newAmount > 0) {
        trialGraph.get(fromNode).set(toNode, newAmount);
      } else {
        trialGraph.get(fromNode).delete(toNode);
      }
      if (current < usedAmount) {
        totalLost += (usedAmount - current);
        if (pass === 1) {
          console.log(`     ⚠️ EDGE LOSS: ${fromNode}→${toNode} had ₹${current} but tried to remove ₹${usedAmount}!`);
        }
      }
    }
  }

  if (!trialGraph.has(from)) {
    trialGraph.set(from, new Map());
  }
  const currentDirect = trialGraph.get(from).get(to) || 0;
  trialGraph.get(from).set(to, currentDirect + maxFlowValue);

  if (pass === 1) {
    console.log(`     Direct edge before: ₹${currentDirect}, adding ₹${maxFlowValue} = ₹${currentDirect + maxFlowValue}`);
  }

  cancelReversePairs(trialGraph);
  pruneZeroEdges(trialGraph);

  const edgeCountAfter = countActiveEdges(trialGraph);
  const debtBefore = calculateTotalDebt(workingGraph);
  const debtAfter = calculateTotalDebt(trialGraph);

  if (pass === 1) {
    console.log(`     Edges: ${edgeCountBefore} → ${edgeCountAfter}`);
    console.log(`     Debt: ₹${debtBefore.toFixed(2)} → ₹${debtAfter.toFixed(2)}`);
  }

  if (edgeCountAfter < edgeCountBefore) {
    workingGraph.clear();
    for (const [u, neighbors] of trialGraph) {
      workingGraph.set(u, new Map(neighbors));
    }
    if (pass === 1) console.log(`     ✅ COMMITTED (edge count decreased)`);
    return true;
  }

  if (pass === 1) console.log(`     ❌ REJECTED (edge count not decreased)`);
  return false;
}

// Helper functions from the original file
function buildFlowNetworkExcludingPair(workingGraph, fromNode, toNode, nodes) {
  const edges = new Map();
  for (const node of nodes) {
    edges.set(node, new Map());
  }
  for (const [u, neighbors] of workingGraph) {
    for (const [v, amount] of neighbors) {
      if (u === fromNode && v === toNode) {
        continue;
      }
      edges.get(u).set(v, amount);
    }
  }
  return {
    nodes,
    edges
  };
}

function cancelReversePairs(graph) {
  const nodesToProcess = Array.from(graph.keys());
  for (const u of nodesToProcess) {
    if (!graph.has(u)) continue;
    const neighbors = graph.get(u);
    for (const v of neighbors.keys()) {
      if (!graph.has(v)) continue;
      const reverseNeighbors = graph.get(v);
      if (reverseNeighbors.has(u)) {
        const forward = neighbors.get(v);
        const reverse = reverseNeighbors.get(u);
        if (forward > reverse) {
          neighbors.set(v, forward - reverse);
          reverseNeighbors.delete(u);
        } else if (reverse > forward) {
          reverseNeighbors.set(u, reverse - forward);
          neighbors.delete(v);
        } else {
          neighbors.delete(v);
          reverseNeighbors.delete(u);
        }
      }
    }
  }
}

function pruneZeroEdges(graph) {
  for (const [u, neighbors] of graph) {
    const toDelete = [];
    for (const [v, amount] of neighbors) {
      if (amount <= 0) {
        toDelete.push(v);
      }
    }
    for (const v of toDelete) {
      neighbors.delete(v);
    }
  }
}

function countActiveEdges(graph) {
  let count = 0;
  for (const neighbors of graph.values()) {
    for (const amount of neighbors.values()) {
      if (amount > 0) count++;
    }
  }
  return count;
}

function exportEdgeList(graph) {
  const edges = [];
  for (const [from, neighbors] of graph) {
    for (const [to, amount] of neighbors) {
      if (amount > 0) {
        edges.push({ from, to, amount });
      }
    }
  }
  edges.sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    return a.to.localeCompare(b.to);
  });
  return edges;
}

function cloneGraph(graph) {
  const cloned = new Map();
  for (const [u, neighbors] of graph) {
    cloned.set(u, new Map(neighbors));
  }
  return cloned;
}

// Test it
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

const result = simplifyDebtsPreservingPairsDinicDEBUG(rawDebtEdges);

console.log('\n📤 FINAL OUTPUT:\n');
result.forEach((edge, idx) => {
  console.log(`${idx + 1}. ${edge.from} → ${edge.to}: ₹${edge.amount}`);
});

const total = result.reduce((sum, e) => sum + e.amount, 0);
const inputTotal = rawDebtEdges.reduce((sum, e) => sum + e.amount, 0);
console.log(`\nTotal input: ₹${inputTotal.toFixed(2)}`);
console.log(`Total output: ₹${total.toFixed(2)}`);
console.log(`Lost: ₹${(inputTotal - total).toFixed(2)}`);
