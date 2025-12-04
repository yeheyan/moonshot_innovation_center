--
-- PostgreSQL database dump
--

\restrict GsREdDPkDocgrQNdujZzJagODMNLNh0AjU11kCG31H6kyUafHTiriqVafoLPadC

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
-- Data for Name: admin; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admin (adminid, adminname, adminemail, password_hash, adminrole, created_at, last_login) FROM stdin;
1	Admin	admin@moonshot.com	$2b$10$l5Xt7JV.dlVe8fdg.khA4.NkAGofBhSgONZ1Dtr5h/WQgXNS4Eefq	admin	2025-11-18 13:52:48.774495	2025-12-03 23:32:39.563598
\.


--
-- Data for Name: course; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.course (courseid, coursename, coursedescription, courseprice, coursemaxenroll, coursestatus, created_at) FROM stdin;
2	Python 101	Learn Python from scratch.	3500.00	15	active	2025-11-14 15:07:10.746799
3	3D Printer	Design and create your first 3D print toys	2200.00	12	active	2025-11-14 15:07:10.746799
4	AI for Kids	Teach basic flow of AI. Build your own AI modal 	3000.00	10	active	2025-11-14 15:07:10.746799
5	Drone Design	Design and build your own drone.	4000.00	8	active	2025-11-14 15:07:10.746799
1	Robotic Arm Design	Design and build your first robotic arm that can pick things up.	4000.00	5	active	2025-11-14 15:07:10.746799
\.


--
-- Data for Name: enrollmentaudit; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.enrollmentaudit (auditid, enrollmentid, studentid, sessionid, oldstatus, newstatus, changedby, changedat, operation) FROM stdin;
1	9	3	1	\N	active	postgres	2025-11-14 16:17:07.465599	INSERT
2	10	4	1	\N	waitlisted	postgres	2025-11-14 16:17:25.794563	INSERT
3	9	3	1	active	withdrawn	postgres	2025-11-14 16:17:31.630659	UPDATE
4	10	4	1	waitlisted	active	postgres	2025-11-14 16:17:31.630659	UPDATE
7	14	1	1	\N	waitlisted	postgres	2025-11-16 16:35:25.285511	INSERT
9	14	1	1	waitlisted	withdrawn	postgres	2025-11-16 16:47:20.975636	UPDATE
11	17	2	2	\N	active	postgres	2025-11-16 16:55:26.044763	INSERT
12	18	8	6	\N	active	postgres	2025-11-18 11:18:50.861269	INSERT
13	18	8	6	active	withdrawn	postgres	2025-11-18 11:42:14.557481	UPDATE
14	18	8	6	withdrawn	\N	postgres	2025-11-18 11:46:11.934889	DELETE
15	19	9	6	\N	active	postgres	2025-11-18 17:25:44.74968	INSERT
16	19	9	6	active	withdrawn	postgres	2025-11-18 17:25:51.314738	UPDATE
17	20	10	6	\N	active	postgres	2025-12-02 13:56:24.856121	INSERT
18	20	10	6	active	withdrawn	postgres	2025-12-02 13:56:32.672826	UPDATE
25	27	10	6	\N	active	postgres	2025-12-02 14:30:43.901631	INSERT
26	28	11	6	\N	active	postgres	2025-12-02 15:05:41.00689	INSERT
27	29	13	6	\N	active	postgres	2025-12-03 23:41:45.547999	INSERT
28	29	13	6	active	withdrawn	postgres	2025-12-03 23:42:31.868406	UPDATE
\.


--
-- Data for Name: order_transaction; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_transaction (orderid, userid, orderdate, discountamount, ordertotal, orderstatus, created_at) FROM stdin;
8	2	2025-11-14 16:17:04.712737	0.00	2800.00	paid	2025-11-14 16:17:04.712737
12	1	2025-11-16 16:55:26.044763	0.00	2800.00	paid	2025-11-16 16:55:26.044763
19	7	2025-12-02 14:30:43.901631	0.00	2200.00	paid	2025-12-02 14:30:43.901631
20	8	2025-12-02 15:05:41.00689	0.00	2200.00	paid	2025-12-02 15:05:41.00689
21	7	2025-12-03 23:41:45.547999	0.00	2200.00	paid	2025-12-03 23:41:45.547999
\.


--
-- Data for Name: passwordresettokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.passwordresettokens (token_id, user_id, token, expires_at, used, created_at) FROM stdin;
\.


