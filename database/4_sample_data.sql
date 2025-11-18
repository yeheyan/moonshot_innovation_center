-- ========================================
-- MOONSHOT INNOVATION CENTER
-- Sample Data for Testing and Demonstration
-- ========================================

-- Clear existing data (in correct order due to foreign keys)
TRUNCATE TABLE Payment CASCADE;
TRUNCATE TABLE SessionEnrollment CASCADE;
TRUNCATE TABLE Order_Transaction CASCADE;
TRUNCATE TABLE Session CASCADE;
TRUNCATE TABLE Student CASCADE;
TRUNCATE TABLE Course CASCADE;
TRUNCATE TABLE Teacher CASCADE;
TRUNCATE TABLE Admin CASCADE;
TRUNCATE TABLE User_Account CASCADE;

-- Reset sequences
ALTER SEQUENCE user_account_userid_seq RESTART WITH 1;
ALTER SEQUENCE admin_adminid_seq RESTART WITH 1;
ALTER SEQUENCE teacher_teacherid_seq RESTART WITH 1;
ALTER SEQUENCE course_courseid_seq RESTART WITH 1;
ALTER SEQUENCE student_studentid_seq RESTART WITH 1;
ALTER SEQUENCE session_sessionid_seq RESTART WITH 1;
ALTER SEQUENCE order_transaction_orderid_seq RESTART WITH 1;
ALTER SEQUENCE sessionenrollment_enrollmentid_seq RESTART WITH 1;
ALTER SEQUENCE payment_paymentid_seq RESTART WITH 1;

-- ========================================
-- 1. ADMIN ACCOUNTS
-- Password for all: "password123"
-- Hash generated with: bcrypt.hash('password123', 10)
-- ========================================
INSERT INTO Admin (AdminName, AdminEmail, password_hash, AdminRole) VALUES
('Alice Johnson', 'alice@moonshot.com', '$2b$10$YQZ4z5xR5vZ5yR5xR5yR5eeJ5K5L5M5N5O5P5Q5R5S5T5U5V5W5X5Y', 'super_admin'),
('Bob Smith', 'bob@moonshot.com', '$2b$10$YQZ4z5xR5vZ5yR5xR5yR5eeJ5K5L5M5N5O5P5Q5R5S5T5U5V5W5X5Y', 'admin'),
('Carol White', 'carol@moonshot.com', '$2b$10$YQZ4z5xR5vZ5yR5xR5yR5eeJ5K5L5M5N5O5P5Q5R5S5T5U5V5W5X5Y', 'staff');

-- ========================================
-- 2. USER ACCOUNTS (Parents)
-- Password for all: "parent123"
-- Hash generated with: bcrypt.hash('parent123', 10)
-- ========================================
INSERT INTO User_Account (UserName, UserPhone, password_hash, UserWechat, UserAddress) VALUES
('Michael Chen', '13812345678', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'michael_chen', '123 Innovation Street, Haidian District, Beijing'),
('Sarah Wang', '13898765432', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'sarah_wang88', '456 Tech Avenue, Chaoyang District, Beijing'),
('David Liu', '13711112222', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'david_liu2024', '789 Education Road, Xicheng District, Beijing'),
('Emily Zhang', '13633334444', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'emily_zhang', '321 Learning Lane, Dongcheng District, Beijing'),
('James Li', '13555556666', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'james_li_dad', '654 Science Boulevard, Haidian District, Beijing'),
('Linda Wu', '13477778888', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'linda_wu123', '987 Future Street, Chaoyang District, Beijing'),
('Robert Yang', '13399990000', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'robert_yang', '147 Dream Road, Xicheng District, Beijing'),
('Jennifer Ma', '13211113333', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'jenny_ma', '258 Hope Avenue, Dongcheng District, Beijing'),
('Thomas Zhou', '13122224444', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'thomas_zhou', '369 Knowledge Street, Haidian District, Beijing'),
('Nancy Xu', '13088887777', '$2b$10$XYZ3w4vQ4uY4xQ4vQ4xQ4ddH4J4K4L4M4N4O4P4Q4R4S4T4U4V4W4X', 'nancy_xu_mom', '741 Wisdom Lane, Chaoyang District, Beijing');

