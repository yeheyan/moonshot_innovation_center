const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const app = express();

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Security headers
app.use(helmet());

// Compression for responses
app.use(compression());

// Rate limiting - prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per window
    message: { success: false, error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // only 5 login attempts per 15 minutes
    message: { success: false, error: 'Too many login attempts, please try again later' }
});

// ============================================
// MIDDLEWARE - processes requests before routes
// ============================================

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [
        process.env.ADMIN_PORTAL_URL,  // https://admin.your-domain.com
        'https://servicewechat.com',    // WeChat Mini Program
        /\.servicewechat\.com$/         // WeChat subdomains
    ]
    : ['http://localhost:3000', 'http://localhost:3001'];

// app.use(cors({
//     origin: function (origin, callback) {
//         // Allow requests with no origin (mobile apps, Postman)
//         if (!origin) return callback(null, true);

//         if (allowedOrigins.some(allowed => {
//             if (typeof allowed === 'string') return allowed === origin;
//             if (allowed instanceof RegExp) return allowed.test(origin);
//             return false;
//         })) {
//             callback(null, true);
//         } else {
//             callback(new Error('Not allowed by CORS'));
//         }
//     },
//     credentials: true
// }));
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? function (origin, callback) {
            // Allow Vercel domains and localhost
            if (!origin ||
                origin.includes('vercel.app') ||
                origin.includes('localhost')) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
        : true,  // Allow all in development
    credentials: true
}));

// Request logging in development
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.path}`);
        next();
    });
}

// ============================================
// SERVE ADMIN PORTAL STATIC FILES (Production)
// ============================================

if (process.env.NODE_ENV === 'production') {
    // Serve admin portal static files
    app.use('/admin', express.static(path.join(__dirname, 'frontend/admin-portal/build')));

    // Admin portal SPA routing
    app.get('/admin/*', (req, res) => {
        res.sendFile(path.join(__dirname, 'frontend/admin-portal/build/index.html'));
    });
}

// ============================================
// API ROUTES
// ============================================

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const enrollmentRoutes = require('./routes/enrollments');
const studentRoutes = require('./routes/students');
const adminAuthRoutes = require('./routes/adminAuth');
const courseRoutes = require('./routes/courses');
const teacherRoutes = require('./routes/teachers');
const adminStudentRoutes = require('./routes/adminStudents');
const wechatAuthRoutes = require('./routes/wechatAuth');
const orderRoutes = require('./routes/orders');
const usersRoutes = require('./routes/users');
const configRoutes = require('./routes/config');
app.use('/api/config', configRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/auth', wechatAuthRoutes);
// Apply rate limiting to auth routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/admin/login', authLimiter);

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/admin', adminStudentRoutes);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Moonshot Innovation Center API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Moonshot Innovation Center API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            admin: '/api/admin',
            sessions: '/api/sessions',
            enrollments: '/api/enrollments',
            students: '/api/students',
            courses: '/api/courses',
            teachers: '/api/teachers',
            users: '/api/users'
        }
    });
});

// ============================================
// ERROR HANDLING
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

    // Don't leak error details in production
    const errorMessage = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message;

    res.status(err.status || 500).json({
        success: false,
        error: errorMessage
    });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, () => {
    console.log(`
  ✅ Moonshot Innovation Center API
  🚀 Server running on port ${PORT}
  📡 Environment: ${process.env.NODE_ENV || 'development'}
  🌍 CORS enabled for: ${process.env.NODE_ENV === 'production' ? 'production domains' : 'localhost'}
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

module.exports = app;