import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const authPool = new Pool({ connectionString });
const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'sherise-local-development-secret-change-in-production';
const ADMIN_COMMISSION_RATE = 10;
const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL || '';
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD || '';
const SHIPROCKET_PICKUP_LOCATION = process.env.SHIPROCKET_PICKUP_LOCATION || '';
let shiprocketToken = '';
let shiprocketTokenExpiresAt = 0;
const authAttempts = new Map<string, { count:number; resetAt:number }>();
const authChallenges = new Map<string, { codeHash:string; expiresAt:number; purpose:'login'|'reset'; attempts:number }>();

app.use(helmet());
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '12mb' }));

interface AuthRequest extends Request { user?: { id: string; role: string } }

function signToken(user: { id: string; role: string }) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = { id: String(payload.sub), role: String(payload.role) };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      req.user = { id: String(payload.sub), role: String(payload.role) };
    } catch {}
  }
  next();
}

function role(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

function serializeProduct(p: any) {
  return {
    ...p,
    price: Number(p.price),
    mrp: Number(p.mrp),
    tax: Number(p.tax),
    variants: (p.variants || []).map((v: any) => ({ ...v, price: Number(v.price) })),
    images: p.images || []
  };
}

function authRateLimit(key:string){
  const now=Date.now(); const x=authAttempts.get(key);
  if(!x || now>x.resetAt){ authAttempts.set(key,{count:1,resetAt:now+15*60*1000}); return true; }
  if(x.count>=10) return false; x.count++; return true;
}
function makeOtp(){ return String(crypto.randomInt(100000,1000000)); }
function challengeKey(purpose:string, identifier:string){ return `${purpose}:${identifier.toLowerCase().trim()}`; }
function hashCode(code:string){ return crypto.createHash('sha256').update(`${code}:${JWT_SECRET}`).digest('hex'); }
function normalizeMobile(value: unknown){
  const digits=String(value??'').replace(/\D/g,'');
  if(!digits) return '';
  if(digits.length===12 && digits.startsWith('91')) return digits.slice(2);
  if(digits.length===11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function publicUser(user: any) {
  return { id: user.id, name: user.name, email: user.email, username: user.username, mobile: user.mobile, role: user.role };
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cleanImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 12);
}

async function getCart(userId: string) {
  const cart = await prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: { items: { include: { product: { include: { brand: true, category: true, images: true, variants: { include: { images: { orderBy: { sort: 'asc' } } } } } }, variant: { include: { images: { orderBy: { sort: 'asc' } } } } } } }
  });
  const items = cart.items.map((i: any) => {
    const price = i.variant ? Number(i.variant.price) : Number(i.product.price);
    const stock = i.variant ? i.variant.stock : i.product.stock;
    return { id: i.id, productId: i.productId, variantId: i.variantId, quantity: i.quantity, stock, variant: i.variant ? { ...i.variant, price } : null, product: serializeProduct(i.product), lineTotal: price * i.quantity };
  });
  return { id: cart.id, items, subtotal: items.reduce((s: number, i: any) => s + i.lineTotal, 0), count: items.reduce((s: number, i: any) => s + i.quantity, 0) };
}

async function shiprocketAuth() {
  if (!SHIPROCKET_EMAIL || !SHIPROCKET_PASSWORD) throw new Error('Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.');
  if (shiprocketToken && Date.now() < shiprocketTokenExpiresAt) return shiprocketToken;
  const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD }) });
  if (!response.ok) throw new Error(`Shiprocket authentication failed (${response.status})`);
  const data = await response.json() as any;
  shiprocketToken = String(data.token || '');
  shiprocketTokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;
  return shiprocketToken;
}

async function shiprocketRequest(path: string, init: RequestInit = {}) {
  const token = await shiprocketAuth();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`https://apiv2.shiprocket.in/v1/external${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`Shiprocket request failed (${response.status})`);
  return response.json() as Promise<any>;
}

async function shippingEstimate(pickupPostcode: string, deliveryPostcode: string, weightKg: number, cod: boolean, declaredValue: number) {
  if (!SHIPROCKET_EMAIL || !SHIPROCKET_PASSWORD) return { configured: false, available: true, shipping: declaredValue >= 999 ? 0 : 49, estimatedDays: null, couriers: [] };
  const qs = new URLSearchParams({ pickup_postcode: pickupPostcode, delivery_postcode: deliveryPostcode, cod: cod ? '1' : '0', weight: String(Math.max(.1, weightKg)), declared_value: String(Math.round(declaredValue)) });
  const data = await shiprocketRequest(`/courier/serviceability/?${qs.toString()}`);
  const couriers = data?.data?.available_courier_companies || [];
  const cheapest = [...couriers].sort((a:any,b:any)=>Number(a.rate||Infinity)-Number(b.rate||Infinity))[0];
  return { configured: true, available: couriers.length > 0, shipping: Number(cheapest?.rate || 0), estimatedDays: cheapest?.etd || cheapest?.estimated_delivery_days || null, couriers };
}

async function customerScanner() {
  const setting = await prisma.platformSetting.findUnique({ where: { key: 'CUSTOMER_PAYMENT_SCANNER' } });
  return setting?.value || '';
}

async function ensureSellerForUser(userId: string, businessName?: string) {
  const existing = await prisma.seller.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.seller.create({ data: { userId, businessName: businessName || 'My SheRise Store' } });
}

async function addOrderActivity(tx: any, orderId: string, actorUserId: string | null, type: string, message: string) {
  return tx.orderActivity.create({ data: { orderId, actorUserId: actorUserId || undefined, type, message } });
}

async function createPayoutForVerifiedPayment(tx: any, payment: any, adminId: string) {
  if (payment.status !== 'VERIFIED') return;
  const order = await tx.order.findUnique({ where: { id: payment.orderId }, include: { seller: true } });
  if (!order?.sellerId) return;
  const existingCommission = await tx.commission.findFirst({ where: { orderId: order.id, sellerId: order.sellerId } });
  if (existingCommission) return;
  const amount = Number(payment.amount);
  const commissionAmount = Math.round(amount * ADMIN_COMMISSION_RATE) / 100;
  const sellerAmount = Math.max(0, Math.round((amount - commissionAmount) * 100) / 100);
  await tx.commission.create({ data: { sellerId: order.sellerId, orderId: order.id, rate: ADMIN_COMMISSION_RATE, amount: commissionAmount } });
  await tx.sellerPayout.create({ data: { sellerId: order.sellerId, amount: sellerAmount, status: 'PENDING' } });
  await tx.sellerLedgerEntry.createMany({ data: [
    { sellerId: order.sellerId, orderId: order.id, type: 'SALE_PAYABLE', amount: sellerAmount, reference: order.orderNumber, description: `Seller payable after ${ADMIN_COMMISSION_RATE}% platform commission` },
    { sellerId: order.sellerId, orderId: order.id, type: 'COMMISSION', amount: -commissionAmount, reference: order.orderNumber, description: `SheRise platform commission ${ADMIN_COMMISSION_RATE}%` }
  ] });
  await tx.notification.create({ data: { userId: order.seller!.userId, type: 'PAYOUT', title: 'Payment verified', body: `Order ${order.orderNumber} payment is verified. Seller payout pending: ₹${sellerAmount.toFixed(2)}.` } });
  await tx.auditLog.create({ data: { userId: adminId, action: 'PAYMENT_VERIFIED', entity: 'Payment', entityId: payment.id } });
}

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'sherise-api', database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, service: 'sherise-api', database: 'unavailable' });
  }
});

// Auth (Termux-safe: authentication uses node-postgres directly so login/register
// do not depend on Prisma's schema engine, which can fail on Android/Termux.)
const registerSchema = z.object({
  name: z.string().min(2),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
  email: z.string().email(),
  password: z.string().min(8),
  mobile: z.string().optional(),
  role: z.enum(['CUSTOMER', 'SELLER']).default('CUSTOMER'),
  businessName: z.string().optional()
});

async function authUserById(id: string) {
  const r = await authPool.query('SELECT id,name,email,username,mobile,"passwordHash",role,"createdAt" FROM "User" WHERE id=$1 LIMIT 1', [id]);
  return r.rows[0] || null;
}

async function authUserByIdentifier(identifier: string) {
  const mobile = normalizeMobile(identifier);
  const r = identifier.includes('@')
    ? await authPool.query('SELECT id,name,email,username,mobile,"passwordHash",role,"createdAt" FROM "User" WHERE lower(email)=lower($1) LIMIT 1', [identifier])
    : await authPool.query('SELECT id,name,email,username,mobile,"passwordHash",role,"createdAt" FROM "User" WHERE lower(username)=lower($1) OR mobile=$2 LIMIT 1', [identifier, mobile]);
  return r.rows[0] || null;
}

app.post('/api/auth/register', async (req, res) => {
  const client = await authPool.connect();
  try {
    const data = registerSchema.parse(req.body);
    const email = data.email.trim().toLowerCase();
    const mobile = normalizeMobile(data.mobile);
    const usernameInput = data.username?.trim().toLowerCase() || '';
    const existing = await client.query(
      'SELECT id,email,username,mobile FROM "User" WHERE lower(email)=lower($1) OR ($2<>\'\' AND lower(username)=lower($2)) OR ($3<>\'\' AND mobile=$3) LIMIT 1',
      [email, usernameInput, mobile]
    );
    if (existing.rows[0]) {
      const x = existing.rows[0];
      if (String(x.email).toLowerCase() === email) return res.status(409).json({ error: 'Email is already registered' });
      if (usernameInput && x.username && String(x.username).toLowerCase() === usernameInput) return res.status(409).json({ error: 'Username is already registered' });
      return res.status(409).json({ error: 'Mobile number is already registered' });
    }

    const baseUsername = (usernameInput || slugify(data.name).replace(/-/g, '') || `user${Date.now()}`).toLowerCase();
    let username = baseUsername;
    for (let suffix = 1; suffix < 10000; suffix++) {
      const u = await client.query('SELECT 1 FROM "User" WHERE lower(username)=lower($1) LIMIT 1', [username]);
      if (!u.rows[0]) break;
      username = `${baseUsername}${suffix}`;
    }
    const passwordHash = await bcrypt.hash(data.password, 12);
    const id = crypto.randomUUID();
    await client.query('BEGIN');
    const created = await client.query(
      'INSERT INTO "User" (id,name,email,username,mobile,"passwordHash",role,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7::"Role",CURRENT_TIMESTAMP) RETURNING id,name,email,username,mobile,"passwordHash",role,"createdAt"',
      [id, data.name.trim(), email, username, mobile || null, passwordHash, data.role]
    );
    if (data.role === 'SELLER') {
      await client.query(
        'INSERT INTO "Seller" (id,"userId","businessName","kycStatus","pickupCountry") VALUES ($1,$2,$3,\'PENDING\',\'India\')',
        [crypto.randomUUID(), id, data.businessName?.trim() || `${data.name.trim()}'s SheRise Store`]
      );
    }
    await client.query('COMMIT');
    const user = created.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (e: any) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Registration error:', e);
    if (e?.code === '23505') return res.status(409).json({ error: 'An account with these details already exists.' });
    const message = e?.issues?.[0]?.message || e?.message || 'Registration failed. Please check the database and try again.';
    res.status(400).json({ error: String(message) });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const rawIdentifier = String(req.body.identifier || req.body.email || req.body.username || '').trim();
    const identifier = rawIdentifier.toLowerCase();
    const password = String(req.body.password || '');
    if (!identifier || !password) return res.status(400).json({ error: 'Email, username or mobile number and password are required' });
    if (!authRateLimit(`login:${identifier}`)) return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    const user = await authUserByIdentifier(identifier);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email, username, mobile number or password' });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login service is temporarily unavailable. Check the backend database connection.' });
  }
});

