/**
 * Ensures a local dev admin account exists (username: admin, password: admin). Idempotent —
 * safe to run multiple times. Intended for local development only; the seeded password is
 * intentionally weak, so never run this against a production database.
 */
import { connectMongo, UserModel } from '@docmind/shared';
import { hashPassword } from '../src/auth/passwords';
import { env } from '../src/config/env';

const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@docmind.local';
const ADMIN_PASSWORD = 'admin';

async function main() {
  await connectMongo(env.MONGODB_URI);

  const existing = await UserModel.findOne({ username: ADMIN_USERNAME });
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.email = existing.email || ADMIN_EMAIL;
    await existing.save();
    // eslint-disable-next-line no-console
    console.log(`Updated existing admin account (${existing.email}).`);
  } else {
    const user = await UserModel.create({
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      passwordHash,
      name: 'Admin',
    });
    // eslint-disable-next-line no-console
    console.log(`Created admin account (${user.email}).`);
  }

  // eslint-disable-next-line no-console
  console.log(`Log in with username "${ADMIN_USERNAME}" and password "${ADMIN_PASSWORD}".`);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed admin account:', err);
  process.exit(1);
});