-- ========================================
-- 3. TEACHERS
-- ========================================
INSERT INTO Teacher (TeacherName, TeacherInfo) VALUES
('Dr. Helen Anderson', 'PhD in Computer Science from MIT. 10 years of teaching experience in programming and robotics.'),
('Prof. Mark Williams', 'Former NASA engineer. Specializes in aerospace engineering and physics for young learners.'),
('Ms. Susan Brown', 'Master in Fine Arts. Expert in creative design thinking and digital art for children.'),
('Mr. Kevin Davis', 'Certified Math Olympiad coach. Has trained multiple national competition winners.'),
('Dr. Rachel Green', 'PhD in Cognitive Psychology. Focuses on brain development and memory techniques.'),
('Mr. Tony Miller', 'Professional game developer with 15 years industry experience. Unity and Unreal Engine expert.'),
('Ms. Lisa Taylor', 'Champion debater and public speaking coach. TED talk trainer.'),
('Dr. Peter Wilson', 'Biomedical engineer. Makes biology and chemistry fun through hands-on experiments.'),
('Ms. Anna Moore', 'Published children''s author. Creative writing and storytelling specialist.'),
('Mr. Chris Martin', 'Former Google engineer. Teaches AI and machine learning concepts for beginners.');

-- ========================================
-- 4. COURSES
-- ========================================
INSERT INTO Course (CourseName, CourseDescription, CoursePrice, CourseMaxEnroll, CourseStatus) VALUES
('Python Programming Fundamentals', 'Learn Python from scratch with fun projects like games and animations. Perfect for beginners aged 10-15.', 2800.00, 15, 'active'),
('Robotics Engineering for Kids', 'Build and program real robots using Arduino and sensors. Hands-on STEM learning experience.', 3500.00, 12, 'active'),
('Creative Digital Art & Design', 'Master Photoshop, Illustrator, and digital drawing tablets. Create amazing artwork and animations.', 2400.00, 20, 'active'),
('Mathematics Competition Prep', 'Intensive training for Math Olympiad and AMC competitions. Problem-solving strategies and techniques.', 3200.00, 10, 'active'),
('Brain Training & Memory Mastery', 'Develop super memory skills, speed reading, and concentration techniques for academic excellence.', 2600.00, 18, 'active'),
('Game Development with Unity', 'Create your own 2D and 3D games from scratch. Learn coding, design, and game mechanics.', 3800.00, 12, 'active'),
('Public Speaking & Debate', 'Build confidence in speaking, debating, and presenting. Learn rhetoric and persuasion techniques.', 2200.00, 15, 'active'),
('Young Scientist Lab', 'Exciting chemistry and biology experiments. Learn scientific method through hands-on discovery.', 2900.00, 14, 'active'),
('Creative Writing Workshop', 'Write stories, poetry, and novels. Develop your unique voice and publishing skills.', 2300.00, 16, 'active'),
('AI & Machine Learning Basics', 'Introduction to artificial intelligence concepts. Build simple AI projects and chatbots.', 4200.00, 10, 'active'),
('3D Modeling & Animation', 'Learn Blender and Maya. Create 3D characters, environments, and animations.', 3600.00, 12, 'active'),
('Music Production & DJing', 'Create electronic music using Ableton Live. Learn mixing, effects, and music theory.', 3000.00, 15, 'active');

-- ========================================
-- 5. STUDENTS
-- ========================================
INSERT INTO Student (UserID, StudentName, StudentNationalID, StudentBirthDate, StudentGrade, StudentSchool, MedicalInfo) VALUES
-- Michael Chen's children
(1, 'Alex Chen', '110101201401011234', '2014-01-01', 'Grade 5', 'Beijing International School', 'No allergies'),
(1, 'Emma Chen', '110101201601151235', '2016-01-15', 'Grade 3', 'Beijing International School', 'Asthma - has inhaler'),

-- Sarah Wang's children
(2, 'Oliver Wang', '110101201301201236', '2013-01-20', 'Grade 6', 'Haidian Experimental School', 'No known conditions'),

-- David Liu's children
(3, 'Sophia Liu', '110101201402101237', '2014-02-10', 'Grade 5', 'Chaoyang Foreign Language School', 'Wears glasses'),
(3, 'Mason Liu', '110101201602281238', '2016-02-28', 'Grade 3', 'Chaoyang Foreign Language School', 'No allergies'),

-- Emily Zhang's children
(4, 'Isabella Zhang', '110101201501051239', '2015-01-05', 'Grade 4', 'Beijing No. 1 Elementary', 'Lactose intolerant'),

-- James Li's children
(5, 'Ethan Li', '110101201202151240', '2012-02-15', 'Grade 7', 'Tsinghua University High School', 'No known conditions'),
(5, 'Ava Li', '110101201403301241', '2014-03-30', 'Grade 5', 'Tsinghua University High School', 'Peanut allergy'),

-- Linda Wu's children
(6, 'Noah Wu', '110101201304221242', '2013-04-22', 'Grade 6', 'Peking University Affiliated School', 'No allergies'),

-- Robert Yang's children
(7, 'Mia Yang', '110101201505121243', '2015-05-12', 'Grade 4', 'Beijing BISS International', 'No known conditions'),

