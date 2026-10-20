import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

let connectPromise;
async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) {
    throw new Error('Database is not configured. Set MONGODB_URI in .env or Vercel Environment Variables.');
  }
  if (!connectPromise) {
    connectPromise = mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
      .catch(error => {
        connectPromise = null;
        throw error;
      });
  }
  await connectPromise;
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
}, { timestamps: true });
const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  movieId: { type: String, required: true },
  movieTitle: { type: String, required: true },
  showDate: { type: String, required: true },
  showTime: { type: String, required: true },
  seats: [{ type: String, required: true }],
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
}, { timestamps: true });
const movieSchema = new mongoose.Schema({
  movieId: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  genre: { type: String, required: true, trim: true, maxlength: 80 },
  rating: { type: String, default: 'NR', trim: true, maxlength: 10 },
  duration: { type: String, required: true, trim: true, maxlength: 30 },
  language: { type: String, default: 'English', trim: true, maxlength: 40 },
  cert: { type: String, default: 'UA 13+', trim: true, maxlength: 20 },
  year: { type: Number, required: true, min: 1888, max: 2200 },
  poster: { type: String, required: true, trim: true, maxlength: 2048 },
  backdrop: { type: String, default: '', trim: true, maxlength: 2048 },
  description: { type: String, default: '', trim: true, maxlength: 1000 },
  tag: { type: String, default: 'NOW SHOWING', trim: true, maxlength: 40 },
}, { timestamps: true });
const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  ticketPrice: { type: Number, required: true, min: 1, max: 100000, default: 220 },
  showtimes: { type: [String], required: true, default: ['10:30 AM', '1:15 PM', '4:00 PM', '7:30 PM', '10:15 PM'] },
});
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
const Movie = mongoose.models.Movie || mongoose.model('Movie', movieSchema);
const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

