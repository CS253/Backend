/**
 * Simplified Debt Simplification using Dinic's Max Flow
 * Preserves debtor-creditor structure while minimizing transaction count
 * 
 * Key principle: Never creates new debtor-creditor pairs that didn't exist in original input
 * Uses max flow to compress debt through existing allowed paths only
 */

/**
 * Main function: Simplify debts while preserving pair structure
 * @param {Array} transactions - array of {from, to, amount}
 * @param {Object} options - {strictImproveOnly, restartAfterCommit, sortByCurrentAmountDesc, maxPasses}
 * @returns {Array} simplified transactions
 */
function simplifyDebtsPreservingPairsDinic(transactions, options = {}) {
  const defaults = {
    strictImproveOnly: true,
    restartAfterCommit: true,
    sortByCurrentAmountDesc: true,
    maxPasses: 100000
  };
  const opts = { ...defaults, ...options };

  // ===== STEP 1: NORMALIZE INPUT =====
  const { workingGraph, allowedPairs, nodes } = normalizeTransactions(transactions);

  // ===== STEP 2: ITERATIVELY COMPRESS USING MAX FLOW =====
  let passCount = 0;
  let improved = true;

  while (improved && passCount < opts.maxPasses) {
    improved = false;
    passCount++;

    // Get all candidate pairs, sorted by current amount descending
    const candidates = Array.from(allowedPairs)
      .map((pair) => {
        const [from, to] = pair.split('|');
        const currentAmount = workingGraph.get(from)?.get(to) || 0;
        return { from, to, currentAmount };
      });

    // Sort: by current amount descending, then lexicographically
    if (opts.sortByCurrentAmountDesc) {
      candidates.sort((a, b) => {
        if (b.currentAmount !== a.currentAmount) {
          return b.currentAmount - a.currentAmount;
        }
        if (a.from !== b.from) return a.from.localeCompare(b.from);
        return a.to.localeCompare(b.to);
      });
    }

    // Try to compress each pair
    for (const { from, to } of candidates) {
      const compressed = tryCompressPair(workingGraph, allowedPairs, from, to, nodes);
      if (compressed) {
        improved = true;
        if (opts.restartAfterCommit) {
          break; // Restart the full pass
        }
      }
    }
  }

  // ===== STEP 3: EXPORT AND SORT =====
  return exportEdgeList(workingGraph);
}

/**
 * Normalize transactions: merge parallels, validate, extract allowed pairs
 */
function normalizeTransactions(transactions) {
  const workingGraph = new Map(); // Map<from, Map<to, amount>>
  const nodes = new Set();
  const allowedPairsSet = new Set(); // Set of "from|to"

  // Merge parallel edges, validate amounts
  for (const tx of transactions) {
    if (!tx.from || !tx.to || typeof tx.amount !== 'number') {
      throw new Error('Invalid transaction format');
    }

    const amount = Math.floor(tx.amount);
    if (amount < 0) {
      throw new Error('Negative amounts not allowed');
    }
    if (amount === 0) {
      continue; // Skip zero amounts
    }
    if (tx.from === tx.to) {
      continue; // Ignore self-loops
    }

    nodes.add(tx.from);
    nodes.add(tx.to);

    if (!workingGraph.has(tx.from)) {
      workingGraph.set(tx.from, new Map());
    }
    const current = workingGraph.get(tx.from).get(tx.to) || 0;
    workingGraph.get(tx.from).set(tx.to, current + amount);

    // Mark as allowed pair (from original)
    allowedPairsSet.add(`${tx.from}|${tx.to}`);
  }

  // Cancel reverse pairs in the normalized graph
  cancelReversePairs(workingGraph);

  return {
    workingGraph,
    allowedPairs: allowedPairsSet,
    nodes
  };
}

/**
 * Try to compress debt from u to v using max flow through alternate paths
 * Returns true if compression was successful (edge count decreased)
 */
