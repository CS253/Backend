/**
 * Direct test of calculateSettlements to see if Dinics runs
 */
const settlementService = require('../services/settlementService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function test() {
  try {
    const groupId = '84da65dd-b3cf-47ef-bd5d-754fa3ac48a0'; // Use your actual group ID
    
    console.log('Starting testSettlementDirect...\n');
    console.log('Calling calculateSettlements()');
    
    const settlements = await settlementService.calculateSettlements(groupId);
    
    console.log('\n✅ Settlements returned:');
    console.log(JSON.stringify(settlements, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
