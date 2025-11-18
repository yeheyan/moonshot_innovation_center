const bcrypt = require('bcryptjs');

// Change this to your desired password
const password = process.argv[2] || 'admin123';
const saltRounds = 10;

console.log('Hashing password...\n');

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        console.error('Error hashing password:', err);
        process.exit(1);
    }

    console.log('Password:', password);
    console.log('Hashed:', hash);
    console.log('\n--- Copy this SQL command ---\n');
    console.log('SET search_path TO courses_management, public;');
    console.log(`INSERT INTO Admin (AdminName, AdminEmail, password_hash)`);
    console.log(`VALUES ('Admin', 'admin@moonshot.com', '${hash}');`);
    console.log('\n--- Or update existing admin ---\n');
    console.log(`UPDATE Admin SET password_hash = '${hash}' WHERE AdminEmail = 'admin@moonshot.com';`);
});

console.log('\nUsage:');
console.log('  node hashPassword.js                 # Hash default password (admin123)');
console.log('  node hashPassword.js mypassword      # Hash custom password');
console.log('  node hashPassword.js "my password"   # Hash password with spaces (use quotes)\n');