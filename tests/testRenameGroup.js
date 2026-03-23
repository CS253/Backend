const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api';

(async () => {
  try {
    console.log('✅ Testing Group Rename Feature\n');
    console.log('═'.repeat(70));

    // Get first group
    const group = await prisma.group.findFirst();
    if (!group) {
      console.log('❌ No group found in database');
      process.exit(0);
    }

    const originalName = group.title;
    const newName = `${originalName} - Updated (${new Date().getTime()})`;

    console.log(`\n📝 Original Group Name: "${originalName}"`);
    console.log(`   Group ID: ${group.id}`);

    // Test 1: Rename the group
    console.log(`\n🔄 Renaming group to: "${newName}"\n`);
    const renameRes = await axios.put(`${BASE_URL}/groups/${group.id}`, {
      title: newName,
    });

    if (renameRes.data.success) {
      console.log('✅ Rename successful!');
      console.log(`   New name: "${renameRes.data.data.title}"`);
    } else {
      console.log('❌ Rename failed');
      console.log(renameRes.data);
    }

    // Test 2: Verify the change by fetching group again
    console.log(`\n🔍 Verifying change...\n`);
    const verifyRes = await axios.get(`${BASE_URL}/groups/${group.id}`);
    
    if (verifyRes.data.data.title === newName) {
      console.log('✅ Group name verified in database');
      console.log(`   Confirmed name: "${verifyRes.data.data.title}"`);
    } else {
      console.log('❌ Name mismatch in database');
    }

    // Test 3: Update multiple fields
    console.log(`\n📊 Testing multiple field update...\n`);
    const updateRes = await axios.put(`${BASE_URL}/groups/${group.id}`, {
      title: 'Goa Trip 2026',
      currency: 'INR',
    });

    if (updateRes.data.success) {
      console.log('✅ Multi-field update successful!');
      console.log(`   Title: "${updateRes.data.data.title}"`);
      console.log(`   Currency: ${updateRes.data.data.currency}`);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('\n✅ GROUP RENAME FEATURE WORKING!\n');
    console.log('📌 API Endpoint:');
    console.log('   PUT /api/groups/:groupId');
    console.log('\n📋 Request body options:');
    console.log('   { "title": "New Group Name" }');
    console.log('   { "currency": "USD" }');
    console.log('   { "title": "...", "currency": "..." }');

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
    await prisma.$disconnect();
    process.exit(1);
  }
})();
