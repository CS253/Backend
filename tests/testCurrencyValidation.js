/**
 * Test script for Currency Validation
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const expenseService = require('../services/expenseService');
const groupService = require('../services/groupService');

async function runTests() {
  console.log('\n========== CURRENCY VALIDATION TEST ==========\n');

  try {
    // 1. Setup Test User
    const user = await prisma.user.upsert({
      where: { email: 'currency-test@test.com' },
      update: {},
      create: {
        email: 'currency-test@test.com',
        passwordHash: 'hash',
        name: 'Currency Tester',
      },
    });

    // 2. Test Group Creation with Invalid Currency
    console.log('1. Testing Group Creation with "DOGECOIN"...');
    try {
      await groupService.createGroupWithParticipants({
        title: 'Bad Currency Group',
        createdBy: user.id,
        currency: 'DOGECOIN'
      }, '127.0.0.1');
      console.log('❌ FAIL: Group creation with DOGECOIN should have failed');
    } catch (error) {
      console.log('✅ SUCCESS:', error.message);
    }

    // 3. Setup Valid Group for further tests
    const group = await groupService.createGroupWithParticipants({
      title: 'Valid Group',
      createdBy: user.id,
      currency: 'USD'
    }, '127.0.0.1');

    // 4. Test Expense Creation with Invalid Currency
    console.log('\n2. Testing Expense Creation with "SCAM"...');
    try {
      await expenseService.createExpense({
        groupId: group.groupId,
        title: 'Fake Expense',
        amount: 100,
        paidBy: user.id,
        currency: 'SCAM',
        split: { type: 'EQUAL', participants: [user.id] }
      });
      console.log('❌ FAIL: Expense creation with SCAM should have failed');
    } catch (error) {
      console.log('✅ SUCCESS:', error.message);
    }

    // 5. Test Expense Update with Invalid Currency
    const validExpense = await expenseService.createExpense({
      groupId: group.groupId,
      title: 'Valid Expense',
      amount: 100,
      paidBy: user.id,
      currency: 'USD',
      split: { type: 'EQUAL', participants: [user.id] }
    });

    console.log('\n3. Testing Expense Update with "MOON"...');
    try {
      await expenseService.updateExpense(validExpense.id, {
        userId: user.id,
        currency: 'MOON'
      });
      console.log('❌ FAIL: Expense update with MOON should have failed');
    } catch (error) {
      console.log('✅ SUCCESS:', error.message);
    }

    console.log('\n========== TESTS COMPLETED ==========\n');

  } catch (error) {
    console.error('❌ Test failed unexpectedly:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
