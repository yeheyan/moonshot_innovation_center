const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ============================================
// MIDDLEWARE - processes requests before routes
// ============================================

// Parse JSON bodies (allows req.body to work)
app.use(express.json());

// Enable CORS (allows frontend to call this API)
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000'
}));

// ============================================
// ROUTES - connect URLs to controller functions
// ============================================

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const enrollmentRoutes = require('./routes/enrollments');
const studentRoutes = require('./routes/students');

// Mount routes
app.use('/api/auth', authRoutes);           // /api/auth/login, /api/auth/register, etc.
app.use('/api/sessions', sessionRoutes);     // /api/sessions, /api/sessions/:id
app.use('/api/enrollments', enrollmentRoutes); // /api/enrollments, etc.
app.use('/api/students', studentRoutes);     // /api/students/parent/:userId, etc.

// ============================================
// HEALTH CHECK - test if server is running
// ============================================

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Moonshot Innovation Center API is running' });
});

// ============================================
// ERROR HANDLING - catch errors
// ============================================

// 404 - route not found
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.url} not found`
    });
});

// 500 - server error
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`
  ✅ Moonshot Innovation Center API
  🚀 Server running on port ${PORT}
  📡 Environment: ${process.env.NODE_ENV || 'development'}
  `);
});

module.exports = app;