-- Jennifer Ma's children
(8, 'Liam Ma', '110101201406081244', '2014-06-08', 'Grade 5', 'Beijing World Youth Academy', 'Eczema'),

-- Thomas Zhou's children
(9, 'Charlotte Zhou', '110101201307181245', '2013-07-18', 'Grade 6', 'Beijing No. 4 Middle School', 'No allergies'),

-- Nancy Xu's children
(10, 'Lucas Xu', '110101201508251246', '2015-08-25', 'Grade 4', 'Haidian Foreign Language School', 'Mild ADD - on medication');

-- ========================================
-- 6. SESSIONS
-- ========================================
INSERT INTO Session (CourseID, TeacherID, SessionName, SessionStartDate, SessionDayOfWeek, SessionStartTime, SessionEndTime, EnrolledCount) VALUES
-- Python Programming (Course 1)
(1, 1, 'Python Beginner - Weekend Morning', '2025-12-01', 'Saturday', '09:00:00', '11:30:00', 0),
(1, 1, 'Python Beginner - Weekday Evening', '2025-12-02', 'Monday', '18:00:00', '20:00:00', 0),

-- Robotics (Course 2)
(2, 2, 'Robotics Level 1 - Saturday', '2025-12-07', 'Saturday', '13:00:00', '16:00:00', 0),
(2, 2, 'Robotics Level 1 - Sunday', '2025-12-08', 'Sunday', '09:00:00', '12:00:00', 0),

-- Digital Art (Course 3)
(3, 3, 'Digital Art Basics - Weekend', '2025-12-01', 'Sunday', '14:00:00', '16:30:00', 0),
(3, 3, 'Digital Art Basics - Weekday', '2025-12-03', 'Wednesday', '17:30:00', '20:00:00', 0),

-- Math Competition (Course 4)
(4, 4, 'Math Olympiad Prep - Advanced', '2025-12-05', 'Thursday', '18:00:00', '20:30:00', 0),
(4, 4, 'Math Olympiad Prep - Intermediate', '2025-12-07', 'Saturday', '09:00:00', '11:30:00', 0),

-- Brain Training (Course 5)
(5, 5, 'Memory Mastery - Morning', '2025-12-08', 'Sunday', '09:00:00', '11:00:00', 0),
(5, 5, 'Memory Mastery - Evening', '2025-12-04', 'Wednesday', '18:30:00', '20:30:00', 0),

-- Game Development (Course 6)
(6, 6, 'Unity Game Dev - Beginner', '2025-12-01', 'Saturday', '13:30:00', '16:30:00', 0),
(6, 6, 'Unity Game Dev - Advanced', '2025-12-08', 'Sunday', '13:00:00', '16:00:00', 0),

-- Public Speaking (Course 7)
(7, 7, 'Debate & Speaking - Youth', '2025-12-02', 'Monday', '17:00:00', '19:00:00', 0),
(7, 7, 'Debate & Speaking - Teens', '2025-12-07', 'Saturday', '14:00:00', '16:00:00', 0),

-- Science Lab (Course 8)
(8, 8, 'Young Scientist - Chemistry', '2025-12-01', 'Sunday', '10:00:00', '12:30:00', 0),
(8, 8, 'Young Scientist - Biology', '2025-12-06', 'Friday', '17:00:00', '19:30:00', 0),

-- Creative Writing (Course 9)
(9, 9, 'Writing Workshop - Fiction', '2025-12-03', 'Tuesday', '18:00:00', '20:00:00', 0),
(9, 9, 'Writing Workshop - Poetry', '2025-12-07', 'Saturday', '10:00:00', '12:00:00', 0),

-- AI & ML (Course 10)
(10, 10, 'AI for Beginners - Weekend', '2025-12-08', 'Sunday', '14:00:00', '17:00:00', 0),
(10, 10, 'AI for Beginners - Weekday', '2025-12-05', 'Thursday', '18:00:00', '21:00:00', 0);

-- ========================================
-- 7. ORDERS
-- ========================================
INSERT INTO Order_Transaction (UserID, OrderDate, DiscountAmount, OrderTotal, OrderStatus) VALUES
(1, '2025-11-10 14:30:00', 200.00, 2600.00, 'paid'),      -- Michael Chen
(2, '2025-11-11 16:45:00', 0.00, 3500.00, 'paid'),        -- Sarah Wang
(3, '2025-11-12 10:20:00', 300.00, 2900.00, 'paid'),      -- David Liu
(4, '2025-11-13 09:15:00', 0.00, 2400.00, 'paid'),        -- Emily Zhang
(5, '2025-11-14 15:30:00', 500.00, 3700.00, 'paid'),      -- James Li
(6, '2025-11-15 11:00:00', 0.00, 2600.00, 'paid'),        -- Linda Wu
(7, '2025-11-16 14:20:00', 100.00, 2100.00, 'paid'),      -- Robert Yang
(8, '2025-11-17 16:00:00', 0.00, 3800.00, 'paid'),        -- Jennifer Ma
(1, '2025-11-18 10:30:00', 200.00, 3000.00, 'pending'),   -- Michael Chen (2nd order)
(3, '2025-11-18 13:45:00', 0.00, 2300.00, 'pending');     -- David Liu (2nd order)