app.post('/api/auth/otp/request', async (req, res) => {
  try {
    const rawIdentifier=String(req.body.identifier||'').trim();
    const identifier=rawIdentifier.includes('@') ? rawIdentifier.toLowerCase() : normalizeMobile(rawIdentifier);
    if(!identifier) return res.status(400).json({error:'Mobile number or email is required'});
    if(!authRateLimit(`otp:${identifier}`)) return res.status(429).json({error:'Too many OTP requests. Try again later.'});
    const user=await authUserByIdentifier(identifier);
    if(!user) return res.status(404).json({error:'No SheRise account was found for these details'});
    const code=makeOtp(); authChallenges.set(challengeKey('login',identifier),{codeHash:hashCode(code),expiresAt:Date.now()+5*60*1000,purpose:'login',attempts:0});
    const response:any={message:'OTP generated. It expires in 5 minutes.'};
    if(process.env.AUTH_OTP_DEV_MODE==='true') response.devOtp=code;
    res.json(response);
  } catch (e) { console.error('OTP request error:',e); res.status(500).json({error:'Could not generate OTP'}); }
});

app.post('/api/auth/otp/verify', async (req,res)=>{
  try {
    const rawIdentifier=String(req.body.identifier||'').trim(); const identifier=rawIdentifier.includes('@') ? rawIdentifier.toLowerCase() : normalizeMobile(rawIdentifier); const code=String(req.body.otp||'').trim();
    const c=authChallenges.get(challengeKey('login',identifier));
    if(!c || c.purpose!=='login' || c.expiresAt<Date.now()) return res.status(400).json({error:'OTP expired or not requested'});
    if(++c.attempts>5 || hashCode(code)!==c.codeHash) return res.status(401).json({error:'Invalid OTP'});
    const user=await authUserByIdentifier(identifier);
    if(!user) return res.status(404).json({error:'Account not found'});
    authChallenges.delete(challengeKey('login',identifier)); res.json({token:signToken(user),user:publicUser(user)});
  } catch { res.status(500).json({error:'Could not verify OTP'}); }
});

app.post('/api/auth/password/request', async (req,res)=>{
  try {
    const rawIdentifier=String(req.body.identifier||'').trim(); const identifier=rawIdentifier.includes('@') ? rawIdentifier.toLowerCase() : normalizeMobile(rawIdentifier);
    if(!identifier) return res.status(400).json({error:'Email or mobile number is required'});
    if(!authRateLimit(`reset:${identifier}`)) return res.status(429).json({error:'Too many reset requests. Try again later.'});
    const user=await authUserByIdentifier(identifier);
    if(!user) return res.status(404).json({error:'No SheRise account was found for these details'});
    const code=makeOtp(); authChallenges.set(challengeKey('reset',identifier),{codeHash:hashCode(code),expiresAt:Date.now()+10*60*1000,purpose:'reset',attempts:0});
    const response:any={message:'Password reset code generated. It expires in 10 minutes.'}; if(process.env.AUTH_OTP_DEV_MODE==='true') response.devOtp=code; res.json(response);
  } catch { res.status(500).json({error:'Could not create password reset request'}); }
});

app.post('/api/auth/password/reset', async (req,res)=>{
  try {
    const rawIdentifier=String(req.body.identifier||'').trim(); const identifier=rawIdentifier.includes('@') ? rawIdentifier.toLowerCase() : normalizeMobile(rawIdentifier); const code=String(req.body.otp||'').trim(); const newPassword=String(req.body.newPassword||'');
    if(newPassword.length<8) return res.status(400).json({error:'Password must contain at least 8 characters'});
    const c=authChallenges.get(challengeKey('reset',identifier));
    if(!c || c.purpose!=='reset' || c.expiresAt<Date.now()) return res.status(400).json({error:'Reset code expired or not requested'});
    if(++c.attempts>5 || hashCode(code)!==c.codeHash) return res.status(401).json({error:'Invalid reset code'});
    const user=await authUserByIdentifier(identifier); if(!user) return res.status(404).json({error:'Account not found'});
    await authPool.query('UPDATE "User" SET "passwordHash"=$1 WHERE id=$2',[await bcrypt.hash(newPassword,12),user.id]); authChallenges.delete(challengeKey('reset',identifier)); res.json({ok:true});
  } catch { res.status(500).json({error:'Could not reset password'}); }
});

app.patch('/api/auth/profile', auth, async (req: AuthRequest, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    const mobile = normalizeMobile(req.body.mobile) || null;
    const username = req.body.username === undefined ? undefined : String(req.body.username || '').trim().toLowerCase() || null;
    if (name.length < 2) return res.status(400).json({ error: 'Name must contain at least 2 characters' });
    if (username && !/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Invalid username' });
    if (username) { const exists = await authPool.query('SELECT 1 FROM "User" WHERE lower(username)=lower($1) AND id<>$2 LIMIT 1',[username,req.user!.id]); if (exists.rows[0]) return res.status(409).json({ error:'Username already exists' }); }
    const r = await authPool.query('UPDATE "User" SET name=$1,mobile=$2' + (username !== undefined ? ',username=$3' : '') + ' WHERE id=$' + (username !== undefined ? '4' : '3') + ' RETURNING id,name,email,username,mobile,"passwordHash",role,"createdAt"', username !== undefined ? [name,mobile,username,req.user!.id] : [name,mobile,req.user!.id]);
    res.json({ user: publicUser(r.rows[0]) });
  } catch { res.status(400).json({ error: 'Could not update profile' }); }
});

app.get('/api/auth/me', auth, async (req: AuthRequest, res: Response) => {
  try { const user = await authUserById(req.user!.id); if (!user) return res.status(404).json({ error: 'User not found' }); res.json({ user: publicUser(user) }); }
  catch { res.status(500).json({ error:'Authentication database unavailable' }); }
});

// Public catalog
app.get('/api/categories', async (_req, res) => res.json(await prisma.category.findMany({ orderBy: { name: 'asc' } })));
app.get('/api/brands', async (_req, res) => res.json(await prisma.brand.findMany({ orderBy: { name: 'asc' } })));
app.get('/api/banners', async (_req, res) => res.json(await prisma.banner.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } })));
app.get('/api/offers', async (_req, res) => res.json(await prisma.offer.findMany({ where: { active: true }, orderBy: { startsAt: 'asc' } })));
app.get('/api/payment-settings/customer', async (_req, res) => res.json({ scannerUrl: await customerScanner(), message: 'Scan the SheRise payment QR, complete payment, then enter your payment reference at checkout.' }));

app.get('/api/search/suggestions', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const [products, brands, categories] = await Promise.all([
    prisma.product.findMany({ where: { approvalStatus: 'APPROVED', name: { contains: q, mode: 'insensitive' } }, select: { name: true, slug: true }, take: 5 }),
    prisma.brand.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, select: { name: true, slug: true }, take: 3 }),
    prisma.category.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, select: { name: true, slug: true }, take: 3 })
  ]);
  res.json([...products.map(x => ({ type: 'product', label: x.name, value: x.name })), ...brands.map(x => ({ type: 'brand', label: x.name, value: x.name })), ...categories.map(x => ({ type: 'category', label: x.name, value: x.name }))]);
});

