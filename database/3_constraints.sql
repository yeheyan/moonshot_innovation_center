-- ========================================
-- MOONSHOT INNOVATION CENTER
-- Advanced Constraints and Data Integrity Rules
-- ========================================

-- ========================================
-- TABLE-LEVEL CHECK CONSTRAINTS
-- ========================================

-- User_Account constraints
ALTER TABLE User_Account
ADD CONSTRAINT chk_user_phone_format 
CHECK (UserPhone ~ '^\+?[0-9]{10,15}$');  -- Valid phone format

ALTER TABLE User_Account
ADD CONSTRAINT chk_user_name_length
CHECK (LENGTH(TRIM(UserName)) >= 2);

-- Student constraints
ALTER TABLE Student
ADD CONSTRAINT chk_student_age
CHECK (StudentBirthDate <= CURRENT_DATE - INTERVAL '3 years');  -- At least 3 years old

ALTER TABLE Student
ADD CONSTRAINT chk_student_age_max
CHECK (StudentBirthDate >= CURRENT_DATE - INTERVAL '18 years');  -- Under 18

ALTER TABLE Student
ADD CONSTRAINT chk_student_grade_valid
CHECK (StudentGrade IN ('Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 
                        'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 
                        'Grade 10', 'Grade 11', 'Grade 12'));

-- Course constraints
ALTER TABLE Course
ADD CONSTRAINT chk_course_price_reasonable
CHECK (CoursePrice >= 0 AND CoursePrice <= 100000);  -- Max 100,000 yuan

ALTER TABLE Course
ADD CONSTRAINT chk_course_capacity
CHECK (CourseMaxEnroll BETWEEN 1 AND 50);  -- Reasonable class size

ALTER TABLE Course
ADD CONSTRAINT chk_course_name_length
CHECK (LENGTH(TRIM(CourseName)) >= 3);

-- Session constraints
ALTER TABLE Session
ADD CONSTRAINT chk_session_duration
CHECK (SessionEndTime - SessionStartTime >= INTERVAL '30 minutes');  -- Minimum 30 min

ALTER TABLE Session
ADD CONSTRAINT chk_session_duration_max
CHECK (SessionEndTime - SessionStartTime <= INTERVAL '4 hours');  -- Maximum 4 hours

ALTER TABLE Session
ADD CONSTRAINT chk_session_future_date
CHECK (SessionStartDate >= CURRENT_DATE - INTERVAL '1 year');  -- Not too far in past

ALTER TABLE Session
ADD CONSTRAINT chk_session_reasonable_time
CHECK (SessionStartTime >= '06:00:00' AND SessionEndTime <= '22:00:00');  -- Reasonable hours

-- Order_Transaction constraints
ALTER TABLE Order_Transaction
ADD CONSTRAINT chk_discount_not_exceed_total
CHECK (DiscountAmount <= OrderTotal + DiscountAmount);  -- Discount can't exceed original price

ALTER TABLE Order_Transaction
ADD CONSTRAINT chk_order_total_reasonable
CHECK (OrderTotal >= 0 AND OrderTotal <= 1000000);  -- Max 1 million yuan per order

-- Payment constraints
ALTER TABLE Payment
ADD CONSTRAINT chk_payment_amount_positive
CHECK (PaymentAmount > 0);

ALTER TABLE Payment
ADD CONSTRAINT chk_payment_date_not_future
CHECK (PaymentDate <= CURRENT_TIMESTAMP);

-- Admin constraints
ALTER TABLE Admin
ADD CONSTRAINT chk_admin_email_format
CHECK (AdminEmail ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- ========================================
-- FOREIGN KEY CONSTRAINTS WITH SPECIFIC BEHAVIORS
-- ========================================

-- Note: Most FK constraints are already in schema.sql
-- These are additional advanced FK behaviors

-- Prevent deletion of Course if it has future sessions
CREATE OR REPLACE FUNCTION prevent_course_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM Session 
        WHERE CourseID = OLD.CourseID 
        AND SessionStartDate >= CURRENT_DATE
    ) THEN
        RAISE EXCEPTION 'Cannot delete course with upcoming sessions';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_course_deletion
    BEFORE DELETE ON Course
    FOR EACH ROW
    EXECUTE FUNCTION prevent_course_deletion();

