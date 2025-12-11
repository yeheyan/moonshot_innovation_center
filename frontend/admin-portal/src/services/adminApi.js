import axios from 'axios';

// Base URL for admin API
// const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api'; // Local development URL
const API_URL = process.env.REACT_APP_API_URL || 'https://moonshotinnovationcenter-production.up.railway.app/api';

// Create axios instance
const adminApi = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to requests automatically
adminApi.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('adminToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// ============================================
// ADMIN AUTH
// ============================================

export const adminLogin = (credentials) => {
    return adminApi.post('/admin/login', credentials);
};

export const getCurrentAdmin = () => {
    return adminApi.get('/admin/me');
};

// ============================================
// DASHBOARD STATS
// ============================================

export const getDashboardStats = async () => {
    try {
        // Get stats from multiple endpoints
        const [enrollmentStats, coursesRes, sessionsRes, studentsRes, usersRes] = await Promise.all([
            adminApi.get('/enrollments/stats'),
            adminApi.get('/courses'),
            adminApi.get('/sessions'),
            adminApi.get('/admin/students'),
            adminApi.get('/admin/users')
        ]);

        return {
            enrollments: enrollmentStats.data.data,
            totalCourses: coursesRes.data.count || 0,
            totalSessions: sessionsRes.data.count || 0,
            totalStudents: studentsRes.data.count || 0,
            totalUsers: usersRes.data.count || 0
        };
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        // Return default values if fetch fails
        return {
            enrollments: {
                total_enrollments: 0,
                active_enrollments: 0,
                waitlisted: 0,
                withdrawn: 0
            },
            totalCourses: 0,
            totalSessions: 0,
            totalStudents: 0,
            totalUsers: 0
        };
    }
};

// ============================================
// COURSE MANAGEMENT
// ============================================

export const getAllCourses = () => {
    return adminApi.get('/courses');
};

export const getCourseById = (courseId) => {
    return adminApi.get(`/courses/${courseId}`);
};

export const createCourse = (courseData) => {
    return adminApi.post('/courses', courseData);
};

export const updateCourse = (courseId, courseData) => {
    return adminApi.put(`/courses/${courseId}`, courseData);
};

export const deleteCourse = (courseId) => {
    return adminApi.delete(`/courses/${courseId}`);
};

// ============================================
// SESSION MANAGEMENT
// ============================================

export const getAllSessions = (params) => {
    return adminApi.get('/sessions', { params });
};

export const getSessionById = (sessionId) => {
    return adminApi.get(`/sessions/${sessionId}`);
};

export const createSession = (sessionData) => {
    return adminApi.post('/sessions', sessionData);
};

export const updateSession = (sessionId, sessionData) => {
    return adminApi.put(`/sessions/${sessionId}`, sessionData);
};

export const deleteSession = (sessionId) => {
    return adminApi.delete(`/sessions/${sessionId}`);
};

// ============================================
// STUDENT MANAGEMENT
// ============================================

export const getAllStudents = () => {
    return adminApi.get('/students');
};

export const getStudentById = (studentId) => {
    return adminApi.get(`/students/${studentId}`);
};

export const getStudentEnrollments = (studentId) => {
    return adminApi.get(`/students/${studentId}/enrollments`);
};

// ============================================
// ENROLLMENT MANAGEMENT
// ============================================

// export const getAllEnrollments = () => {
//     return adminApi.get('/enrollments');
// };

// export const getEnrollmentStats = () => {
//     return adminApi.get('/enrollments/stats');
// };

// export const updateEnrollmentStatus = (enrollmentId, status) => {
//     return adminApi.put(`/enrollments/${enrollmentId}/status`, { status });
// };

// ============================================
// ENROLLMENT MANAGEMENT
// ============================================

export const getAllEnrollmentsAdmin = (params) => {
    return adminApi.get('/admin/enrollments', { params });
};

export const updateEnrollmentStatus = (enrollmentId, status) => {
    return adminApi.put(`/admin/enrollments/${enrollmentId}/status`, { status });
};
// ============================================
// TEACHER MANAGEMENT
// ============================================

export const getAllTeachers = () => {
    return adminApi.get('/teachers');
};

export const createTeacher = (teacherData) => {
    return adminApi.post('/teachers', teacherData);
};

export const updateTeacher = (teacherId, teacherData) => {
    return adminApi.put(`/teachers/${teacherId}`, teacherData);
};

export const deleteTeacher = (teacherId) => {
    return adminApi.delete(`/teachers/${teacherId}`);
};

// ============================================
// STUDENT MANAGEMENT (ADMIN)
// ============================================

export const getAllStudentsAdmin = () => {
    return adminApi.get('/admin/students');
};

export const getStudentDetails = (studentId) => {
    return adminApi.get(`/students/${studentId}`);
};

export const getAllUsers = () => {
    return adminApi.get('/admin/users');
};

export const getUserById = (userId) => {
    return adminApi.get(`/admin/users/${userId}`);
};


// Export default object
export default {
    adminLogin,
    getCurrentAdmin,
    getDashboardStats,
    getAllCourses,
    getCourseById,
    createCourse,
    updateCourse,
    deleteCourse,
    getAllSessions,
    getSessionById,
    createSession,
    updateSession,
    deleteSession,
    getAllStudents,
    getStudentById,
    getStudentEnrollments,
    getAllUsers,
    getUserById,
    // getAllEnrollments,
    // getEnrollmentStats,
    getAllEnrollmentsAdmin,
    updateEnrollmentStatus,
    getAllTeachers,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    getAllStudentsAdmin,
    getStudentDetails,
};