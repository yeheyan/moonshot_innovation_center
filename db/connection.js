const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Set schema for all connections
pool.on('connect', (client) => {
    // Fixed: added missing backtick
    client.query('SET search_path TO courses_management, public');
});

// Test connection with schema
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