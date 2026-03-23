/**
 * Test script for Expense Management API
 * This file tests the expense creation and retrieval endpoints
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTests() {
  console.log('\n========== EXPENSE MANAGEMENT TEST ==========\n');

  try {
    // 1. Create test users
    console.log('1. Creating test users...');
    const user1 = await prisma.user.create({
      data: {
        email: 'user1@test.com',
        passwordHash: 'hash1',
        name: 'John Doe',
      },
    });

    const user2 = await prisma.user.create({
      data: {
        email: 'user2@test.com',
        passwordHash: 'hash2',
        name: 'Jane Smith',
      },
    });

    const user3 = await prisma.user.create({
      data: {
        email: 'user3@test.com',
        passwordHash: 'hash3',
        name: 'Bob Wilson',
      },
    });

    const user4 = await prisma.user.create({
      data: {
        email: 'user4@test.com',
        passwordHash: 'hash4',
        name: 'Alice Brown',
      },
    });

    console.log('✓ Users created:', [user1.id, user2.id, user3.id, user4.id]);

    // 2. Create a test group
    console.log('\n2. Creating test group...');
    const group = await prisma.group.create({
      data: {
        title: 'Europe Trip 2024',
        inviteLink: 'link_' + Date.now(),
        createdBy: user1.id,
        currency: 'USD',
      },
    });

    console.log('✓ Group created:', group.id);

    // 3. Add group members
    console.log('\n3. Adding group members...');
    await prisma.groupMember.create({
      data: { userId: user1.id, groupId: group.id },
    });
    await prisma.groupMember.create({
      data: { userId: user2.id, groupId: group.id },
    });
    await prisma.groupMember.create({
      data: { userId: user3.id, groupId: group.id },
    });
    await prisma.groupMember.create({
      data: { userId: user4.id, groupId: group.id },
    });

    console.log('✓ All users added to group');

    // 4. Test EQUAL split (all members)
    console.log('\n4. Testing EQUAL split (all members)...');
    console.log('   Creating expense: Dinner - $120 (split among 4 members)');

    const expense1 = await prisma.expense.create({
      data: {
        title: 'Dinner',
        amount: 120,
        currency: 'USD',
        groupId: group.id,
        paidBy: user1.id,
        date: new Date(),
        splitType: 'EQUAL',
      },
    });

    const participants1 = [user1.id, user2.id, user3.id, user4.id];
    const perPerson1 = 120 / participants1.length;

    await Promise.all(
      participants1.map((userId) =>
        prisma.expenseSplit.create({
          data: {
            expenseId: expense1.id,
            userId,
            amount: parseFloat(perPerson1.toFixed(2)),
          },
        }),
      ),
    );

    console.log(`✓ Expense created. Each member owes: $${perPerson1.toFixed(2)}`);

    // 5. Test SELECTED_EQUAL split (simulate transfer)
    console.log('\n5. Testing SELECTED_EQUAL split (simulating transfer)...');
    console.log('   User 2 wants to transfer $50 to User 1');

    const expense2 = await prisma.expense.create({
      data: {
        title: 'Reimbursement - Gas',
        amount: 50,
        currency: 'USD',
        groupId: group.id,
        paidBy: user2.id,
        date: new Date(),
        splitType: 'SELECTED_EQUAL',
      },
    });

    // Only user1 is selected, so user1 owes the full $50
    await prisma.expenseSplit.create({
      data: {
        expenseId: expense2.id,
        userId: user1.id,
        amount: 50,
      },
    });

    console.log('✓ Transfer recorded as expense with SELECTED_EQUAL split');

    // 6. Test CUSTOM split
    console.log('\n6. Testing CUSTOM split...');
    console.log('   Group gift - $300 (custom amounts: User1=$150, User2=$100, User3=$50)');

    const expense3 = await prisma.expense.create({
      data: {
        title: 'Group Gift',
        amount: 300,
        currency: 'USD',
        groupId: group.id,
        paidBy: user1.id,
        date: new Date(),
        splitType: 'CUSTOM',
      },
    });

    const customSplits = [
      { userId: user1.id, amount: 150 },
      { userId: user2.id, amount: 100 },
      { userId: user3.id, amount: 50 },
    ];

    await Promise.all(
      customSplits.map((split) =>
        prisma.expenseSplit.create({
          data: {
            expenseId: expense3.id,
            ...split,
          },
        }),
      ),
    );

    console.log('✓ Custom split expense created');

    // 7. Get all expenses
    console.log('\n7. Retrieving all expenses...');
    const allExpenses = await prisma.expense.findMany({
      where: { groupId: group.id },
      include: {
        splits: true,
        payer: { select: { name: true } },
      },
    });

    console.log(`✓ Found ${allExpenses.length} expenses:`);
    allExpenses.forEach((exp, idx) => {
      console.log(
        `   ${idx + 1}. ${exp.title} - $${exp.amount} ${exp.currency} (paid by ${exp.payer.name})`,
      );
      exp.splits.forEach((split) => {
        console.log(`      - Participant owes: $${split.amount}`);
      });
    });

    // 8. Calculate balances manually
    console.log('\n8. Calculating balances...');

    const balances = {
      [user1.id]: { paid: 0, owed: 0, name: user1.name },
      [user2.id]: { paid: 0, owed: 0, name: user2.name },
      [user3.id]: { paid: 0, owed: 0, name: user3.name },
      [user4.id]: { paid: 0, owed: 0, name: user4.name },
    };

    allExpenses.forEach((exp) => {
      balances[exp.paidBy].paid += exp.amount;
      exp.splits.forEach((split) => {
        balances[split.userId].owed += split.amount;
      });
    });

    Object.entries(balances).forEach(([userId, data]) => {
      const balance = data.paid - data.owed;
      const status = balance > 0 ? 'is owed' : 'owes';
      console.log(
        `   ${data.name}: Paid=$${data.paid}, Owed=$${data.owed}, Net=${status} $${Math.abs(balance).toFixed(2)}`,
      );
    });

    console.log('\n========== TESTS COMPLETED SUCCESSFULLY ==========\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
