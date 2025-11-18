# Moonshot Innovation Center

A full-stack education management platform for course enrollment and student management.

## Project Structure

```
moonshot_app/
├── controllers/          # Backend business logic
├── db/                   # Database connection
├── middleware/           # Auth & validation middleware
├── routes/              # API routes
├── server.js            # Backend entry point
├── .env                 # Environment variables (not in git)
├── package.json         # Backend dependencies
└── frontend/
    └── moonshot-innovation-center/  # Parent portal (React app)
        ├── src/
        ├── public/
        └── package.json
```

## Tech Stack

**Backend:**
- Node.js + Express
- PostgreSQL (with `courses_management` schema)
- JWT Authentication
- bcryptjs for password hashing

**Frontend:**
- React 19
- Axios for API calls
- CSS3 (custom styling)

## Quick Start

### 1. Prerequisites

- Node.js (v18+)
- PostgreSQL (v12+)
- npm or yarn

### 2. Database Setup

```sql
-- Create database
CREATE DATABASE your_database_name;

-- Connect to database and create schema
\c your_database_name
CREATE SCHEMA courses_management;
SET search_path TO courses_management, public;

-- Run the database schema file (if provided)
-- \i path/to/schema.sql
```

### 3. Backend Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd moonshot_app

# Install backend dependencies
npm install

# Create .env file
cp .env.example .env  # Or create manually

# Edit .env with your values:
# PORT=5001
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=your_database_name
# DB_USER=your_db_user
# DB_PASSWORD=your_db_password
# JWT_SECRET=your-secret-jwt-key
# WITHDRAWAL_DEADLINE_DAYS=7

# Start backend server
npm start
```

Backend will run on **http://localhost:5001**

### 4. Frontend Setup

```bash
# Open a new terminal window
cd moonshot_app/frontend/moonshot-innovation-center

# Install frontend dependencies
npm install

# Start frontend
npm start
```

Frontend will open at **http://localhost:3000**

## Default Test Account

After running the database setup, create a test account:

```sql
-- Set a user as admin (use after registering via UI)
UPDATE User_Account 
SET role = 'admin' 
WHERE userphone = 'YOUR_PHONE_NUMBER';
```

Or register a new account through the UI at http://localhost:3000

## Features

### Parent Portal (http://localhost:3000)
- User registration & login (phone-based)
- Add/edit/delete children information
- Browse available courses and sessions
- Enroll children in sessions
- View enrollments
- Withdraw from sessions (7+ days before start)

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info

#### Students
- `GET /api/students/parent/:userId` - Get parent's children
- `POST /api/students/parent/:userId` - Add child
- `PUT /api/students/:studentId` - Update child info
- `DELETE /api/students/:studentId` - Delete child

#### Sessions
- `GET /api/sessions` - Get all available sessions
- `GET /api/sessions/:sessionId` - Get session details

#### Enrollments
- `POST /api/enrollments` - Enroll in session
- `PUT /api/enrollments/:enrollmentId/withdraw` - Withdraw from session
- `GET /api/enrollments/stats` - Get enrollment statistics

## 🗃️ Database Schema

Key tables:
- **User_Account** - Parent/admin accounts
- **Student** - Student information (linked to parents)
- **Course** - Course information
- **Session** - Specific course sessions with schedule
- **Teacher** - Teacher information
- **SessionEnrollment** - Student enrollments in sessions

## Development

### Backend Development
```bash
# Run with auto-reload (if nodemon installed)
npm run dev

# Or use regular node
node server.js
```

### Frontend Development
```bash
cd frontend/moonshot-innovation-center
npm start
```

Frontend auto-reloads on file changes.

## Environment Variables

Required in `.env`:

```env
# Server
PORT=5001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRE=7d

# Business Rules
WITHDRAWAL_DEADLINE_DAYS=7

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

## Common Issues

### Backend won't start
- Check if `.env` file exists with correct database credentials
- Verify PostgreSQL is running: `psql -U postgres -l`
- Check if port 5001 is available: `lsof -i:5001`

### Frontend can't connect to backend
- Verify backend is running on http://localhost:5001
- Check CORS settings in `server.js`
- Check `services/api.js` has correct API_URL

### Database connection errors
- Verify database exists and schema is set
- Check database credentials in `.env`
- Test connection: `psql -h localhost -U your_db_user -d your_database_name`

## Dependencies

### Backend
```json
{
  "express": "^4.18.2",
  "pg": "^8.11.0",
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.0",
  "cors": "^2.8.5",
  "dotenv": "^16.0.3"
}
```

### Frontend
```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "axios": "^1.13.2"
}
```

## Team

Changying Zhang & Yehe Yan

## License

MIT License
