--
-- PostgreSQL database dump
--

\restrict HLUp7P5TsS4uXUiNsANAWbQ24gSQan26OsV1TK0KvtUTW7dgeNenMqF9RNAFaKa

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: audit_enrollment_changes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.audit_enrollment_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO EnrollmentAudit (EnrollmentID, StudentID, SessionID, NewStatus, Operation)
        VALUES (NEW.EnrollmentID, NEW.StudentID, NEW.SessionID, NEW.EnrollmentStatus, 'INSERT');
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO EnrollmentAudit (EnrollmentID, StudentID, SessionID, OldStatus, NewStatus, Operation)
        VALUES (NEW.EnrollmentID, NEW.StudentID, NEW.SessionID, OLD.EnrollmentStatus, NEW.EnrollmentStatus, 'UPDATE');
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO EnrollmentAudit (EnrollmentID, StudentID, SessionID, OldStatus, Operation)
        VALUES (OLD.EnrollmentID, OLD.StudentID, OLD.SessionID, OLD.EnrollmentStatus, 'DELETE');
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


ALTER FUNCTION public.audit_enrollment_changes() OWNER TO postgres;

--
-- Name: check_session_capacity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_session_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_max_capacity INTEGER;
    v_current_enrolled INTEGER;
BEGIN
    -- Only check for active enrollments
    IF NEW.EnrollmentStatus != 'active' THEN
        RETURN NEW;
    END IF;
    
    -- Get session capacity and current enrollment
    SELECT c.CourseMaxEnroll, s.EnrolledCount
    INTO v_max_capacity, v_current_enrolled
    FROM Session s
    JOIN Course c ON s.CourseID = c.CourseID
    WHERE s.SessionID = NEW.SessionID;
    
    -- Check if over capacity
    IF v_current_enrolled >= v_max_capacity THEN
        RAISE EXCEPTION 'Session is full. Capacity: %, Current enrolled: %', 
            v_max_capacity, v_current_enrolled;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_session_capacity() OWNER TO postgres;

