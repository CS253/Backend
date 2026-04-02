const axios = require('axios');

async function test() {
  try {
    const groupId = '84da65dd-b3cf-47ef-bd5d-754fa3ac48a0';
    
    console.log('📊 Raw BALANCES (no algorithm):');
    const balRes = await axios.get(
      `http://localhost:5000/api/groups/${groupId}/balances`
    );
    
    if (balRes.data.data.INR) {
      console.log('\n  User Balances:');
      Object.entries(balRes.data.data.INR).forEach(([userId, balance]) => {
        const net = balance.balance;
        const sign = net >= 0 ? '+' : '';
        console.log(`    ${userId.substring(0,8)}: Paid=${balance.paid}, Owed=${balance.owed}, Net=${sign}${net}`);
      });
    }
    
    console.log('\n🟢 Testing GREEDY (simplifyDebts=true):');
    const greedyRes = await axios.get(
      `http://localhost:5000/api/groups/${groupId}/balances?simplifyDebts=true`
    );
    
    if (greedyRes.data.data.INR) {
      const txns = greedyRes.data.data.INR;
      console.log(`\n  Transactions: ${txns.length}`);
      txns.forEach((t, i) => {
        console.log(`    ${i+1}. ${t.fromUserId.substring(0,8)} → ${t.toUserId.substring(0,8)}: ₹${t.amount}`);
      });
    }
    
    console.log('\n🔵 Testing DINICS (simplifyDebts=false):');
    const dinicsRes = await axios.get(
      `http://localhost:5000/api/groups/${groupId}/balances?simplifyDebts=false`
    );
    
    if (dinicsRes.data.data.INR) {
      const txns = dinicsRes.data.data.INR;
      console.log(`\n  Transactions: ${txns.length}`);
      txns.forEach((t, i) => {
        console.log(`    ${i+1}. ${t.fromUserId.substring(0,8)} → ${t.toUserId.substring(0,8)}: ₹${t.amount}`);
      });
    }
    
    console.log('\n✅ Comparison:');
    console.log(`  GREEDY:  ${greedyRes.data.data.INR?.length || 0} transactions`);
    console.log(`  DINICS:  ${dinicsRes.data.data.INR?.length || 0} transactions`);
    console.log('\n');
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

test();
