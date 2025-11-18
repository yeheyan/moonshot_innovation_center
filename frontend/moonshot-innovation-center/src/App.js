import React, { useState, useEffect } from 'react';
import './App.css';
import api from './services/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Check if user is logged in on app load
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (token && user) {
      setIsAuthenticated(true);
      setCurrentUser(JSON.parse(user));
    }
  }, []);

  // Fetch students when user logs in
  useEffect(() => {
    if (currentUser) {
      fetchStudents();
      fetchSessions();
    }
  }, [currentUser]);

  const fetchStudents = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const response = await api.getStudentsByParent(currentUser.userId);
      setStudents(response.data.data);
    } catch (error) {
      setMessage('Error fetching students: ' + error.message);
    }
    setLoading(false);
  };

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await api.getSessions();
      setSessions(response.data.data);
    } catch (error) {
      setMessage('Error fetching sessions: ' + error.message);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setStudents([]);
    setSessions([]);
  };

  const addStudent = async (studentData) => {
    try {
      await api.addStudent(currentUser.userId, studentData);
      setMessage('Student added successfully!');
      fetchStudents();
      return true;
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
      return false;
    }
  };

  const updateStudent = async (studentId, studentData) => {
    try {
      await api.updateStudent(studentId, studentData);
      setMessage('Student updated successfully!');
      fetchStudents();
      return true;
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
      return false;
    }
  };

  const deleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to delete ${studentName}?`)) {
      return false;
    }
    try {
      await api.deleteStudent(studentId);
      setMessage('Student deleted successfully!');
      fetchStudents();
      return true;
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
      return false;
    }
  };

  const enrollStudent = async (studentId, sessionId) => {
    try {
      await api.createEnrollment({ studentId, sessionId });
      setMessage('Enrolled successfully!');
      fetchStudents();
      fetchSessions();
      return true;
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
      return false;
    }
  };

  const withdrawEnrollment = async (enrollmentId, sessionName) => {
    if (!window.confirm(`Are you sure you want to withdraw from "${sessionName}"?`)) {
      return false;
    }
    try {
      await api.withdrawEnrollment(enrollmentId);
      setMessage('Withdrawn successfully!');
      return true;
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
      return false;
    }
  };

  // If not logged in, show login page
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={(user) => {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }} />;
  }

  // Main app interface
  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <h1>🚀 Moonshot Innovation Center</h1>
          <div className="user-info">
            <span>Welcome, {currentUser?.userName}!</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      {message && (
        <div className={`message ${message.startsWith('Error') ? 'error' : 'success'}`}>
          {message}
          <button onClick={() => setMessage('')}>✕</button>
        </div>
      )}

      <div className="tabs">
        <button
          className={activeTab === 'students' ? 'active' : ''}
          onClick={() => setActiveTab('students')}
        >
          My Learners
        </button>
        <button
          className={activeTab === 'sessions' ? 'active' : ''}
          onClick={() => setActiveTab('sessions')}
        >
          Available Sessions
        </button>
        <button
          className={activeTab === 'enrollments' ? 'active' : ''}
          onClick={() => setActiveTab('enrollments')}
        >
          My Enrollments
        </button>
      </div>

      <main className="content">
        {loading && <div className="loading">Loading...</div>}

        {activeTab === 'students' && (
          <StudentsTab
            students={students}
            onAddStudent={addStudent}
            onUpdateStudent={updateStudent}
            onDeleteStudent={deleteStudent}
          />
        )}

        {activeTab === 'sessions' && (
          <SessionsTab
            sessions={sessions}
            students={students}
            onEnroll={enrollStudent}
          />
        )}

        {activeTab === 'enrollments' && (
          <EnrollmentsTab
            students={students}
            onWithdraw={withdrawEnrollment}
          />
        )}
      </main>
    </div>
  );
}

// ==================== STUDENTS TAB ====================
function StudentsTab({ students, onAddStudent, onUpdateStudent, onDeleteStudent }) {
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({
    studentName: '',
    studentNationalID: '',
    studentBirthDate: '',
    studentGrade: '',
    studentSchool: ''
  });

  const handleEdit = (student) => {
    setEditingStudent(student);
    setFormData({
      studentName: student.studentname,
      studentNationalID: student.studentnationalid || '',
      studentBirthDate: student.studentbirthdate ? student.studentbirthdate.split('T')[0] : '',
      studentGrade: student.studentgrade || '',
      studentSchool: student.studentschool || ''
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let success;
    if (editingStudent) {
      success = await onUpdateStudent(editingStudent.studentid, formData);
    } else {
      success = await onAddStudent(formData);
    }

    if (success) {
      setFormData({
        studentName: '',
        studentNationalID: '',
        studentBirthDate: '',
        studentGrade: '',
        studentSchool: ''
      });
      setShowForm(false);
      setEditingStudent(null);
    }
  };

  const handleCancel = () => {
    setFormData({
      studentName: '',
      studentNationalID: '',
      studentBirthDate: '',
      studentGrade: '',
      studentSchool: ''
    });
    setShowForm(false);
    setEditingStudent(null);
  };

  return (
    <div className="students-tab">
      <div className="tab-header">
        <h2>My Learners</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)}>+ Add Child</button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="student-form">
          <h3>{editingStudent ? 'Edit Learner' : 'Add Learner'}</h3>
          <input
            type="text"
            placeholder="Learner's Name *"
            value={formData.studentName}
            onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="National ID (optional)"
            value={formData.studentNationalID}
            onChange={(e) => setFormData({ ...formData, studentNationalID: e.target.value })}
          />
          <input
            type="date"
            placeholder="Birth Date"
            value={formData.studentBirthDate}
            onChange={(e) => setFormData({ ...formData, studentBirthDate: e.target.value })}
          />
          <input
            type="text"
            placeholder="Grade (optional)"
            value={formData.studentGrade}
            onChange={(e) => setFormData({ ...formData, studentGrade: e.target.value })}
          />
          <input
            type="text"
            placeholder="School (optional)"
            value={formData.studentSchool}
            onChange={(e) => setFormData({ ...formData, studentSchool: e.target.value })}
          />
          <div className="form-actions">
            <button type="submit">{editingStudent ? 'Update' : 'Add'}</button>
            <button type="button" onClick={handleCancel}>Cancel</button>
          </div>
        </form>
      )}

      <div className="students-list">
        {students.length === 0 ? (
          <p>No children added yet. Click "Add Child" to get started.</p>
        ) : (
          students.map(student => (
            <div key={student.studentid} className="student-card">
              <div className="student-info">
                <h3>{student.studentname}</h3>
                {student.studentgrade && <p> Grade: {student.studentgrade}</p>}
                {student.studentschool && <p> School: {student.studentschool}</p>}
                {student.studentbirthdate && (
                  <p> Birth Date: {new Date(student.studentbirthdate).toLocaleDateString()}</p>
                )}
              </div>
              <div className="student-actions">
                <button onClick={() => handleEdit(student)} className="edit-btn">
                  ✏️ Edit
                </button>
                <button
                  onClick={() => onDeleteStudent(student.studentid, student.studentname)}
                  className="delete-btn"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==================== SESSIONS TAB ====================
function SessionsTab({ sessions, students, onEnroll }) {
  const [selectedStudent, setSelectedStudent] = useState('');
  const [enrolling, setEnrolling] = useState(null);
  const [expandedCourses, setExpandedCourses] = useState({});

  // Group sessions by course
  const groupedSessions = sessions.reduce((acc, session) => {
    const courseName = session.course_name;
    if (!acc[courseName]) {
      acc[courseName] = {
        courseInfo: {
          name: courseName,
          description: session.course_description,
          price: session.price
        },
        sessions: []
      };
    }
    acc[courseName].sessions.push(session);
    return acc;
  }, {});

  const toggleCourse = (courseName) => {
    setExpandedCourses(prev => ({
      ...prev,
      [courseName]: !prev[courseName]
    }));
  };

  const handleEnroll = async (sessionId) => {
    if (!selectedStudent) {
      alert('Please select a student first');
      return;
    }
    setEnrolling(sessionId);
    await onEnroll(selectedStudent, sessionId);
    setEnrolling(null);
  };

  return (
    <div className="sessions-tab">
      <h2>Available Courses & Sessions</h2>

      {students.length > 0 && (
        <div className="student-selector">
          <label>Select child to enroll:</label>
          <select
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
          >
            <option value="">-- Choose a child --</option>
            {students.map(s => (
              <option key={s.studentid} value={s.studentid}>
                {s.studentname}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="courses-list">
        {Object.keys(groupedSessions).length === 0 ? (
          <p>No courses available at the moment.</p>
        ) : (
          Object.entries(groupedSessions).map(([courseName, data]) => (
            <div key={courseName} className="course-group">
              <div
                className="course-header"
                onClick={() => toggleCourse(courseName)}
              >
                <div className="course-info">
                  <h3>{data.courseInfo.name}</h3>
                  <p className="course-description">{data.courseInfo.description}</p>
                  <span className="course-price">💰 ¥{data.courseInfo.price}</span>
                  <span className="session-count">
                    {data.sessions.length} session{data.sessions.length > 1 ? 's' : ''} available
                  </span>
                </div>
                <button className="expand-btn">
                  {expandedCourses[courseName] ? '▼' : '▶'}
                </button>
              </div>

              {expandedCourses[courseName] && (
                <div className="sessions-in-course">
                  {data.sessions.map(session => (
                    <div key={session.session_id} className="session-card-compact">
                      <div className="session-details-compact">
                        <h4>{session.session_name}</h4>
                        <div className="session-info-row">
                          <span> teacher: {session.teacher_name}</span>
                          <span> day: {session.day_of_week}</span>
                          <span> start time: {session.start_time} - {session.end_time}</span>
                        </div>
                        <span className={`availability ${session.status === 'available' ? 'available' : 'full'}`}>
                          {session.available_spots > 0
                            ? `${session.available_spots} spots available`
                            : 'Full - Waitlist only'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleEnroll(session.session_id)}
                        disabled={!selectedStudent || enrolling === session.session_id}
                        className="enroll-btn-compact"
                      >
                        {enrolling === session.session_id ? 'Enrolling...' : 'Enroll'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==================== ENROLLMENTS TAB ====================
function EnrollmentsTab({ students, onWithdraw }) {
  const [enrollments, setEnrollments] = useState({});
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(null);

  useEffect(() => {
    fetchAllEnrollments();
  }, [students]);

  const fetchAllEnrollments = async () => {
    setLoading(true);
    const allEnrollments = {};

    for (const student of students) {
      try {
        const response = await api.getStudentEnrollments(student.studentid);
        allEnrollments[student.studentid] = response.data.data;
      } catch (error) {
        console.error('Error fetching enrollments:', error);
      }
    }

    setEnrollments(allEnrollments);
    setLoading(false);
  };

  const handleWithdraw = async (enrollmentId, sessionName) => {
    setWithdrawing(enrollmentId);
    const success = await onWithdraw(enrollmentId, sessionName);
    if (success) {
      fetchAllEnrollments();
    }
    setWithdrawing(null);
  };

  const calculateDaysUntil = (sessionStartDate) => {
    const now = new Date();
    const start = new Date(sessionStartDate);
    const days = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) return <div>Loading enrollments...</div>;

  return (
    <div className="enrollments-tab">
      <h2>My Enrollments</h2>

      {students.length === 0 ? (
        <p>No children added yet.</p>
      ) : (
        students.map(student => (
          <div key={student.studentid} className="student-enrollments">
            <h3>{student.studentname}'s Enrollments</h3>
            {enrollments[student.studentid]?.length === 0 || !enrollments[student.studentid] ? (
              <p>No enrollments yet.</p>
            ) : (
              <div className="enrollments-list">
                {enrollments[student.studentid].map(e => {
                  const daysUntil = calculateDaysUntil(e.sessionstartdate);
                  const canWithdraw = e.enrollmentstatus === 'active' && daysUntil >= 7;

                  return (
                    <div key={e.enrollmentid} className="enrollment-card">
                      <div className="enrollment-info">
                        <h4>{e.coursename}</h4>
                        <p>{e.sessionname}</p>
                        <span className={`status ${e.enrollmentstatus}`}>
                          {e.enrollmentstatus}
                        </span>
                        <p> Day: {e.sessiondayofweek} Time: {e.sessionstarttime} - {e.sessionendtime}</p>
                        <p> Start Date: {new Date(e.sessionstartdate).toLocaleDateString()}</p>
                        <p> Teacher: {e.teachername}</p>
                        {daysUntil > 0 && (
                          <p className="days-until"> {daysUntil} days until session</p>
                        )}
                      </div>
                      {e.enrollmentstatus === 'active' && (
                        <div className="enrollment-actions">
                          {canWithdraw ? (
                            <button
                              onClick={() => handleWithdraw(e.enrollmentid, e.sessionname)}
                              disabled={withdrawing === e.enrollmentid}
                              className="withdraw-btn"
                            >
                              {withdrawing === e.enrollmentid ? 'Withdrawing...' : '❌ Withdraw'}
                            </button>
                          ) : (
                            <p className="no-withdraw">
                              Cannot withdraw (less than 7 days until session)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ==================== LOGIN PAGE ====================
function LoginPage({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    userPhone: '',
    password: '',
    userName: '',
    userWechat: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let response;
      if (isLogin) {
        response = await api.login({
          userPhone: formData.userPhone,
          password: formData.password
        });
      } else {
        response = await api.register({
          userName: formData.userName,
          userPhone: formData.userPhone,
          password: formData.password,
          userWechat: formData.userWechat
        });
      }

      localStorage.setItem('token', response.data.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.data.user));
      onLoginSuccess(response.data.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h2>🚀 Moonshot Innovation Center</h2>
        <h3>{isLogin ? 'Login' : 'Register'}</h3>

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <input
                type="text"
                placeholder="Full Name"
                value={formData.userName}
                onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="WeChat ID (optional)"
                value={formData.userWechat}
                onChange={(e) => setFormData({ ...formData, userWechat: e.target.value })}
              />
            </>
          )}

          <input
            type="tel"
            placeholder="Phone Number"
            value={formData.userPhone}
            onChange={(e) => setFormData({ ...formData, userPhone: e.target.value })}
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
            {loading ? 'Loading...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>

        <p>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Register' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default App;