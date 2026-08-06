/* E2E for /auth/telegram: crafts a correctly-signed Mini App initData with the
   same algorithm Telegram uses, then verifies the backend accepts it,
   rejects tampering, and serves the session. Run with backend on :5057. */
const crypto = require('crypto');

const BOT_TOKEN = '1234567890:AAE2eTestTokenForInitDataVerification123456';
const BASE = 'http://localhost:5057';

function signInitData(fields) {
  const pairs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`);
  const dataCheck = pairs.join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  return pairs.join('&') + `&hash=${hash}`;
}

(async () => {
  const user = {
    id: 424242,
    first_name: 'Abebe',
    last_name: 'Bekele',
    username: 'abebe_b',
    photo_url: 'https://t.me/i/userpic/320/abebe.jpg',
    language_code: 'am',
  };
  const authDate = Math.floor(Date.now() / 1000);

  const initData = signInitData({ auth_date: String(authDate), user: JSON.stringify(user), query_id: 'AAEtest123' });

  // 1. status
  const status = await fetch(`${BASE}/auth/status`).then((r) => r.json());
  console.log('1. /auth/status →', JSON.stringify(status), status.telegramAuth === true ? 'PASS' : 'FAIL');

  // 2. valid login
  const loginRes = await fetch(`${BASE}/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  const login = await loginRes.json();
  const okLogin = loginRes.status === 201 && login.verified === true && login.user?.username === 'abebe_b' && !!login.token;
  console.log('2. valid initData →', loginRes.status, JSON.stringify(login.user), okLogin ? 'PASS' : 'FAIL');

  // 3. session round-trip
  const meRes = await fetch(`${BASE}/auth/me`, { headers: { authorization: `Bearer ${login.token}` } });
  const me = await meRes.json();
  const okMe = meRes.status === 200 && me.user?.telegramId === '424242';
  console.log('3. /auth/me →', meRes.status, JSON.stringify(me.user), okMe ? 'PASS' : 'FAIL');

  // 4. tampered initData must be rejected
  const tampered = initData.replace('Abebe', 'Hacker');
  const badRes = await fetch(`${BASE}/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: tampered }),
  });
  const bad = await badRes.json();
  console.log('4. tampered →', badRes.status, JSON.stringify(bad).slice(0, 90), badRes.status === 401 ? 'PASS' : 'FAIL');

  // 5. forged session must be rejected
  const forged = Buffer.from(JSON.stringify({ tid: '424242', exp: Date.now() + 99999 })).toString('base64url') + '.forgedsig';
  const forgedRes = await fetch(`${BASE}/auth/me`, { headers: { authorization: `Bearer ${forged}` } });
  console.log('5. forged session →', forgedRes.status, forgedRes.status === 401 ? 'PASS' : 'FAIL');

  // 6. upsert idempotency: login again, same account
  const again = await fetch(`${BASE}/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  }).then((r) => r.json());
  console.log('6. re-login (upsert) →', again.verified === true ? 'PASS' : 'FAIL');
})().catch((e) => {
  console.error('TEST ERROR', e.message);
  process.exit(1);
});
