/**
 * Vercel serverless entry — re-exports the Express app.
 * Socket.io push is unavailable serverless; the desktop agent uses
 * GET /api/agent/next polling which works perfectly on Vercel.
 */
const { app } = require('../backend/server');
app.set('io', null);
module.exports = app;
