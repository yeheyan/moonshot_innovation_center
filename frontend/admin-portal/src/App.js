import React, { useState, useEffect } from 'react';
import './App.css';
import adminApi from './services/adminApi';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Check if admin is logged in
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    const admin = localStorage.getItem('admin');

    if (token && admin) {
      setIsAuthenticated(true);
      setCurrentAdmin(JSON.parse(admin));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('admin');
    setIsAuthenticated(false);
    setCurrentAdmin(null);
  };

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={(admin) => {
      setCurrentAdmin(admin);
      setIsAuthenticated(true);
    }} />;
  }

  // Main admin interface
  return (
    <div className="admin-app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>🚀 Admin Portal</h2>
          <p>{currentAdmin?.adminName}</p>
        </div>

        <nav className="sidebar-nav">
          <button
            className={activeView === 'dashboard' ? 'active' : ''}
            onClick={() => setActiveView('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={activeView === 'courses' ? 'active' : ''}
            onClick={() => setActiveView('courses')}
          >
            Courses
          </button>
          <button
            className={activeView === 'teachers' ? 'active' : ''}
            onClick={() => setActiveView('teachers')}
          >
            Teachers
          </button>
          <button
            className={activeView === 'students' ? 'active' : ''}
            onClick={() => setActiveView('students')}
          >
            Students
          </button>
          <button
            className={activeView === 'users' ? 'active' : ''}
            onClick={() => setActiveView('users')}
          >
            Parents
          </button>
          <button
            className={activeView === 'enrollments' ? 'active' : ''}
            onClick={() => setActiveView('enrollments')}
          >
            Enrollments
          </button>
        </nav>

        <button className="logout-btn" onClick={handleLogout}>
          🚪 Logout
        </button>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="content-header">
          <h1>{getViewTitle(activeView)}</h1>
        </header>

        {message && (
          <div className={`message ${message.startsWith('Error') ? 'error' : 'success'}`}>
            {message}
            <button onClick={() => setMessage('')}>✕</button>
          </div>
        )}

        <div className="content-body">
          {loading && <div className="loading">Loading...</div>}

          {activeView === 'dashboard' && <Dashboard />}
          {activeView === 'courses' && <CoursesView setMessage={setMessage} />}
          {activeView === 'teachers' && <TeachersView setMessage={setMessage} />}
          {activeView === 'students' && <StudentsView />}
          {activeView === 'users' && <UsersView />}
          {activeView === 'enrollments' && <EnrollmentsView />}
        </div>
      </main>
    </div>
  );
}

// Helper function
function getViewTitle(view) {
  const titles = {
    dashboard: '📊 Dashboard',
    courses: '📚 Course Management',
    sessions: '📅 Session Management',
    students: '👨‍🎓 Student Management',
    users: '👥 Parent Accounts',
    enrollments: '📋 Enrollment Management'
  };
  return titles[view] || 'Admin Portal';
}

// ==================== ADMIN LOGIN ====================
function AdminLogin({ onLoginSuccess }) {
  const [formData, setFormData] = useState({
    adminEmail: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await adminApi.adminLogin(formData);

      localStorage.setItem('adminToken', response.data.data.token);
      localStorage.setItem('admin', JSON.stringify(response.data.data.admin));

      onLoginSuccess(response.data.data.admin);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-box">
        <h2>🔐 Admin Login</h2>
        <p className="subtitle">Moonshot Innovation Center</p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Admin Email"
            value={formData.adminEmail}
            onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
          />

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ==================== DASHBOARD ====================
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const data = await adminApi.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div className="dashboard">
      <div className="stats-grid">
        <StatCard
          icon="👥"
          title="Total Users"
          value={stats?.totalUsers || 0}
          color="#667eea"
        />
        <StatCard
          icon="👨‍🎓"
          title="Total Students"
          value={stats?.totalStudents || 0}
          color="#48bb78"
        />
        <StatCard
          icon="📚"
          title="Total Courses"
          value={stats?.totalCourses || 0}
          color="#ed8936"
        />
        <StatCard
          icon="📅"
          title="Total Sessions"
          value={stats?.totalSessions || 0}
          color="#9f7aea"
        />
        <StatCard
          icon="✅"
          title="Active Enrollments"
          value={stats?.enrollments?.active_enrollments || 0}
          color="#38b2ac"
        />
        <StatCard
          icon="⏳"
          title="Waitlisted"
          value={stats?.enrollments?.waitlisted || 0}
          color="#f6ad55"
        />
      </div>

      <div className="dashboard-section">
        <h3>📈 Quick Stats</h3>
        <div className="info-cards">
          <div className="info-card">
            <h4>Total Enrollments</h4>
            <p className="big-number">{stats?.enrollments?.total_enrollments || 0}</p>
          </div>
          <div className="info-card">
            <h4>Withdrawn</h4>
            <p className="big-number">{stats?.enrollments?.withdrawn || 0}</p>
          </div>
          <div className="info-card">
            <h4>Sessions with Enrollments</h4>
            <p className="big-number">{stats?.enrollments?.sessions_with_enrollments || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, color }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <p className="stat-title">{title}</p>
        <p className="stat-value">{value}</p>
      </div>
    </div>
  );
}

// ==================== COURSES VIEW ====================
function CoursesView({ setMessage }) {
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCourses();
    fetchTeachers();
  }, []);

  const fetchCourses = async () => {
    try {
      const response = await adminApi.getAllCourses();
      setCourses(response.data.data);
    } catch (error) {
      setMessage('Error fetching courses: ' + error.message);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await adminApi.getAllTeachers();
      setTeachers(response.data.data);
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  };

  const handleAddCourse = () => {
    setEditingCourse(null);
    setShowCourseForm(true);
  };

  const handleEditCourse = (course) => {
    setEditingCourse(course);
    setShowCourseForm(true);
  };

  const handleDeleteCourse = async (courseId, courseName) => {
    if (!window.confirm(`Delete course "${courseName}"? This will fail if there are sessions.`)) {
      return;
    }

    try {
      await adminApi.deleteCourse(courseId);
      setMessage('Course deleted successfully');
      fetchCourses();
      if (selectedCourse?.courseid === courseId) {
        setSelectedCourse(null);
      }
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleCourseFormSubmit = async (courseData) => {
    try {
      if (editingCourse) {
        await adminApi.updateCourse(editingCourse.courseid, courseData);
        setMessage('Course updated successfully');
      } else {
        await adminApi.createCourse(courseData);
        setMessage('Course created successfully');
      }
      setShowCourseForm(false);
      setEditingCourse(null);
      fetchCourses();
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="courses-management">
      <div className="management-header">
        <h2>Course Management</h2>
        <button onClick={handleAddCourse} className="btn-primary">
          + Add Course
        </button>
      </div>

      {showCourseForm && (
        <CourseForm
          course={editingCourse}
          onSubmit={handleCourseFormSubmit}
          onCancel={() => {
            setShowCourseForm(false);
            setEditingCourse(null);
          }}
        />
      )}

      <div className="courses-grid">
        {courses.map(course => (
          <div
            key={course.courseid}
            className={`course-card ${selectedCourse?.courseid === course.courseid ? 'selected' : ''}`}
            onClick={() => setSelectedCourse(course)}
          >
            <div className="course-card-header">
              <h3>{course.coursename}</h3>
              <span className={`status-badge ${course.coursestatus}`}>
                {course.coursestatus}
              </span>
            </div>
            <p className="course-description">{course.coursedescription}</p>
            <div className="course-meta">
              <span>Price: ${course.courseprice}</span>
              <span>Max: {course.coursemaxenroll}</span>
              <span>Sessions: {course.session_count}</span>
            </div>
            <div className="course-actions">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditCourse(course);
                }}
                className="btn-edit"
              >
                Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCourse(course.courseid, course.coursename);
                }}
                className="btn-delete"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedCourse && (
        <SessionsForCourse
          course={selectedCourse}
          teachers={teachers}
          setMessage={setMessage}
          onClose={() => setSelectedCourse(null)}
        />
      )}
    </div>
  );
}

// ==================== COURSE FORM ====================
function CourseForm({ course, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    courseName: course?.coursename || '',
    courseDescription: course?.coursedescription || '',
    coursePrice: course?.courseprice || '',
    courseMaxEnroll: course?.coursemaxenroll || '',
    courseStatus: course?.coursestatus || 'active'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{course ? 'Edit Course' : 'Add New Course'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Course Name *</label>
            <input
              type="text"
              value={formData.courseName}
              onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.courseDescription}
              onChange={(e) => setFormData({ ...formData, courseDescription: e.target.value })}
              rows="3"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Price *</label>
              <input
                type="number"
                value={formData.coursePrice}
                onChange={(e) => setFormData({ ...formData, coursePrice: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Max Enrollment *</label>
              <input
                type="number"
                value={formData.courseMaxEnroll}
                onChange={(e) => setFormData({ ...formData, courseMaxEnroll: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select
              value={formData.courseStatus}
              onChange={(e) => setFormData({ ...formData, courseStatus: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {course ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================== SESSIONS FOR COURSE ====================
function SessionsForCourse({ course, teachers, setMessage, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [editingSession, setEditingSession] = useState(null);

  useEffect(() => {
    fetchSessions();
  }, [course]);

  const fetchSessions = async () => {
    try {
      const response = await adminApi.getAllSessions({ courseId: course.courseid });
      setSessions(response.data.data);
    } catch (error) {
      setMessage('Error fetching sessions: ' + error.message);
    }
  };

  const handleAddSession = () => {
    setEditingSession(null);
    setShowSessionForm(true);
  };

  const handleEditSession = (session) => {
    setEditingSession(session);
    setShowSessionForm(true);
  };

  const handleDeleteSession = async (sessionId, sessionName) => {
    if (!window.confirm(`Delete session "${sessionName}"?`)) {
      return;
    }

    try {
      await adminApi.deleteSession(sessionId);
      setMessage('Session deleted successfully');
      fetchSessions();
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleSessionFormSubmit = async (sessionData) => {
    try {
      const dataWithCourse = { ...sessionData, courseId: course.courseid };

      if (editingSession) {
        await adminApi.updateSession(editingSession.session_id, dataWithCourse);
        setMessage('Session updated successfully');
      } else {
        await adminApi.createSession(dataWithCourse);
        setMessage('Session created successfully');
      }
      setShowSessionForm(false);
      setEditingSession(null);
      fetchSessions();
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="sessions-panel">
      <div className="panel-header">
        <h3>Sessions for {course.coursename}</h3>
        <div>
          <button onClick={handleAddSession} className="btn-primary">
            + Add Session
          </button>
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>

      {showSessionForm && (
        <SessionForm
          session={editingSession}
          teachers={teachers}
          onSubmit={handleSessionFormSubmit}
          onCancel={() => {
            setShowSessionForm(false);
            setEditingSession(null);
          }}
        />
      )}

      <div className="sessions-list">
        {sessions.length === 0 ? (
          <p className="empty-message">No sessions yet. Add one to get started.</p>
        ) : (
          sessions.map(session => (
            <div key={session.session_id} className="session-item">
              <div className="session-info">
                <h4>{session.session_name}</h4>
                <div className="session-details">
                  <span>Teacher: {session.teacher_name}</span>
                  <span>Day: {session.day_of_week}</span>
                  <span>Time: {session.start_time} - {session.end_time}</span>
                  <span>Enrolled: {session.enrolled_count}/{course.coursemaxenroll}</span>
                </div>
              </div>
              <div className="session-actions">
                <button onClick={() => handleEditSession(session)} className="btn-edit">
                  Edit
                </button>
                <button onClick={() => handleDeleteSession(session.session_id, session.session_name)} className="btn-delete">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==================== SESSION FORM ====================
function SessionForm({ session, teachers, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    sessionName: session?.session_name || '',
    teacherId: session?.teacherid || '',
    sessionDayOfWeek: session?.day_of_week || '',
    sessionStartTime: session?.start_time || '',
    sessionEndTime: session?.end_time || '',
    sessionStartDate: session?.sessionstartdate?.split('T')[0] || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{session ? 'Edit Session' : 'Add New Session'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Session Name *</label>
            <input
              type="text"
              value={formData.sessionName}
              onChange={(e) => setFormData({ ...formData, sessionName: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Teacher *</label>
            <select
              value={formData.teacherId}
              onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
              required
            >
              <option value="">Select a teacher</option>
              {teachers.map(teacher => (
                <option key={teacher.teacherid} value={teacher.teacherid}>
                  {teacher.teachername}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Day of Week *</label>
            <select
              value={formData.sessionDayOfWeek}
              onChange={(e) => setFormData({ ...formData, sessionDayOfWeek: e.target.value })}
              required
            >
              <option value="">Select a day</option>
              {daysOfWeek.map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Time *</label>
              <input
                type="time"
                value={formData.sessionStartTime}
                onChange={(e) => setFormData({ ...formData, sessionStartTime: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>End Time *</label>
              <input
                type="time"
                value={formData.sessionEndTime}
                onChange={(e) => setFormData({ ...formData, sessionEndTime: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Start Date *</label>
            <input
              type="date"
              value={formData.sessionStartDate}
              onChange={(e) => setFormData({ ...formData, sessionStartDate: e.target.value })}
              required
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {session ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudentsView() {
  return (
    <div className="view-placeholder">
      <h2>👨‍🎓 Student Management</h2>
      <p>Student management coming soon...</p>
    </div>
  );
}

function UsersView() {
  return (
    <div className="view-placeholder">
      <h2>👥 Parent Accounts</h2>
      <p>User management coming soon...</p>
    </div>
  );
}

function EnrollmentsView() {
  return (
    <div className="view-placeholder">
      <h2>📋 Enrollment Management</h2>
      <p>Enrollment management coming soon...</p>
    </div>
  );
}
// Add this component to your admin App.js
// Replace the placeholder TeachersView or add this to your file

function TeachersView({ setMessage }) {
  const [teachers, setTeachers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getAllTeachers();
      setTeachers(response.data.data);
    } catch (error) {
      setMessage('Error fetching teachers: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTeacher = () => {
    setEditingTeacher(null);
    setShowForm(true);
  };

  const handleEditTeacher = (teacher) => {
    setEditingTeacher(teacher);
    setShowForm(true);
  };

  const handleDeleteTeacher = async (teacherId, teacherName) => {
    if (!window.confirm(`Delete teacher "${teacherName}"? This will fail if they have assigned sessions.`)) {
      return;
    }

    try {
      await adminApi.deleteTeacher(teacherId);
      setMessage('Teacher deleted successfully');
      fetchTeachers();
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleFormSubmit = async (teacherData) => {
    try {
      if (editingTeacher) {
        await adminApi.updateTeacher(editingTeacher.teacherid, teacherData);
        setMessage('Teacher updated successfully');
      } else {
        await adminApi.createTeacher(teacherData);
        setMessage('Teacher added successfully');
      }
      setShowForm(false);
      setEditingTeacher(null);
      fetchTeachers();
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) return <div className="loading">Loading teachers...</div>;

  return (
    <div className="teachers-management">
      <div className="management-header">
        <h2>Teacher Management</h2>
        <button onClick={handleAddTeacher} className="btn-primary">
          + Add Teacher
        </button>
      </div>

      {showForm && (
        <TeacherForm
          teacher={editingTeacher}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingTeacher(null);
          }}
        />
      )}

      <div className="teachers-grid">
        {teachers.length === 0 ? (
          <p className="empty-message">No teachers yet. Add one to get started.</p>
        ) : (
          teachers.map(teacher => (
            <div key={teacher.teacherid} className="teacher-card">
              <div className="teacher-header">
                <h3>{teacher.teachername}</h3>
              </div>
              <p className="teacher-info">{teacher.teacherinfo || 'No additional information'}</p>
              <div className="teacher-actions">
                <button onClick={() => handleEditTeacher(teacher)} className="btn-edit">
                  Edit
                </button>
                <button onClick={() => handleDeleteTeacher(teacher.teacherid, teacher.teachername)} className="btn-delete">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==================== TEACHER FORM ====================
function TeacherForm({ teacher, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    teacherName: teacher?.teachername || '',
    teacherInfo: teacher?.teacherinfo || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{teacher ? 'Edit Teacher' : 'Add New Teacher'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Teacher Name *</label>
            <input
              type="text"
              value={formData.teacherName}
              onChange={(e) => setFormData({ ...formData, teacherName: e.target.value })}
              placeholder="Enter teacher name"
              required
            />
          </div>

          <div className="form-group">
            <label>Teacher Information</label>
            <textarea
              value={formData.teacherInfo}
              onChange={(e) => setFormData({ ...formData, teacherInfo: e.target.value })}
              placeholder="Bio, qualifications, experience, etc."
              rows="4"
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {teacher ? 'Update' : 'Add Teacher'}
            </button>
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;