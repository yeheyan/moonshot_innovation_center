-- ========================================
-- MOONSHOT INNOVATION CENTER DATABASE SCHEMA
-- Course Management System with Session-Based Enrollment
-- ========================================

-- Step 1: Create Database (run separately in default postgres database)
-- CREATE DATABASE innovation_courses;

-- After connecting to innovation_courses database, run everything below:

-- ========================================
-- DROP EXISTING TABLES (for clean setup)
-- ========================================
DROP TABLE IF EXISTS Payment CASCADE;
DROP TABLE IF EXISTS SessionEnrollment CASCADE;
DROP TABLE IF EXISTS Order_Transaction CASCADE;
DROP TABLE IF EXISTS Session CASCADE;
DROP TABLE IF EXISTS Student CASCADE;
DROP TABLE IF EXISTS Course CASCADE;
DROP TABLE IF EXISTS Teacher CASCADE;
DROP TABLE IF EXISTS Admin CASCADE;
DROP TABLE IF EXISTS User_Account CASCADE;

-- ========================================
-- INDEPENDENT TABLES
-- ========================================

-- User Account (Parents)
CREATE TABLE User_Account (
    UserID SERIAL PRIMARY KEY,
    UserName VARCHAR(100) NOT NULL,
    UserPhone VARCHAR(20) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    UserWechat VARCHAR(100),
    UserAddress VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Users
CREATE TABLE Admin (
    AdminID SERIAL PRIMARY KEY,
    AdminName VARCHAR(100) NOT NULL,
    AdminEmail VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    AdminRole VARCHAR(50) DEFAULT 'admin' CHECK (AdminRole IN ('admin', 'super_admin', 'staff')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Teachers
CREATE TABLE Teacher (
    TeacherID SERIAL PRIMARY KEY,
    TeacherName VARCHAR(100) NOT NULL,
    TeacherInfo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Courses
CREATE TABLE Course (
    CourseID SERIAL PRIMARY KEY,
    CourseName VARCHAR(200) NOT NULL,
    CourseDescription TEXT,
    CoursePrice DECIMAL(10,2) NOT NULL CHECK (CoursePrice >= 0),
    CourseMaxEnroll INTEGER CHECK (CourseMaxEnroll > 0),
    CourseStatus VARCHAR(20) DEFAULT 'active' CHECK (CourseStatus IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- DEPENDENT TABLES
-- ========================================

-- Students (linked to User_Account)
CREATE TABLE Student (
    StudentID SERIAL PRIMARY KEY,
    UserID INTEGER NOT NULL REFERENCES User_Account(UserID) ON DELETE CASCADE,
    StudentName VARCHAR(100) NOT NULL,
    StudentNationalID VARCHAR(50) UNIQUE,
    StudentBirthDate DATE NOT NULL,
    StudentGrade VARCHAR(20),
    StudentSchool VARCHAR(200),
    MedicalInfo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT age_check CHECK (StudentBirthDate < CURRENT_DATE)
);

-- Sessions (course offerings with specific teacher and time)
CREATE TABLE Session (
    SessionID SERIAL PRIMARY KEY,
    CourseID INTEGER NOT NULL REFERENCES Course(CourseID) ON DELETE CASCADE,
    TeacherID INTEGER NOT NULL REFERENCES Teacher(TeacherID),
    SessionName VARCHAR(200) NOT NULL,
    SessionStartDate DATE NOT NULL,
    SessionDayOfWeek VARCHAR(10) CHECK (SessionDayOfWeek IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    SessionStartTime TIME NOT NULL,
    SessionEndTime TIME NOT NULL,
    EnrolledCount INTEGER DEFAULT 0 CHECK (EnrolledCount >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT time_check CHECK (SessionEndTime > SessionStartTime)
);

-- Orders (purchase transactions)
CREATE TABLE Order_Transaction (
    OrderID SERIAL PRIMARY KEY,
    UserID INTEGER NOT NULL REFERENCES User_Account(UserID),
    OrderDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    DiscountAmount DECIMAL(10,2) DEFAULT 0 CHECK (DiscountAmount >= 0),
    OrderTotal DECIMAL(10,2) NOT NULL CHECK (OrderTotal >= 0),
    OrderStatus VARCHAR(20) DEFAULT 'pending' CHECK (OrderStatus IN ('pending', 'paid', 'cancelled', 'refunded')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session Enrollments (students enrolled in sessions)
CREATE TABLE SessionEnrollment (
    EnrollmentID SERIAL PRIMARY KEY,
    StudentID INTEGER NOT NULL REFERENCES Student(StudentID),
    SessionID INTEGER NOT NULL REFERENCES Session(SessionID),
    OrderID INTEGER REFERENCES Order_Transaction(OrderID),
    EnrollmentStatus VARCHAR(20) DEFAULT 'active' CHECK (EnrollmentStatus IN ('active', 'waitlisted', 'completed', 'withdrawn')),
    EnrollmentDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(StudentID, SessionID, EnrollmentDate)
);

-- Payments (payment records for orders)
CREATE TABLE Payment (
    PaymentID SERIAL PRIMARY KEY,
    OrderID INTEGER NOT NULL REFERENCES Order_Transaction(OrderID),
    PaymentAmount DECIMAL(10,2) NOT NULL CHECK (PaymentAmount >= 0),
    PaymentDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PaymentMethod VARCHAR(50) CHECK (PaymentMethod IN ('credit_card', 'debit_card', 'wechat', 'alipay', 'cash')),
    PaymentStatus VARCHAR(20) DEFAULT 'pending' CHECK (PaymentStatus IN ('pending', 'completed', 'failed', 'refunded'))
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================
CREATE INDEX idx_student_user ON Student(UserID);
CREATE INDEX idx_session_course ON Session(CourseID);
CREATE INDEX idx_session_teacher ON Session(TeacherID);
CREATE INDEX idx_enrollment_student ON SessionEnrollment(StudentID);
CREATE INDEX idx_enrollment_session ON SessionEnrollment(SessionID);
CREATE INDEX idx_enrollment_status ON SessionEnrollment(EnrollmentStatus);
CREATE INDEX idx_payment_order ON Payment(OrderID);
CREATE INDEX idx_order_user ON Order_Transaction(UserID);
CREATE INDEX idx_user_phone ON User_Account(UserPhone);

-- ========================================
-- BUSINESS CONSTRAINTS
-- ========================================
-- One active enrollment per student at a time
CREATE UNIQUE INDEX unique_active_enrollment 
ON SessionEnrollment(StudentID) 
WHERE EnrollmentStatus IN ('active', 'waitlisted');

-- ========================================
-- DEFAULT ADMIN ACCOUNT
-- ========================================
-- Password: admin123 (hash this properly in production!)
INSERT INTO Admin (AdminName, AdminEmail, password_hash, AdminRole)
VALUES ('System Admin', 'admin@moonshot.com', '$2b$10$YourHashedPasswordHere', 'super_admin');

-- ========================================
-- VERIFY SETUP
-- ========================================
SELECT 'Database schema created successfully!' AS status;

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;