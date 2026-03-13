require('dotenv').config();
const express = require('express');
const path = require('path');

const forecastRouter = require('./routes/forecast');
const compareRouter = require('./routes/compare');
const spreadsRouter = require('./routes/spreads');
const chartRouter = require('./routes/chart');
const eventsRouter = require('./routes/events');
const creditSpreadsRouter = require('./routes/creditSpreads');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// API Routes
app.use('/api/forecast', forecastRouter);
app.use('/api/compare', compareRouter);
app.use('/api/forecast/spreads', spreadsRouter);
app.use('/api/chart', chartRouter);
app.use('/api/events', eventsRouter);
app.use('/api/forecast/credit-spread-pricing', creditSpreadsRouter);

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
