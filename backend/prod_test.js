const BASE_URL = 'https://nfc-qr-code-production.up.railway.app/api';

async function main() {
  console.log('Verifying production Railway backend live status...');
  
  // 1. Log in
  console.log('Sending login request to production auth...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  
  if (!loginRes.ok) {
    const errorText = await loginRes.text();
    console.error(`Login failed: ${loginRes.status} ${errorText}`);
    return;
  }
  
  const loginData = await loginRes.json();
  const token = loginData.token || loginData.accessToken;
  console.log('Login successful. JWT Token obtained.');

  // 2. Fetch /tokens/active
  console.log('Fetching active tokens from production...');
  const tokensRes = await fetch(`${BASE_URL}/tokens/active`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log(`GET /api/tokens/active Status: ${tokensRes.status}`);
  const tokensData = await tokensRes.json();
  console.log('GET /api/tokens/active Data:', JSON.stringify(tokensData, null, 2));

  // 3. Fetch /tables/occupancy
  console.log('Fetching table occupancy details from production...');
  const occupancyRes = await fetch(`${BASE_URL}/tables/occupancy`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log(`GET /api/tables/occupancy Status: ${occupancyRes.status}`);
  const occupancyData = await occupancyRes.json();
  console.log('GET /api/tables/occupancy Data:', JSON.stringify(occupancyData, null, 2));
}

main().catch(console.error);
