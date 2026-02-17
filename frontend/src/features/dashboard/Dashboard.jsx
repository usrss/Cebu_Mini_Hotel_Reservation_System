// src/features/dashboard/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, logoutUser, getStoredUser, isFirstLogin, clearFirstLoginFlag } from '../../services/api';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getStoredUser());
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(isFirstLogin());

  useEffect(() => {
    fetchUserData();

    // Clear first login flag after showing welcome
    if (showWelcome) {
      setTimeout(() => {
        setShowWelcome(false);
        clearFirstLoginFlag();
      }, 5000);
    }
  }, []);

  const fetchUserData = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error('Error fetching user:', error);
      // If error, token might be invalid - redirect to login
      if (error.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try {
        await logoutUser();
        // Force a hard navigation to login
        window.location.href = '/login';
      } catch (error) {
        console.error('Logout error:', error);
        // Logout locally anyway
        window.location.href = '/login';
      }
    }
  };

  const handleEditProfile = () => {
    navigate('/settings');
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner">
          <span className="spinner"></span>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Welcome Banner for First-Time Users */}
      {showWelcome && (
        <div className="welcome-banner">
          <div className="welcome-content">
            <h1>ðŸŽ‰ Welcome to Cebu Mini Hotel!</h1>
            <p>Your account has been successfully created. We're excited to have you!</p>
          </div>
          <button
            onClick={() => {
              setShowWelcome(false);
              clearFirstLoginFlag();
            }}
            className="close-button"
          >
            Ã—
          </button>
        </div>
      )}

      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Cebu Mini Hotel</h1>
          <div className="header-actions">
            <button onClick={handleEditProfile} className="btn btn-secondary">
              Edit Profile
            </button>
            <button onClick={handleLogout} className="btn btn-outline">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        <div className="dashboard-grid">
          {/* User Info Card */}
          <div className="card user-card">
            <div className="card-header">
              <h2>Profile Information</h2>
            </div>
            <div className="card-body">
              <div className="user-avatar">
                <div className="avatar-circle">
                  {user?.first_name?.[0] || user?.email?.[0].toUpperCase()}
                </div>
              </div>
              <div className="user-details">
                <h3>{user?.full_name || user?.email}</h3>
                <p className="user-email">{user?.email}</p>
                <div className="user-meta">
                  <span className={`badge ${user?.is_verified ? 'badge-success' : 'badge-warning'}`}>
                    {user?.is_verified ? 'âœ“ Verified' : 'Pending Verification'}
                  </span>
                  <span className="badge badge-info">
                    {user?.auth_provider === 'email' ? 'ðŸ“§ Email' :
                     user?.auth_provider === 'google' ? 'Google' :
                     'Facebook'}
                  </span>
                </div>
                <p className="text-muted mt-2">
                  Member since {new Date(user?.date_joined).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="card">
            <div className="card-header">
              <h2>Quick Actions</h2>
            </div>
            <div className="card-body">
              <div className="quick-actions">
                <button className="action-button" onClick={() => navigate('/rooms')}>
                  <h4>Book a Room</h4>
                  <p>Find and reserve your perfect stay</p>
                </button>

                  <button className="action-button" onClick={() => navigate('/rooms')}>
                    <h4>My Reservations</h4>
                    <p>View your upcoming bookings</p>
                  </button>

                <button className="action-button">
                  <span className="action-icon"></span>
                  <div>
                    <h4>Payment Methods</h4>
                    <p>Manage your payment options</p>
                  </div>
                </button>

                <button className="action-button">
                  <span className="action-icon"></span>
                  <div>
                    <h4>Reviews</h4>
                    <p>See your reviews and ratings</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Recent Activity Card */}
          <div className="card">
            <div className="card-header">
              <h2>Recent Activity</h2>
            </div>
            <div className="card-body">
              <div className="activity-list">
                <div className="activity-item">
                  <span className="activity-icon">âœ“</span>
                  <div>
                    <p><strong>Account Created</strong></p>
                    <p className="text-muted">
                      {new Date(user?.date_joined).toLocaleString()}
                    </p>
                  </div>
                </div>

                {user?.last_login && user.last_login !== user.date_joined && (
                  <div className="activity-item">
                    <span className="activity-icon">ðŸ”</span>
                    <div>
                      <p><strong>Last Login</strong></p>
                      <p className="text-muted">
                        {new Date(user.last_login).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats Card */}
          <div className="card stats-card">
            <div className="card-header">
              <h2>Your Stats</h2>
            </div>
            <div className="card-body">
              <div className="stats-grid">
                <div className="stat-item">
                  <h3>0</h3>
                  <p>Total Bookings</p>
                </div>
                <div className="stat-item">
                  <h3>0</h3>
                  <p>Nights Stayed</p>
                </div>
                <div className="stat-item">
                  <h3>0</h3>
                  <p>Reviews</p>
                </div>
                <div className="stat-item">
                  <h3>New</h3>
                  <p>Member Status</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}