-- Prevent deletion of Teacher if they have upcoming sessions
CREATE OR REPLACE FUNCTION prevent_teacher_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM Session 
        WHERE TeacherID = OLD.TeacherID 
        AND SessionStartDate >= CURRENT_DATE
    ) THEN
        RAISE EXCEPTION 'Cannot delete teacher with upcoming sessions';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_teacher_deletion
    BEFORE DELETE ON Teacher
    FOR EACH ROW
    EXECUTE FUNCTION prevent_teacher_deletion();

-- ========================================
-- BUSINESS LOGIC CONSTRAINTS
-- ========================================

-- 1. Student can only have one active enrollment at a time (already in schema via unique index)
-- But let's add a more detailed check:
CREATE OR REPLACE FUNCTION check_single_active_enrollment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.EnrollmentStatus IN ('active', 'waitlisted') THEN
        IF EXISTS (
            SELECT 1 FROM SessionEnrollment
            WHERE StudentID = NEW.StudentID
            AND EnrollmentID != COALESCE(NEW.EnrollmentID, 0)
            AND EnrollmentStatus IN ('active', 'waitlisted')
        ) THEN
            RAISE EXCEPTION 'Student already has an active enrollment';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_single_active_enrollment
    BEFORE INSERT OR UPDATE ON SessionEnrollment
    FOR EACH ROW
    EXECUTE FUNCTION check_single_active_enrollment();

-- 2. Payment amount must match order total
CREATE OR REPLACE FUNCTION validate_payment_amount()
RETURNS TRIGGER AS $$
DECLARE
    v_order_total DECIMAL(10,2);
    v_total_paid DECIMAL(10,2);
BEGIN
    SELECT OrderTotal INTO v_order_total
    FROM Order_Transaction
    WHERE OrderID = NEW.OrderID;
    
    SELECT COALESCE(SUM(PaymentAmount), 0) INTO v_total_paid
    FROM Payment
    WHERE OrderID = NEW.OrderID
    AND PaymentID != COALESCE(NEW.PaymentID, 0)
    AND PaymentStatus = 'completed';
    
    IF (v_total_paid + NEW.PaymentAmount) > v_order_total THEN
        RAISE EXCEPTION 'Payment amount exceeds order total. Order: %, Paid: %, New: %', 
                        v_order_total, v_total_paid, NEW.PaymentAmount;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_payment_amount
    BEFORE INSERT OR UPDATE ON Payment
    FOR EACH ROW
    EXECUTE FUNCTION validate_payment_amount();

-- 3. Enrollment date must be before session start date
CREATE OR REPLACE FUNCTION validate_enrollment_date()
RETURNS TRIGGER AS $$
DECLARE
    v_session_start DATE;
BEGIN
    SELECT SessionStartDate INTO v_session_start
    FROM Session
    WHERE SessionID = NEW.SessionID;
    
    IF DATE(NEW.EnrollmentDate) > v_session_start THEN
        RAISE EXCEPTION 'Cannot enroll after session has started';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_enrollment_date
    BEFORE INSERT ON SessionEnrollment
    FOR EACH ROW
    EXECUTE FUNCTION validate_enrollment_date();

-- 4. Prevent overlapping sessions for same teacher
CREATE OR REPLACE FUNCTION prevent_teacher_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM Session
        WHERE TeacherID = NEW.TeacherID
        AND SessionID != COALESCE(NEW.SessionID, 0)
        AND SessionDayOfWeek = NEW.SessionDayOfWeek
        AND (
            (NEW.SessionStartTime, NEW.SessionEndTime) OVERLAPS 
            (SessionStartTime, SessionEndTime)
        )
        AND SessionStartDate = NEW.SessionStartDate
    ) THEN
        RAISE EXCEPTION 'Teacher has overlapping session on % from % to %',
                        NEW.SessionDayOfWeek, NEW.SessionStartTime, NEW.SessionEndTime;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_teacher_overlap
    BEFORE INSERT OR UPDATE ON Session
    FOR EACH ROW
    EXECUTE FUNCTION prevent_teacher_overlap();

