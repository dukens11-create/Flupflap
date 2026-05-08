import {
  PrismaClient,
  Role,
  ProductStatus,
  SellerPhoneVerificationStatus,
  SellerVerificationStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
async function main(){
  const pass = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({ where:{email:'guest@flupflap.local'}, update:{}, create:{name:'Guest Buyer',email:'guest@flupflap.local',password:'',role:Role.CUSTOMER} });
  const admin = await prisma.user.upsert({ where:{email:'admin@flupflap.com'}, update:{}, create:{name:'FlupFlap Admin',email:'admin@flupflap.com',password:pass,role:Role.ADMIN} });
  const seller = await prisma.user.upsert({ where:{email:'seller@flupflap.com'}, update:{}, create:{name:'Demo Seller',email:'seller@flupflap.com',password:pass,role:Role.SELLER,phone:'+15005550006'} });
  await prisma.sellerVerification.upsert({
    where: { sellerId: seller.id },
    update: {
      status: SellerVerificationStatus.APPROVED,
      rejectionReason: null,
      phoneNumber: '+15005550006',
      phoneVerificationStatus: SellerPhoneVerificationStatus.VERIFIED,
      street: '123 Demo Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      country: 'US',
      governmentIdFrontPublicId: 'seed/government-id-front',
      governmentIdFrontFormat: 'jpg',
      governmentIdBackPublicId: 'seed/government-id-back',
      governmentIdBackFormat: 'jpg',
      selfieImagePublicId: 'seed/selfie',
      selfieImageFormat: 'jpg',
    },
    create: {
      sellerId: seller.id,
      status: SellerVerificationStatus.APPROVED,
      rejectionReason: null,
      phoneNumber: '+15005550006',
      phoneVerificationStatus: SellerPhoneVerificationStatus.VERIFIED,
      street: '123 Demo Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      country: 'US',
      governmentIdFrontPublicId: 'seed/government-id-front',
      governmentIdFrontFormat: 'jpg',
      governmentIdBackPublicId: 'seed/government-id-back',
      governmentIdBackFormat: 'jpg',
      selfieImagePublicId: 'seed/selfie',
      selfieImageFormat: 'jpg',
    },
  });
  const count = await prisma.product.count();
  if(count===0){ await prisma.product.createMany({ data:[
    {title:'Used iPhone 13',description:'Clean used phone, unlocked, good battery.',priceCents:32900,condition:'Used',category:'Electronics',imageUrl:'https://images.unsplash.com/photo-1592750475338-74b7b21085ab',status:ProductStatus.APPROVED,sellerId:seller.id,shippingCents:1299,inventory:1},
    {title:'New Wireless Headphones',description:'Brand new Bluetooth headphones with case.',priceCents:4900,condition:'New',category:'Electronics',imageUrl:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',status:ProductStatus.APPROVED,sellerId:seller.id,shippingCents:599,inventory:5},
    {title:'Used Office Chair',description:'Comfortable office chair in good condition.',priceCents:8500,condition:'Used',category:'Furniture',imageUrl:'https://images.unsplash.com/photo-1586023492125-27b2c045efd7',status:ProductStatus.APPROVED,sellerId:seller.id,shippingCents:2500,inventory:1}
  ]});}
  console.log({admin: admin.email, seller: seller.email, password:'password123'});
}
main().finally(()=>prisma.$disconnect());
