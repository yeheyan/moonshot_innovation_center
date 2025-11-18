# Database Schema Documentation

## Overview

The Moonshot Innovation Center uses PostgreSQL with a custom schema `courses_management` for managing educational courses, sessions, student enrollments, and user accounts.

## Database Structure

```
courses_management schema
├── User_Account (Parent accounts)
├── Admin (Administrator accounts)
├── Student (Student information)
├── Course (Course catalog)
├── Session (Scheduled course sessions)
├── Teacher (Instructor information)
└── SessionEnrollment (Student-Session enrollments)
```

## Tables

### User_Account (Parents)
Parents who register and manage their children's enrollments.

**Key Fields:**
- `UserID` - Primary key
- `UserName` - Parent's full name
- `UserPhone` - Phone number (used for login, UNIQUE)
- `password_hash` - Hashed password (bcrypt)
- `UserWechat` - WeChat ID (optional)
- `UserAddress` - Home address (optional)
- `created_at` - Account creation timestamp
- `last_login` - Last login timestamp

**Relationships:**
- One parent can have multiple students (1:N with Student)

---

### Admin (Administrators)
Staff members who manage the system.

**Key Fields:**
- `AdminID` - Primary key
- `AdminName` - Admin full name
- `AdminEmail` - Email (used for login, UNIQUE)
- `password_hash` - Hashed password (bcrypt)
- `AdminRole` - Role (default: 'admin')
- `created_at` - Account creation timestamp
- `last_login` - Last login timestamp

**Note:** Admin table is separate from User_Account - admins don't have children and use email login instead of phone.

---

### Student (Children)
Children registered by parents.

**Key Fields:**
- `StudentID` - Primary key
- `UserID` - Foreign key to User_Account (parent)
- `StudentName` - Student's full name
- `StudentNationalID` - National ID (optional)
- `StudentBirthDate` - Date of birth (optional)
- `StudentGrade` - Current grade (optional)
- `StudentSchool` - School name (optional)
- `created_at` - Registration timestamp

**Relationships:**
- Belongs to one parent (N:1 with User_Account)
- Can have multiple enrollments (1:N with SessionEnrollment)

---

### Course (Course Catalog)
Educational courses offered by the center.

**Key Fields:**
- `CourseID` - Primary key
- `CourseName` - Course name
- `CourseDescription` - Course description
- `CoursePrice` - Price per session
- `CourseMaxEnroll` - Maximum students per session
- `CourseStatus` - Status ('active' or 'inactive')
- `created_at` - Creation timestamp

**Relationships:**
- One course can have multiple sessions (1:N with Session)

---

### Session (Scheduled Classes)
Specific scheduled instances of courses with assigned teachers.

**Key Fields:**
- `SessionID` - Primary key
- `CourseID` - Foreign key to Course
- `TeacherID` - Foreign key to Teacher
- `SessionName` - Session name (e.g., "Monday Morning Class")
- `SessionDayOfWeek` - Day of week (e.g., "Monday")
- `SessionStartTime` - Start time (TIME format)
- `SessionEndTime` - End time (TIME format)
- `SessionStartDate` - First day of session (DATE format)
- `EnrolledCount` - Current number of enrolled students
- `created_at` - Creation timestamp

**Relationships:**
- Belongs to one course (N:1 with Course)
- Taught by one teacher (N:1 with Teacher)
- Has multiple enrollments (1:N with SessionEnrollment)

**Business Rules:**
- Cannot exceed CourseMaxEnroll capacity
- Automatically tracks EnrolledCount

---

### Teacher (Instructors)
Teachers who conduct the sessions.

**Key Fields:**
- `TeacherID` - Primary key
- `TeacherName` - Teacher's full name
- `TeacherInfo` - Bio, qualifications, experience
- `created_at` - Creation timestamp

**Relationships:**
- Can teach multiple sessions (1:N with Session)

---

### SessionEnrollment (Enrollments)
Tracks which students are enrolled in which sessions.

**Key Fields:**
- `EnrollmentID` - Primary key
- `StudentID` - Foreign key to Student
- `SessionID` - Foreign key to Session
- `EnrollmentStatus` - Status: 'active', 'waitlisted', or 'withdrawn'
- `EnrollmentDate` - Enrollment timestamp

**Relationships:**
- Links Student to Session (M:N relationship)

**Business Rules:**
- If session is full, status = 'waitlisted'
- If session has space, status = 'active'
- Cannot enroll in same session twice
- Withdrawal allowed if 7+ days before session start

---

## Key Relationships

```
User_Account (Parent)
    └── 1:N → Student
                └── 1:N → SessionEnrollment
                              └── N:1 → Session
                                          ├── N:1 → Course
                                          └── N:1 → Teacher

Admin (separate - no relationships)
```

