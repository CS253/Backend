/**
 * DEBUG: Inspect actual database data and settlement calculations
 * Use this to understand why algorithms produce unexpected results
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugGroup(groupId) {
  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║           SETTLEMENT DATA DEBUG FOR GROUP: ${groupId.substring(0, 8)}      ║`);
  console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

  try {
    // 1. Get group info
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true } }
          }
        }
      }
    });

    if (!group) {
      console.error(`❌ Group not found: ${groupId}`);
      return;
    }

    console.log(`📊 GROUP INFO:`);
    console.log(`  Name: ${group.name}`);
    console.log(`  simplifyDebts: ${group.simplifyDebts}`);
    console.log(`  Members (${group.members.length}):`);
    group.members.forEach(m => {
      console.log(`    - ${m.user.name} (${m.user.id})`);
    });

    // 2. Get all expenses
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: { splits: true },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`\n💰 EXPENSES (${expenses.length} total):`);
    let expensesByPayer = {};
    let allSplitsCount = 0;

    expenses.forEach((exp, idx) => {
      const payer = group.members.find(m => m.userId === exp.paidBy);
      const payerName = payer?.user.name || exp.paidBy.substring(0, 8);
      
      console.log(`\n  Expense ${idx + 1}: ${payerName} paid ₹${exp.amount} ${exp.currency}`);
      console.log(`    Description: ${exp.description || '(none)'}`);
      
      if (!expensesByPayer[exp.paidBy]) {
        expensesByPayer[exp.paidBy] = 0;
      }
      expensesByPayer[exp.paidBy] += exp.amount;

      console.log(`    Splits (${exp.splits.length}):`);
      exp.splits.forEach((split, sidx) => {
        const splitMember = group.members.find(m => m.userId === split.userId);
        const splitName = splitMember?.user.name || split.userId.substring(0, 8);
        console.log(`      ${sidx + 1}. ${splitName}: ₹${split.amount}`);
        allSplitsCount++;
      });
    });

    // 3. Calculate balances manually
    console.log(`\n📈 CALCULATED BALANCES:`);
    let userBalances = {};

    expenses.forEach(exp => {
      if (!userBalances[exp.paidBy]) {
        userBalances[exp.paidBy] = { paid: 0, owed: 0 };
      }
      userBalances[exp.paidBy].paid += exp.amount;

      exp.splits.forEach(split => {
        if (!userBalances[split.userId]) {
          userBalances[split.userId] = { paid: 0, owed: 0 };
        }
        userBalances[split.userId].owed += split.amount;
      });
    });

    group.members.forEach(m => {
      const userId = m.user.id;
      const balance = userBalances[userId] || { paid: 0, owed: 0 };
      const net = balance.paid - balance.owed;
      const sign = net > 0 ? '+' : '';
      const emoji = net > 0 ? '💵' : '💳';

      console.log(`  ${emoji} ${m.user.name}:`);
      console.log(`      Paid: ₹${balance.paid}, Owed: ₹${balance.owed}, Net: ${sign}₹${net}`);
    });

    // 4. Build edge list (like Dinics does)
    console.log(`\n🔗 DEBT EDGES (who owes whom):`);
    const edges = new Map();
    let totalDebt = 0;

    expenses.forEach(exp => {
      const payer = group.members.find(m => m.userId === exp.paidBy);
      const payerName = payer?.user.name || exp.paidBy.substring(0, 8);

      exp.splits.forEach(split => {
        if (split.userId !== exp.paidBy) {
          const debtor = group.members.find(m => m.userId === split.userId);
          const debtorName = debtor?.user.name || split.userId.substring(0, 8);
          
          const key = `${split.userId}->${exp.paidBy}`;
          if (!edges.has(key)) {
            edges.set(key, { 
              fromName: debtorName,
              toName: payerName,
              from: split.userId,
              to: exp.paidBy,
              capacity: 0 
            });
          }
          edges.get(key).capacity += split.amount;
          totalDebt += split.amount;
        }
      });
    });

    console.log(`  Total edges (consolidated): ${edges.size}`);
    console.log(`  Total debt to settle: ₹${totalDebt}`);
    edges.forEach((edge, key) => {
      console.log(`    ${edge.fromName} → ${edge.toName}: ₹${edge.capacity}`);
    });

    // 5. Show expected settlements for both algorithms
    console.log(`\n🎯 EXPECTED SETTLEMENTS:\n`);
    
    console.log(`If using DINICS (preserves relationships):`);
    console.log(`  Should process ${edges.size} consolidated edges`);
    edges.forEach((edge, key) => {
      console.log(`    ${edge.fromName} pays ${edge.toName}: ₹${edge.capacity}`);
    });
    console.log(`  Expected total transactions: ${edges.size}`);

    console.log(`\nIf using GREEDY (minimizes transactions):`);
    // Simulate greedy
    const workingBalances = {};
    Object.keys(userBalances).forEach(userId => {
      const member = group.members.find(m => m.userId === userId);
      const name = member?.user.name || userId.substring(0, 8);
      const balance = userBalances[userId] || { paid: 0, owed: 0 };
      workingBalances[userId] = { 
        name, 
        balance: balance.paid - balance.owed 
      };
    });

    let greedyCount = 0;
    while (true) {
      let maxCreditorId = null;
      let maxCreditorAmount = 0;
      let maxDebtorId = null;
      let maxDebtorAmount = 0;

      Object.keys(workingBalances).forEach(userId => {
        const balance = workingBalances[userId].balance;
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
      const debtorMember = group.members.find(m => m.userId === maxDebtorId);
      const creditorMember = group.members.find(m => m.userId === maxCreditorId);
      
      console.log(`    ${debtorMember?.user.name || maxDebtorId.substring(0, 8)} pays ${creditorMember?.user.name || maxCreditorId.substring(0, 8)}: ₹${settlementAmount}`);
      greedyCount++;

      workingBalances[maxCreditorId].balance -= settlementAmount;
      workingBalances[maxDebtorId].balance += settlementAmount;
    }
    console.log(`  Expected total transactions: ${greedyCount}`);

    console.log(`\n═══════════════════════════════════════════════════════════════\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Get group ID from command line or use default
const groupId = process.argv[2];

if (!groupId) {
  console.error('\n❌ Usage: node debugSettlementData.js <groupId>');
  console.error('\nExample: node debugSettlementData.js clg1abc2def3ghi4jkl5mno');
  process.exit(1);
}

debugGroup(groupId);