-- 5. Order must have at least one enrollment
CREATE OR REPLACE FUNCTION validate_order_has_enrollment()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM SessionEnrollment
        WHERE OrderID = OLD.OrderID
    ) THEN
        RAISE EXCEPTION 'Cannot delete enrollment - order must have at least one enrollment';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_order_enrollment
    BEFORE DELETE ON SessionEnrollment
    FOR EACH ROW
    WHEN (OLD.OrderID IS NOT NULL)
    EXECUTE FUNCTION validate_order_has_enrollment();

-- ========================================
-- REFERENTIAL INTEGRITY CONSTRAINTS
-- ========================================

-- Ensure SessionEnrollment references valid active Session
CREATE OR REPLACE FUNCTION validate_session_active()
RETURNS TRIGGER AS $$
DECLARE
    v_session_date DATE;
BEGIN
    SELECT SessionStartDate INTO v_session_date
    FROM Session
    WHERE SessionID = NEW.SessionID;
    
    IF v_session_date < CURRENT_DATE - INTERVAL '1 month' THEN
        RAISE EXCEPTION 'Cannot enroll in past session';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_session_active
    BEFORE INSERT ON SessionEnrollment
    FOR EACH ROW
    EXECUTE FUNCTION validate_session_active();

-- Ensure Course is active before creating Session
CREATE OR REPLACE FUNCTION validate_course_active()
RETURNS TRIGGER AS $$
DECLARE
    v_course_status VARCHAR(20);
BEGIN
    SELECT CourseStatus INTO v_course_status
    FROM Course
    WHERE CourseID = NEW.CourseID;
    
    IF v_course_status != 'active' THEN
        RAISE EXCEPTION 'Cannot create session for inactive course';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_course_active
    BEFORE INSERT ON Session
    FOR EACH ROW
    EXECUTE FUNCTION validate_course_active();

-- ========================================
-- DATA CONSISTENCY CONSTRAINTS
-- ========================================

-- Prevent modification of paid orders
CREATE OR REPLACE FUNCTION prevent_paid_order_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.OrderStatus = 'paid' AND NEW.OrderTotal != OLD.OrderTotal THEN
        RAISE EXCEPTION 'Cannot modify paid order total';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_paid_order_mod
    BEFORE UPDATE ON Order_Transaction
    FOR EACH ROW
    EXECUTE FUNCTION prevent_paid_order_modification();

-- Ensure student belongs to the user making the order
CREATE OR REPLACE FUNCTION validate_student_user_match()
RETURNS TRIGGER AS $$
DECLARE
    v_student_user_id INTEGER;
    v_order_user_id INTEGER;
BEGIN
    SELECT UserID INTO v_student_user_id
    FROM Student
    WHERE StudentID = NEW.StudentID;
    
    SELECT UserID INTO v_order_user_id
    FROM Order_Transaction
    WHERE OrderID = NEW.OrderID;
    
    IF v_student_user_id != v_order_user_id THEN
        RAISE EXCEPTION 'Student does not belong to the user placing this order';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_student_user
    BEFORE INSERT OR UPDATE ON SessionEnrollment
    FOR EACH ROW
    WHEN (NEW.OrderID IS NOT NULL)
    EXECUTE FUNCTION validate_student_user_match();

-- ========================================
-- UNIQUE CONSTRAINTS (Additional)
-- ========================================

-- Prevent duplicate session names for the same course
ALTER TABLE Session
ADD CONSTRAINT uq_session_course_name 
UNIQUE (CourseID, SessionName);

-- Prevent duplicate teacher names (optional, comment out if not needed)
-- ALTER TABLE Teacher
-- ADD CONSTRAINT uq_teacher_name UNIQUE (TeacherName);

-- Prevent duplicate course names
ALTER TABLE Course
ADD CONSTRAINT uq_course_name UNIQUE (CourseName);

-- Admin email must be unique (already in schema)
-- User phone must be unique (already in schema)

-- ========================================
-- SUMMARY OF ALL CONSTRAINTS
-- ========================================

-- Query to view all constraints in database
/*
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type;
*/

-- Query to view all triggers
/*
SELECT 
    trigger_name,
    event_object_table AS table_name,
    action_timing AS timing,
    event_manipulation AS event,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
*/