--
-- Name: complete_all_sessions(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.complete_all_sessions(p_course_id integer) RETURNS TABLE(updated_count integer, message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Update all active enrollments to completed for sessions of this course
    UPDATE SessionEnrollment se
    SET EnrollmentStatus = 'completed'
    FROM Session s
    WHERE se.SessionID = s.SessionID
    AND s.CourseID = p_course_id
    AND se.EnrollmentStatus = 'active';
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN QUERY SELECT v_count, format('Completed %s enrollments for course', v_count);
END;
$$;


ALTER FUNCTION public.complete_all_sessions(p_course_id integer) OWNER TO postgres;

--
-- Name: enroll_student(integer, integer, integer, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enroll_student(p_user_id integer, p_student_id integer, p_session_id integer, p_payment_amount numeric) RETURNS TABLE(success boolean, message text, order_id integer, enrollment_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_order_id INTEGER;
    v_enrollment_id INTEGER;
    v_student_name VARCHAR(100);
    v_session_name VARCHAR(200);
    v_capacity_check RECORD;
    v_existing_enrollment INTEGER;
BEGIN
    -- Check 1: Verify student belongs to parent
    IF NOT EXISTS (
        SELECT 1 FROM Student 
        WHERE StudentID = p_student_id AND UserID = p_user_id
    ) THEN
        RETURN QUERY SELECT FALSE, 'Student does not belong to this parent', NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Check 2: Check for existing active enrollment
    SELECT EnrollmentID INTO v_existing_enrollment
    FROM SessionEnrollment
    WHERE StudentID = p_student_id 
    AND EnrollmentStatus IN ('active', 'waitlisted');
    
    IF v_existing_enrollment IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'Student already has an active enrollment', NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Check 3: Check session capacity
    SELECT 
        s.EnrolledCount,
        c.CourseMaxEnroll,
        s.SessionName
    INTO v_capacity_check
    FROM Session s
    JOIN Course c ON s.CourseID = c.CourseID
    WHERE s.SessionID = p_session_id;
    
    -- Get student name for messages
    SELECT StudentName INTO v_student_name FROM Student WHERE StudentID = p_student_id;
    
    -- Start enrollment process
    IF v_capacity_check.EnrolledCount >= v_capacity_check.CourseMaxEnroll THEN
        -- Add to waitlist
        INSERT INTO SessionEnrollment (StudentID, SessionID, OrderID, EnrollmentStatus)
        VALUES (p_student_id, p_session_id, NULL, 'waitlisted')
        RETURNING EnrollmentID INTO v_enrollment_id;
        
        RETURN QUERY SELECT TRUE, format('Student %s added to waitlist for %s', v_student_name, v_capacity_check.SessionName), NULL::INTEGER, v_enrollment_id;
    ELSE
        -- Create order
        INSERT INTO Order_Transaction (UserID, OrderTotal, OrderStatus, OrderDate)
        VALUES (p_user_id, p_payment_amount, 'pending', CURRENT_TIMESTAMP)
        RETURNING OrderID INTO v_order_id;
        
        -- Create enrollment
        INSERT INTO SessionEnrollment (StudentID, SessionID, OrderID, EnrollmentStatus)
        VALUES (p_student_id, p_session_id, v_order_id, 'active')
        RETURNING EnrollmentID INTO v_enrollment_id;
        
        -- Process payment
        INSERT INTO Payment (OrderID, PaymentAmount, PaymentMethod, PaymentStatus)
        VALUES (v_order_id, p_payment_amount, 'pending', 'pending');
        
        -- Update order status
        UPDATE Order_Transaction 
        SET OrderStatus = 'paid' 
        WHERE OrderID = v_order_id;
        
        RETURN QUERY SELECT TRUE, format('Student %s successfully enrolled in %s', v_student_name, v_capacity_check.SessionName), v_order_id, v_enrollment_id;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, format('Error: %s', SQLERRM), NULL::INTEGER, NULL::INTEGER;
END;
$$;


ALTER FUNCTION public.enroll_student(p_user_id integer, p_student_id integer, p_session_id integer, p_payment_amount numeric) OWNER TO postgres;

--
-- Name: enroll_student(integer, integer, integer, numeric, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enroll_student(p_user_id integer, p_student_id integer, p_session_id integer, p_payment_amount numeric, p_payment_method character varying DEFAULT 'wechat'::character varying) RETURNS TABLE(success boolean, message text, order_id integer, enrollment_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_order_id INTEGER;
    v_enrollment_id INTEGER;
    v_student_name VARCHAR(100);
    v_session_name VARCHAR(200);
    v_capacity_check RECORD;
    v_existing_enrollment INTEGER;
BEGIN
    -- [Previous checks remain the same...]
    
    -- Check 1: Verify student belongs to parent
    IF NOT EXISTS (
        SELECT 1 FROM Student 
        WHERE StudentID = p_student_id AND UserID = p_user_id
    ) THEN
        RETURN QUERY SELECT FALSE, 'Student does not belong to this parent', NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Check 2: Check for existing active enrollment
    SELECT EnrollmentID INTO v_existing_enrollment
    FROM SessionEnrollment
    WHERE StudentID = p_student_id 
    AND EnrollmentStatus IN ('active', 'waitlisted');
    
    IF v_existing_enrollment IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'Student already has an active enrollment', NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Check 3: Check session capacity
    SELECT 
        s.EnrolledCount,
        c.CourseMaxEnroll,
        s.SessionName
    INTO v_capacity_check
    FROM Session s
    JOIN Course c ON s.CourseID = c.CourseID
    WHERE s.SessionID = p_session_id;
    
    -- Get student name
    SELECT StudentName INTO v_student_name FROM Student WHERE StudentID = p_student_id;
    
    IF v_capacity_check.EnrolledCount >= v_capacity_check.CourseMaxEnroll THEN
        -- Add to waitlist
        INSERT INTO SessionEnrollment (StudentID, SessionID, OrderID, EnrollmentStatus)
        VALUES (p_student_id, p_session_id, NULL, 'waitlisted')
        RETURNING EnrollmentID INTO v_enrollment_id;
        
        RETURN QUERY SELECT TRUE, format('Student %s added to waitlist for %s', v_student_name, v_capacity_check.SessionName), NULL::INTEGER, v_enrollment_id;
    ELSE
        -- Create order
        INSERT INTO Order_Transaction (UserID, OrderTotal, OrderStatus, OrderDate)
        VALUES (p_user_id, p_payment_amount, 'pending', CURRENT_TIMESTAMP)
        RETURNING OrderID INTO v_order_id;
        
        -- Create enrollment
        INSERT INTO SessionEnrollment (StudentID, SessionID, OrderID, EnrollmentStatus)
        VALUES (p_student_id, p_session_id, v_order_id, 'active')
        RETURNING EnrollmentID INTO v_enrollment_id;
        
        -- Process payment with the provided payment method
        INSERT INTO Payment (OrderID, PaymentAmount, PaymentMethod, PaymentStatus)
        VALUES (v_order_id, p_payment_amount, p_payment_method, 'completed');  -- Use the parameter
        
        -- Update order status
        UPDATE Order_Transaction 
        SET OrderStatus = 'paid' 
        WHERE OrderID = v_order_id;
        
        RETURN QUERY SELECT TRUE, format('Student %s successfully enrolled in %s', v_student_name, v_capacity_check.SessionName), v_order_id, v_enrollment_id;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, format('Error: %s', SQLERRM), NULL::INTEGER, NULL::INTEGER;
END;
$$;


ALTER FUNCTION public.enroll_student(p_user_id integer, p_student_id integer, p_session_id integer, p_payment_amount numeric, p_payment_method character varying) OWNER TO postgres;

--
-- Name: get_available_sessions(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_available_sessions(p_student_id integer) RETURNS TABLE(session_id integer, course_name character varying, session_name character varying, teacher_name character varying, day_of_week character varying, start_time time without time zone, end_time time without time zone, available_spots integer, price numeric, status text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.SessionID,
        c.CourseName,
        s.SessionName,
        t.TeacherName,
        s.SessionDayOfWeek,
        s.SessionStartTime,
        s.SessionEndTime,
        c.CourseMaxEnroll - s.EnrolledCount as available_spots,
        c.CoursePrice,
        CASE 
            WHEN c.CourseMaxEnroll - s.EnrolledCount > 0 THEN 'Available'
            ELSE 'Waitlist Only'
        END as status
    FROM Session s
    JOIN Course c ON s.CourseID = c.CourseID
    JOIN Teacher t ON s.TeacherID = t.TeacherID
    WHERE NOT EXISTS (
        -- Exclude sessions where student is already enrolled
        SELECT 1 FROM SessionEnrollment se
        WHERE se.SessionID = s.SessionID
        AND se.StudentID = p_student_id
        AND se.EnrollmentStatus IN ('active', 'waitlisted')
    )
    AND c.CourseStatus = 'active'
    ORDER BY c.CourseName, s.SessionDayOfWeek, s.SessionStartTime;
END;
$$;


ALTER FUNCTION public.get_available_sessions(p_student_id integer) OWNER TO postgres;

--
-- Name: get_enrollment_report(date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_enrollment_report(p_start_date date DEFAULT (CURRENT_DATE - '30 days'::interval), p_end_date date DEFAULT CURRENT_DATE) RETURNS TABLE(course_name character varying, total_enrollments bigint, active_enrollments bigint, completed_enrollments bigint, withdrawn_enrollments bigint, total_revenue numeric, avg_enrollment_per_session numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.CourseName,
        COUNT(se.EnrollmentID) as total_enrollments,
        COUNT(CASE WHEN se.EnrollmentStatus = 'active' THEN 1 END) as active_enrollments,
        COUNT(CASE WHEN se.EnrollmentStatus = 'completed' THEN 1 END) as completed_enrollments,
        COUNT(CASE WHEN se.EnrollmentStatus = 'withdrawn' THEN 1 END) as withdrawn_enrollments,
        COALESCE(SUM(ot.OrderTotal), 0) as total_revenue,
        ROUND(COUNT(se.EnrollmentID)::NUMERIC / NULLIF(COUNT(DISTINCT s.SessionID), 0), 2) as avg_enrollment_per_session
    FROM Course c
    LEFT JOIN Session s ON c.CourseID = s.CourseID
    LEFT JOIN SessionEnrollment se ON s.SessionID = se.SessionID
        AND se.EnrollmentDate BETWEEN p_start_date AND p_end_date
    LEFT JOIN Order_Transaction ot ON se.OrderID = ot.OrderID
        AND ot.OrderStatus = 'paid'
    GROUP BY c.CourseID, c.CourseName
    ORDER BY total_revenue DESC;
END;
$$;


ALTER FUNCTION public.get_enrollment_report(p_start_date date, p_end_date date) OWNER TO postgres;

--
-- Name: process_refund(integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.process_refund(p_enrollment_id integer, p_refund_reason text) RETURNS TABLE(success boolean, message text, refund_amount numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_enrollment RECORD;
    v_refund_amount DECIMAL;
    v_days_attended INTEGER;
BEGIN
    -- Get enrollment details
    SELECT 
        se.*,
        ot.OrderTotal,
        ot.OrderStatus,
        s.SessionName,
        st.StudentName
    INTO v_enrollment
    FROM SessionEnrollment se
    JOIN Order_Transaction ot ON se.OrderID = ot.OrderID
    JOIN Session s ON se.SessionID = s.SessionID
    JOIN Student st ON se.StudentID = st.StudentID
    WHERE se.EnrollmentID = p_enrollment_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Enrollment not found', 0::DECIMAL;
        RETURN;
    END IF;
    
    -- Check if already refunded
    IF v_enrollment.OrderStatus = 'refunded' THEN
        RETURN QUERY SELECT FALSE, 'Already refunded', 0::DECIMAL;
        RETURN;
    END IF;
    
    -- Calculate refund amount (example: prorated based on time)
    -- For simplicity, full refund if withdrawn within 7 days
    v_days_attended := EXTRACT(DAY FROM CURRENT_TIMESTAMP - v_enrollment.EnrollmentDate);
    
    IF v_days_attended <= 7 THEN
        v_refund_amount := v_enrollment.OrderTotal;
    ELSIF v_days_attended <= 14 THEN
        v_refund_amount := v_enrollment.OrderTotal * 0.5;
    ELSE
        v_refund_amount := 0;
    END IF;
    
    -- Process refund
    IF v_refund_amount > 0 THEN
        -- Update enrollment status
        UPDATE SessionEnrollment 
        SET EnrollmentStatus = 'withdrawn'
        WHERE EnrollmentID = p_enrollment_id;
        
        -- Update order status
        UPDATE Order_Transaction 
        SET OrderStatus = 'refunded'
        WHERE OrderID = v_enrollment.OrderID;
        
        -- Create refund payment record
        INSERT INTO Payment (OrderID, PaymentAmount, PaymentMethod, PaymentStatus)
        VALUES (v_enrollment.OrderID, -v_refund_amount, 'refund', 'completed');
        
        RETURN QUERY SELECT TRUE, 
            format('Refund of %.2f processed for %s', v_refund_amount, v_enrollment.StudentName), 
            v_refund_amount;
    ELSE
        RETURN QUERY SELECT FALSE, 'No refund available (past refund period)', 0::DECIMAL;
    END IF;
END;
$$;


ALTER FUNCTION public.process_refund(p_enrollment_id integer, p_refund_reason text) OWNER TO postgres;

--
-- Name: promote_from_waitlist(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.promote_from_waitlist() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_waitlist_student RECORD;
BEGIN
    -- Only trigger when changing from 'active' to something else
    IF OLD.EnrollmentStatus = 'active' AND NEW.EnrollmentStatus != 'active' THEN
        -- Find the first waitlisted student for this session
        SELECT * INTO v_waitlist_student
        FROM SessionEnrollment
        WHERE SessionID = NEW.SessionID 
          AND EnrollmentStatus = 'waitlisted'
        ORDER BY EnrollmentDate
        LIMIT 1;
        
        -- If found, promote them
        IF FOUND THEN
            UPDATE SessionEnrollment
            SET EnrollmentStatus = 'active'
            WHERE EnrollmentID = v_waitlist_student.EnrollmentID;
            
            RAISE NOTICE 'Student % promoted from waitlist for session %', 
                v_waitlist_student.StudentID, NEW.SessionID;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.promote_from_waitlist() OWNER TO postgres;

--
-- Name: update_session_enrolled_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_session_enrolled_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- For INSERT or UPDATE to 'active'
    IF (TG_OP = 'INSERT' AND NEW.EnrollmentStatus = 'active') OR
       (TG_OP = 'UPDATE' AND NEW.EnrollmentStatus = 'active' AND OLD.EnrollmentStatus != 'active') THEN
        UPDATE Session 
        SET EnrolledCount = EnrolledCount + 1 
        WHERE SessionID = NEW.SessionID;
    END IF;
    
    -- For UPDATE from 'active' to something else
    IF TG_OP = 'UPDATE' AND OLD.EnrollmentStatus = 'active' AND NEW.EnrollmentStatus != 'active' THEN
        UPDATE Session 
        SET EnrolledCount = EnrolledCount - 1 
        WHERE SessionID = NEW.SessionID;
    END IF;
    
    -- For DELETE of 'active' enrollment
    IF TG_OP = 'DELETE' AND OLD.EnrollmentStatus = 'active' THEN
        UPDATE Session 
        SET EnrolledCount = EnrolledCount - 1 
        WHERE SessionID = OLD.SessionID;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


ALTER FUNCTION public.update_session_enrolled_count() OWNER TO postgres;

--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_timestamp() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin (
    adminid integer NOT NULL,
    adminname character varying(100) NOT NULL,
    adminemail character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    adminrole character varying(50) DEFAULT 'admin'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp without time zone
);


ALTER TABLE public.admin OWNER TO postgres;

--
-- Name: admin_adminid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admin_adminid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admin_adminid_seq OWNER TO postgres;

--
-- Name: admin_adminid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admin_adminid_seq OWNED BY public.admin.adminid;


--
-- Name: course; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.course (
    courseid integer NOT NULL,
    coursename character varying(200) NOT NULL,
    coursedescription text,
    courseprice numeric(10,2) NOT NULL,
    coursemaxenroll integer,
    coursestatus character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT course_coursemaxenroll_check CHECK ((coursemaxenroll > 0)),
    CONSTRAINT course_courseprice_check CHECK ((courseprice >= (0)::numeric)),
    CONSTRAINT course_coursestatus_check CHECK (((coursestatus)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'archived'::character varying])::text[])))
);


ALTER TABLE public.course OWNER TO postgres;

--
-- Name: course_courseid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.course_courseid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.course_courseid_seq OWNER TO postgres;

--
-- Name: course_courseid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.course_courseid_seq OWNED BY public.course.courseid;


--
-- Name: enrollmentaudit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.enrollmentaudit (
    auditid integer NOT NULL,
    enrollmentid integer,
    studentid integer,
    sessionid integer,
    oldstatus character varying(20),
    newstatus character varying(20),
    changedby character varying(100) DEFAULT CURRENT_USER,
    changedat timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    operation character varying(10)
);


ALTER TABLE public.enrollmentaudit OWNER TO postgres;

--
-- Name: enrollmentaudit_auditid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.enrollmentaudit_auditid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.enrollmentaudit_auditid_seq OWNER TO postgres;

--
-- Name: enrollmentaudit_auditid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.enrollmentaudit_auditid_seq OWNED BY public.enrollmentaudit.auditid;


--
-- Name: order_transaction; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_transaction (
    orderid integer NOT NULL,
    userid integer NOT NULL,
    orderdate timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    discountamount numeric(10,2) DEFAULT 0,
    ordertotal numeric(10,2) NOT NULL,
    orderstatus character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_transaction_discountamount_check CHECK ((discountamount >= (0)::numeric)),
    CONSTRAINT order_transaction_orderstatus_check CHECK (((orderstatus)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'cancelled'::character varying, 'refunded'::character varying])::text[]))),
    CONSTRAINT order_transaction_ordertotal_check CHECK ((ordertotal >= (0)::numeric))
);


ALTER TABLE public.order_transaction OWNER TO postgres;

--
-- Name: order_transaction_orderid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_transaction_orderid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_transaction_orderid_seq OWNER TO postgres;

--
-- Name: order_transaction_orderid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_transaction_orderid_seq OWNED BY public.order_transaction.orderid;


--
-- Name: passwordresettokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.passwordresettokens (
    token_id integer NOT NULL,
    user_id integer,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.passwordresettokens OWNER TO postgres;

--
-- Name: passwordresettokens_token_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.passwordresettokens_token_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.passwordresettokens_token_id_seq OWNER TO postgres;

--
-- Name: passwordresettokens_token_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.passwordresettokens_token_id_seq OWNED BY public.passwordresettokens.token_id;


--
-- Name: payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment (
    paymentid integer NOT NULL,
    orderid integer NOT NULL,
    paymentamount numeric(10,2) NOT NULL,
    paymentdate timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    paymentmethod character varying(50),
    paymentstatus character varying(20) DEFAULT 'pending'::character varying,
    CONSTRAINT payment_paymentamount_check CHECK ((paymentamount >= (0)::numeric)),
    CONSTRAINT payment_paymentmethod_check CHECK (((paymentmethod)::text = ANY ((ARRAY['credit_card'::character varying, 'debit_card'::character varying, 'wechat'::character varying, 'alipay'::character varying, 'cash'::character varying])::text[]))),
    CONSTRAINT payment_paymentstatus_check CHECK (((paymentstatus)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'refunded'::character varying])::text[])))
);


ALTER TABLE public.payment OWNER TO postgres;

--
-- Name: payment_paymentid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payment_paymentid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_paymentid_seq OWNER TO postgres;

--
-- Name: payment_paymentid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payment_paymentid_seq OWNED BY public.payment.paymentid;


--
-- Name: session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session (
    sessionid integer NOT NULL,
    courseid integer NOT NULL,
    teacherid integer NOT NULL,
    sessionname character varying(200) NOT NULL,
    sessiondayofweek character varying(10),
    sessionstarttime time without time zone NOT NULL,
    sessionendtime time without time zone NOT NULL,
    enrolledcount integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sessionstartdate date NOT NULL,
    CONSTRAINT session_enrolledcount_check CHECK ((enrolledcount >= 0)),
    CONSTRAINT session_sessiondayofweek_check CHECK (((sessiondayofweek)::text = ANY ((ARRAY['Monday'::character varying, 'Tuesday'::character varying, 'Wednesday'::character varying, 'Thursday'::character varying, 'Friday'::character varying, 'Saturday'::character varying, 'Sunday'::character varying])::text[]))),
    CONSTRAINT time_check CHECK ((sessionendtime > sessionstarttime))
);


ALTER TABLE public.session OWNER TO postgres;

--
-- Name: session_sessionid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.session_sessionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.session_sessionid_seq OWNER TO postgres;

--
-- Name: session_sessionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.session_sessionid_seq OWNED BY public.session.sessionid;


--
-- Name: sessionenrollment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessionenrollment (
    enrollmentid integer NOT NULL,
    studentid integer NOT NULL,
    sessionid integer NOT NULL,
    orderid integer,
    enrollmentstatus character varying(20) DEFAULT 'active'::character varying,
    enrollmentdate timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sessionenrollment_enrollmentstatus_check CHECK (((enrollmentstatus)::text = ANY ((ARRAY['active'::character varying, 'waitlisted'::character varying, 'completed'::character varying, 'withdrawn'::character varying])::text[])))
);


ALTER TABLE public.sessionenrollment OWNER TO postgres;

--
-- Name: sessionenrollment_enrollmentid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.sessionenrollment_enrollmentid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sessionenrollment_enrollmentid_seq OWNER TO postgres;

--
-- Name: sessionenrollment_enrollmentid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.sessionenrollment_enrollmentid_seq OWNED BY public.sessionenrollment.enrollmentid;


--
-- Name: student; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student (
    studentid integer NOT NULL,
    userid integer NOT NULL,
    studentname character varying(100) NOT NULL,
    studentnationalid character varying(50),
    studentbirthdate date NOT NULL,
    studentgrade character varying(20),
    studentschool character varying(200),
    medicalinfo text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT age_check CHECK ((studentbirthdate < CURRENT_DATE))
);


ALTER TABLE public.student OWNER TO postgres;

--
-- Name: student_studentid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_studentid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_studentid_seq OWNER TO postgres;

--
-- Name: student_studentid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_studentid_seq OWNED BY public.student.studentid;


--
-- Name: teacher; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teacher (
    teacherid integer NOT NULL,
    teachername character varying(100) NOT NULL,
    teacherinfo text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.teacher OWNER TO postgres;

--
-- Name: teacher_teacherid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.teacher_teacherid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.teacher_teacherid_seq OWNER TO postgres;

--
-- Name: teacher_teacherid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.teacher_teacherid_seq OWNED BY public.teacher.teacherid;


--
-- Name: user_account; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_account (
    userid integer NOT NULL,
    username character varying(100) NOT NULL,
    userphone character varying(20) NOT NULL,
    userwechat character varying(100),
    useraddress character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    password_hash character varying(255),
    last_login timestamp without time zone
);


ALTER TABLE public.user_account OWNER TO postgres;

--
-- Name: user_account_userid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_account_userid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_account_userid_seq OWNER TO postgres;

--
-- Name: user_account_userid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_account_userid_seq OWNED BY public.user_account.userid;


--
-- Name: admin adminid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin ALTER COLUMN adminid SET DEFAULT nextval('public.admin_adminid_seq'::regclass);


--
-- Name: course courseid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course ALTER COLUMN courseid SET DEFAULT nextval('public.course_courseid_seq'::regclass);


--
-- Name: enrollmentaudit auditid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollmentaudit ALTER COLUMN auditid SET DEFAULT nextval('public.enrollmentaudit_auditid_seq'::regclass);


--
-- Name: order_transaction orderid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_transaction ALTER COLUMN orderid SET DEFAULT nextval('public.order_transaction_orderid_seq'::regclass);


--
-- Name: passwordresettokens token_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.passwordresettokens ALTER COLUMN token_id SET DEFAULT nextval('public.passwordresettokens_token_id_seq'::regclass);


--
-- Name: payment paymentid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment ALTER COLUMN paymentid SET DEFAULT nextval('public.payment_paymentid_seq'::regclass);


--
-- Name: session sessionid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session ALTER COLUMN sessionid SET DEFAULT nextval('public.session_sessionid_seq'::regclass);


--
-- Name: sessionenrollment enrollmentid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessionenrollment ALTER COLUMN enrollmentid SET DEFAULT nextval('public.sessionenrollment_enrollmentid_seq'::regclass);


--
-- Name: student studentid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student ALTER COLUMN studentid SET DEFAULT nextval('public.student_studentid_seq'::regclass);


--
-- Name: teacher teacherid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher ALTER COLUMN teacherid SET DEFAULT nextval('public.teacher_teacherid_seq'::regclass);


--
-- Name: user_account userid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_account ALTER COLUMN userid SET DEFAULT nextval('public.user_account_userid_seq'::regclass);


--
-- Name: admin admin_adminemail_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_adminemail_key UNIQUE (adminemail);


--
-- Name: admin admin_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_pkey PRIMARY KEY (adminid);


--
-- Name: course course_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course
    ADD CONSTRAINT course_pkey PRIMARY KEY (courseid);


--
-- Name: enrollmentaudit enrollmentaudit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollmentaudit
    ADD CONSTRAINT enrollmentaudit_pkey PRIMARY KEY (auditid);


--
-- Name: order_transaction order_transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_transaction
    ADD CONSTRAINT order_transaction_pkey PRIMARY KEY (orderid);


--
-- Name: passwordresettokens passwordresettokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_pkey PRIMARY KEY (token_id);


--
-- Name: passwordresettokens passwordresettokens_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_token_key UNIQUE (token);


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (paymentid);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sessionid);


--
-- Name: sessionenrollment sessionenrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessionenrollment
    ADD CONSTRAINT sessionenrollment_pkey PRIMARY KEY (enrollmentid);


--
-- Name: sessionenrollment sessionenrollment_studentid_sessionid_enrollmentdate_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessionenrollment
    ADD CONSTRAINT sessionenrollment_studentid_sessionid_enrollmentdate_key UNIQUE (studentid, sessionid, enrollmentdate);


--
-- Name: student student_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_pkey PRIMARY KEY (studentid);


--
-- Name: student student_studentnationalid_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_studentnationalid_key UNIQUE (studentnationalid);


--
-- Name: teacher teacher_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher
    ADD CONSTRAINT teacher_pkey PRIMARY KEY (teacherid);


--
-- Name: user_account unique_userphone; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT unique_userphone UNIQUE (userphone);


--
-- Name: user_account user_account_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT user_account_pkey PRIMARY KEY (userid);


--
-- Name: idx_admin_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_email ON public.admin USING btree (adminemail);


--
-- Name: idx_enrollment_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_date ON public.sessionenrollment USING btree (enrollmentdate);


--
-- Name: idx_enrollment_orderid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_orderid ON public.sessionenrollment USING btree (orderid);


--
-- Name: idx_enrollment_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_session ON public.sessionenrollment USING btree (sessionid);


--
-- Name: idx_enrollment_sessionid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_sessionid ON public.sessionenrollment USING btree (sessionid);


--
-- Name: idx_enrollment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_status ON public.sessionenrollment USING btree (enrollmentstatus);


--
-- Name: idx_enrollment_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_student ON public.sessionenrollment USING btree (studentid);


--
-- Name: idx_enrollment_studentid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_studentid ON public.sessionenrollment USING btree (studentid);


--
-- Name: idx_enrollment_unique_check; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_unique_check ON public.sessionenrollment USING btree (studentid, sessionid);


--
-- Name: idx_order_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_status ON public.order_transaction USING btree (orderstatus);


--
-- Name: idx_order_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_user ON public.order_transaction USING btree (userid);


--
-- Name: idx_order_userid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_userid ON public.order_transaction USING btree (userid);


--
-- Name: idx_payment_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_date ON public.payment USING btree (paymentdate);


--
-- Name: idx_payment_orderid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_orderid ON public.payment USING btree (orderid);


--
-- Name: idx_payment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_status ON public.payment USING btree (paymentstatus);


--
-- Name: idx_session_course; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_course ON public.session USING btree (courseid);


--
-- Name: idx_session_courseid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_courseid ON public.session USING btree (courseid);


--
-- Name: idx_session_schedule; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_schedule ON public.session USING btree (sessiondayofweek, sessionstarttime);


--
-- Name: idx_session_startdate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_startdate ON public.session USING btree (sessionstartdate);


--
-- Name: idx_session_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_teacher ON public.session USING btree (teacherid);


--
-- Name: idx_session_teacherid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_teacherid ON public.session USING btree (teacherid);


--
-- Name: idx_student_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_user ON public.student USING btree (userid);


--
-- Name: idx_student_userid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_userid ON public.student USING btree (userid);


--
-- Name: idx_user_lastlogin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_lastlogin ON public.user_account USING btree (last_login);


--
-- Name: idx_user_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_phone ON public.user_account USING btree (userphone);


--
-- Name: unique_active_enrollment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX unique_active_enrollment ON public.sessionenrollment USING btree (studentid) WHERE ((enrollmentstatus)::text = ANY ((ARRAY['active'::character varying, 'waitlisted'::character varying])::text[]));


--
-- Name: sessionenrollment audit_enrollment_changes; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER audit_enrollment_changes AFTER INSERT OR DELETE OR UPDATE ON public.sessionenrollment FOR EACH ROW EXECUTE FUNCTION public.audit_enrollment_changes();


--
-- Name: sessionenrollment check_session_capacity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER check_session_capacity BEFORE INSERT OR UPDATE ON public.sessionenrollment FOR EACH ROW EXECUTE FUNCTION public.check_session_capacity();


--
-- Name: sessionenrollment promote_from_waitlist; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER promote_from_waitlist AFTER UPDATE ON public.sessionenrollment FOR EACH ROW EXECUTE FUNCTION public.promote_from_waitlist();


--
-- Name: sessionenrollment update_enrolled_count_on_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_enrolled_count_on_delete AFTER DELETE ON public.sessionenrollment FOR EACH ROW EXECUTE FUNCTION public.update_session_enrolled_count();


--
-- Name: sessionenrollment update_enrolled_count_on_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_enrolled_count_on_insert AFTER INSERT ON public.sessionenrollment FOR EACH ROW EXECUTE FUNCTION public.update_session_enrolled_count();


--
-- Name: sessionenrollment update_enrolled_count_on_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_enrolled_count_on_update AFTER UPDATE ON public.sessionenrollment FOR EACH ROW EXECUTE FUNCTION public.update_session_enrolled_count();


--
-- Name: user_account update_user_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_user_timestamp BEFORE UPDATE ON public.user_account FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: order_transaction order_transaction_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_transaction
    ADD CONSTRAINT order_transaction_userid_fkey FOREIGN KEY (userid) REFERENCES public.user_account(userid);


--
-- Name: passwordresettokens passwordresettokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_account(userid) ON DELETE CASCADE;


--
-- Name: payment payment_orderid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_orderid_fkey FOREIGN KEY (orderid) REFERENCES public.order_transaction(orderid);


--
-- Name: session session_courseid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_courseid_fkey FOREIGN KEY (courseid) REFERENCES public.course(courseid) ON DELETE CASCADE;


--
-- Name: session session_teacherid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_teacherid_fkey FOREIGN KEY (teacherid) REFERENCES public.teacher(teacherid);


--
-- Name: sessionenrollment sessionenrollment_orderid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessionenrollment
    ADD CONSTRAINT sessionenrollment_orderid_fkey FOREIGN KEY (orderid) REFERENCES public.order_transaction(orderid);


--
-- Name: sessionenrollment sessionenrollment_sessionid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessionenrollment
    ADD CONSTRAINT sessionenrollment_sessionid_fkey FOREIGN KEY (sessionid) REFERENCES public.session(sessionid);


--
-- Name: sessionenrollment sessionenrollment_studentid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessionenrollment
    ADD CONSTRAINT sessionenrollment_studentid_fkey FOREIGN KEY (studentid) REFERENCES public.student(studentid);


--
-- Name: student student_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_userid_fkey FOREIGN KEY (userid) REFERENCES public.user_account(userid) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict HLUp7P5TsS4uXUiNsANAWbQ24gSQan26OsV1TK0KvtUTW7dgeNenMqF9RNAFaKa