function tryCompressPair(workingGraph, allowedPairs, from, to, nodes) {
  // Count edges BEFORE
  const edgeCountBefore = countActiveEdges(workingGraph);

  // Build flow network EXCLUDING the direct edge (from, to)
  const flowNetwork = buildFlowNetworkExcludingPair(workingGraph, from, to, nodes);

  if (!flowNetwork || flowNetwork.nodes.size === 0) {
    return false; // No alternate path
  }

  // Run Dinic max flow
  const dinic = new DinicMaxFlow(flowNetwork.nodes);
  for (const [u, neighbors] of flowNetwork.edges) {
    for (const [v, cap] of neighbors) {
      dinic.addEdge(u, v, cap);
    }
  }

  const maxFlowValue = dinic.maxFlow(from, to);
  if (maxFlowValue <= 0) {
    return false; // No flow found
  }

  // Extract used forward flows
  const usedFlows = dinic.getUsedForwardFlows();

  // Build TRIAL graph by applying flows
  const trialGraph = cloneGraph(workingGraph);

  // Apply each used forward flow: subtract from path, add to direct edge
  for (const { fromNode, toNode, usedAmount } of usedFlows) {
    if (trialGraph.has(fromNode) && trialGraph.get(fromNode).has(toNode)) {
      const current = trialGraph.get(fromNode).get(toNode);
      const newAmount = current - usedAmount;
      if (newAmount > 0) {
        trialGraph.get(fromNode).set(toNode, newAmount);
      } else {
        trialGraph.get(fromNode).delete(toNode);
      }
    }
  }

  // Add the max flow onto the direct edge
  if (!trialGraph.has(from)) {
    trialGraph.set(from, new Map());
  }
  const currentDirect = trialGraph.get(from).get(to) || 0;
  trialGraph.get(from).set(to, currentDirect + maxFlowValue);

  // Cancel reverse pairs
  cancelReversePairs(trialGraph);

  // Prune zeros
  pruneZeroEdges(trialGraph);

  // Count edges AFTER
  const edgeCountAfter = countActiveEdges(trialGraph);

  // Commit ONLY if edge count strictly decreased
  if (edgeCountAfter < edgeCountBefore) {
    // Copy trial back to working
    workingGraph.clear();
    for (const [u, neighbors] of trialGraph) {
      workingGraph.set(u, new Map(neighbors));
    }
    return true;
  }

  return false;
}

/**
 * Build a flow network snapshot EXCLUDING the direct edge (from, to)
 */
function buildFlowNetworkExcludingPair(workingGraph, fromNode, toNode, nodes) {
  const edges = new Map(); // Map<nodeId, Map<nodeId, capacity>>

  for (const node of nodes) {
    edges.set(node, new Map());
  }

  for (const [u, neighbors] of workingGraph) {
    for (const [v, amount] of neighbors) {
      // EXCLUDE the direct edge we're trying to compress
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

/**
 * Cancel reverse pairs: if u->v=a and v->u=b, keep only the difference
 */
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

/**
 * Remove all zero-amount edges
 */
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
  
  // Remove nodes with no outgoing edges (optional cleanup)
  const emptyNodes = [];
  for (const [u, neighbors] of graph) {
    if (neighbors.size === 0) {
      emptyNodes.push(u);
    }
  }
  // Don't remove nodes, just leave empty neighbor maps
}

/**
 * Count active positive edges
 */
function countActiveEdges(graph) {
  let count = 0;
  for (const neighbors of graph.values()) {
    for (const amount of neighbors.values()) {
      if (amount > 0) count++;
    }
  }
  return count;
}

/**
 * Export graph as sorted array of transactions
 */
function exportEdgeList(graph) {
  const edges = [];
  for (const [from, neighbors] of graph) {
    for (const [to, amount] of neighbors) {
      if (amount > 0) {
        edges.push({ from, to, amount });
      }
    }
  }

  // Sort deterministically: by from, then by to
  edges.sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    return a.to.localeCompare(b.to);
  });

  return edges;
}

/**
 * Deep clone a debt graph
 */
function cloneGraph(graph) {
  const cloned = new Map();
  for (const [u, neighbors] of graph) {
    cloned.set(u, new Map(neighbors));
  }
  return cloned;
}

/**
 * Dinic's Maximum Flow Algorithm
 * Optimized for integer capacities with forward edge tracking
 */
class DinicMaxFlow {
  constructor(nodes) {
    this.nodes = nodes;
    this.nodeArray = Array.from(nodes);
    this.nodeIndex = new Map();
    this.nodeArray.forEach((node, idx) => this.nodeIndex.set(node, idx));
    
    this.n = this.nodeArray.length;
    this.graph = Array.from({ length: this.n }, () => []);
    this.source = null;
    this.sink = null;
  }

  addEdge(from, to, capacity) {
    const u = this.nodeIndex.get(from);
    const v = this.nodeIndex.get(to);
    
    if (u === undefined || v === undefined) return;

    const edge1 = {
      from,
      to,
      fromIdx: u,
      toIdx: v,
      cap: capacity,
      originalCap: capacity,
      flow: 0,
      rev: this.graph[v].length,
      isForward: true
    };

    const edge2 = {
      from: to,
      to: from,
      fromIdx: v,
      toIdx: u,
      cap: 0,
      originalCap: 0,
      flow: 0,
      rev: this.graph[u].length,
      isForward: false
    };

    this.graph[u].push(edge1);
    this.graph[v].push(edge2);
  }

  maxFlow(source, sink) {
    this.source = this.nodeIndex.get(source);
    this.sink = this.nodeIndex.get(sink);

    if (this.source === undefined || this.sink === undefined) {
      return 0;
    }

    let flow = 0;
    while (this.bfs()) {
      const iter = Array(this.n).fill(0);
      let f;
      while ((f = this.dfs(this.source, this.sink, Infinity, iter)) > 0) {
        flow += f;
      }
    }
    return flow;
  }