---

## Setup Instructions

### Local Development

1. **Create PostgreSQL database:**
```bash
createdb innovation_courses
```

2. **Run schema migration:**
```bash
psql -h localhost -U postgres -d innovation_courses < database/schema.sql
```

3. **Verify installation:**
```bash
psql -h localhost -U postgres -d innovation_courses -c "\dn"
# Should show courses_management schema
```

4. **Create first admin account:**
```bash
# First, hash a password
node hashPassword.js

# Then insert admin
psql -h localhost -U postgres -d innovation_courses
```
```sql
SET search_path TO courses_management, public;
INSERT INTO Admin (AdminName, AdminEmail, password_hash)
VALUES ('Admin', 'admin@moonshot.com', 'PASTE_HASH_HERE');
```

---

## Backend Connection

The backend connects using `db/connection.js`:

```javascript
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Automatically sets schema
pool.on('connect', (client) => {
  client.query('SET search_path TO courses_management, public');
});
```

**Why schema?** Using `courses_management` schema keeps our tables separate from PostgreSQL's default `public` schema, preventing naming conflicts and organizing our data.

---

## Authentication

### Parent Login (Phone-based)
- Endpoint: `POST /api/auth/login`
- Login with: `userPhone` + `password`
- Uses `User_Account` table
- JWT token includes: `userId`, `phone`, `role: 'parent'`

### Admin Login (Email-based)
- Endpoint: `POST /api/admin/login`
- Login with: `adminEmail` + `password`
- Uses `Admin` table
- JWT token includes: `adminId`, `email`, `role: 'admin'`, `isAdmin: true`

**Passwords:** All passwords are hashed using bcryptjs (10 salt rounds) before storage.

---

## Business Logic

### Enrollment Flow

1. Parent selects a session
2. System checks:
   - Student not already enrolled
   - Session capacity
3. If space available → `status: 'active'`
4. If full → `status: 'waitlisted'`
5. Updates `Session.EnrolledCount`

### Withdrawal Rules

- Can withdraw if `session.SessionStartDate - today >= 7 days`
- If withdrawal from active enrollment:
  - Decrease `EnrolledCount`
  - Promote first waitlisted student to active
- Status changes to `'withdrawn'`

---

## Data Access Rules

### Parents can:
- View/edit their own children only
- Enroll their children in sessions
- View their own enrollments
- Withdraw from sessions (with deadline check)

### Admins can:
- View ALL data (students, parents, courses, sessions, enrollments)
- Create/edit/delete courses
- Create/edit/delete sessions
- Create/edit/delete teachers
- Update enrollment statuses
- **Cannot** edit parent/student personal information (for security)

---

## Backup & Migration

### Export current database:
```bash
# Schema only
pg_dump -h localhost -U postgres -d innovation_courses \
  --schema-only --schema=courses_management > schema.sql

# Schema + data
pg_dump -h localhost -U postgres -d innovation_courses \
  --schema=courses_management > schema_with_data.sql
```

### Import to new database:
```bash
psql -h NEW_HOST -U postgres -d NEW_DATABASE < schema.sql
```

---

## Troubleshooting

**Issue:** "schema courses_management does not exist"
```sql
CREATE SCHEMA courses_management;
SET search_path TO courses_management, public;
```

**Issue:** "permission denied for schema"
```sql
GRANT ALL ON SCHEMA courses_management TO your_user;
GRANT ALL ON ALL TABLES IN SCHEMA courses_management TO your_user;
```

**Issue:** Backend can't connect
- Check `.env` values match your database
- Verify PostgreSQL is running: `pg_isready`
- Test connection: `psql -h HOST -U USER -d DATABASE`

---

## Schema Maintenance

When adding new tables/columns:

1. Add to `schema.sql`
2. Create migration file: `migrations/001_add_feature.sql`
3. Document changes in git commit
4. Notify team to run migration

**Example migration:**
```sql
-- migrations/001_add_student_email.sql
SET search_path TO courses_management, public;
ALTER TABLE Student ADD COLUMN StudentEmail VARCHAR(255);
```

---

## Security Notes

- Never commit `.env` file (contains passwords)
- Never expose database credentials in code
- Admin and parent passwords stored as bcrypt hashes (never plaintext)
- Use prepared statements (parameterized queries) to prevent SQL injection
- Admin table is separate to prevent privilege escalation
- JWT tokens expire after 7 days

---

## Questions?

Check:
1. Main README.md for project setup
2. `.env.example` for required environment variables
3. Backend API documentation in main README

For database issues, verify:
- PostgreSQL service is running
- Schema `courses_management` exists
- Connection details in `.env` are correct