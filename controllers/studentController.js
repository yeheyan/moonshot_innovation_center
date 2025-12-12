const db = require('../db/connection');

// Get students by parent (userId from User_Account)
exports.getStudentsByParent = async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await db.query(
            `SELECT
        StudentID,
        StudentName,
        StudentNationalID,
        StudentBirthDate,
        StudentGrade,
        StudentSchool
      FROM Student
      WHERE UserID = $1
      ORDER BY StudentID DESC`,
            [userId]
        );

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });

    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Add a student under a parent
exports.addStudent = async (req, res) => {
    try {
        const { userId } = req.params;
        const {
            studentName,
            studentNickname,
            studentGender,
            studentNationalID,
            studentBirthDate,
            studentGrade,
            studentSchool,
            studentPhone,
            studentAddress
        } = req.body;

        // Validate required fields
        if (!studentName || !studentGender || !studentNationalID ||
            !studentBirthDate || !studentGrade || !studentSchool || !studentPhone) {
            return res.status(400).json({
                success: false,
                error: 'Name, gender, national ID, birthday, grade, school, and phone are required'
            });
        }

        const result = await db.query(
            `INSERT INTO student (
        userid, studentname, student_nickname, student_gender,
        studentnationalid, studentbirthdate, studentgrade, studentschool,
        student_phone, student_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
            [userId, studentName, studentNickname || null, studentGender, studentNationalID,
                studentBirthDate, studentGrade, studentSchool, studentPhone, studentAddress || null]
        );

        res.status(201).json({
            success: true,
            message: 'Student added successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error adding student:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Update student information
exports.updateStudent = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { studentName, studentNationalID, studentBirthDate, studentGrade, studentSchool } = req.body;

        const result = await db.query(
            `UPDATE Student SET
        StudentName = COALESCE($1, StudentName),
        StudentNationalID = COALESCE($2, StudentNationalID),
        StudentBirthDate = COALESCE($3, StudentBirthDate),
        StudentGrade = COALESCE($4, StudentGrade),
        StudentSchool = COALESCE($5, StudentSchool)
      WHERE StudentID = $6
      RETURNING *`,
            [studentName, studentNationalID, studentBirthDate, studentGrade, studentSchool, studentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        res.json({
            success: true,
            message: 'Student updated successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Delete student
exports.deleteStudent = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { studentId } = req.params;

        await client.query('BEGIN');

        // Check if student has active enrollments
        const enrollmentCheck = await client.query(
            `SELECT COUNT(*) FROM SessionEnrollment
       WHERE StudentID = $1 AND EnrollmentStatus = 'active'`,
            [studentId]
        );

        if (parseInt(enrollmentCheck.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Cannot delete student with active enrollments. Please withdraw from sessions first.'
            });
        }

        // Delete all enrollment records (withdrawn/waitlisted)
        await client.query(
            'DELETE FROM SessionEnrollment WHERE StudentID = $1',
            [studentId]
        );

        // Delete the student
        const result = await client.query(
            'DELETE FROM Student WHERE StudentID = $1 RETURNING *',
            [studentId]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Student deleted successfully'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting student:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
};

// Get student's enrollments with session details
exports.getStudentEnrollments = async (req, res) => {
    try {
        const { studentId } = req.params;

        const result = await db.query(
            `SELECT
        se.EnrollmentID,
        se.EnrollmentStatus,
        se.EnrollmentDate,
        s.SessionID,
        s.SessionName,
        s.SessionDayOfWeek,
        s.SessionStartTime,
        s.SessionEndTime,
        s.SessionStartDate,
        c.CourseID,
        c.CourseName,
        c.CourseDescription,
        c.CoursePrice,
        t.TeacherName,
        t.TeacherInfo
      FROM SessionEnrollment se
      JOIN Session s ON se.SessionID = s.SessionID
      JOIN Course c ON s.CourseID = c.CourseID
      JOIN Teacher t ON s.TeacherID = t.TeacherID
      WHERE se.StudentID = $1
      ORDER BY se.EnrollmentDate DESC`,
            [studentId]
        );

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });

    } catch (error) {
        console.error('Error fetching enrollments:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};