app.get('/api/products', async (req, res) => {
  try {
    const q = String(req.query.q || req.query.search || '').trim();
    const category = String(req.query.category || '').trim();
    const brand = String(req.query.brand || '').trim();
    const sort = String(req.query.sort || 'featured');
    const min = Number(req.query.minPrice || 0);
    const max = Number(req.query.maxPrice || Number.MAX_SAFE_INTEGER);
    const where: any = { approvalStatus: 'APPROVED', price: { gte: min, lte: max } };
    const ratingMin = Number(req.query.ratingMin || 0);
    if (q) {
      const terms = [...new Set([q, q.replace(/[^a-z0-9]/gi, ''), q.endsWith('s') ? q.slice(0,-1) : `${q}s`].filter(Boolean))];
      where.OR = terms.flatMap(term => [{ name: { contains: term, mode: 'insensitive' } }, { sku: { contains: term, mode: 'insensitive' } }, { description: { contains: term, mode: 'insensitive' } }, { brand: { name: { contains: term, mode: 'insensitive' } } }, { category: { name: { contains: term, mode: 'insensitive' } } }]);
    }
    if (category) where.category = { slug: category };
    if (brand) where.brand = { slug: brand };
    if (req.query.inStock === 'true') where.stock = { gt: 0 };
    if (ratingMin > 0) where.reviews = { some: { rating: { gte: ratingMin } } };
    let orderBy: any = { id: 'desc' };
    if (sort === 'price-asc') orderBy = { price: 'asc' };
    if (sort === 'price-desc') orderBy = { price: 'desc' };
    if (sort === 'name') orderBy = { name: 'asc' };
    if (sort === 'newest') orderBy = { createdAt: 'desc' };
    if (sort === 'popular') orderBy = { orderItems: { _count: 'desc' } };
    const products = await prisma.product.findMany({ where, include: { brand: true, category: true, images: { orderBy: { sort: 'asc' } }, variants: { include: { images: { orderBy: { sort: 'asc' } } } } }, orderBy, take: Math.min(Number(req.query.limit || 100), 100) });
    if (sort === 'discount') products.sort((a:any,b:any) => ((Number(b.mrp)-Number(b.price))/Math.max(1,Number(b.mrp))) - ((Number(a.mrp)-Number(a.price))/Math.max(1,Number(a.mrp))));
    if (q) await prisma.searchEvent.create({ data: { userId: (req as any).user?.id, query: q.toLowerCase(), results: products.length } }).catch(() => {});
    res.json(products.map(serializeProduct));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load products' }); }
});

app.get('/api/products/:id', async (req, res) => {
  const p = await prisma.product.findFirst({ where: { approvalStatus: 'APPROVED', OR: [{ id: String(req.params.id) }, { slug: String(req.params.id) }] }, include: { brand: true, category: true, images: { orderBy: { sort: 'asc' } }, variants: { include: { images: { orderBy: { sort: 'asc' } } } }, reviews: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }, offers: { where: { active: true }, include: { seller: { select: { id: true, businessName: true, user: { select: { name: true } } } } }, orderBy: [{ featured: 'desc' }, { price: 'asc' }] }, questions: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 30 } } });
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const product = serializeProduct(p);
  const ratings = p.reviews.map((r: any) => r.rating);
  res.json({ ...product, averageRating: ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0, reviewCount: ratings.length });
});

// Cart
app.get('/api/cart', auth, async (req: AuthRequest, res) => res.json(await getCart(req.user!.id)));
app.post('/api/cart/items', auth, async (req: AuthRequest, res) => {
  try {
    const productId = String(req.body.productId);
    const variantId = req.body.variantId ? String(req.body.variantId) : null;
    const requested = Math.max(1, Number(req.body.quantity || 1));
    const product = await prisma.product.findUnique({ where: { id: productId }, include: { variants: true } });
    if (!product || product.approvalStatus !== 'APPROVED') return res.status(404).json({ error: 'Product is not available' });
    const variant = variantId ? product.variants.find(v => v.id === variantId) : null;
    if (variantId && !variant) return res.status(400).json({ error: 'Selected variant is not available' });
    const available = variant ? variant.stock : product.stock;
    if (available < requested) return res.status(400).json({ error: `Only ${available} item(s) available` });
    const cart = await prisma.cart.upsert({ where: { userId: req.user!.id }, update: {}, create: { userId: req.user!.id } });
    const existing = await prisma.cartItem.findFirst({ where: { cartId: cart.id, productId, variantId } });
    if (existing) {
      const quantity = existing.quantity + requested;
      if (quantity > available) return res.status(400).json({ error: `Only ${available} item(s) available` });
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity } });
    } else await prisma.cartItem.create({ data: { cartId: cart.id, productId, variantId, quantity: requested } });
    res.json(await getCart(req.user!.id));
  } catch (e) { console.error(e); res.status(400).json({ error: 'Could not add to cart' }); }
});
app.patch('/api/cart/items/:id', auth, async (req: AuthRequest, res) => {
  const quantity = Math.max(0, Number(req.body.quantity));
  const item: any = await prisma.cartItem.findUnique({ where: { id: String(req.params.id) }, include: { cart: true, product: true, variant: true } });
  if (!item || item.cart.userId !== req.user!.id) return res.status(404).json({ error: 'Cart item not found' });
  const available = item.variant ? item.variant.stock : item.product.stock;
  if (quantity === 0) await prisma.cartItem.delete({ where: { id: item.id } });
  else if (item.product.approvalStatus !== 'APPROVED') return res.status(400).json({ error: 'This product is no longer available' });
  else if (quantity > available) return res.status(400).json({ error: `Only ${available} item(s) available` });
  else await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  res.json(await getCart(req.user!.id));
});
app.delete('/api/cart/items/:id', auth, async (req: AuthRequest, res) => {
  const item: any = await prisma.cartItem.findUnique({ where: { id: String(req.params.id) }, include: { cart: true } });
  if (!item || item.cart.userId !== req.user!.id) return res.status(404).json({ error: 'Cart item not found' });
  await prisma.cartItem.delete({ where: { id: item.id } });
  res.json(await getCart(req.user!.id));
});
app.delete('/api/cart', auth, async (req: AuthRequest, res) => {
  const cart = await prisma.cart.findUnique({ where: { userId: req.user!.id } });
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  res.json(await getCart(req.user!.id));
});

// Wishlist
app.get('/api/wishlist', auth, async (req: AuthRequest, res) => {
  const list = await prisma.wishlist.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } });
  const products = list.length ? await prisma.product.findMany({ where: { id: { in: list.map(x => x.productId) }, approvalStatus: 'APPROVED' }, include: { brand: true, category: true, images: true } }) : [];
  res.json(products.map(serializeProduct));
});
app.post('/api/wishlist/toggle', auth, async (req: AuthRequest, res) => {
  const productId = String(req.body.productId);
  const existing = await prisma.wishlist.findFirst({ where: { userId: req.user!.id, productId } });
  if (existing) await prisma.wishlist.delete({ where: { id: existing.id } }); else {
    const p = await prisma.product.findUnique({ where: { id: productId } });
    if (!p || p.approvalStatus !== 'APPROVED') return res.status(404).json({ error: 'Product is not available' });
    await prisma.wishlist.create({ data: { userId: req.user!.id, productId } });
  }
  res.json({ active: !existing });
});

// Addresses
app.get('/api/addresses', auth, async (req: AuthRequest, res) => res.json(await prisma.address.findMany({ where: { userId: req.user!.id }, orderBy: [{ isDefault: 'desc' }, { id: 'desc' }] })));
app.post('/api/addresses', auth, async (req: AuthRequest, res) => {
  const data = { label: String(req.body.label || 'Home'), line1: String(req.body.line1 || ''), line2: req.body.line2 ? String(req.body.line2) : undefined, city: String(req.body.city || ''), state: String(req.body.state || ''), pincode: String(req.body.pincode || ''), country: String(req.body.country || 'India'), isDefault: Boolean(req.body.isDefault) };
  if (!data.line1 || !data.city || !data.state || !data.pincode) return res.status(400).json({ error: 'Complete address is required' });
  if (data.isDefault) await prisma.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
  const address = await prisma.address.create({ data: { ...data, userId: req.user!.id } });
  res.status(201).json(address);
});
app.patch('/api/addresses/:id', auth, async (req: AuthRequest, res) => {
  const old = await prisma.address.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!old) return res.status(404).json({ error: 'Address not found' });
  if (req.body.isDefault) await prisma.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
  const address = await prisma.address.update({ where: { id: old.id }, data: req.body });
  res.json(address);
});
app.delete('/api/addresses/:id', auth, async (req: AuthRequest, res) => { await prisma.address.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } }); res.json({ ok: true }); });

// Coupons
app.post('/api/coupons/validate', async (req, res) => {
  const code = String(req.body.code || '').toUpperCase();
  const subtotal = Number(req.body.subtotal || 0);
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active || (coupon.expiresAt && coupon.expiresAt < new Date())) return res.status(400).json({ error: 'Invalid or expired coupon' });
  if (coupon.minOrder && subtotal < Number(coupon.minOrder)) return res.status(400).json({ error: `Minimum order is ₹${Number(coupon.minOrder).toFixed(0)}` });
  let discount = coupon.type === 'PERCENT' ? subtotal * Number(coupon.value) / 100 : Number(coupon.value);
  if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
  discount = Math.max(0, Math.min(discount, subtotal));
  res.json({ code, discount, type: coupon.type, value: Number(coupon.value) });
});

