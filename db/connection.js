const { Pool } = require('pg');
require('dotenv').config();

// Railway provides DATABASE_URL, local uses individual variables
const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    : new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

pool.on('connect', (client) => {
    // Only set schema for local (courses_management)
    // Railway uses public schema
    if (!process.env.DATABASE_URL) {
        client.query('SET search_path TO courses_management, public');
    }
    console.log('✅ Database connected');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
});

// Test connection
pool.query('SELECT current_schema()', (err, res) => {
    if (err) {
        console.error('❌ Database connection error:', err);
    } else {
        console.log('✅ Connected to database with schema:', res.rows[0].current_schema);
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};