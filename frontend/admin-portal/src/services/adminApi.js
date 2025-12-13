import axios from 'axios';

// Base URL for admin API
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
// SYSTEM CONFIG (NEW!)
// ============================================

export const getSystemConfig = () => {
    return adminApi.get('/config');
};

export const updateSystemConfig = (data) => {
    return adminApi.put('/config', data);
};

// ============================================
// DASHBOARD STATS
// ============================================

export const getDashboardStats = async () => {
    try {
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

export const getAllCourses = () => adminApi.get('/courses');
export const getCourseById = (courseId) => adminApi.get(`/courses/${courseId}`);
export const createCourse = (courseData) => adminApi.post('/courses', courseData);
export const updateCourse = (courseId, courseData) => adminApi.put(`/courses/${courseId}`, courseData);
export const deleteCourse = (courseId) => adminApi.delete(`/courses/${courseId}`);

// ============================================
// SESSION MANAGEMENT
// ============================================

export const getAllSessions = (params) => adminApi.get('/sessions', { params });
export const getSessionById = (sessionId) => adminApi.get(`/sessions/${sessionId}`);
export const createSession = (sessionData) => adminApi.post('/sessions', sessionData);
export const updateSession = (sessionId, sessionData) => adminApi.put(`/sessions/${sessionId}`, sessionData);
export const deleteSession = (sessionId) => adminApi.delete(`/sessions/${sessionId}`);

// ============================================
// STUDENT MANAGEMENT
// ============================================

export const getAllStudents = () => adminApi.get('/students');
export const getStudentById = (studentId) => adminApi.get(`/students/${studentId}`);
export const getStudentEnrollments = (studentId) => adminApi.get(`/students/${studentId}/enrollments`);
export const getAllStudentsAdmin = () => adminApi.get('/admin/students');
export const getStudentDetails = (studentId) => adminApi.get(`/students/${studentId}`);

// ============================================
// ENROLLMENT MANAGEMENT
// ============================================

export const getAllEnrollmentsAdmin = (params) => adminApi.get('/admin/enrollments', { params });
export const updateEnrollmentStatus = (enrollmentId, status) => adminApi.put(`/admin/enrollments/${enrollmentId}/status`, { status });

// ============================================
// TEACHER MANAGEMENT
// ============================================

export const getAllTeachers = () => adminApi.get('/teachers');
export const createTeacher = (teacherData) => adminApi.post('/teachers', teacherData);
export const updateTeacher = (teacherId, teacherData) => adminApi.put(`/teachers/${teacherId}`, teacherData);
export const deleteTeacher = (teacherId) => adminApi.delete(`/teachers/${teacherId}`);

// ============================================
// USER MANAGEMENT
// ============================================

export const getAllUsers = () => adminApi.get('/admin/users');
export const getUserById = (userId) => adminApi.get(`/admin/users/${userId}`);

// Export default object
export default {
    adminLogin,
    getCurrentAdmin,
    // Config (NEW!)
    getSystemConfig,
    updateSystemConfig,
    // Dashboard
    getDashboardStats,
    // Courses
    getAllCourses,
    getCourseById,
    createCourse,
    updateCourse,
    deleteCourse,
    // Sessions
    getAllSessions,
    getSessionById,
    createSession,
    updateSession,
    deleteSession,
    // Students
    getAllStudents,
    getStudentById,
    getStudentEnrollments,
    getAllStudentsAdmin,
    getStudentDetails,
    // Enrollments
    getAllEnrollmentsAdmin,
    updateEnrollmentStatus,
    // Teachers
    getAllTeachers,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    // Users
    getAllUsers,
    getUserById
};