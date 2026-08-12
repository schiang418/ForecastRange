require('dotenv').config();
const express = require('express');
const path = require('path');

const forecastRouter = require('./routes/forecast');
const compareRouter = require('./routes/compare');
const spreadsRouter = require('./routes/spreads');
const chartRouter = require('./routes/chart');
const eventsRouter = require('./routes/events');
const creditSpreadsRouter = require('./routes/creditSpreads');
const deviationRouter = require('./routes/deviation');
const authRouter = require('./routes/auth');
const watchlistRouter = require('./routes/watchlist');
const { optionalAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/forecast', optionalAuth, forecastRouter);
app.use('/api/compare', optionalAuth, compareRouter);
app.use('/api/forecast/spreads', optionalAuth, spreadsRouter);
app.use('/api/chart', chartRouter);
app.use('/api/events', eventsRouter);
app.use('/api/deviation', deviationRouter);
app.use('/api/forecast/credit-spread-pricing', creditSpreadsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Phone app at /m — the Expo web export of mobile/ (same UI as the iOS app,
// no TestFlight / no 90-day expiry; save the URL to the home screen). Must be
// mounted BEFORE the web-dashboard catch-all. Index is served no-cache so
// home-screen saves pick up redeploys; the hashed JS bundle is cacheable.
const mobileWebPath = path.join(__dirname, '..', 'web-m');
app.get(['/m', '/m/'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(mobileWebPath, 'index.html'));
});
app.use('/m', express.static(mobileWebPath));

// Serve React build in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ForecastRange server running on port ${PORT}`);
});