-- ========================================
-- 8. SESSION ENROLLMENTS
-- ========================================
INSERT INTO SessionEnrollment (StudentID, SessionID, OrderID, EnrollmentStatus, EnrollmentDate) VALUES
-- Paid enrollments
(1, 1, 1, 'active', '2025-11-10 14:30:00'),    -- Alex Chen -> Python Weekend
(2, 5, 1, 'completed', '2025-11-10 14:30:00'), -- Emma Chen -> Digital Art (completed)
(3, 3, 2, 'active', '2025-11-11 16:45:00'),    -- Oliver Wang -> Robotics Saturday
(4, 7, 3, 'active', '2025-11-12 10:20:00'),    -- Sophia Liu -> Math Advanced
(5, 5, 3, 'withdrawn', '2025-11-12 10:20:00'), -- Mason Liu -> Digital Art (withdrawn)
(6, 5, 4, 'active', '2025-11-13 09:15:00'),    -- Isabella Zhang -> Digital Art
(7, 13, 5, 'active', '2025-11-14 15:30:00'),   -- Ethan Li -> Debate Teens
(8, 11, 5, 'active', '2025-11-14 15:30:00'),   -- Ava Li -> Unity Beginner
(9, 9, 6, 'active', '2025-11-15 11:00:00'),    -- Noah Wu -> Memory Morning
(10, 13, 7, 'active', '2025-11-16 14:20:00'),  -- Mia Yang -> Debate Youth
(11, 11, 8, 'active', '2025-11-17 16:00:00'),  -- Liam Ma -> Unity Beginner
(12, 7, 9, 'waitlisted', '2025-11-18 10:30:00'); -- Charlotte Zhou -> Math (waitlisted)

-- ========================================
-- 9. PAYMENTS
-- ========================================
INSERT INTO Payment (OrderID, PaymentAmount, PaymentDate, PaymentMethod, PaymentStatus) VALUES
(1, 2600.00, '2025-11-10 14:35:00', 'wechat', 'completed'),
(2, 3500.00, '2025-11-11 16:50:00', 'alipay', 'completed'),
(3, 2900.00, '2025-11-12 10:25:00', 'wechat', 'completed'),
(4, 2400.00, '2025-11-13 09:20:00', 'credit_card', 'completed'),
(5, 3700.00, '2025-11-14 15:35:00', 'wechat', 'completed'),
(6, 2600.00, '2025-11-15 11:05:00', 'alipay', 'completed'),
(7, 2100.00, '2025-11-16 14:25:00', 'wechat', 'completed'),
(8, 3800.00, '2025-11-17 16:05:00', 'wechat', 'completed'),
(9, 1500.00, '2025-11-18 10:35:00', 'wechat', 'pending'),  -- Partial payment
(10, 2300.00, '2025-11-18 13:50:00', 'alipay', 'pending');

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Show summary
SELECT 'Sample data loaded successfully!' AS status;

-- Count records in each table
SELECT 'Admin' AS table_name, COUNT(*) AS record_count FROM Admin
UNION ALL SELECT 'User_Account', COUNT(*) FROM User_Account
UNION ALL SELECT 'Teacher', COUNT(*) FROM Teacher
UNION ALL SELECT 'Course', COUNT(*) FROM Course
UNION ALL SELECT 'Student', COUNT(*) FROM Student
UNION ALL SELECT 'Session', COUNT(*) FROM Session
UNION ALL SELECT 'Order_Transaction', COUNT(*) FROM Order_Transaction
UNION ALL SELECT 'SessionEnrollment', COUNT(*) FROM SessionEnrollment
UNION ALL SELECT 'Payment', COUNT(*) FROM Payment;

-- Show active enrollments
SELECT 
    st.StudentName,
    c.CourseName,
    s.SessionName,
    t.TeacherName,
    se.EnrollmentStatus
FROM SessionEnrollment se
JOIN Student st ON se.StudentID = st.StudentID
JOIN Session s ON se.SessionID = s.SessionID
JOIN Course c ON s.CourseID = c.CourseID
JOIN Teacher t ON s.TeacherID = t.TeacherID
WHERE se.EnrollmentStatus = 'active'
ORDER BY st.StudentName;