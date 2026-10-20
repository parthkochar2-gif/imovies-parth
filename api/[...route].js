import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

let connectPromise;
async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) throw new Error('Database is not configured. Set MONGODB_URI in .env for local development or in Vercel Project Settings → Environment Variables.');
  if (!connectPromise) connectPromise = mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).catch(err => { connectPromise = null; throw err; });
  await connectPromise;
}
const userSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true, maxlength: 80 }, email: { type: String, required: true, unique: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true }, role: { type: String, enum: ['user', 'admin'], default: 'user' } }, { timestamps: true });
const bookingSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, movieId: { type: String, required: true }, movieTitle: { type: String, required: true }, showDate: { type: String, required: true }, showTime: { type: String, required: true }, seats: [{ type: String, required: true }], amount: { type: Number, required: true, min: 0 }, status: { type: String, enum: ['confirmed'], default: 'confirmed' } }, { timestamps: true });
// A seat can only be reserved once for a given movie/date/time. The booking API checks conflicts before inserting.
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
const JWT_SECRET = () => process.env.JWT_SECRET || '';
function issueToken(user) { if (!JWT_SECRET()) throw new Error('JWT_SECRET is not configured. Add it in Vercel Environment Variables.'); return jwt.sign({ sub: user._id.toString(), role: user.role }, JWT_SECRET(), { expiresIn: '7d' }); }
async function auth(req, res, next) {
  try { const value = req.headers.authorization || ''; const token = value.startsWith('Bearer ') ? value.slice(7) : ''; if (!token) return res.status(401).json({ message: 'Please sign in to continue.' }); if (!JWT_SECRET()) return res.status(500).json({ message: 'JWT_SECRET is not configured on the server.' }); const payload = jwt.verify(token, JWT_SECRET()); await connectDB(); const user = await User.findById(payload.sub).select('_id name email role'); if (!user) return res.status(401).json({ message: 'Account not found. Please sign in again.' }); req.user = user; next(); } catch (e) { return res.status(401).json({ message: e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError' ? 'Your session has expired. Please sign in again.' : e.message }); }
}
app.get('/api/health', async (req, res) => {
  if (!process.env.MONGODB_URI) {
    return res.status(503).json({
      status: 'error',
      app: 'IMovies API',
      databaseConfigured: false,
      databaseConnected: false,
      message: 'Database is not configured. Set MONGODB_URI.',
    });
  }

  try {
    await connectDB();
    return res.json({
      status: 'ok',
      app: 'IMovies API',
      databaseConfigured: true,
      databaseConnected: true,
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    return res.status(503).json({
      status: 'error',
      app: 'IMovies API',
      databaseConfigured: true,
      databaseConnected: false,
      message: 'Could not connect to MongoDB. Check the connection string and Atlas network access.',
    });
  }
});
app.post('/api/auth/register', async (req, res) => {
  try { await connectDB(); if (!JWT_SECRET()) return res.status(500).json({ message: 'JWT_SECRET is not configured on the server.' }); const name = String(req.body.name || '').trim(); const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || ''); if (name.length < 2) return res.status(400).json({ message: 'Please enter your full name.' }); if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Please enter a valid email address.' }); if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' }); if (await User.exists({ email })) return res.status(409).json({ message: 'An account with this email already exists.' }); const passwordHash = await bcrypt.hash(password, 12); const user = await User.create({ name, email, passwordHash }); return res.status(201).json({ token: issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } }); } catch (e) { return res.status(500).json({ message: e.code === 11000 ? 'An account with this email already exists.' : e.message || 'Registration failed.' }); }
});
app.post('/api/auth/login', async (req, res) => {
  try { await connectDB(); if (!JWT_SECRET()) return res.status(500).json({ message: 'JWT_SECRET is not configured on the server.' }); const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || ''); const user = await User.findOne({ email }); if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Incorrect email or password.' }); return res.json({ token: issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } }); } catch (e) { return res.status(500).json({ message: e.message || 'Sign in failed.' }); }
});
app.get('/api/bookings', auth, async (req, res) => { try { const bookings = await Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean(); res.json({ bookings }); } catch (e) { res.status(500).json({ message: 'Could not load bookings.' }); } });
app.post('/api/bookings', auth, async (req, res) => {
  try { const movieId = String(req.body.movieId || '').trim(); const movieTitle = String(req.body.movieTitle || '').trim(); const showDate = String(req.body.showDate || ''); const showTime = String(req.body.showTime || ''); const seats = [...new Set(Array.isArray(req.body.seats) ? req.body.seats.map(s => String(s).toUpperCase()) : [])]; if (!movieId || !movieTitle || !/^\d{4}-\d{2}-\d{2}$/.test(showDate) || !showTime) return res.status(400).json({ message: 'Please select a movie, date, and showtime.' }); if (!seats.length || seats.length > 8) return res.status(400).json({ message: 'Select between 1 and 8 seats per booking.' }); if (seats.some(s => !/^[A-F][1-8]$/.test(s))) return res.status(400).json({ message: 'One or more seats are invalid.' }); const amount = seats.length * 220; await connectDB(); const conflict = await Booking.findOne({ movieId, showDate, showTime, status: 'confirmed', seats: { $in: seats } }).lean(); if (conflict) return res.status(409).json({ message: 'One or more selected seats were just booked. Please choose different seats.' }); const booking = await Booking.create({ userId: req.user._id, movieId, movieTitle, showDate, showTime, seats, amount }); return res.status(201).json({ booking }); } catch (e) { return res.status(500).json({ message: e.message || 'Booking could not be completed.' }); }
});
app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint not found.' }));
export default app;