--
-- Data for Name: payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment (paymentid, orderid, paymentamount, paymentdate, paymentmethod, paymentstatus) FROM stdin;
3	12	2800.00	2025-11-16 16:55:26.044763	wechat	completed
10	19	2200.00	2025-12-02 14:30:43.914	wechat	completed
11	20	2200.00	2025-12-02 15:05:41.029	wechat	completed
12	21	2200.00	2025-12-03 23:41:45.561	wechat	completed
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.session (sessionid, courseid, teacherid, sessionname, sessiondayofweek, sessionstarttime, sessionendtime, enrolledcount, created_at, sessionstartdate) FROM stdin;
7	3	5	3D Printer-Sunday-Morning	Sunday	09:00:00	11:00:00	0	2025-11-14 15:07:10.75308	2025-12-18
9	5	3	Drone Design-Saturday-Evening	Saturday	18:00:00	20:00:00	0	2025-11-14 15:07:10.75308	2025-12-18
10	5	3	Drone Design-Sunday-Afternoon	Sunday	15:00:00	17:00:00	0	2025-11-14 15:07:10.75308	2025-12-18
6	3	5	3D Printer-Saturday-Afternoon	Saturday	14:00:00	16:00:00	4	2025-11-14 15:07:10.75308	2025-12-18
3	1	1	Robotic Arm Design-Sunday-Moring	Sunday	09:00:00	11:00:00	0	2025-11-14 15:07:10.75308	2025-12-18
4	2	2	Python 101-Saturday-Morning	Saturday	09:00:00	11:30:00	0	2025-11-14 15:07:10.75308	2025-12-18
5	2	2	Python 101-Sunday-Afternoon	Sunday	14:00:00	16:30:00	0	2025-11-14 15:07:10.75308	2025-12-18
8	4	4	AI for Kids-Saturday-Morning	Saturday	10:00:00	12:00:00	0	2025-11-14 15:07:10.75308	2025-12-18
1	1	1	Robotic Arm Design-Saturday-Morning	Saturday	09:00:00	11:00:00	1	2025-11-14 15:07:10.75308	2025-12-18
2	1	1	Robotic Arm Design-Saturday-Afternoon	Saturday	14:00:00	16:00:00	1	2025-11-14 15:07:10.75308	2025-12-18
\.


--
-- Data for Name: sessionenrollment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessionenrollment (enrollmentid, studentid, sessionid, orderid, enrollmentstatus, enrollmentdate) FROM stdin;
9	3	1	8	withdrawn	2025-11-14 16:17:07.465599
10	4	1	\N	active	2025-11-14 16:17:25.794563
14	1	1	\N	withdrawn	2025-11-16 16:35:25.285511
17	2	2	12	active	2025-11-16 16:55:26.044763
19	9	6	\N	withdrawn	2025-11-18 17:25:44.74968
20	10	6	\N	withdrawn	2025-12-02 13:56:24.856121
27	10	6	19	active	2025-12-02 14:30:43.901631
28	11	6	20	active	2025-12-02 15:05:41.00689
29	13	6	21	withdrawn	2025-12-03 23:41:45.547999
\.


--
-- Data for Name: student; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.student (studentid, userid, studentname, studentnationalid, studentbirthdate, studentgrade, studentschool, medicalinfo, created_at) FROM stdin;
11	8	Kim	\N	2021-09-09	\N	\N	\N	2025-12-02 15:04:39.647202
9	6	Chelsea	\N	2020-07-08	\N	\N	\N	2025-11-18 17:24:49.383884
10	7	Rahul	\N	2010-10-21	\N	\N	\N	2025-12-02 13:55:40.498824
1	1	Jerry	\N	2013-05-15	Grade 3	Sunrise Elementary School	\N	2025-11-14 15:07:10.749369
2	1	Mark 	\N	2015-08-20	Grade 1	Sunrise Elementary School	\N	2025-11-14 15:07:10.749369
3	2	Lucy	\N	2012-03-10	Grade 4	Maple Elementary School	\N	2025-11-14 15:07:10.749369
4	3	Sam	\N	2014-09-01	Grade 2	Cedar School	\N	2025-11-14 15:07:10.749369
5	4	Xiaoming	\N	2013-11-25	Grade 2	Cedar School	\N	2025-11-14 15:07:10.749369
6	4	Ali	\N	2016-02-14	Grade 3	Willow Park Elementary School	\N	2025-11-14 15:07:10.749369
7	5	Zack	\N	2012-07-08	Grade 7	Maple Elementary School	\N	2025-11-14 15:07:10.749369
13	7	Joe	\N	2001-10-01	\N	\N	\N	2025-12-03 23:41:36.676347
\.


