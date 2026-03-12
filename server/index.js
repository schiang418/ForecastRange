require('dotenv').config();
const express = require('express');
const path = require('path');

const forecastRouter = require('./routes/forecast');
const compareRouter = require('./routes/compare');
const spreadsRouter = require('./routes/spreads');
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React build in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ForecastRange server running on port ${PORT}`);
});
