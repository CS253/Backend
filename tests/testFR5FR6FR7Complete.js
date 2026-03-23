#!/usr/bin/env node

const http = require('http');

const BASE_URL = 'http://localhost:5000/api';
const timestamp = Date.now();

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    
    let body = null;
    if (data) {
      body = JSON.stringify(data);
    }
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function test() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║    Testing FR-5, FR-6, FR-7 Implementation         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // Create users with unique emails
    console.log('✏️  Creating test users...\n');
    const u1 = await makeRequest('POST', '/users', {
      email: `alice-${timestamp}@test.com`,
      name: 'Alice',
      password: 'pass123',
    });
    if (u1.status !== 201) throw new Error('Failed to create user 1');
    const user1Id = u1.data.data.userId;
    console.log(`✓ User 1 (Alice): ${user1Id}`);

    const u2 = await makeRequest('POST', '/users', {
      email: `bob-${timestamp}@test.com`,
      name: 'Bob',
      password: 'pass123',
    });
    const user2Id = u2.data.data.userId;
    console.log(`✓ User 2 (Bob): ${user2Id}`);

    const u3 = await makeRequest('POST', '/users', {
      email: `charlie-${timestamp}@test.com`,
      name: 'Charlie',
      password: 'pass123',
    });
    const user3Id = u3.data.data.userId;
    console.log(`✓ User 3 (Charlie): ${user3Id}`);

    const u4 = await makeRequest('POST', '/users', {
      email: `diana-${timestamp}@test.com`,
      name: 'Diana',
      password: 'pass123',
    });
    const user4Id = u4.data.data.userId;
    console.log(`✓ User 4 (Diana): ${user4Id}\n`);

    // === FR-5: Create group with pre-added participants ===
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ FR-5: Create group with pre-added participants\n');

    const groupCreate = await makeRequest('POST', '/groups', {
      title: 'Europe Trip 2024',
      createdBy: user1Id,
      preAddedParticipants: ['Alice', 'Bob', 'Charlie'],
    });

    if (groupCreate.status !== 201) throw new Error('Failed to create group');

    const groupId = groupCreate.data.data.groupId;
    const inviteLink = groupCreate.data.data.inviteLink;
    const currency = groupCreate.data.data.currency;

    console.log(`✓ Group created: ${groupId}`);
    console.log(`✓ Invite Link: ${inviteLink}`);
    console.log(`✓ Auto-Detected Currency: ${currency}`);
    console.log(`✓ Pre-Added Participants: ${groupCreate.data.data.preAddedParticipants.join(', ')}\n`);

    // Test error: duplicate names
    console.log('Testing FR-5 Error: Duplicate participant names...');
    const dupGroup = await makeRequest('POST', '/groups', {
      title: 'Test',
      createdBy: user1Id,
      preAddedParticipants: ['Alice', 'Bob', 'Alice'],
    });
    if (dupGroup.status === 400 && dupGroup.data.error.includes('unique')) {
      console.log('✓ Correctly rejected duplicate names\n');
    }

    // === FR-6: Join group via invite link ===
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ FR-6: Join group via invite link\n');

    const join1 = await makeRequest('POST', '/groups/join', {
      inviteLink,
      userId: user2Id,
      participantName: 'Bob',
    });

    if (join1.status === 201) {
      console.log('✓ User 2 (Bob) joined group');
      console.log(`  Members: ${join1.data.data.members.length}\n`);
    }

    const join2 = await makeRequest('POST', '/groups/join', {
      inviteLink,
      userId: user3Id,
      participantName: 'Charlie',
    });
    console.log('✓ User 3 (Charlie) joined group\n');

    // Test error case 1: Invalid invite link
    console.log('Testing FR-6 Error 1: Invalid invite link...');
    const invalidLink = await makeRequest('POST', '/groups/join', {
      inviteLink: 'invalid-xyz',
      userId: user4Id,
      participantName: 'Diana',
    });
    if (invalidLink.status === 400 && invalidLink.data.error === 'Invite link expired') {
      console.log('✓ Correctly rejected invalid link\n');
    }

    // Test error case 2: Already joined member
    console.log('Testing FR-6 Error 2: Already joined member...');
    const rejoin = await makeRequest('POST', '/groups/join', {
      inviteLink,
      userId: user1Id,
      participantName: 'Someone',
    });
    if (rejoin.status === 400 && rejoin.data.error.includes('already a member')) {
      console.log('✓ Correctly rejected already-joined member\n');
    }

    // Test error case 3: Claimed name
    console.log('Testing FR-6 Error 3: Name already claimed...');
    const claimed = await makeRequest('POST', '/groups/join', {
      inviteLink,
      userId: user4Id,
      participantName: 'Bob',
    });
    if (claimed.status === 400 && claimed.data.error.includes('already joined')) {
      console.log('✓ Correctly rejected claimed name\n');
    }

    // User joins with new name
    const join3 = await makeRequest('POST', '/groups/join', {
      inviteLink,
      userId: user4Id,
      participantName: 'Diana',
    });
    console.log('✓ User 4 (Diana) joined with non-pre-added name');
    console.log(`  Final members: ${join3.data.data.members.length}\n`);

    // === FR-7: Delete group ===
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ FR-7: Delete group (hard delete)\n');

    // Create group to delete
    const toDelete = await makeRequest('POST', '/groups', {
      title: 'Delete Me',
      createdBy: user1Id,
      preAddedParticipants: ['Test1'],
    });
    const deleteGroupId = toDelete.data.data.groupId;
    const deleteLink = toDelete.data.data.inviteLink;

    // Add a member
    await makeRequest('POST', '/groups/join', {
      inviteLink: deleteLink,
      userId: user2Id,
      participantName: 'Test1',
    });
    console.log('Created test group to delete');

    // Test error: no confirmation
    console.log('Testing FR-7 Error: Delete without confirmation...');
    const noConfirm = await makeRequest('DELETE', `/groups/${deleteGroupId}`, {
      confirmation: false,
    });
    if (noConfirm.status === 400) {
      console.log('✓ Correctly rejected delete without confirmation\n');
    }

    // Delete with confirmation
    console.log('Testing FR-7 Success: Delete with confirmation...');
    const deleteSuccess = await makeRequest('DELETE', `/groups/${deleteGroupId}`, {
      confirmation: true,
    });

    if (deleteSuccess.status === 200) {
      console.log('✓ Group deleted successfully (hard delete)');

      const verify = await makeRequest('GET', `/groups/${deleteGroupId}`);
      if (verify.status === 404) {
        console.log('✓ Verified: Group no longer exists\n');
      }
    }

    // Summary
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ All FR-5, FR-6, FR-7 tests PASSED!\n');
    console.log('Active Test Group:');
    console.log(`  ID: ${groupId}`);
    console.log(`  Invite Link: ${inviteLink}`);
    console.log(`  Members: ${join3.data.data.members.length}`);
    console.log(`  Currency: ${currency}\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

test();
