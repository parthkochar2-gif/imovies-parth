# IMovies — Movie Ticket Booking

A responsive movie-ticket booking demo built with React, Vite, Express, MongoDB, JWT, and bcrypt. The repository is structured for a **single Vercel deployment**: the React frontend is built into `dist/`, and the Express API is served from `api/[...route].js` as a Vercel serverless function.

## Features

- Responsive cinema-inspired dark UI
- Movie browsing, title search, genre filters, ratings and movie cards
- Showtime/date selection and interactive seat map
- Registration and login using bcrypt password hashing and JWT sessions
- Booking confirmation and booking history
- Admin dashboard for movie catalogue, bookings, ticket price, and showtimes
- API-side validation and checks for seats already booked
- Mobile-friendly layout and deployment-ready Vercel configuration

## Deploy to Vercel

1. Download and unzip this project.
2. Push the **contents of the `imovies-vercel` folder** to a new GitHub repository, or import the folder/repository into Vercel.
3. In Vercel, select **Add New → Project** and import the repository.
4. Set the **Root Directory** to the folder containing `package.json`, `api/`, and `src/`. Keep the build command `npm run build` and output directory `dist` (also set by `vercel.json`).
5. Add these Environment Variables in **Project → Settings → Environment Variables** for Production, Preview, and Development:
   - `MONGODB_URI` — your MongoDB Atlas connection string
   - `JWT_SECRET` — a long, random secret string
   - `ADMIN_EMAIL` — the first administrator's email address
   - `ADMIN_PASSWORD` — a private password of at least 12 characters
6. In MongoDB Atlas, create a database user, allow network access for your deployment (for a student demo, Atlas's IP access settings may require `0.0.0.0/0`; use a strong database password), and copy the connection string. Replace its username/password placeholders and use the database name `imovies`.
7. Deploy. If you add/change environment variables after deployment, redeploy the project. The frontend and `/api/*` backend deploy together from this one project.
8. Check `https://YOUR-DEPLOYMENT.vercel.app/api/health`. A successful response shows `status: "ok"`, `databaseConfigured: true`, and `databaseConnected: true`. Then test registration, login, and booking.
9. Sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD` to open the Admin dashboard. The account is created or promoted when those credentials are first used to sign in or register after deployment. Keep the password private; never commit it to Git.

## Local development

Requirements: Node.js 20 or newer recommended.

```bash
npm install
npm run dev
```

The frontend and API run together at `http://localhost:5173`. Copy `.env.example` to `.env`, set `MONGODB_URI` and `JWT_SECRET`, and set private `ADMIN_EMAIL` and `ADMIN_PASSWORD` values to enable the admin dashboard. Check `http://localhost:5173/api/health` to confirm MongoDB connectivity.

## Environment variables

For local development, copy `.env.example` to `.env` and fill in your own values. Never commit `.env`, database credentials, or JWT secrets to GitHub. The frontend can load without these values, but registration, login, and persistent bookings require both variables.

## API endpoints

- `GET /api/health` — API status and MongoDB connectivity
- `GET /api/movies` — public movie catalogue
- `GET /api/settings` — current ticket price and showtimes
- `POST /api/auth/register` — `{ "name", "email", "password" }`
- `POST /api/auth/login` — `{ "email", "password" }`
- `GET /api/bookings` — requires `Authorization: Bearer <token>`
- `POST /api/bookings` — requires a bearer token and accepts `{ "movieId", "movieTitle", "showDate", "showTime", "seats" }`
- `GET /api/admin/bookings` — admin only; list bookings
- `PATCH /api/admin/bookings/:id` — admin only; cancel or restore a booking
- `POST /api/admin/movies` — admin only; add a movie
- `PATCH /api/admin/movies/:id` and `DELETE /api/admin/movies/:id` — admin only; edit or remove a movie
- `PUT /api/admin/settings` — admin only; update ticket price and showtimes

## Notes / demo limitations

- The initial movie catalogue and poster art are demo data; movie information is not fetched from a live cinema provider.
- The booking UI starts at a ticket price of ₹220 and sample seat occupancy. Admin price and showtime changes apply to new bookings; bookings persist in MongoDB.
- For a commercial/production booking platform, use a transaction or atomic seat-inventory collection with a unique compound index on show + seat. The included conflict check is suitable as a starter demo but two concurrent requests can race.
- Online payments, email/SMS tickets, and real cinema inventory are not included.
- The frontend uses poster artwork hosted by TMDB image URLs. Provide your own licensed assets if publishing commercially.
