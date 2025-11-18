# Database Setup Instructions

## Test Credentials

### Admin Accounts
- **Email:** alice@moonshot.com | **Password:** password123 | **Role:** Super Admin
- **Email:** bob@moonshot.com | **Password:** password123 | **Role:** Admin
- **Email:** carol@moonshot.com | **Password:** password123 | **Role:** Staff

### Parent Accounts (Phone-based login)
All parent accounts use password: **parent123**

| Phone | Name | WeChat |
|-------|------|--------|
| 13812345678 | Michael Chen | michael_chen |
| 13898765432 | Sarah Wang | sarah_wang88 |
| 13711112222 | David Liu | david_liu2024 |

## Setup Order
```bash
# 1. Create database
createdb innovation_courses

# 2. Run schema
psql innovation_courses < 1_schema.sql

# 3. Add constraints
psql innovation_courses < 2_constraints.sql

# 4. Create functions
psql innovation_courses < 3_functions.sql

# 5. Load sample data
psql innovation_courses < 4_sample_data.sql
```

## Generating Real Password Hashes
```javascript
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('your_password', 10);
console.log(hash);
```

**IMPORTANT:** These are test passwords for development only. Never use these in production!