-- ========================================
-- MOONSHOT INNOVATION CENTER
-- Stored Procedures, Triggers, and Useful Queries
-- ========================================

-- ========================================
-- TRIGGERS
-- ========================================

-- 1. Auto-update timestamp on User_Account changes
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_modtime
    BEFORE UPDATE ON User_Account
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- 2. Automatically update EnrolledCount when enrollment changes
CREATE OR REPLACE FUNCTION update_enrolled_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.EnrollmentStatus IN ('active', 'waitlisted') THEN
            UPDATE Session 
            SET EnrolledCount = EnrolledCount + 1 
            WHERE SessionID = NEW.SessionID;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.EnrollmentStatus IN ('active', 'waitlisted') AND 
           NEW.EnrollmentStatus NOT IN ('active', 'waitlisted') THEN
            UPDATE Session 
            SET EnrolledCount = EnrolledCount - 1 
            WHERE SessionID = NEW.SessionID;
        ELSIF OLD.EnrollmentStatus NOT IN ('active', 'waitlisted') AND 
              NEW.EnrollmentStatus IN ('active', 'waitlisted') THEN
            UPDATE Session 
            SET EnrolledCount = EnrolledCount + 1 
            WHERE SessionID = NEW.SessionID;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.EnrollmentStatus IN ('active', 'waitlisted') THEN
            UPDATE Session 
            SET EnrolledCount = EnrolledCount - 1 
            WHERE SessionID = OLD.SessionID;
        END IF;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_enrolled_count
    AFTER INSERT OR UPDATE OR DELETE ON SessionEnrollment
    FOR EACH ROW
    EXECUTE FUNCTION update_enrolled_count();

-- 3. Prevent enrollment if session is full
CREATE OR REPLACE FUNCTION check_session_capacity()
RETURNS TRIGGER AS $$
DECLARE
    max_capacity INTEGER;
    current_count INTEGER;
BEGIN
    SELECT c.CourseMaxEnroll, s.EnrolledCount
    INTO max_capacity, current_count
    FROM Session s
    JOIN Course c ON s.CourseID = c.CourseID
    WHERE s.SessionID = NEW.SessionID;
    
    IF NEW.EnrollmentStatus = 'active' AND current_count >= max_capacity THEN
        RAISE EXCEPTION 'Session is full. Maximum capacity: %', max_capacity;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_capacity
    BEFORE INSERT OR UPDATE ON SessionEnrollment
    FOR EACH ROW
    EXECUTE FUNCTION check_session_capacity();

-- 4. Calculate order total automatically
CREATE OR REPLACE FUNCTION calculate_order_total()
RETURNS TRIGGER AS $$
DECLARE
    total_price DECIMAL(10,2);
BEGIN
    -- Sum up all session prices in this order
    SELECT COALESCE(SUM(c.CoursePrice), 0)
    INTO total_price
    FROM SessionEnrollment se
    JOIN Session s ON se.SessionID = s.SessionID
    JOIN Course c ON s.CourseID = c.CourseID
    WHERE se.OrderID = NEW.OrderID;
    
    -- Apply discount
    NEW.OrderTotal = total_price - COALESCE(NEW.DiscountAmount, 0);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_order_total
    BEFORE INSERT OR UPDATE ON Order_Transaction
    FOR EACH ROW
    EXECUTE FUNCTION calculate_order_total();

-- ========================================
-- STORED PROCEDURES
-- ========================================

