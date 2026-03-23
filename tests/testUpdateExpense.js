const http = require('http');

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (err) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  try {
    console.log('🧪 TESTING UPDATE EXPENSE ENDPOINT\n');
    console.log('═'.repeat(80) + '\n');

    // Use the existing test group from previous tests
    // Group ID: 5e98b8ff-0c8a-4420-85de-05a2e0e63fff
    // Users: Raghav (8389b5a4), Aniz (6c276968), Samprit (ee0191e3), Vedant (294519b9)
    const groupId = '5e98b8ff-0c8a-4420-85de-05a2e0e63fff';
    const user1 = '8389b5a4-a44f-427a-afe2-2259783091c7'; // Raghav
    const user2 = '6c276968-639f-4240-a492-5e31780ead6b'; // Aniz
    const user3 = 'ee0191e3-0387-492e-b7d0-708e341b5565'; // Samprit

    console.log(`Using existing test group: ${groupId}\n`);

    // Create a test expense
    console.log('1️⃣  Creating initial expense...\n');
    const expenseRes = await makeRequest('POST', `/api/groups/${groupId}/expenses`, {
      title: 'Test Lunch',
      amount: 300,
      paidBy: user1,
      currency: 'INR',
      split: {
        type: 'EQUAL',
        participants: [user1, user2, user3]
      },
      date: new Date().toISOString()
    });

    if (!expenseRes.data.success || !expenseRes.data.data) {
      console.log('❌ Failed to create expense');
      console.log(expenseRes.data);
      process.exit(1);
    }

    const expenseId = expenseRes.data.data.id;
    console.log(`✓ Created expense: ${expenseId}`);
    console.log(`  Title: ${expenseRes.data.data.title}`);
    console.log(`  Amount: ₹${expenseRes.data.data.amount}`);
    console.log(`  Paid by: ${expenseRes.data.data.paidBy}`);
    console.log(`  Splits: ${expenseRes.data.data.splits.length} people\n`);

    // Update the expense
    console.log('2️⃣  Updating expense...\n');
    const updateRes = await makeRequest('PUT', `/api/groups/${groupId}/expenses/${expenseId}`, {
      title: 'Updated Lunch',
      amount: 600,
      paidBy: user2,
      split: {
        type: 'CUSTOM',
        splits: [
          { userId: user1, amount: 200 },
          { userId: user2, amount: 200 },
          { userId: user3, amount: 200 }
        ]
      },
      notes: 'Updated via API test'
    });

    if (!updateRes.data.success || !updateRes.data.data) {
      console.log('❌ Failed to update expense');
      console.log(updateRes.data);
      process.exit(1);
    }

    const updatedExpense = updateRes.data.data;
    console.log(`✓ Updated expense: ${expenseId}`);
    console.log(`  Title: ${updatedExpense.title}`);
    console.log(`  Amount: ₹${updatedExpense.amount}`);
    console.log(`  Paid by: ${updatedExpense.paidBy}`);
    console.log(`  Notes: ${updatedExpense.notes}`);
    console.log(`  Splits:`);
    updatedExpense.splits.forEach(split => {
      console.log(`    - ${split.userId}: ₹${split.amount}`);
    });

    // Verify by fetching the expense
    console.log('\n3️⃣  Verifying updated expense...\n');
    const fetchRes = await makeRequest('GET', `/api/groups/${groupId}/expenses/${expenseId}`);
    const fetchedExpense = fetchRes.data.data;
    
    let verifyPass = true;
    if (fetchedExpense.title !== 'Updated Lunch') {
      console.log('❌ Title mismatch');
      verifyPass = false;
    } else {
      console.log('✓ Title correct: ' + fetchedExpense.title);
    }

    if (fetchedExpense.amount !== 600) {
      console.log('❌ Amount mismatch');
      verifyPass = false;
    } else {
      console.log('✓ Amount correct: ₹' + fetchedExpense.amount);
    }

    if (fetchedExpense.paidBy !== user2) {
      console.log('❌ Payer mismatch');
      verifyPass = false;
    } else {
      console.log('✓ Payer correct: ' + fetchedExpense.paidBy);
    }

    if (fetchedExpense.splits.length !== 3) {
      console.log('❌ Split count mismatch');
      verifyPass = false;
    } else {
      console.log('✓ Splits count correct: 3');
    }

    console.log('\n' + '═'.repeat(80));
    if (verifyPass) {
      console.log('\n🎉 UPDATE EXPENSE ENDPOINT WORKING CORRECTLY!\n');
    } else {
      console.log('\n⚠️  Some verification checks failed\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
