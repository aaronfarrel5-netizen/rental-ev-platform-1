import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import vehiclesRouter from './routes/vehicles.js';
import reservationsRouter from './routes/reservations.js';

// ---------------------------------------------------------------------------
// App initialisation
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

// Allow all origins — safe for development; restrict in production.
app.use(cors({ origin: '*' }));

// Parse incoming JSON request bodies
app.use(express.json());

// Parse URL-encoded form bodies (e.g. from HTML forms)
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/reservations', reservationsRouter);

// ---------------------------------------------------------------------------
// Health-check endpoint
// A quick way for ops / load balancers to confirm the service is running.
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ---------------------------------------------------------------------------
// 404 handler — catches any route not matched above
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'The requested endpoint does not exist.',
  });
});

// ---------------------------------------------------------------------------
// Global error handler — catches any error thrown inside route handlers
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Global Error Handler]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An unexpected error occurred.',
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅  Server is running on http://localhost:${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/health`);
  console.log(`   Vehicles API → http://localhost:${PORT}/api/vehicles`);
  console.log(`   Reservations → http://localhost:${PORT}/api/reservations`);
});

export default app;