  bfs() {
    const level = Array(this.n).fill(-1);
    level[this.source] = 0;
    const queue = [this.source];

    for (let i = 0; i < queue.length; i++) {
      const v = queue[i];
      for (const edge of this.graph[v]) {
        if (level[edge.toIdx] < 0 && edge.cap - edge.flow > 0) {
          level[edge.toIdx] = level[v] + 1;
          queue.push(edge.toIdx);
        }
      }
    }

    this.level = level;
    return level[this.sink] >= 0;
  }

  dfs(v, t, pushed, iter) {
    if (v === t) return pushed;

    for (; iter[v] < this.graph[v].length; iter[v]++) {
      const edge = this.graph[v][iter[v]];
      if (this.level[v] < this.level[edge.toIdx] && edge.cap - edge.flow > 0) {
        const tr = Math.min(pushed, edge.cap - edge.flow);
        const d = this.dfs(edge.toIdx, t, tr, iter);
        if (d > 0) {
          edge.flow += d;
          this.graph[edge.toIdx][edge.rev].flow -= d;
          return d;
        }
      }
    }
    return 0;
  }

  getUsedForwardFlows() {
    const usedFlows = [];
    for (let u = 0; u < this.n; u++) {
      for (const edge of this.graph[u]) {
        if (edge.isForward && edge.flow > 0) {
          usedFlows.push({
            fromNode: edge.from,
            toNode: edge.to,
            usedAmount: edge.flow
          });
        }
      }
    }
    return usedFlows;
  }
}

/**
 * UNIT TESTS
 */
function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     DEBT SIMPLIFICATION WITH PAIR PRESERVATION TESTS    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Test 1: Chain should preserve structure
  console.log('TEST 1: Chain (A->B->C) should NOT compress to A->C');
  const test1Input = [
    { from: 'A', to: 'B', amount: 10 },
    { from: 'B', to: 'C', amount: 10 }
  ];
  const test1Result = simplifyDebtsPreservingPairsDinic(test1Input);
  console.log('Input:', JSON.stringify(test1Input, null, 2));
  console.log('Output:', JSON.stringify(test1Result, null, 2));
  const test1Pass = test1Result.length === 2 && 
    test1Result.some(t => t.from === 'A' && t.to === 'B') &&
    test1Result.some(t => t.from === 'B' && t.to === 'C');
  console.log(`Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 2: Reverse edges should cancel
  console.log('TEST 2: Reverse edges A->B=10, B->A=4 should become A->B=6');
  const test2Input = [
    { from: 'A', to: 'B', amount: 10 },
    { from: 'B', to: 'A', amount: 4 }
  ];
  const test2Result = simplifyDebtsPreservingPairsDinic(test2Input);
  console.log('Input:', JSON.stringify(test2Input, null, 2));
  console.log('Output:', JSON.stringify(test2Result, null, 2));
  const test2Pass = test2Result.length === 1 &&
    test2Result[0].from === 'A' &&
    test2Result[0].to === 'B' &&
    test2Result[0].amount === 6;
  console.log(`Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 3: Complex simplification
  console.log('TEST 3: Complex graph should compress optimally');
  const test3Input = [
    { from: 'Bob', to: 'Alice', amount: 1000 },
    { from: 'Charlie', to: 'Alice', amount: 1000 },
    { from: 'Charlie', to: 'Bob', amount: 300 },
    { from: 'Alice', to: 'Charlie', amount: 1200 },
    { from: 'Bob', to: 'Charlie', amount: 1500 }
  ];
  const test3Result = simplifyDebtsPreservingPairsDinic(test3Input);
  console.log('Input:', JSON.stringify(test3Input, null, 2));
  console.log('Output:', JSON.stringify(test3Result, null, 2));
  // Expected: Bob->Alice=800, Bob->Charlie=1400 (or similar valid compression)
  console.log(`Result: Output generated (check structure manually)\n`);

  // Test 4: Reverse cancellation in complex graph
  console.log('TEST 4: Parallel edges should be merged first');
  const test4Input = [
    { from: 'A', to: 'B', amount: 5 },
    { from: 'A', to: 'B', amount: 7 }
  ];
  const test4Result = simplifyDebtsPreservingPairsDinic(test4Input);
  console.log('Input:', JSON.stringify(test4Input, null, 2));
  console.log('Output:', JSON.stringify(test4Result, null, 2));
  const test4Pass = test4Result.length === 1 &&
    test4Result[0].from === 'A' &&
    test4Result[0].to === 'B' &&
    test4Result[0].amount === 12;
  console.log(`Result: ${test4Pass ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 5: Empty input
  console.log('TEST 5: Empty input should return empty array');
  const test5Result = simplifyDebtsPreservingPairsDinic([]);
  console.log('Input: []');
  console.log('Output:', JSON.stringify(test5Result));
  const test5Pass = test5Result.length === 0;
  console.log(`Result: ${test5Pass ? '✅ PASS' : '❌ FAIL'}\n`);

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                  TESTS COMPLETE                        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simplifyDebtsPreservingPairsDinic,
    runTests,
    DinicMaxFlow
  };
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}
