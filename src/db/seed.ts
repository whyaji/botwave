import 'dotenv/config';

import { passwordService } from '@/src/modules/auth/infrastructure/password/password.service';

import env from '../config/env';
import { db } from './connection';
import { users } from './schema/schema';

async function seed() {
  const email = env.SUPERADMIN_EMAIL;
  const password = env.SUPERADMIN_PASSWORD;
  const passwordHash = await passwordService.hashPassword(password);

  await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: 'Super Admin',
      role: 'superadmin',
      isActive: 1,
    })
    .onConflictDoNothing({ target: users.email });

  console.log('Seeder done. Superadmin:', email);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
