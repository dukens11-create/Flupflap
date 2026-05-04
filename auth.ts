import { prisma } from './db';
import bcrypt from 'bcryptjs';
export async function verifyUser(email:string,password:string){
 const user = await prisma.user.findUnique({where:{email}});
 if(!user) return null;
 const ok = await bcrypt.compare(password,user.password);
 if(!ok) return null;
 return user;
}
