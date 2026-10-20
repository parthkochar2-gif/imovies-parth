import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI in .env before creating the admin account.');
  process.exitCode = 1;
} else if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Set a valid ADMIN_EMAIL in .env before creating the admin account.');
  process.exitCode = 1;
} else if (password.length < 12) {
  console.error('Set an ADMIN_PASSWORD of at least 12 characters in .env.');
  process.exitCode = 1;
} else {
  const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  }, { timestamps: true });
  const User = mongoose.models.User || mongoose.model('User', userSchema);

  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: { role: 'admin', passwordHash },
        $setOnInsert: { name: 'Administrator', email },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    console.log('Admin account created or updated. Sign in with ADMIN_EMAIL and ADMIN_PASSWORD.');
  } catch (error) {
    console.error('Could not create the admin account. Check MongoDB connectivity, Atlas network access, and database permissions.');
    console.error(`Error type: ${error.name || 'Unknown'}${error.code ? ` (${error.code})` : ''}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