const JWT_SECRET = () => process.env.JWT_SECRET || '';
const defaultMovies = [
  { movieId: 'm1', title: 'Dune: Part Two', genre: 'Sci-Fi / Adventure', rating: '8.8', duration: '2h 46m', language: 'English', cert: 'UA 13+', year: 2024, poster: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg', description: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.', tag: 'TRENDING' },
  { movieId: 'm2', title: 'Spider-Man: Across the Spider-Verse', genre: 'Animation / Action', rating: '8.7', duration: '2h 20m', language: 'English', cert: 'UA 7+', year: 2023, poster: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj965Lk.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg', description: 'Miles Morales swings back into the multiverse and meets a team of Spider-People charged with protecting its existence.', tag: 'FAN FAVOURITE' },
  { movieId: 'm3', title: 'Oppenheimer', genre: 'Drama / History', rating: '8.3', duration: '3h 00m', language: 'English', cert: 'UA 16+', year: 2023, poster: 'https://image.tmdb.org/t/p/w500/ptpr0kGAckfQkJeJIt8st5dglvd.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg', description: 'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb.', tag: 'AWARD WINNER' },
  { movieId: 'm4', title: 'The Batman', genre: 'Action / Crime', rating: '7.8', duration: '2h 56m', language: 'English', cert: 'UA 16+', year: 2022, poster: 'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg', description: 'Batman ventures into Gotham City’s underworld when a sadistic killer leaves behind a trail of cryptic clues.', tag: 'NOW SHOWING' },
  { movieId: 'm5', title: 'Everything Everywhere All at Once', genre: 'Sci-Fi / Comedy', rating: '7.8', duration: '2h 19m', language: 'English', cert: 'A', year: 2022, poster: 'https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/5J2V8k7w2v3Q5x6x5Z8b7q2Z2Vf.jpg', description: 'An exhausted laundromat owner is swept into an adventure across the multiverse.', tag: 'COMING SOON' },
  { movieId: 'm6', title: 'Top Gun: Maverick', genre: 'Action / Drama', rating: '8.2', duration: '2h 10m', language: 'English', cert: 'UA 13+', year: 2022, poster: 'https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/odJ4hx6g6vBt4lBWKFD1tI8WS4x.jpg', description: 'After thirty years, Maverick pushes the envelope as a top naval aviator while training a new generation.', tag: 'COMING SOON' },
];

function issueToken(user) {
  if (!JWT_SECRET()) throw new Error('JWT_SECRET is not configured. Add it in Environment Variables.');
  return jwt.sign({ sub: user._id.toString(), role: user.role }, JWT_SECRET(), { expiresIn: '7d' });
}

async function bootstrapAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email && !password) return;
  if (!email || !password) throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap the admin account.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('ADMIN_EMAIL must be a valid email address.');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');

  const existing = await User.findOne({ email });
  if (existing) {
    const passwordMatches = await bcrypt.compare(password, existing.passwordHash);
    if (existing.role === 'admin') {
      if (!passwordMatches) {
        existing.passwordHash = await bcrypt.hash(password, 12);
        await existing.save();
      }
      return;
    }
    if (!passwordMatches) {
      throw new Error('ADMIN_EMAIL already belongs to an account with a different password. Use a different ADMIN_EMAIL or promote the account manually.');
    }
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
    }
    return;
  }

  try {
    await User.create({
      name: 'Administrator',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'admin',
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const created = await User.findOne({ email });
    if (!created || !(await bcrypt.compare(password, created.passwordHash))) throw error;
  }
}

async function auth(req, res, next) {
  try {
    const value = req.headers.authorization || '';
    const token = value.startsWith('Bearer ') ? value.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
    if (!JWT_SECRET()) return res.status(500).json({ message: 'JWT_SECRET is not configured on the server.' });
    const payload = jwt.verify(token, JWT_SECRET());
    await connectDB();
    const user = await User.findById(payload.sub).select('_id name email role');
    if (!user) return res.status(401).json({ message: 'Account not found. Please sign in again.' });
    req.user = user;
    return next();
  } catch (error) {
    return res.status(error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' ? 401 : 500)
      .json({ message: error.message || 'Authentication failed.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
  return next();
}

function moviePayload(movie) {
  const { movieId, ...fields } = movie;
  return { id: movieId, ...fields };
}

function cleanMovie(body) {
  const fields = ['title', 'genre', 'rating', 'duration', 'language', 'cert', 'year', 'poster', 'backdrop', 'description', 'tag'];
  const movie = {};
  for (const field of fields) {
    if (body[field] !== undefined) movie[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
  }
  if (movie.year !== undefined) movie.year = Number(movie.year);
  if (movie.rating !== undefined) movie.rating = String(movie.rating);
  return movie;
}

async function getSettings() {
  return Settings.findOneAndUpdate(
    { _id: 'global' },
    { $setOnInsert: { ticketPrice: 220, showtimes: ['10:30 AM', '1:15 PM', '4:00 PM', '7:30 PM', '10:15 PM'] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

app.get('/api/health', async (req, res) => {
  if (!process.env.MONGODB_URI) {
    return res.status(503).json({ status: 'error', app: 'IMovies API', databaseConfigured: false, databaseConnected: false });
  }
  try {
    await connectDB();
    return res.json({ status: 'ok', app: 'IMovies API', databaseConfigured: true, databaseConnected: true });
  } catch (error) {
    console.error('Database health check failed:', error);
    return res.status(503).json({ status: 'error', app: 'IMovies API', databaseConfigured: true, databaseConnected: false });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    await connectDB();
    if (!JWT_SECRET()) return res.status(500).json({ message: 'JWT_SECRET is not configured on the server.' });
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (email === (process.env.ADMIN_EMAIL || '').trim().toLowerCase()) await bootstrapAdmin();
    if (name.length < 2) return res.status(400).json({ message: 'Please enter your full name.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Please enter a valid email address.' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    return res.status(201).json({ token: issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    return res.status(500).json({ message: error.code === 11000 ? 'An account with this email already exists.' : error.message || 'Registration failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    await connectDB();
    if (!JWT_SECRET()) return res.status(500).json({ message: 'JWT_SECRET is not configured on the server.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (email === (process.env.ADMIN_EMAIL || '').trim().toLowerCase()) await bootstrapAdmin();
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Incorrect email or password.' });
    return res.json({ token: issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Sign in failed.' });
  }
});

app.get('/api/movies', async (req, res) => {
  try {
    await connectDB();
    if (await Movie.countDocuments() === 0) {
      await Movie.bulkWrite(defaultMovies.map(movie => ({
        updateOne: { filter: { movieId: movie.movieId }, update: { $setOnInsert: movie }, upsert: true },
      })));
    }
    const movies = await Movie.find().sort({ createdAt: 1 }).lean();
    return res.json({ movies: movies.map(moviePayload) });
  } catch (error) {
    return res.status(503).json({ message: error.message || 'Could not load movies.' });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    await connectDB();
    const settings = await getSettings();
    return res.json({ ticketPrice: settings.ticketPrice, showtimes: settings.showtimes });
  } catch (error) {
    return res.status(503).json({ message: error.message || 'Could not load booking settings.' });
  }
});

app.get('/api/bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ bookings });
  } catch {
    return res.status(500).json({ message: 'Could not load bookings.' });
  }
});

app.post('/api/bookings', auth, async (req, res) => {
  try {
    const movieId = String(req.body.movieId || '').trim();
    const showDate = String(req.body.showDate || '');
    const showTime = String(req.body.showTime || '');
    const seats = [...new Set(Array.isArray(req.body.seats) ? req.body.seats.map(seat => String(seat).toUpperCase()) : [])];
    if (!movieId || !/^\d{4}-\d{2}-\d{2}$/.test(showDate) || !showTime) return res.status(400).json({ message: 'Please select a movie, date, and showtime.' });
    if (!seats.length || seats.length > 8) return res.status(400).json({ message: 'Select between 1 and 8 seats per booking.' });
    if (seats.some(seat => !/^[A-F][1-8]$/.test(seat))) return res.status(400).json({ message: 'One or more seats are invalid.' });
    await connectDB();
    const movie = await Movie.findOne({ movieId }).lean();
    if (!movie) return res.status(404).json({ message: 'This movie is no longer available.' });
    const settings = await getSettings();
    if (!settings.showtimes.includes(showTime)) return res.status(400).json({ message: 'That showtime is no longer available. Please choose another.' });
    const conflict = await Booking.findOne({ movieId, showDate, showTime, status: 'confirmed', seats: { $in: seats } }).lean();
    if (conflict) return res.status(409).json({ message: 'One or more selected seats were just booked. Please choose different seats.' });
    const booking = await Booking.create({
      userId: req.user._id, movieId, movieTitle: movie.title, showDate, showTime, seats,
      amount: seats.length * settings.ticketPrice,
    });
    return res.status(201).json({ booking });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Booking could not be completed.' });
  }
});

app.get('/api/admin/bookings', auth, requireAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find().populate('userId', 'name email').sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ bookings });
  } catch {
    return res.status(500).json({ message: 'Could not load all bookings.' });
  }
});

app.patch('/api/admin/bookings/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['confirmed', 'cancelled'].includes(status)) return res.status(400).json({ message: 'Status must be confirmed or cancelled.' });
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    if (status === 'confirmed' && booking.status !== 'confirmed') {
      const conflict = await Booking.findOne({
        _id: { $ne: booking._id }, movieId: booking.movieId, showDate: booking.showDate,
        showTime: booking.showTime, status: 'confirmed', seats: { $in: booking.seats },
      }).lean();
      if (conflict) return res.status(409).json({ message: 'Those seats have since been booked; this booking cannot be restored.' });
    }
    booking.status = status;
    await booking.save();
    return res.json({ booking });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not update booking.' });
  }
});

app.post('/api/admin/movies', auth, requireAdmin, async (req, res) => {
  try {
    const movie = await Movie.create({ movieId: `movie-${randomUUID()}`, ...cleanMovie(req.body) });
    return res.status(201).json({ movie: moviePayload(movie.toObject()) });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Could not add movie.' });
  }
});

app.patch('/api/admin/movies/:id', auth, requireAdmin, async (req, res) => {
  try {
    const movie = await Movie.findOneAndUpdate({ movieId: req.params.id }, { $set: cleanMovie(req.body) }, { new: true, runValidators: true }).lean();
    if (!movie) return res.status(404).json({ message: 'Movie not found.' });
    return res.json({ movie: moviePayload(movie) });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Could not update movie.' });
  }
});

app.delete('/api/admin/movies/:id', auth, requireAdmin, async (req, res) => {
  try {
    const movie = await Movie.findOneAndDelete({ movieId: req.params.id });
    if (!movie) return res.status(404).json({ message: 'Movie not found.' });
    return res.status(204).end();
  } catch {
    return res.status(500).json({ message: 'Could not remove movie.' });
  }
});

app.put('/api/admin/settings', auth, requireAdmin, async (req, res) => {
  try {
    const ticketPrice = Number(req.body.ticketPrice);
    const showtimes = [...new Set(Array.isArray(req.body.showtimes) ? req.body.showtimes.map(time => String(time).trim()).filter(Boolean) : [])];
    if (!Number.isFinite(ticketPrice) || ticketPrice < 1 || ticketPrice > 100000) return res.status(400).json({ message: 'Ticket price must be between 1 and 100000.' });
    if (!showtimes.length || showtimes.length > 12 || showtimes.some(time => time.length > 30)) return res.status(400).json({ message: 'Provide between 1 and 12 valid showtimes.' });
    const settings = await Settings.findOneAndUpdate(
      { _id: 'global' }, { $set: { ticketPrice, showtimes } }, { new: true, upsert: true, runValidators: true },
    ).lean();
    return res.json({ ticketPrice: settings.ticketPrice, showtimes: settings.showtimes });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Could not save booking settings.' });
  }
});

app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint not found.' }));
export default app;