-- 1. Enroll student in a session
CREATE OR REPLACE FUNCTION enroll_student(
    p_student_id INTEGER,
    p_session_id INTEGER,
    p_order_id INTEGER DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_enrollment_id INTEGER;
    v_max_capacity INTEGER;
    v_current_count INTEGER;
    v_status VARCHAR(20);
BEGIN
    -- Check capacity
    SELECT c.CourseMaxEnroll, s.EnrolledCount
    INTO v_max_capacity, v_current_count
    FROM Session s
    JOIN Course c ON s.CourseID = c.CourseID
    WHERE s.SessionID = p_session_id;
    
    -- Determine status
    IF v_current_count < v_max_capacity THEN
        v_status := 'active';
    ELSE
        v_status := 'waitlisted';
    END IF;
    
    -- Insert enrollment
    INSERT INTO SessionEnrollment (StudentID, SessionID, OrderID, EnrollmentStatus)
    VALUES (p_student_id, p_session_id, p_order_id, v_status)
    RETURNING EnrollmentID INTO v_enrollment_id;
    
    RETURN v_enrollment_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Process payment and update order status
CREATE OR REPLACE FUNCTION process_payment(
    p_order_id INTEGER,
    p_amount DECIMAL(10,2),
    p_method VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    v_payment_id INTEGER;
BEGIN
    -- Insert payment record
    INSERT INTO Payment (OrderID, PaymentAmount, PaymentMethod, PaymentStatus)
    VALUES (p_order_id, p_amount, p_method, 'completed')
    RETURNING PaymentID INTO v_payment_id;
    
    -- Update order status
    UPDATE Order_Transaction
    SET OrderStatus = 'paid'
    WHERE OrderID = p_order_id;
    
    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Get available sessions for a course
CREATE OR REPLACE FUNCTION get_available_sessions(p_course_id INTEGER)
RETURNS TABLE (
    session_id INTEGER,
    session_name VARCHAR(200),
    teacher_name VARCHAR(100),
    start_date DATE,
    day_of_week VARCHAR(10),
    start_time TIME,
    end_time TIME,
    enrolled_count INTEGER,
    max_capacity INTEGER,
    available_spots INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.SessionID,
        s.SessionName,
        t.TeacherName,
        s.SessionStartDate,
        s.SessionDayOfWeek,
        s.SessionStartTime,
        s.SessionEndTime,
        s.EnrolledCount,
        c.CourseMaxEnroll,
        (c.CourseMaxEnroll - s.EnrolledCount) AS available_spots
    FROM Session s
    JOIN Teacher t ON s.TeacherID = t.TeacherID
    JOIN Course c ON s.CourseID = c.CourseID
    WHERE s.CourseID = p_course_id
        AND s.SessionStartDate > CURRENT_DATE
    ORDER BY s.SessionStartDate, s.SessionStartTime;
END;
$$ LANGUAGE plpgsql;

-- 4. Get student enrollment history
CREATE OR REPLACE FUNCTION get_student_enrollments(p_student_id INTEGER)
RETURNS TABLE (
    enrollment_id INTEGER,
    course_name VARCHAR(200),
    session_name VARCHAR(200),
    teacher_name VARCHAR(100),
    enrollment_status VARCHAR(20),
    enrollment_date TIMESTAMP,
    course_price DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        se.EnrollmentID,
        c.CourseName,
        s.SessionName,
        t.TeacherName,
        se.EnrollmentStatus,
        se.EnrollmentDate,
        c.CoursePrice
    FROM SessionEnrollment se
    JOIN Session s ON se.SessionID = s.SessionID
    JOIN Course c ON s.CourseID = c.CourseID
    JOIN Teacher t ON s.TeacherID = t.TeacherID
    WHERE se.StudentID = p_student_id
    ORDER BY se.EnrollmentDate DESC;
END;
$$ LANGUAGE plpgsql;

-- 5. Withdraw student from session with refund
CREATE OR REPLACE FUNCTION withdraw_student(
    p_enrollment_id INTEGER,
    p_refund BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN AS $$
DECLARE
    v_order_id INTEGER;
BEGIN
    -- Update enrollment status
    UPDATE SessionEnrollment
    SET EnrollmentStatus = 'withdrawn'
    WHERE EnrollmentID = p_enrollment_id
    RETURNING OrderID INTO v_order_id;
    
    -- Process refund if requested
    IF p_refund AND v_order_id IS NOT NULL THEN
        UPDATE Order_Transaction
        SET OrderStatus = 'refunded'
        WHERE OrderID = v_order_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- USEFUL QUERIES (Save as Views)
-- ========================================

-- View: Active enrollments with full details
CREATE OR REPLACE VIEW v_active_enrollments AS
SELECT 
    se.EnrollmentID,
    st.StudentName,
    st.StudentID,
    u.UserName AS ParentName,
    u.UserPhone AS ParentPhone,
    c.CourseName,
    s.SessionName,
    t.TeacherName,
    s.SessionDayOfWeek,
    s.SessionStartTime,
    s.SessionEndTime,
    se.EnrollmentDate,
    c.CoursePrice
FROM SessionEnrollment se
JOIN Student st ON se.StudentID = st.StudentID
JOIN User_Account u ON st.UserID = u.UserID
JOIN Session s ON se.SessionID = s.SessionID
JOIN Course c ON s.CourseID = c.CourseID
JOIN Teacher t ON s.TeacherID = t.TeacherID
WHERE se.EnrollmentStatus = 'active';

-- View: Revenue summary by course
CREATE OR REPLACE VIEW v_revenue_by_course AS
SELECT 
    c.CourseID,
    c.CourseName,
    COUNT(se.EnrollmentID) AS TotalEnrollments,
    SUM(c.CoursePrice) AS TotalRevenue,
    AVG(c.CoursePrice) AS AvgPrice
FROM Course c
LEFT JOIN Session s ON c.CourseID = s.CourseID
LEFT JOIN SessionEnrollment se ON s.SessionID = se.SessionID
WHERE se.EnrollmentStatus IN ('active', 'completed')
GROUP BY c.CourseID, c.CourseName
ORDER BY TotalRevenue DESC;

-- View: Session capacity overview
CREATE OR REPLACE VIEW v_session_capacity AS
SELECT 
    s.SessionID,
    c.CourseName,
    s.SessionName,
    t.TeacherName,
    s.SessionStartDate,
    s.EnrolledCount,
    c.CourseMaxEnroll AS MaxCapacity,
    (c.CourseMaxEnroll - s.EnrolledCount) AS AvailableSpots,
    ROUND((s.EnrolledCount::DECIMAL / c.CourseMaxEnroll) * 100, 2) AS CapacityPercent
FROM Session s
JOIN Course c ON s.CourseID = c.CourseID
JOIN Teacher t ON s.TeacherID = t.TeacherID
WHERE s.SessionStartDate > CURRENT_DATE
ORDER BY s.SessionStartDate;

-- View: Parent dashboard (all their children and enrollments)
CREATE OR REPLACE VIEW v_parent_dashboard AS
SELECT 
    u.UserID,
    u.UserName AS ParentName,
    u.UserPhone,
    st.StudentID,
    st.StudentName,
    st.StudentGrade,
    COUNT(se.EnrollmentID) AS ActiveEnrollments,
    SUM(c.CoursePrice) AS TotalSpent
FROM User_Account u
LEFT JOIN Student st ON u.UserID = st.UserID
LEFT JOIN SessionEnrollment se ON st.StudentID = se.StudentID AND se.EnrollmentStatus = 'active'
LEFT JOIN Session s ON se.SessionID = s.SessionID
LEFT JOIN Course c ON s.CourseID = c.CourseID
GROUP BY u.UserID, u.UserName, u.UserPhone, st.StudentID, st.StudentName, st.StudentGrade
ORDER BY u.UserID, st.StudentID;

-- ========================================
-- COMMON QUERY EXAMPLES
-- ========================================

-- 1. Find all sessions starting this week
/*
SELECT * FROM Session
WHERE SessionStartDate >= date_trunc('week', CURRENT_DATE)
  AND SessionStartDate < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
ORDER BY SessionStartDate, SessionStartTime;
*/

-- 2. Get students who haven't enrolled in any course
/*
SELECT st.StudentID, st.StudentName, u.UserName AS ParentName, u.UserPhone
FROM Student st
JOIN User_Account u ON st.UserID = u.UserID
LEFT JOIN SessionEnrollment se ON st.StudentID = se.StudentID
WHERE se.EnrollmentID IS NULL;
*/

-- 3. Get most popular courses (by enrollment)
/*
SELECT 
    c.CourseName,
    COUNT(se.EnrollmentID) AS TotalEnrollments,
    COUNT(DISTINCT st.StudentID) AS UniqueStudents
FROM Course c
JOIN Session s ON c.CourseID = s.CourseID
JOIN SessionEnrollment se ON s.SessionID = se.SessionID
WHERE se.EnrollmentStatus IN ('active', 'completed')
GROUP BY c.CourseID, c.CourseName
ORDER BY TotalEnrollments DESC
LIMIT 10;
*/

-- 4. Find sessions that are almost full (>80% capacity)
/*
SELECT 
    c.CourseName,
    s.SessionName,
    s.EnrolledCount,
    c.CourseMaxEnroll,
    ROUND((s.EnrolledCount::DECIMAL / c.CourseMaxEnroll) * 100, 2) AS CapacityPercent
FROM Session s
JOIN Course c ON s.CourseID = c.CourseID
WHERE s.SessionStartDate > CURRENT_DATE
  AND (s.EnrolledCount::DECIMAL / c.CourseMaxEnroll) > 0.8
ORDER BY CapacityPercent DESC;
*/

-- 5. Get payment history for a user
/*
SELECT 
    o.OrderID,
    o.OrderDate,
    o.OrderTotal,
    o.OrderStatus,
    p.PaymentAmount,
    p.PaymentMethod,
    p.PaymentDate,
    STRING_AGG(c.CourseName, ', ') AS Courses
FROM Order_Transaction o
LEFT JOIN Payment p ON o.OrderID = p.OrderID
LEFT JOIN SessionEnrollment se ON o.OrderID = se.OrderID
LEFT JOIN Session s ON se.SessionID = s.SessionID
LEFT JOIN Course c ON s.CourseID = c.CourseID
WHERE o.UserID = 1  -- Replace with actual UserID
GROUP BY o.OrderID, o.OrderDate, o.OrderTotal, o.OrderStatus, 
         p.PaymentAmount, p.PaymentMethod, p.PaymentDate
ORDER BY o.OrderDate DESC;
*/

-- 6. Teacher workload (number of sessions and students)
/*
SELECT 
    t.TeacherName,
    COUNT(DISTINCT s.SessionID) AS TotalSessions,
    SUM(s.EnrolledCount) AS TotalStudents,
    COUNT(DISTINCT s.SessionDayOfWeek) AS DaysTeaching
FROM Teacher t
LEFT JOIN Session s ON t.TeacherID = s.TeacherID
WHERE s.SessionStartDate > CURRENT_DATE
GROUP BY t.TeacherID, t.TeacherName
ORDER BY TotalStudents DESC;
*/

-- ========================================
-- MAINTENANCE QUERIES
-- ========================================

-- Archive completed sessions (mark as completed)
/*
UPDATE SessionEnrollment
SET EnrollmentStatus = 'completed'
WHERE SessionID IN (
    SELECT SessionID FROM Session
    WHERE SessionStartDate < CURRENT_DATE - INTERVAL '3 months'
)
AND EnrollmentStatus = 'active';
*/

-- Find orphaned records (sessions without enrollments)
/*
SELECT s.SessionID, s.SessionName, c.CourseName
FROM Session s
JOIN Course c ON s.CourseID = c.CourseID
LEFT JOIN SessionEnrollment se ON s.SessionID = se.SessionID
WHERE se.EnrollmentID IS NULL
  AND s.SessionStartDate < CURRENT_DATE;
*/