import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const images = [
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=900&q=80'
];

async function main() {
  const adminPassword = await bcrypt.hash('Admin@12345', 12);
  const sellerPassword = await bcrypt.hash('Seller@12345', 12);

  await prisma.user.upsert({ where: { email: 'admin@sherise.local' }, update: { username: 'admin', role: 'ADMIN' }, create: { name: 'SheRise Admin', email: 'admin@sherise.local', username: 'admin', passwordHash: adminPassword, role: 'ADMIN' } });
  const sellerUser = await prisma.user.upsert({ where: { email: 'seller@sherise.local' }, update: { username: 'seller', role: 'SELLER' }, create: { name: 'SheRise Seller', email: 'seller@sherise.local', username: 'seller', passwordHash: sellerPassword, role: 'SELLER' } });
  const seller = await prisma.seller.upsert({ where: { userId: sellerUser.id }, update: { businessName: 'SheRise Store', kycStatus: 'VERIFIED', pickupLine1: 'Demo Seller Pickup Centre', pickupCity: 'Pune', pickupState: 'Maharashtra', pickupPincode: '411001', pickupCountry: 'India' }, create: { userId: sellerUser.id, businessName: 'SheRise Store', kycStatus: 'VERIFIED', pickupLine1: 'Demo Seller Pickup Centre', pickupCity: 'Pune', pickupState: 'Maharashtra', pickupPincode: '411001', pickupCountry: 'India' } });

  const categoryData = [
    ['Fashion','fashion'], ['Beauty','beauty'], ['Jewellery','jewellery'], ['Electronics','electronics'],
    ['Home & Kitchen','home-kitchen'], ['Grocery','grocery'], ['Accessories','accessories'], ['Gifts','gifts']
  ];
  const categories: Record<string,string> = {};
  for (const [name, slug] of categoryData) categories[slug] = (await prisma.category.upsert({ where: { slug }, update: { name }, create: { name, slug } })).id;

  const brandData = [['SheRise Essentials','sherise-essentials'],['Aura','aura'],['Nova','nova'],['Bloom','bloom']];
  const brands: Record<string,string> = {};
  for (const [name, slug] of brandData) brands[slug] = (await prisma.brand.upsert({ where: { slug }, update: { name }, create: { name, slug } })).id;

  const products = [
    ['SR-FASH-001','Classic Cotton Shirt','fashion','aura',899,1499,38],
    ['SR-ELEC-001','Wireless Headphones','electronics','nova',2499,3999,22],
    ['SR-HOME-001','Kitchen Organizer','home-kitchen','sherise-essentials',699,999,45],
    ['SR-FASH-002','Everyday Running Shoes','fashion','nova',1999,2999,31],
    ['SR-ELEC-002','Smart Watch','electronics','nova',3299,4999,18],
    ['SR-BEAU-001','Daily Skin Care Set','beauty','bloom',1299,1999,27],
    ['SR-JEW-001','Minimal Gold-Tone Earrings','jewellery','aura',599,999,50],
    ['SR-FASH-003','Printed Kurti','fashion','bloom',1199,1899,35],
    ['SR-HOME-002','Soft Cushion Set','home-kitchen','sherise-essentials',799,1299,29],
    ['SR-ACC-001','Everyday Tote Bag','accessories','aura',899,1499,40],
    ['SR-GIFT-001','Self-Care Gift Box','gifts','bloom',1499,2299,16],
    ['SR-GROC-001','Healthy Snack Combo','grocery','sherise-essentials',499,699,60]
  ];

  for (let i=0; i<products.length; i++) {
    const [sku,name,cat,brand,price,mrp,stock] = products[i] as any[];
    const slug = `${String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${sku.toLowerCase()}`;
    const p = await prisma.product.upsert({
      where: { sku },
      update: { name, price, mrp, stock, categoryId: categories[cat], brandId: brands[brand], sellerId: seller.id, approvalStatus: 'APPROVED', approvedAt: new Date() },
      create: { sku, name, slug, description: `${name} from the SheRise marketplace. Quality-focused everyday choice for you and your home.`, price, mrp, stock, categoryId: categories[cat], brandId: brands[brand], sellerId: seller.id, approvalStatus: 'APPROVED', approvedAt: new Date() }
    });
    const existingImage = await prisma.productImage.findFirst({ where: { productId: p.id } });
    if (!existingImage) await prisma.productImage.create({ data: { productId: p.id, url: images[i % images.length], alt: name, sort: 0 } });
  }

  const coupon = await prisma.coupon.findUnique({ where: { code: 'WELCOME10' } });
  if (!coupon) await prisma.coupon.create({ data: { code: 'WELCOME10', type: 'PERCENT', value: 10, minOrder: 499, maxDiscount: 300, active: true } });

  const bannerCount = await prisma.banner.count();
  if (!bannerCount) await prisma.banner.create({ data: { title: 'SheRise — made for every journey', imageUrl: images[6], link: '/shop', active: true } });

  const offerCount = await prisma.offer.count();
  if (!offerCount) await prisma.offer.create({ data: { title: 'Welcome offer', description: 'Save 10% with WELCOME10', discount: 10, startsAt: new Date(), endsAt: new Date(Date.now()+30*24*60*60*1000), active: true } });

  console.log('SheRise seed complete');
  console.log('Admin: admin / Admin@12345 (or admin@sherise.local / Admin@12345)');
  console.log('Seller: seller / Seller@12345 (or seller@sherise.local / Seller@12345)');
  console.log('Coupon: WELCOME10');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
