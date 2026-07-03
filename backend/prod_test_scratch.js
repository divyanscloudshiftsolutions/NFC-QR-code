const BASE_URL = 'https://nfc-qr-code-production.up.railway.app/api';

async function main() {
  console.log('Checking live Railway API status...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  
  if (!loginRes.ok) {
    console.error(`Login failed: ${loginRes.status}`);
    return;
  }
  
  const loginData = await loginRes.json();
  const token = loginData.token || loginData.accessToken;

  // active tokens
  const tokensRes = await fetch(`${BASE_URL}/tokens/active`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const tokensData = await tokensRes.json();
  console.log(`GET /api/tokens/active Status: ${tokensRes.status}`);

  // table occupancy
  const occupancyRes = await fetch(`${BASE_URL}/tables/occupancy`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const occupancyData = await occupancyRes.json();
  console.log(`GET /api/tables/occupancy Status: ${occupancyRes.status}`);
  
  if (tokensRes.status === 200 && occupancyRes.status === 200) {
    console.log('=== RUNTIME VERIFICATION SUCCESS ===');
    console.log('Tokens count:', tokensData.length);
  } else {
    console.log('=== RUNTIME VERIFICATION FAIL ===');
    console.log('Tokens Data:', JSON.stringify(tokensData, null, 2));
    console.log('Occupancy Data:', JSON.stringify(occupancyData, null, 2));
  }
}

main().catch(console.error);
