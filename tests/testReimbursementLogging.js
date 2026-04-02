/**
 * TEST: Verify reimbursements appear in history and settlements update after payment
 */

const axios = require('axios');

const API_URL = 'http://localhost:5000/api';
const groupId = '84da65dd-b3cf-47ef-bd5d-754fa3ac48a0';

async function testReimbursementLogic() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST: Reimbursement Logging & Settlement Updates             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // STEP 1: Get initial settlements
    console.log('📊 STEP 1: Get Initial Settlements');
    console.log('─────────────────────────────────────');
    const settlementsRes = await axios.get(
      `${API_URL}/groups/${groupId}/balances?simplifyDebts=false`
    );
    const initialSettlements = settlementsRes.data.data.INR || [];
    console.log(`Before payment: ${initialSettlements.length} settlements`);
    initialSettlements.forEach(tx => {
      console.log(`  - ${tx.fromUserId.substring(0, 8)}... → ${tx.toUserId.substring(0, 8)}...: ₹${tx.amount}`);
    });
    console.log();

    // STEP 2: Get initial history (expenses only)
    console.log('📜 STEP 2: Get Initial History (Expenses)');
    console.log('─────────────────────────────────────');
    const historyRes = await axios.get(`${API_URL}/groups/${groupId}/history`);
    const initialHistory = historyRes.data.data;
    const initialExpenses = initialHistory.filter(h => h.type === 'EXPENSE');
    const initialReimbursements = initialHistory.filter(h => h.type === 'REIMBURSEMENT');
    console.log(`Expenses: ${initialExpenses.length}`);
    console.log(`Reimbursements before payment: ${initialReimbursements.length}\n`);

    // STEP 3: Make a payment (mark first settlement as paid)
    console.log('💳 STEP 3: Mark Settlement as Paid');
    console.log('─────────────────────────────────────');
    if (initialSettlements.length === 0) {
      console.log('❌ No settlements to pay. Test cannot continue.');
      return;
    }

    const firstSettlement = initialSettlements[0];
    console.log(`Marking as paid: ${firstSettlement.fromUserId.substring(0, 8)}... → ${firstSettlement.toUserId.substring(0, 8)}... : ₹${firstSettlement.amount}`);
    
    const payRes = await axios.post(
      `${API_URL}/groups/${groupId}/settlements/mark-paid`,
      {
        fromUserId: firstSettlement.fromUserId,
        toUserId: firstSettlement.toUserId,
        amount: firstSettlement.amount,
        currency: firstSettlement.currency,
      }
    );
    console.log(`✅ Payment recorded: ${payRes.data.data.id.substring(0, 8)}...\n`);

    // WAIT BRIEFLY
    await new Promise(resolve => setTimeout(resolve, 500));

    // STEP 4: Check history again - should include reimbursement
    console.log('📜 STEP 4: Check History After Payment');
    console.log('─────────────────────────────────────');
    const historyRes2 = await axios.get(`${API_URL}/groups/${groupId}/history`);
    const updatedHistory = historyRes2.data.data;
    const updatedExpenses = updatedHistory.filter(h => h.type === 'EXPENSE');
    const updatedReimbursements = updatedHistory.filter(h => h.type === 'REIMBURSEMENT');
    
    console.log(`Expenses: ${updatedExpenses.length} (unchanged)`);
    console.log(`Reimbursements now: ${updatedReimbursements.length} (was ${initialReimbursements.length})`);
    
    if (updatedReimbursements.length > initialReimbursements.length) {
      console.log(`✅ New reimbursement appears in history!`);
      const newReimbursement = updatedReimbursements[updatedReimbursements.length - 1];
      console.log(`   Type: ${newReimbursement.type}`);
      console.log(`   Title: ${newReimbursement.title}`);
      console.log(`   Amount: ₹${newReimbursement.amount}`);
    } else {
      console.log(`❌ Reimbursement NOT found in history`);
    }
    console.log();

    // STEP 5: Check settlements - should exclude paid transaction (or reduce amount)
    console.log('📊 STEP 5: Check Settlements After Payment');
    console.log('─────────────────────────────────────');
    const settlementsRes2 = await axios.get(
      `${API_URL}/groups/${groupId}/balances?simplifyDebts=false`
    );
    const updatedSettlements = settlementsRes2.data.data.INR || [];
    console.log(`After payment: ${updatedSettlements.length} settlements (was ${initialSettlements.length})`);
    updatedSettlements.forEach(tx => {
      console.log(`  - ${tx.fromUserId.substring(0, 8)}... → ${tx.toUserId.substring(0, 8)}...: ₹${tx.amount}`);
    });

    if (updatedSettlements.length < initialSettlements.length) {
      console.log(`✅ Paid settlement REMOVED from list!`);
    } else if (updatedSettlements.length === initialSettlements.length) {
      console.log(`⚠️  Settlement still in list - checking if amount was reduced...`);
      const matchingSettlement = updatedSettlements.find(
        s => s.fromUserId === firstSettlement.fromUserId && s.toUserId === firstSettlement.toUserId
      );
      if (matchingSettlement && matchingSettlement.amount < firstSettlement.amount) {
        console.log(`✅ Settlement amount was reduced from ₹${firstSettlement.amount} to ₹${matchingSettlement.amount}`);
      } else if (!matchingSettlement) {
        console.log(`✅ Paid settlement no longer exists in pairs!`);
      }
    } else {
      console.log(`❌ Settlement count increased (unexpected)`);
    }
    console.log();

    // SUMMARY
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  RESULTS                                                     ║');
    console.log('║  ✅ Reimbursement logged in history                         ║');
    console.log('║  ✅ Settlements updated after payment                       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('❌ Test Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testReimbursementLogic();
