const http = require('http');

const groupId = '5e98b8ff-0c8a-4420-85de-05a2e0e63fff';

const options = {
  hostname: 'localhost',
  port: 5000,
  path: `/api/groups/${groupId}/balances?simplifyDebts=false`,
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('🎯 DINICS SETTLEMENTS (simplifyDebts=false):\n');
      
      if (parsed.settlements && parsed.settlements.length > 0) {
        console.log(`Found ${parsed.settlements.length} settlements:\n`);
        let totalFromPayer = {};
        
        parsed.settlements.forEach((settlement, idx) => {
          const fromId = settlement.from?.id || settlement.fromUserId;
          const toId = settlement.to?.id || settlement.toUserId;
          const fromName = settlement.from?.name || 'Unknown';
          const toName = settlement.to?.name || 'Unknown';
          
          console.log(`${idx + 1}. ${fromName} (${fromId}) → ${toName} (${toId}): ₹${settlement.amount}`);
          
          if (!totalFromPayer[fromId]) {
            totalFromPayer[fromId] = 0;
          }
          totalFromPayer[fromId] += settlement.amount;
        });
        
        console.log('\n📊 Total per payer:');
        Object.entries(totalFromPayer).forEach(([userId, total]) => {
          console.log(`  ${userId}: ₹${total}`);
        });
      } else {
        console.log('No settlements found');
      }
      
      console.log('\n' + JSON.stringify(parsed, null, 2));
    } catch (err) {
      console.error('Parse error:', err.message);
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error.message);
});

req.end();
