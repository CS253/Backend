const axios = require('axios');

const groupId = '84da65dd-b3cf-47ef-bd5d-754fa3ac48a0';
const API_URL = 'http://localhost:5000';

async function testAPI() {
  try {
    console.log('Testing API response format...\n');

    const res = await axios.get(
      `${API_URL}/api/groups/${groupId}/balances?simplifyDebts=false`
    );

    console.log('Full Response:');
    console.log(JSON.stringify(res.data, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testAPI();