--
-- Data for Name: teacher; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teacher (teacherid, teachername, teacherinfo, created_at) FROM stdin;
1	Wong	Kids love him.	2025-11-14 15:07:10.745057
2	Park	Worked in Google for 10 years.	2025-11-14 15:07:10.745057
3	Jisoo	Computer Science PHD. 100 published articles 	2025-11-14 15:07:10.745057
4	Jennie	UC mathematics master. 10 years in teaching.	2025-11-14 15:07:10.745057
5	Lisa	MIT Engineer PHD. Program lead.	2025-11-14 15:07:10.745057
\.


--
-- Data for Name: user_account; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_account (userid, username, userphone, userwechat, useraddress, created_at, updated_at, password_hash, last_login) FROM stdin;
8	Changying	123456789	\N	\N	2025-12-02 15:03:57.324073	2025-12-02 15:03:57.324073	$2b$10$KZXDOzu2Oz2Jo3xHaNF/BOGUsMZ9N6pkg19kCK2pPUBdSaCgefduu	\N
1	Bob	13811112222	zhangwei_wx	Chaoyao, Beijing	2025-11-14 15:07:10.720962	2025-12-03 23:12:42.955512	\N	\N
2	Catherine	13922223333	lina_wx	Haidian, Beijing	2025-11-14 15:07:10.720962	2025-12-03 23:12:43.043054	\N	\N
3	Violet	13633334444	wangqiang_wx	Chaoyao, Beijing	2025-11-14 15:07:10.720962	2025-12-03 23:12:43.044224	\N	\N
4	Judy	13744445555	liufang_wx	Dongcheng, Beijing	2025-11-14 15:07:10.720962	2025-12-03 23:12:43.044989	\N	\N
5	Nick	13855556666	chenming_wx	Dongcheg, Beijing	2025-11-14 15:07:10.720962	2025-12-03 23:12:43.04543	\N	\N
6	Test	13800138000	\N	\N	2025-11-17 16:53:47.793571	2025-12-03 23:12:43.046139	$2b$10$F9vGMGwx5dJIK5C0IjI0LunCXxeEuM.lrZmtiNXAXS.PxAlj0ENF2	2025-11-18 17:24:23.201747
7	Yehe	18600200483	\N	\N	2025-12-02 13:55:03.158144	2025-12-03 23:38:52.523988	$2b$10$UMmlgy6NPKH1cEXOb0Vp0u5dezA1zMUDWc2GilGPyBZehAxS7VMhq	2025-12-03 23:38:52.523988
9	Joe doe	123456	\N	\N	2025-12-03 23:43:22.235344	2025-12-03 23:43:22.235344	$2b$10$D7.c9oqqjzcCnY.fZfaDweWKPODALMIqRjlCU0uT.9AHwuvhbuMZ2	\N
\.


--
-- Name: admin_adminid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.admin_adminid_seq', 1, true);


--
-- Name: course_courseid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.course_courseid_seq', 7, true);


--
-- Name: enrollmentaudit_auditid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.enrollmentaudit_auditid_seq', 28, true);


--
-- Name: order_transaction_orderid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_transaction_orderid_seq', 21, true);


--
-- Name: passwordresettokens_token_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.passwordresettokens_token_id_seq', 1, false);


--
-- Name: payment_paymentid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payment_paymentid_seq', 12, true);


--
-- Name: session_sessionid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.session_sessionid_seq', 12, true);


--
-- Name: sessionenrollment_enrollmentid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sessionenrollment_enrollmentid_seq', 29, true);


--
-- Name: student_studentid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.student_studentid_seq', 13, true);


--
-- Name: teacher_teacherid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.teacher_teacherid_seq', 7, true);


--
-- Name: user_account_userid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_account_userid_seq', 9, true);


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
-- Name: idx_enrollment_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_session ON public.sessionenrollment USING btree (sessionid);


--
-- Name: idx_enrollment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_status ON public.sessionenrollment USING btree (enrollmentstatus);


--
-- Name: idx_enrollment_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_enrollment_student ON public.sessionenrollment USING btree (studentid);


--
-- Name: idx_order_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_user ON public.order_transaction USING btree (userid);


--
-- Name: idx_session_course; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_course ON public.session USING btree (courseid);


--
-- Name: idx_session_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_teacher ON public.session USING btree (teacherid);


--
-- Name: idx_student_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_user ON public.student USING btree (userid);


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

\unrestrict GsREdDPkDocgrQNdujZzJagODMNLNh0AjU11kCG31H6kyUafHTiriqVafoLPadC

