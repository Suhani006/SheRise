const base = process.env.API_URL || 'http://localhost:4000/api';
const stamp = Date.now();
const email = `auth.test.${stamp}@example.com`;
const password = 'SheRise@12345';
const body = { name: 'SheRise Test User', email, password, mobile: '9876543210', role: 'CUSTOMER' };
async function call(path, options={}) {
  const r = await fetch(`${base}${path}`, { headers: {'Content-Type':'application/json', ...(options.headers||{})}, ...options });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status}: ${data.error || 'request failed'}`);
  return data;
}
const reg = await call('/auth/register', {method:'POST', body:JSON.stringify(body)});
if (!reg.token) throw new Error('Registration returned no token');
const login = await call('/auth/login', {method:'POST', body:JSON.stringify({identifier:email,password})});
if (!login.token) throw new Error('Login returned no token');
const me = await call('/auth/me', {headers:{Authorization:`Bearer ${login.token}`}});
if (me.user?.email !== email) throw new Error('Authenticated user mismatch');
console.log('AUTH SMOKE TEST PASSED');
console.log(`Created and logged in test account: ${email}`);
