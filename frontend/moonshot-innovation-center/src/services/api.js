import axios from 'axios';

// Base URL for your backend API
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
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
// AUTH API CALLS
// ============================================

export const register = (userData) => {
  return api.post('/auth/register', userData);
};

export const login = (credentials) => {
  return api.post('/auth/login', credentials);
};

export const getCurrentUser = () => {
  return api.get('/auth/me');
};

// ============================================
// STUDENT API CALLS
// ============================================

export const getStudentsByParent = (userId) => {
  return api.get(`/students/parent/${userId}`);
};

export const addStudent = (userId, studentData) => {
  return api.post(`/students/parent/${userId}`, studentData);
};

export const getStudentEnrollments = (studentId) => {
  return api.get(`/students/${studentId}/enrollments`);
};

// ============================================
// SESSION API CALLS
// ============================================

export const getSessions = (params = {}) => {
  return api.get('/sessions', { params });
};

export const getSessionById = (sessionId) => {
  return api.get(`/sessions/${sessionId}`);
};

// ============================================
// ENROLLMENT API CALLS
// ============================================

export const createEnrollment = (enrollmentData) => {
  return api.post('/enrollments', enrollmentData);
};

export const withdrawEnrollment = (enrollmentId) => {
  return api.put(`/enrollments/${enrollmentId}/withdraw`);
};

export const getEnrollmentStats = () => {
  return api.get('/enrollments/stats');
};

// Export default object with all methods
export default {
  register,
  login,
  getCurrentUser,
  getStudentsByParent,
  addStudent,
  getStudentEnrollments,
  getSessions,
  getSessionById,
  createEnrollment,
  withdrawEnrollment,
  getEnrollmentStats,
};