// Checkout / orders
app.post('/api/checkout', auth, async (req: AuthRequest, res) => {
  try {
    const addressId = String(req.body.addressId || '');
    const address = await prisma.address.findFirst({ where: { id: addressId, userId: req.user!.id } });
    if (!address) return res.status(400).json({ error: 'Select a delivery address' });
    const checkoutUser = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    const method = String(req.body.paymentMethod || 'COD').toUpperCase();
    if (!['UPI','COD'].includes(method)) return res.status(400).json({ error: 'Unsupported payment method. Use manual UPI or Cash on Delivery.' });
    const transactionId = req.body.transactionId ? String(req.body.transactionId) : undefined;
    if (method === 'UPI' && !transactionId) return res.status(400).json({ error: 'Enter the UPI/payment reference after scanning the SheRise QR' });
    if (method === 'UPI' && !(await customerScanner())) return res.status(400).json({ error: 'Admin payment scanner is not configured yet' });
    const discount = Math.max(0, Number(req.body.discount || 0));
    let sourceItems: any[] = [];
    let cartId: string | null = null;
    const buyNowProductId = String(req.body.buyNowProductId || '');
    const buyNowQuantity = Math.max(1, Number(req.body.buyNowQuantity || 1));
    const buyNowVariantId = req.body.variantId ? String(req.body.variantId) : null;
    if (buyNowProductId) {
      const product = await prisma.product.findUnique({ where: { id: buyNowProductId }, include: { variants: true } });
      if (!product || product.approvalStatus !== 'APPROVED') return res.status(404).json({ error: 'Product is not available' });
      const variant = buyNowVariantId ? product.variants.find(v => v.id === buyNowVariantId) : null;
      if (buyNowVariantId && !variant) return res.status(400).json({ error: 'Selected variant is not available' });
      sourceItems = [{ product, variant, variantId: buyNowVariantId, quantity: buyNowQuantity }];
    } else {
      const cart = await prisma.cart.findUnique({ where: { userId: req.user!.id }, include: { items: { include: { product: { include: { variants: true } }, variant: true } } } });
      if (!cart || !cart.items.length) return res.status(400).json({ error: 'Your cart is empty' });
      cartId = cart.id; sourceItems = cart.items;
    }
    for (const item of sourceItems) {
      if (item.product.approvalStatus !== 'APPROVED') return res.status(400).json({ error: `${item.product.name} is no longer available` });
      const available = item.variant ? item.variant.stock : item.product.stock;
      if (item.quantity > available) return res.status(400).json({ error: `${item.product.name} has only ${available} item(s) left` });
    }
    const groups = new Map<string, any[]>();
    for (const item of sourceItems) { const key = item.product.sellerId || 'platform'; if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(item); }
    const groupNumber = `SG${Date.now().toString().slice(-10)}`;
    const created = await prisma.$transaction(async tx => {
      const group = await tx.orderGroup.create({ data: { groupNumber, userId: req.user!.id } });
      const results: any[] = [];
      for (const [sellerKey, items] of groups) {
        const subtotal = items.reduce((sum, i) => sum + Number(i.variant?.price ?? i.product.price) * i.quantity, 0);
        const groupDiscount = groups.size === 1 ? Math.min(discount, subtotal) : 0;
        const shipping = subtotal - groupDiscount >= 999 ? 0 : 49;
        const total = Math.max(0, subtotal - groupDiscount + shipping);
        const orderNumber = `SR${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
        const order = await tx.order.create({ data: { orderNumber, orderGroupId: group.id, userId: req.user!.id, sellerId: sellerKey === 'platform' ? undefined : sellerKey, subtotal, discount: groupDiscount, tax: 0, shipping, total, shippingName: checkoutUser?.name || address.label || address.line1, shippingLine1: address.line1, shippingLine2: address.line2, shippingCity: address.city, shippingState: address.state, shippingPincode: address.pincode, shippingCountry: address.country, status: method === 'COD' ? 'PLACED' : 'PLACED', sellerStage: 'NEW', items: { create: items.map(i => ({ productId: i.product.id, variantId: i.variantId || undefined, quantity: i.quantity, price: i.variant?.price ?? i.product.price })) }, payments: { create: { method, status: method === 'UPI' ? 'PENDING' : 'PENDING', amount: total, transactionId, provider: method === 'UPI' ? 'MANUAL_UPI' : 'COD' } }, shipments: { create: { status: 'CREATED' } } }, include: { items: { include: { product: true, variant: true } }, payments: true, shipments: true } });
        for (const item of items) {
          if (item.variantId) { await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { decrement: item.quantity } } }); await tx.product.update({ where: { id: item.product.id }, data: { stock: { decrement: item.quantity } } }); }
          else await tx.product.update({ where: { id: item.product.id }, data: { stock: { decrement: item.quantity } } });
        }
        await addOrderActivity(tx, order.id, req.user!.id, 'ORDER_PLACED', `Order ${orderNumber} placed under checkout ${groupNumber}.`);
        await tx.notification.create({ data: { userId: req.user!.id, type: 'ORDER', title: 'Order placed', body: `Order ${orderNumber} has been placed successfully.` } });
        if (order.sellerId) { const seller = await tx.seller.findUnique({ where: { id: order.sellerId } }); if (seller) await tx.notification.create({ data: { userId: seller.userId, type: 'ORDER', title: 'New order received', body: `Order ${orderNumber} contains your product.` } }); }
        results.push(order);
      }
      if (cartId) await tx.cartItem.deleteMany({ where: { cartId } });
      return results;
    });
    res.status(201).json({ orderGroupNumber: groupNumber, orders: created, message: 'Order placed successfully' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Checkout failed' }); }
});

app.post('/api/shipping/estimate', auth, async (req: AuthRequest, res) => {
  try {
    const addressId = String(req.body.addressId || '');
    const address = await prisma.address.findFirst({ where: { id: addressId, userId: req.user!.id } });
    if (!address) return res.status(400).json({ error: 'Select a delivery address' });
    const cart = await prisma.cart.findUnique({ where: { userId: req.user!.id }, include: { items: { include: { product: true, variant: true } } } });
    const items = cart?.items || [];
    const weightKg = Math.max(.1, items.reduce((sum, i) => sum + ((i.product.weightGrams || 500) * i.quantity), 0) / 1000);
    const result = await shippingEstimate(process.env.SHIPROCKET_PICKUP_PINCODE || '411001', address.pincode, weightKg, String(req.body.paymentMethod || 'COD') === 'COD', Number(req.body.declaredValue || 0));
    res.json({ ...result, weightKg, deliveryPincode: address.pincode });
  } catch (e:any) { res.status(503).json({ error: e?.message || 'Shipping estimate unavailable' }); }
});

app.get('/api/orders', auth, async (req: AuthRequest, res) => {
  const orders = await prisma.order.findMany({ where: { userId: req.user!.id }, include: { items: { include: { product: { include: { images: true } }, variant: true } }, payments: true, shipments: true, returns: true, activities: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  res.json(orders);
});
app.get('/api/orders/:id', auth, async (req: AuthRequest, res) => {
  const order = await prisma.order.findFirst({ where: { id: String(req.params.id), userId: req.user!.id }, include: { items: { include: { product: { include: { images: true } }, variant: true } }, payments: true, shipments: true, returns: true, activities: { orderBy: { createdAt: 'asc' } } } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});
app.post('/api/orders/:id/cancel', auth, async (req: AuthRequest, res) => {
  const order = await prisma.order.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['PLACED', 'CONFIRMED'].includes(order.status)) return res.status(400).json({ error: 'This order can no longer be cancelled' });
  const updated = await prisma.$transaction(async tx => {
    const o = await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const item of items) { if (item.variantId) { await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } }); await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } }); } else await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } }); }
    return o;
  });
  res.json(updated);
});
app.post('/api/orders/:id/return', auth, async (req: AuthRequest, res) => {
  const order: any = await prisma.order.findFirst({ where: { id: String(req.params.id), userId: req.user!.id }, include: { returns: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'DELIVERED') return res.status(400).json({ error: 'Return can be requested after delivery.' });
  if (order.returns.some((r: any) => ['REQUESTED','APPROVED','PICKUP_SCHEDULED','PICKED_UP'].includes(r.status))) return res.status(400).json({ error: 'A return request already exists for this order.' });
  const ret = await prisma.$transaction(async tx => {
    const created = await tx.return.create({ data: { orderId: order.id, reason: String(req.body.reason || 'Customer requested return'), refundAmount: order.total } });
    await addOrderActivity(tx, order.id, req.user!.id, 'RETURN_REQUESTED', `Customer requested a return: ${created.reason}`);
    if (order.sellerId) {
      const seller = await tx.seller.findUnique({ where: { id: order.sellerId } });
      if (seller) await tx.notification.create({ data: { userId: seller.userId, type: 'RETURN', title: 'Return requested', body: `A return was requested for order ${order.orderNumber}.` } });
    }
    return created;
  });
  res.status(201).json(ret);
});

// Reviews
app.get('/api/products/:id/reviews', async (req, res) => res.json(await prisma.review.findMany({ where: { productId: String(req.params.id) }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' } })));
app.post('/api/products/:id/reviews', auth, async (req: AuthRequest, res) => {
  const rating = Number(req.body.rating);
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  const product = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
  if (!product || product.approvalStatus !== 'APPROVED') return res.status(404).json({ error: 'Product not found' });
  const review = await prisma.review.create({ data: { productId: product.id, userId: req.user!.id, rating, body: req.body.body ? String(req.body.body) : undefined } });
  res.status(201).json(review);
});

// Rewards / notifications / support
app.get('/api/rewards', auth, async (req: AuthRequest, res) => {
  let reward = await prisma.reward.findFirst({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } });
  if (!reward) reward = await prisma.reward.create({ data: { userId: req.user!.id, points: 100 } });
  res.json(reward);
});
app.get('/api/notifications', auth, async (req: AuthRequest, res) => res.json(await prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50 })));
app.patch('/api/notifications/:id/read', auth, async (req: AuthRequest, res) => { await prisma.notification.updateMany({ where: { id: String(req.params.id), userId: req.user!.id }, data: { read: true } }); res.json({ ok: true }); });
app.get('/api/support/tickets', auth, async (req: AuthRequest, res) => res.json(await prisma.supportTicket.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } })));
app.post('/api/support/tickets', auth, async (req: AuthRequest, res) => { const ticket = await prisma.supportTicket.create({ data: { userId: req.user!.id, subject: String(req.body.subject || 'Support request'), message: String(req.body.message || '') } }); res.status(201).json(ticket); });

// Seller
app.get('/api/seller/me', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id }, include: { products: { include: { images: true } }, payouts: { orderBy: { createdAt: 'desc' } } } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  const { paymentScannerUrl, ...safeSeller } = seller;
  res.json({ ...safeSeller, hasPaymentScanner: Boolean(paymentScannerUrl) });
});
app.post('/api/seller/register', auth, async (req: AuthRequest, res) => {
  if (req.user!.role === 'ADMIN') return res.status(400).json({ error: 'Admin accounts do not need a seller profile' });
  const seller = await ensureSellerForUser(req.user!.id, String(req.body.businessName || 'My SheRise Store'));
  await prisma.user.update({ where: { id: req.user!.id }, data: { role: 'SELLER' } });
  res.status(201).json(seller);
});
app.patch('/api/seller/profile', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  const updated = await prisma.seller.update({ where: { id: seller.id }, data: {
    businessName: req.body.businessName !== undefined ? String(req.body.businessName) : undefined,
    gstNumber: req.body.gstNumber !== undefined ? String(req.body.gstNumber) : undefined,
    bankAccount: req.body.bankAccount !== undefined ? String(req.body.bankAccount) : undefined,
    paymentScannerUrl: req.body.paymentScannerUrl !== undefined ? String(req.body.paymentScannerUrl) : undefined,
    pickupLine1: req.body.pickupLine1 !== undefined ? String(req.body.pickupLine1) : undefined,
    pickupLine2: req.body.pickupLine2 !== undefined ? String(req.body.pickupLine2) : undefined,
    pickupCity: req.body.pickupCity !== undefined ? String(req.body.pickupCity) : undefined,
    pickupState: req.body.pickupState !== undefined ? String(req.body.pickupState) : undefined,
    pickupPincode: req.body.pickupPincode !== undefined ? String(req.body.pickupPincode) : undefined,
    pickupMobile: req.body.pickupMobile !== undefined ? String(req.body.pickupMobile).trim() : undefined,
    pickupCountry: req.body.pickupCountry !== undefined ? String(req.body.pickupCountry) : undefined
  } });
  res.json(updated);
});
app.get('/api/seller/products', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  res.json((await prisma.product.findMany({ where: { sellerId: seller.id }, include: { images: true, variants: { include: { images: true } }, category: true, brand: true }, orderBy: { id: 'desc' } })).map(serializeProduct));
});
app.post('/api/seller/products', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(403).json({ error: 'Register as a seller first' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Product name is required' });
  const sku = String(req.body.sku || `SR-${Date.now()}`);
  const slug = `${slugify(name)}-${Date.now()}`;
  const images = cleanImageList(req.body.images);
  const product = await prisma.product.create({ data: { name, sku, slug, description: req.body.description ? String(req.body.description) : undefined, price: Number(req.body.price || 0), mrp: Number(req.body.mrp || req.body.price || 0), stock: Number(req.body.stock || 0), sellerId: seller.id, categoryId: req.body.categoryId || undefined, brandId: req.body.brandId || undefined, approvalStatus: 'PENDING', images: { create: images.map((url, i) => ({ url, sort: i })) } }, include: { images: true } });
  res.status(201).json(serializeProduct(product));
});
app.post('/api/seller/products/:id/variants', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  const product = seller ? await prisma.product.findFirst({ where: { id: String(req.params.id), sellerId: seller.id } }) : null;
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Variant name is required' });
  const sku = String(req.body.sku || `${product.sku}-${Date.now()}`);
  const variant = await prisma.productVariant.create({ data: { productId: product.id, sku, name, attributes: req.body.attributes || {}, price: Number(req.body.price ?? product.price), stock: Math.max(0, Number(req.body.stock || 0)), images: { create: cleanImageList(req.body.images).map((url, i) => ({ url, sort: i })) } }, include: { images: true } });
  await prisma.product.update({ where: { id: product.id }, data: { stock: { increment: variant.stock } } });
  res.status(201).json({ ...variant, price: Number(variant.price) });
});

app.patch('/api/seller/products/:id/variants/:variantId', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  const product = seller ? await prisma.product.findFirst({ where: { id: String(req.params.id), sellerId: seller.id } }) : null;
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const variant = await prisma.productVariant.findFirst({ where: { id: String(req.params.variantId), productId: product.id } });
  if (!variant) return res.status(404).json({ error: 'Variant not found' });
  const data:any = {};
  if (req.body.name !== undefined) data.name = String(req.body.name);
  if (req.body.sku !== undefined) data.sku = String(req.body.sku);
  if (req.body.price !== undefined) data.price = Number(req.body.price);
  if (req.body.stock !== undefined) data.stock = Math.max(0, Number(req.body.stock));
  if (req.body.attributes !== undefined) data.attributes = req.body.attributes;
  const updated = await prisma.productVariant.update({ where: { id: variant.id }, data, include: { images: true } });
  if (req.body.stock !== undefined) await prisma.product.update({ where: { id: product.id }, data: { stock: { increment: updated.stock - variant.stock } } });
  res.json({ ...updated, price: Number(updated.price) });
});

app.delete('/api/seller/products/:id/variants/:variantId', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  const product = seller ? await prisma.product.findFirst({ where: { id: String(req.params.id), sellerId: seller.id } }) : null;
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const variant = await prisma.productVariant.findFirst({ where: { id: String(req.params.variantId), productId: product.id } });
  if (!variant) return res.status(404).json({ error: 'Variant not found' });
  await prisma.productVariant.delete({ where: { id: variant.id } });
  await prisma.product.update({ where: { id: product.id }, data: { stock: { decrement: Math.min(product.stock, variant.stock) } } });
  res.json({ ok: true });
});

app.delete('/api/seller/products/:id', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  const product = await prisma.product.findFirst({ where: { id: String(req.params.id), sellerId: seller.id } });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const ordered = await prisma.orderItem.count({ where: { productId: product.id } });
  if (ordered) return res.status(400).json({ error: 'Products with order history cannot be deleted; remove their images instead.' });
  await prisma.product.delete({ where: { id: product.id } });
  res.json({ ok: true });
});
app.post('/api/seller/products/:id/images', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  const product = seller ? await prisma.product.findFirst({ where: { id: String(req.params.id), sellerId: seller.id } }) : null;
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const url = String(req.body.url || '');
  if (!url) return res.status(400).json({ error: 'Image is required' });
  const count = await prisma.productImage.count({ where: { productId: product.id } });
  if (count >= 12) return res.status(400).json({ error: 'Maximum 12 images per product' });
  const image = await prisma.productImage.create({ data: { productId: product.id, url, sort: count } });
  res.status(201).json(image);
});
app.delete('/api/seller/products/:productId/images/:imageId', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  const product = seller ? await prisma.product.findFirst({ where: { id: String(req.params.productId), sellerId: seller.id } }) : null;
  if (!product) return res.status(404).json({ error: 'Product not found' });
  await prisma.productImage.deleteMany({ where: { id: String(req.params.imageId), productId: product.id } });
  res.json({ ok: true });
});
app.get('/api/seller/orders', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  res.json(await prisma.order.findMany({ where: { sellerId: seller.id }, include: { items: { include: { product: { include: { images: true } } } }, user: { select: { name: true, email: true } }, payments: true, shipments: true, returns: true, activities: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } }));
});
app.patch('/api/seller/orders/:id/schedule', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  const order = await prisma.order.findFirst({ where: { id: String(req.params.id), sellerId: seller.id } });
  if (!order) return res.status(404).json({ error: 'Seller order not found' });
  const delivery = req.body.expectedDeliveryDate ? new Date(String(req.body.expectedDeliveryDate)) : null;
  const pickup = req.body.pickupDate ? new Date(String(req.body.pickupDate)) : null;
  if (delivery && Number.isNaN(delivery.getTime())) return res.status(400).json({ error: 'Invalid expected delivery date' });
  if (pickup && Number.isNaN(pickup.getTime())) return res.status(400).json({ error: 'Invalid pickup date' });
  const stage = String(req.body.sellerStage || order.sellerStage || 'NEW');
  const allowed = ['NEW','PREPARING','READY_FOR_PICKUP','PICKED_UP'];
  if (!allowed.includes(stage)) return res.status(400).json({ error: 'Invalid seller stage' });
  const data: any = { sellerExpectedDeliveryAt: delivery, sellerPickupDate: pickup, sellerStage: stage };
  if (stage === 'READY_FOR_PICKUP' && !order.sellerReadyAt) data.sellerReadyAt = new Date();
  if (stage === 'PICKED_UP' && !order.pickedUpAt) data.pickedUpAt = new Date();
  const updated = await prisma.$transaction(async tx => {
    const o = await tx.order.update({ where: { id: order.id }, data, include: { items: { include: { product: { include: { images: true } } } }, payments: true, shipments: true, returns: true } });
    await addOrderActivity(tx, order.id, req.user!.id, 'SELLER_UPDATE', `Seller updated order: stage ${stage}${delivery ? `, expected delivery ${delivery.toISOString().slice(0,10)}` : ''}${pickup ? `, pickup ${pickup.toISOString().slice(0,10)}` : ''}.`);
    await tx.notification.create({ data: { userId: order.userId, type: 'ORDER', title: 'Seller schedule updated', body: `Order ${order.orderNumber}: ${stage.replaceAll('_',' ')}${delivery ? `; expected delivery ${delivery.toLocaleDateString('en-IN')}` : ''}${pickup ? `; pickup ${pickup.toLocaleDateString('en-IN')}` : ''}.` } });
    return o;
  });
  res.json(updated);
});
app.get('/api/seller/returns', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  res.json(await prisma.return.findMany({ where: { order: { sellerId: seller.id } }, include: { order: { include: { user: { select: { name: true, email: true } }, items: { include: { product: { include: { images: true } } } } } } }, orderBy: { requestedAt: 'desc' } }));
});
app.get('/api/seller/analytics', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  const [products, orders, payouts, pending] = await Promise.all([
    prisma.product.count({ where: { sellerId: seller.id } }),
    prisma.order.count({ where: { sellerId: seller.id } }),
    prisma.sellerPayout.aggregate({ where: { sellerId: seller.id, status: 'PAID' }, _sum: { amount: true } }),
    prisma.sellerPayout.aggregate({ where: { sellerId: seller.id, status: 'PENDING' }, _sum: { amount: true } })
  ]);
  res.json({ products, orders, paidPayouts: Number(payouts._sum.amount || 0), pendingPayouts: Number(pending._sum.amount || 0) });
});

// Admin - no UI link is exposed in the hamburger. Every endpoint is role protected.
app.get('/api/admin/stats', auth, role('ADMIN'), async (_req, res) => {
  const [users, customers, products, pendingProducts, orders, sellers, revenue, commissions, pendingPayouts, pendingPayments, returns, lowStock] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.product.count({ where: { approvalStatus: 'APPROVED' } }),
    prisma.product.count({ where: { approvalStatus: 'PENDING' } }),
    prisma.order.count(),
    prisma.seller.count(),
    prisma.order.aggregate({ where: { status: { not: 'CANCELLED' } }, _sum: { total: true } }),
    prisma.commission.aggregate({ _sum: { amount: true } }),
    prisma.sellerPayout.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.return.count({ where: { status: { in: ['REQUESTED','APPROVED','PICKUP_SCHEDULED','PICKED_UP'] } } }),
    prisma.product.count({ where: { approvalStatus: 'APPROVED', stock: { lte: 5 } } })
  ]);
  res.json({ users, customers, products, pendingProducts, orders, sellers, revenue: Number(revenue._sum.total || 0), commissionRevenue: Number(commissions._sum.amount || 0), pendingSellerPayouts: Number(pendingPayouts._sum.amount || 0), pendingPayments, returns, lowStock, commissionRate: ADMIN_COMMISSION_RATE });
});
app.get('/api/admin/users', auth, role('ADMIN'), async (_req, res) => res.json(await prisma.user.findMany({ select: { id: true, name: true, username: true, email: true, mobile: true, role: true, createdAt: true }, orderBy: { createdAt: 'desc' } })));
app.get('/api/admin/products', auth, role('ADMIN'), async (_req, res) => res.json((await prisma.product.findMany({ include: { images: true, seller: { include: { user: { select: { name: true, email: true, username: true } } } }, category: true, brand: true }, orderBy: { id: 'desc' } })).map(serializeProduct)));
app.patch('/api/admin/products/:id/approval', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  const status = String(req.body.status || 'PENDING');
  if (!['PENDING','APPROVED','REJECTED'].includes(status)) return res.status(400).json({ error: 'Invalid approval status' });
  const product = await prisma.product.update({ where: { id: String(req.params.id) }, data: { approvalStatus: status as any, approvedAt: status === 'APPROVED' ? new Date() : null, approvedBy: status === 'APPROVED' ? req.user!.id : null } });
  if (product.sellerId) {
    const seller = await prisma.seller.findUnique({ where: { id: product.sellerId } });
    if (seller) await prisma.notification.create({ data: { userId: seller.userId, type: 'PRODUCT', title: `Product ${status.toLowerCase()}`, body: `${product.name} is now ${status.toLowerCase()} by SheRise admin.` } });
  }
  res.json(product);
});
app.delete('/api/admin/products/:id', auth, role('ADMIN'), async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const ordered = await prisma.orderItem.count({ where: { productId: product.id } });
  if (ordered) return res.status(400).json({ error: 'Products with order history cannot be deleted' });
  await prisma.product.delete({ where: { id: product.id } });
  res.json({ ok: true });
});
app.get('/api/admin/orders', auth, role('ADMIN'), async (_req, res) => res.json(await prisma.order.findMany({ include: { user: { select: { name: true, email: true, mobile: true } }, seller: { include: { user: { select: { name: true, email: true, username: true, mobile: true } } } }, items: { include: { product: { include: { images: true } } } }, payments: true, shipments: true, returns: true, activities: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } })));
app.patch('/api/admin/orders/:id/status', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  const status = String(req.body.status);
  const allowed = ['PLACED','CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const updated = await prisma.$transaction(async tx => {
    const o = await tx.order.update({ where: { id: String(req.params.id) }, data: { status: status as any } });
    await addOrderActivity(tx, o.id, req.user!.id, 'ADMIN_STATUS', `Admin changed order status to ${status.replaceAll('_',' ')}.`);
    await tx.notification.create({ data: { userId: o.userId, type: 'ORDER', title: 'Order status updated', body: `Order ${o.orderNumber} is now ${status.replaceAll('_', ' ')}.` } });
    return o;
  });
  res.json(updated);
});
app.patch('/api/admin/orders/:id/shipment', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  const order = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const shipment = await prisma.shipment.findFirst({ where: { orderId: order.id } });
  const data = { carrier: req.body.carrier ? String(req.body.carrier) : undefined, trackingNumber: req.body.trackingNumber ? String(req.body.trackingNumber) : undefined, status: req.body.status ? String(req.body.status) : undefined };
  const updated = shipment ? await prisma.shipment.update({ where: { id: shipment.id }, data }) : await prisma.shipment.create({ data: { orderId: order.id, carrier: data.carrier, trackingNumber: data.trackingNumber, status: data.status || 'CREATED' } });
  await prisma.$transaction(async tx => {
    await addOrderActivity(tx, order.id, req.user!.id, 'TRACKING_UPDATE', `Admin updated tracking${updated.trackingNumber ? `: ${updated.trackingNumber}` : ''}.`);
    await tx.notification.create({ data: { userId: order.userId, type: 'SHIPMENT', title: 'Tracking updated', body: `Tracking for order ${order.orderNumber} has been updated.` } });
  });
  res.json(updated);
});
app.post('/api/admin/orders/:id/shiprocket', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const order: any = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: { items: { include: { product: true, variant: true } }, payments: true, shipments: true } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const weight = Math.max(.1, order.items.reduce((sum, i) => sum + ((i.product.weightGrams || 500) * i.quantity), 0) / 1000);
    const data = await shiprocketRequest('/orders/create/adhoc', { method: 'POST', body: JSON.stringify({ order_id: order.orderNumber, order_date: order.createdAt.toISOString().slice(0,10), pickup_location: SHIPROCKET_PICKUP_LOCATION, billing_customer_name: order.shippingName || 'Customer', billing_address: order.shippingLine1 || '', billing_address_2: order.shippingLine2 || '', billing_city: order.shippingCity || '', billing_pincode: order.shippingPincode || '', billing_state: order.shippingState || '', billing_country: order.shippingCountry || 'India', billing_email: '', billing_phone: '', shipping_is_billing: true, order_items: order.items.map(i => ({ name: i.product.name, sku: i.variant?.sku || i.product.sku, units: i.quantity, selling_price: Number(i.price) })), payment_method: order.payments?.[0]?.method === 'COD' ? 'COD' : 'Prepaid', sub_total: Number(order.subtotal), length: Math.max(...order.items.map(i=>i.product.lengthCm||20)), breadth: Math.max(...order.items.map(i=>i.product.widthCm||15)), height: Math.max(...order.items.map(i=>i.product.heightCm||5)), weight }) });
    const srOrderId = data?.order_id;
    const shipmentId = data?.shipment_id;
    let shipmentData:any = { provider: 'SHIPROCKET', providerOrderId: srOrderId ? String(srOrderId) : undefined, providerShipmentId: shipmentId ? String(shipmentId) : undefined, status: 'CREATED' };
    if (shipmentId) {
      try {
        const awb = await shiprocketRequest('/courier/assign/awb', { method: 'POST', body: JSON.stringify({ shipment_id: shipmentId }) });
        shipmentData.trackingNumber = awb?.response?.data?.awb_code || awb?.awb_code;
        shipmentData.carrier = awb?.response?.data?.courier_name || awb?.courier_name;
      } catch {}
    }
    const shipment = order.shipments[0] ? await prisma.shipment.update({ where: { id: order.shipments[0].id }, data: shipmentData }) : await prisma.shipment.create({ data: { orderId: order.id, ...shipmentData } });
    await prisma.order.update({ where: { id: order.id }, data: { status: 'SHIPPED' } });
    await addOrderActivity(prisma, order.id, req.user!.id, 'SHIPROCKET_CREATED', `Shipment created${shipment.trackingNumber ? ` with AWB ${shipment.trackingNumber}` : ''}.`);
    res.json(shipment);
  } catch (e:any) { res.status(503).json({ error: e?.message || 'Could not create Shiprocket shipment' }); }
});

app.get('/api/admin/shipping/serviceability', auth, role('ADMIN'), async (req, res) => {
  try { const result = await shippingEstimate(String(req.query.pickupPostcode || process.env.SHIPROCKET_PICKUP_PINCODE || '411001'), String(req.query.deliveryPostcode || ''), Number(req.query.weightKg || .5), String(req.query.cod || 'false') === 'true', Number(req.query.value || 0)); res.json(result); }
  catch (e:any) { res.status(503).json({ error: e?.message || 'Shipping serviceability unavailable' }); }
});

app.post('/api/admin/payments/:id/refund', auth, role('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params.id) }, include: { order: true } });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (!['VERIFIED','CAPTURED'].includes(payment.status)) return res.status(400).json({ error: 'Only verified payments can be refunded' });
    const amount = Math.max(0, Math.min(Number(req.body.amount || payment.amount), Number(payment.amount)));
    const refund = await prisma.refund.create({ data: { paymentId: payment.id, orderId: payment.orderId, amount, status: 'PENDING', provider: payment.provider || 'MANUAL', reason: String(req.body.reason || 'Customer refund') } });
    await prisma.notification.create({ data: { userId: payment.order.userId, type: 'REFUND', title: 'Refund requested', body: `₹${amount.toFixed(2)} refund has been recorded for order ${payment.order.orderNumber}.` } });
    res.json(refund);
  } catch (e:any) { res.status(500).json({ error: e?.message || 'Refund failed' }); }
});

app.get('/api/admin/payments', auth, role('ADMIN'), async (_req, res) => res.json(await prisma.payment.findMany({ include: { order: { include: { user: { select: { name: true, email: true } }, seller: { include: { user: { select: { name: true, email: true } } } } } } }, orderBy: { id: 'desc' } })));
app.patch('/api/admin/payments/:id/verify', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  const updated = await prisma.$transaction(async tx => {
    const p = await tx.payment.update({ where: { id: payment.id }, data: { status: 'VERIFIED' } });
    const verifiedOrder = await tx.order.update({ where: { id: p.orderId }, data: { status: 'CONFIRMED' } });
    await createPayoutForVerifiedPayment(tx, p, req.user!.id);
    await tx.notification.create({ data: { userId: verifiedOrder.userId, type: 'PAYMENT', title: 'Payment verified', body: `Payment for order ${verifiedOrder.orderNumber} has been verified by SheRise admin.` } });
    return p;
  });
  res.json(updated);
});
app.get('/api/admin/returns', auth, role('ADMIN'), async (_req, res) => res.json(await prisma.return.findMany({ include: { order: { include: { user: { select: { name: true, email: true, mobile: true } }, seller: { include: { user: { select: { name: true, email: true } } } }, items: { include: { product: { include: { images: true } } } }, activities: { orderBy: { createdAt: 'asc' } } } } }, orderBy: { requestedAt: 'desc' } })));
app.patch('/api/admin/returns/:id/status', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  const status = String(req.body.status || 'REQUESTED');
  const allowed = ['REQUESTED','APPROVED','PICKUP_SCHEDULED','PICKED_UP','REFUNDED','REJECTED'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid return status' });
  const ret = await prisma.return.findUnique({ where: { id: String(req.params.id) } });
  if (!ret) return res.status(404).json({ error: 'Return not found' });
  const updated = await prisma.$transaction(async tx => {
    const r = await tx.return.update({ where: { id: ret.id }, data: { status, adminNote: req.body.adminNote ? String(req.body.adminNote) : undefined, resolvedAt: ['REFUNDED','REJECTED'].includes(status) ? new Date() : undefined } });
    await addOrderActivity(tx, ret.orderId, req.user!.id, 'RETURN_UPDATE', `Admin changed return status to ${status.replaceAll('_',' ')}.`);
    const order = await tx.order.findUnique({ where: { id: ret.orderId } });
    if (order) await tx.notification.create({ data: { userId: order.userId, type: 'RETURN', title: 'Return updated', body: `Return for order ${order.orderNumber} is now ${status.replaceAll('_',' ')}.` } });
    return r;
  });
  res.json(updated);
});
app.get('/api/admin/activities', auth, role('ADMIN'), async (_req, res) => res.json(await prisma.orderActivity.findMany({ include: { order: { select: { orderNumber: true, userId: true, sellerId: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })));

app.get('/api/admin/payouts', auth, role('ADMIN'), async (_req, res) => res.json(await prisma.sellerPayout.findMany({ include: { seller: { include: { user: { select: { id: true, name: true, username: true, email: true, mobile: true } } } } }, orderBy: { createdAt: 'desc' } })));
app.patch('/api/admin/payouts/:id/paid', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  const payout = await prisma.sellerPayout.findUnique({ where: { id: String(req.params.id) } });
  if (!payout) return res.status(404).json({ error: 'Payout not found' });
  const updated = await prisma.sellerPayout.update({ where: { id: payout.id }, data: { status: 'PAID' } });
  const seller = await prisma.seller.findUnique({ where: { id: payout.sellerId } });
  if (seller) await prisma.notification.create({ data: { userId: seller.userId, type: 'PAYOUT', title: 'Seller payout marked paid', body: `₹${Number(payout.amount).toFixed(2)} has been marked as paid by SheRise admin.` } });
  res.json(updated);
});
app.get('/api/admin/sellers', auth, role('ADMIN'), async (_req, res) => res.json(await prisma.seller.findMany({ include: { user: { select: { id: true, name: true, username: true, email: true, mobile: true } }, payouts: { orderBy: { createdAt: 'desc' } }, commissions: true, products: { include: { images: true } } }, orderBy: { businessName: 'asc' } })));
app.get('/api/admin/sellers/:id', auth, role('ADMIN'), async (req, res) => {
  const seller = await prisma.seller.findUnique({ where: { id: String(req.params.id) }, include: { user: { select: { id: true, name: true, username: true, email: true, mobile: true } }, payouts: { orderBy: { createdAt: 'desc' } }, commissions: true, products: { include: { images: true } } } });
  if (!seller) return res.status(404).json({ error: 'Seller not found' });
  res.json(seller);
});
app.get('/api/admin/coupons', auth, role('ADMIN'), async (_req, res) => res.json(await prisma.coupon.findMany({ orderBy: { code: 'asc' } })));
app.post('/api/admin/coupons', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Coupon code is required' });
  const coupon = await prisma.coupon.create({ data: { code, type: String(req.body.type || 'PERCENT'), value: Number(req.body.value || 0), minOrder: req.body.minOrder ? Number(req.body.minOrder) : undefined, maxDiscount: req.body.maxDiscount ? Number(req.body.maxDiscount) : undefined, expiresAt: req.body.expiresAt ? new Date(String(req.body.expiresAt)) : undefined, active: req.body.active !== false } });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'COUPON_CREATED', entity: 'Coupon', entityId: coupon.id } });
  res.status(201).json(coupon);
});
app.patch('/api/admin/coupons/:id', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  const coupon = await prisma.coupon.update({ where: { id: String(req.params.id) }, data: { active: req.body.active !== undefined ? Boolean(req.body.active) : undefined, value: req.body.value !== undefined ? Number(req.body.value) : undefined, minOrder: req.body.minOrder !== undefined ? Number(req.body.minOrder) : undefined, maxDiscount: req.body.maxDiscount !== undefined ? Number(req.body.maxDiscount) : undefined, expiresAt: req.body.expiresAt !== undefined && req.body.expiresAt ? new Date(String(req.body.expiresAt)) : undefined } });
  res.json(coupon);
});

app.get('/api/admin/settings', auth, role('ADMIN'), async (_req, res) => res.json({ customerScannerUrl: await customerScanner(), commissionRate: ADMIN_COMMISSION_RATE }));
app.patch('/api/admin/settings/customer-scanner', auth, role('ADMIN'), async (req: AuthRequest, res) => {
  const scannerUrl = String(req.body.scannerUrl || '');
  const setting = await prisma.platformSetting.upsert({ where: { key: 'CUSTOMER_PAYMENT_SCANNER' }, update: { value: scannerUrl }, create: { key: 'CUSTOMER_PAYMENT_SCANNER', value: scannerUrl } });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CUSTOMER_SCANNER_UPDATED', entity: 'PlatformSetting', entityId: setting.id } });
  res.json({ scannerUrl: setting.value });
});


// Advanced marketplace foundation: every endpoint below writes/reads real database state.
app.get('/api/products/:id/offers', optionalAuth, async (req, res) => {
  const productId = String(req.params.id);
  const offers = await prisma.productOffer.findMany({ where: { productId, active: true }, include: { seller: { select: { id: true, businessName: true, user: { select: { name: true } } } } }, orderBy: [{ featured: 'desc' }, { price: 'asc' }] });
  res.json(offers.map((o:any) => ({ ...o, price: Number(o.price), mrp: Number(o.mrp), minPrice: o.minPrice ? Number(o.minPrice) : null, maxPrice: o.maxPrice ? Number(o.maxPrice) : null, scheduledPrice: o.scheduledPrice ? Number(o.scheduledPrice) : null, sellerName: o.seller?.businessName || o.seller?.user?.name || 'SheRise Seller' })));
});

app.get('/api/products/:id/questions', async (req, res) => {
  const rows = await prisma.productQuestion.findMany({ where: { productId: String(req.params.id) }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
  res.json(rows);
});
app.post('/api/products/:id/questions', auth, async (req: AuthRequest, res) => {
  const question = String(req.body.question || '').trim();
  if (!question) return res.status(400).json({ error: 'Question is required' });
  const product = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
  if (!product || product.approvalStatus !== 'APPROVED') return res.status(404).json({ error: 'Product not found' });
  const row = await prisma.productQuestion.create({ data: { productId: product.id, userId: req.user!.id, question } });
  res.status(201).json(row);
});

app.post('/api/reviews/:id/helpful', auth, async (req, res) => {
  const row = await prisma.review.update({ where: { id: String(req.params.id) }, data: { helpfulCount: { increment: 1 } } });
  res.json({ helpfulCount: row.helpfulCount });
});
app.post('/api/reviews/:id/report', auth, async (req, res) => {
  const row = await prisma.review.update({ where: { id: String(req.params.id) }, data: { reported: true } });
  await prisma.auditLog.create({ data: { userId: (req as AuthRequest).user!.id, action: 'REVIEW_REPORTED', entity: 'Review', entityId: row.id } });
  res.json({ ok: true });
});

app.post('/api/activity/event', optionalAuth, async (req: AuthRequest, res) => {
  const eventType = String(req.body.eventType || '').trim();
  const productId = req.body.productId ? String(req.body.productId) : undefined;
  if (!eventType) return res.status(400).json({ error: 'eventType is required' });
  const row = await prisma.recommendationEvent.create({ data: { userId: req.user?.id, productId, eventType, query: req.body.query ? String(req.body.query) : undefined, categoryId: req.body.categoryId ? String(req.body.categoryId) : undefined, price: req.body.price !== undefined ? Number(req.body.price) : undefined, metadata: req.body.metadata ?? undefined } });
  res.status(201).json({ id: row.id });
});

app.get('/api/recommendations', optionalAuth, async (req: AuthRequest, res) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit || 12)));
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  const viewed = req.user ? await prisma.recommendationEvent.findMany({ where: { userId: req.user.id, productId: { not: null }, eventType: { in: ['VIEW','CLICK','WISHLIST','CART','PURCHASE'] } }, orderBy: { createdAt: 'desc' }, take: 30 }) : [];
  const ids = [...new Set(viewed.map(x => x.productId).filter(Boolean) as string[])];
  const candidates = await prisma.product.findMany({ where: { approvalStatus: 'APPROVED', ...(categoryId ? { categoryId } : {}), ...(ids.length ? { id: { notIn: ids } } : {}) }, include: { images: { orderBy: { sort: 'asc' }, take: 1 }, brand: true, category: true, reviews: { select: { rating: true } } }, orderBy: { createdAt: 'desc' }, take: 80 });
  const scored = candidates.map((p:any) => ({ p, score: (p.reviews.length ? p.reviews.reduce((a:number,r:any)=>a+r.rating,0)/p.reviews.length : 0) + Math.min(5, Number(p.stock)/20) })).sort((a:any,b:any)=>b.score-a.score).slice(0,limit).map((x:any)=>serializeProduct(x.p));
  res.json(scored);
});

app.get('/api/seller/offers', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  const rows = await prisma.productOffer.findMany({ where: { sellerId: seller.id }, include: { product: { select: { id: true, name: true, sku: true } } }, orderBy: { updatedAt: 'desc' } });
  res.json(rows.map((x:any)=>({...x,price:Number(x.price),mrp:Number(x.mrp),minPrice:x.minPrice?Number(x.minPrice):null,maxPrice:x.maxPrice?Number(x.maxPrice):null,scheduledPrice:x.scheduledPrice?Number(x.scheduledPrice):null})));
});
app.post('/api/seller/offers', auth, role('SELLER'), async (req: AuthRequest, res) => {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } });
  if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
  const product = await prisma.product.findFirst({ where: { id: String(req.body.productId || ''), sellerId: seller.id } });
  if (!product) return res.status(404).json({ error: 'Seller product not found' });
  const price = Number(req.body.price); const mrp = Number(req.body.mrp ?? product.mrp); const stock = Math.max(0, Number(req.body.stock ?? product.stock));
  if (!(price > 0) || !(mrp >= price)) return res.status(400).json({ error: 'Valid price and MRP are required' });
  const row = await prisma.productOffer.upsert({ where: { productId_sellerId: { productId: product.id, sellerId: seller.id } }, update: { price, mrp, stock, minPrice: req.body.minPrice !== undefined ? Number(req.body.minPrice) : undefined, maxPrice: req.body.maxPrice !== undefined ? Number(req.body.maxPrice) : undefined, fulfillmentMode: req.body.fulfillmentMode ? String(req.body.fulfillmentMode) : undefined, active: req.body.active !== false }, create: { productId: product.id, sellerId: seller.id, price, mrp, stock, minPrice: req.body.minPrice !== undefined ? Number(req.body.minPrice) : undefined, maxPrice: req.body.maxPrice !== undefined ? Number(req.body.maxPrice) : undefined, fulfillmentMode: String(req.body.fulfillmentMode || 'SELF_SHIP') } });
  res.status(201).json(row);
});

app.get('/api/seller/price-rules', auth, role('SELLER'), async (req: AuthRequest,res) => {
  const seller=await prisma.seller.findUnique({where:{userId:req.user!.id}}); if(!seller)return res.status(404).json({error:'Seller profile not found'});
  res.json(await prisma.priceRule.findMany({where:{sellerId:seller.id},include:{product:{select:{name:true,sku:true}}},orderBy:{createdAt:'desc'}}));
});
app.post('/api/seller/price-rules', auth, role('SELLER'), async (req: AuthRequest,res) => {
  const seller=await prisma.seller.findUnique({where:{userId:req.user!.id}}); if(!seller)return res.status(404).json({error:'Seller profile not found'});
  const min=Number(req.body.minPrice), max=Number(req.body.maxPrice), value=Number(req.body.value); if(!(min>0)||!(max>=min)||!(value>=0))return res.status(400).json({error:'Invalid price rule'});
  const row=await prisma.priceRule.create({data:{sellerId:seller.id,productId:req.body.productId?String(req.body.productId):undefined,minPrice:min,maxPrice:max,mode:String(req.body.mode||'FIXED'),value,startsAt:req.body.startsAt?new Date(String(req.body.startsAt)):undefined,endsAt:req.body.endsAt?new Date(String(req.body.endsAt)):undefined}}); res.status(201).json(row);
});

app.get('/api/seller/warehouses', auth, role('SELLER'), async (req: AuthRequest,res) => {
  const seller=await prisma.seller.findUnique({where:{userId:req.user!.id}}); if(!seller)return res.status(404).json({error:'Seller profile not found'});
  res.json(await prisma.warehouse.findMany({where:{sellerId:seller.id},include:{inventory:{include:{product:{select:{name:true,sku:true}},warehouse:true}}},orderBy:{name:'asc'}}));
});
app.post('/api/seller/warehouses', auth, role('SELLER'), async (req: AuthRequest,res) => {
  const seller=await prisma.seller.findUnique({where:{userId:req.user!.id}}); if(!seller)return res.status(404).json({error:'Seller profile not found'});
  const name=String(req.body.name||'').trim(), code=String(req.body.code||'').trim().toUpperCase(); if(!name||!code)return res.status(400).json({error:'Warehouse name and code are required'});
  const row=await prisma.warehouse.create({data:{sellerId:seller.id,name,code,line1:String(req.body.line1||''),line2:req.body.line2?String(req.body.line2):undefined,city:String(req.body.city||''),state:String(req.body.state||''),pincode:String(req.body.pincode||'')}}); res.status(201).json(row);
});
app.post('/api/seller/warehouses/:id/inventory', auth, role('SELLER'), async (req: AuthRequest,res) => {
  const seller=await prisma.seller.findUnique({where:{userId:req.user!.id}}); const warehouse=seller?await prisma.warehouse.findFirst({where:{id:String(req.params.id),sellerId:seller.id}}):null; if(!warehouse)return res.status(404).json({error:'Warehouse not found'});
  const productId=String(req.body.productId||''); const product=seller?await prisma.product.findFirst({where:{id:productId,sellerId:seller.id}}):null; if(!product)return res.status(404).json({error:'Product not found'});
  const quantity=Math.max(0,Number(req.body.onHand||0)); const variantId=req.body.variantId?String(req.body.variantId):'';
  const row=await prisma.warehouseInventory.upsert({where:{warehouseId_productId_variantId:{warehouseId:warehouse.id,productId,variantId}},update:{onHand:quantity,reserved:Math.min(Number(req.body.reserved||0),quantity),reorderPoint:Math.max(0,Number(req.body.reorderPoint||0))},create:{warehouseId:warehouse.id,productId,variantId,onHand:quantity,reserved:Math.min(Number(req.body.reserved||0),quantity),reorderPoint:Math.max(0,Number(req.body.reorderPoint||0))}}); res.json(row);
});

app.get('/api/seller/ledger', auth, role('SELLER'), async (req: AuthRequest,res) => { const seller=await prisma.seller.findUnique({where:{userId:req.user!.id}}); if(!seller)return res.status(404).json({error:'Seller profile not found'}); const rows=await prisma.sellerLedgerEntry.findMany({where:{sellerId:seller.id},orderBy:{createdAt:'desc'},take:200}); res.json(rows.map((x:any)=>({...x,amount:Number(x.amount)}))); });
app.get('/api/seller/performance', auth, role('SELLER'), async (req: AuthRequest,res) => { const seller=await prisma.seller.findUnique({where:{userId:req.user!.id}}); if(!seller)return res.status(404).json({error:'Seller profile not found'}); const latest=await prisma.sellerPerformanceMetric.findFirst({where:{sellerId:seller.id},orderBy:{periodEnd:'desc'}}); const [orders,cancelled,returns,late]=await Promise.all([prisma.order.count({where:{sellerId:seller.id}}),prisma.order.count({where:{sellerId:seller.id,status:'CANCELLED'}}),prisma.return.count({where:{order:{sellerId:seller.id}}}),prisma.order.count({where:{sellerId:seller.id,sellerStage:'NEW'}})]); const metric=latest||{healthStatus:'HEALTHY',orderDefectRate:0,cancellationRate:orders?cancelled/orders*100:0,lateDispatchRate:orders?late/orders*100:0,returnRate:orders?returns/orders*100:0,complaintCount:0,policyViolationCount:0,authenticityComplaintCount:0}; res.json(metric); });

app.get('/api/seller/ads', auth, role('SELLER'), async (req: AuthRequest,res) => { const seller=await prisma.seller.findUnique({where:{userId:req.user!.id}}); if(!seller)return res.status(404).json({error:'Seller profile not found'}); const rows=await prisma.advertisingCampaign.findMany({where:{sellerId:seller.id},include:{events:true},orderBy:{createdAt:'desc'}}); res.json(rows.map((x:any)=>({...x,budget:Number(x.budget),spend:Number(x.spend),clicks:x.events.filter((e:any)=>e.type==='CLICK').length,impressions:x.events.filter((e:any)=>e.type==='IMPRESSION').length}))); });
app.post('/api/seller/ads', auth, role('SELLER'), async (req: AuthRequest,res) => { const seller=await prisma.seller.findUnique({where:{userId:req.user!.id}}); if(!seller)return res.status(404).json({error:'Seller profile not found'}); const name=String(req.body.name||'').trim(); const budget=Number(req.body.budget||0); if(!name||budget<=0)return res.status(400).json({error:'Campaign name and positive budget are required'}); const row=await prisma.advertisingCampaign.create({data:{sellerId:seller.id,name,budget,startsAt:req.body.startsAt?new Date(String(req.body.startsAt)):undefined,endsAt:req.body.endsAt?new Date(String(req.body.endsAt)):undefined}}); res.status(201).json(row); });

app.get('/api/admin/warehouses', auth, role('ADMIN'), async (_req,res) => res.json(await prisma.warehouse.findMany({include:{seller:{include:{user:{select:{name:true,email:true}}}},inventory:true},orderBy:{name:'asc'}})));
app.get('/api/admin/fulfillment', auth, role('ADMIN'), async (_req,res) => res.json(await prisma.fulfillmentTask.findMany({include:{order:{select:{orderNumber:true,status:true,total:true}},warehouse:true},orderBy:{createdAt:'desc'},take:200})));
app.post('/api/admin/fulfillment/:orderId/task', auth, role('ADMIN'), async (req: AuthRequest,res) => { const order=await prisma.order.findUnique({where:{id:String(req.params.orderId)}}); if(!order)return res.status(404).json({error:'Order not found'}); const task=await prisma.fulfillmentTask.create({data:{orderId:order.id,warehouseId:req.body.warehouseId?String(req.body.warehouseId):undefined,stage:String(req.body.stage||'PICK'),assignedTo:req.body.assignedTo?String(req.body.assignedTo):undefined}}); await addOrderActivity(prisma,order.id,req.user!.id,'FULFILLMENT_TASK',`Fulfillment task created: ${task.stage}.`); res.status(201).json(task); });
app.patch('/api/admin/fulfillment/:id', auth, role('ADMIN'), async (req,res) => { const status=String(req.body.status||'PENDING'); const allowed=['PENDING','IN_PROGRESS','COMPLETED','CANCELLED']; if(!allowed.includes(status))return res.status(400).json({error:'Invalid fulfillment status'}); const task=await prisma.fulfillmentTask.update({where:{id:String(req.params.id)},data:{status,stage:req.body.stage?String(req.body.stage):undefined,completedAt:status==='COMPLETED'?new Date():undefined}}); res.json(task); });
app.get('/api/admin/seller-performance', auth, role('ADMIN'), async (_req,res) => { const sellers=await prisma.seller.findMany({include:{user:{select:{name:true,email:true}},performanceMetrics:{orderBy:{periodEnd:'desc'},take:1}}}); res.json(sellers.map((s:any)=>({id:s.id,businessName:s.businessName,user:s.user,metric:s.performanceMetrics[0]||null}))); });
app.get('/api/admin/ledger', auth, role('ADMIN'), async (_req,res) => { const rows=await prisma.sellerLedgerEntry.findMany({include:{seller:{include:{user:{select:{name:true,email:true}}}},order:true},orderBy:{createdAt:'desc'},take:500}); res.json(rows.map((x:any)=>({...x,amount:Number(x.amount)}))); });
app.get('/api/admin/recommendation-events', auth, role('ADMIN'), async (_req,res) => res.json(await prisma.recommendationEvent.findMany({orderBy:{createdAt:'desc'},take:500})));
app.get('/api/admin/ad-campaigns', auth, role('ADMIN'), async (_req,res) => res.json(await prisma.advertisingCampaign.findMany({include:{seller:{include:{user:{select:{name:true,email:true}}}},events:true},orderBy:{createdAt:'desc'}})));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

app.listen(PORT, () => console.log(`SheRise API running on http://localhost:${PORT}`));
