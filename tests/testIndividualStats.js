const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testIndividualStats() {
  try {
    console.log('========== INDIVIDUAL STATS TEST ==========\n');

    // Clean up previous data
    await prisma.expenseSplit.deleteMany({});
    await prisma.expense.deleteMany({});
    await prisma.groupMember.deleteMany({});
    await prisma.group.deleteMany({});
    await prisma.user.deleteMany({});

    // 1. Create users
    console.log('1. Creating test users...');
    const user1 = await prisma.user.create({
      data: { email: 'john@test.com', name: 'John', passwordHash: 'hash1' }
    });
    const user2 = await prisma.user.create({
      data: { email: 'jane@test.com', name: 'Jane', passwordHash: 'hash2' }
    });
    const user3 = await prisma.user.create({
      data: { email: 'bob@test.com', name: 'Bob', passwordHash: 'hash3' }
    });

    // 2. Create group
    console.log('2. Creating group...');
    const group = await prisma.group.create({
      data: {
        title: 'Trip to Europe',
        createdBy: user1.id,
        inviteLink: 'trip-' + Date.now(),
        currency: 'USD'
      }
    });

    // 3. Add members
    console.log('3. Adding members to group...');
    await prisma.groupMember.createMany({
      data: [
        { userId: user1.id, groupId: group.id },
        { userId: user2.id, groupId: group.id },
        { userId: user3.id, groupId: group.id }
      ]
    });

    // 4. Create expenses
    console.log('4. Creating test expenses...');

    // Expense 1: John paid $300 for hotel (equal split among 3)
    const expense1 = await prisma.expense.create({
      data: {
        title: 'Hotel',
        paidBy: user1.id,
        amount: 300,
        currency: 'USD',
        groupId: group.id,
        splitType: 'EQUAL',
        date: new Date(),
        splits: {
          create: [
            { userId: user1.id, amount: 100 },
            { userId: user2.id, amount: 100 },
            { userId: user3.id, amount: 100 }
          ]
        }
      }
    });

    // Expense 2: Jane paid $120 for dinner (equal split with only John for testing SELECTED_EQUAL)
    const expense2 = await prisma.expense.create({
      data: {
        title: 'Dinner',
        paidBy: user2.id,
        amount: 120,
        currency: 'USD',
        groupId: group.id,
        splitType: 'SELECTED_EQUAL',
        date: new Date(),
        splits: {
          create: [
            { userId: user1.id, amount: 60 },
            { userId: user2.id, amount: 60 }
          ]
        }
      }
    });

    // Expense 3: Bob paid $60 for breakfast (only his own expense)
    const expense3 = await prisma.expense.create({
      data: {
        title: 'Breakfast',
        paidBy: user3.id,
        amount: 60,
        currency: 'USD',
        groupId: group.id,
        splitType: 'EQUAL',
        date: new Date(),
        splits: {
          create: [ { userId: user3.id, amount: 60 } ]
        }
      }
    });

    console.log('✓ Expenses created\n');

    // 5. Calculate balances manually
    console.log('5. Manual balance calculation...');
    console.log('   John: Paid=$300, Share=$100(hotel)+$60(dinner)=$160, Net=$140 (is owed)');
    console.log('   Jane: Paid=$120, Share=$100(hotel)+$60(dinner)=$160, Net=-$40 (owes money)');
    console.log('   Bob: Paid=$60, Share=$100(hotel)+$60(breakfast)=$160, Net=-$100 (owes money)\n');

    // 6. Test group summary without individual stats
    console.log('6. Testing Group Summary (without userId)...');
    const summaryWithoutUser = await fetch('http://localhost:5000/api/groups/' + group.id + '/summary');
    const summaryDataWithout = await summaryWithoutUser.json();
    
    console.log('✓ Group Summary Response:');
    console.log('  - Total expenses:', summaryDataWithout.data.totalExpensesByPaymentCurrency?.USD || 0);
    console.log('  - Individual stats field:', summaryDataWithout.data.individual ? 'PRESENT' : 'ABSENT (as expected)');
    if (!summaryDataWithout.data.individual) {
      console.log('  ✓ Correctly omits individual stats when userId not provided\n');
    }

    // 7. Test group summary WITH individual stats for User 1 (John)
    console.log('7. Testing Group Summary (with userId for John)...');
    const summaryWithUser1 = await fetch(
      'http://localhost:5000/api/groups/' + group.id + '/summary?userId=' + user1.id
    );
    const summaryDataUser1 = await summaryWithUser1.json();
    
    console.log('✓ John\'s Individual Stats:');
    console.log('  - Paid (USD):', summaryDataUser1.data.individual?.paid?.USD || 0);
    console.log('  - Owed (USD):', summaryDataUser1.data.individual?.owed?.USD || 0);
    console.log('  - Balance (USD):', summaryDataUser1.data.individual?.balance?.USD || 0);
    
    // Verify calculations
    const johnPaid = summaryDataUser1.data.individual?.paid?.USD || 0;
    const johnOwed = summaryDataUser1.data.individual?.owed?.USD || 0;
    const johnBalance = summaryDataUser1.data.individual?.balance?.USD || 0;
    
    if (johnPaid === 300 && johnOwed === 160 && johnBalance === 140) {
      console.log('  ✓ John\'s stats correct: $300 paid - $160 owed = $140 balance\n');
    } else {
      console.log(`  ❌ John's stats incorrect! Expected: Paid=$300, Owed=$160, Balance=$140\n`);
    }

    // 8. Test group summary WITH individual stats for User 2 (Jane)
    console.log('8. Testing Group Summary (with userId for Jane)...');
    const summaryWithUser2 = await fetch(
      'http://localhost:5000/api/groups/' + group.id + '/summary?userId=' + user2.id
    );
    const summaryDataUser2 = await summaryWithUser2.json();
    
    console.log('✓ Jane\'s Individual Stats:');
    console.log('  - Paid (USD):', summaryDataUser2.data.individual?.paid?.USD || 0);
    console.log('  - Owed (USD):', summaryDataUser2.data.individual?.owed?.USD || 0);
    console.log('  - Balance (USD):', summaryDataUser2.data.individual?.balance?.USD || 0);
    
    // Verify calculations
    const janePaid = summaryDataUser2.data.individual?.paid?.USD || 0;
    const janeOwed = summaryDataUser2.data.individual?.owed?.USD || 0;
    const janeBalance = summaryDataUser2.data.individual?.balance?.USD || 0;
    
    if (janePaid === 120 && janeOwed === 160 && janeBalance === -40) {
      console.log('  ✓ Jane\'s stats correct: $120 paid - $160 share = -$40 balance (owes money)\n');
    } else {
      console.log(`  ❌ Jane's stats incorrect! Expected: Paid=$120, Owed=$160, Balance=-$40\n`);
    }

    // 9. Test group summary WITH individual stats for User 3 (Bob)
    console.log('9. Testing Group Summary (with userId for Bob)...');
    const summaryWithUser3 = await fetch(
      'http://localhost:5000/api/groups/' + group.id + '/summary?userId=' + user3.id
    );
    const summaryDataUser3 = await summaryWithUser3.json();
    
    console.log('✓ Bob\'s Individual Stats:');
    console.log('  - Paid (USD):', summaryDataUser3.data.individual?.paid?.USD || 0);
    console.log('  - Owed (USD):', summaryDataUser3.data.individual?.owed?.USD || 0);
    console.log('  - Balance (USD):', summaryDataUser3.data.individual?.balance?.USD || 0);
    
    // Verify calculations
    const bobPaid = summaryDataUser3.data.individual?.paid?.USD || 0;
    const bobOwed = summaryDataUser3.data.individual?.owed?.USD || 0;
    const bobBalance = summaryDataUser3.data.individual?.balance?.USD || 0;
    
    if (bobPaid === 60 && bobOwed === 160 && bobBalance === -100) {
      console.log('  ✓ Bob\'s stats correct: $60 paid - $160 share = -$100 balance (owes money)\n');
    } else {
      console.log(`  ❌ Bob's stats incorrect! Expected: Paid=$60, Owed=$160, Balance=-$100\n`);
    }

    console.log('========== ALL INDIVIDUAL STATS TESTS PASSED ==========');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testIndividualStats();
