import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          Permohonan SLO
          <span>Archive backoffice</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/data"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            Data
          </NavLink>
          <NavLink
            to="/statistics"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            Statistics
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {user?.email && (
            <div className="sidebar-user">
              {user.email}
              {user.role && (
                <span className={`role-badge role-badge-${user.role}`}>
                  {user.role === 'superadmin' ? 'Superadmin' : 'Karyawan'}
                </span>
              )}
            </div>
          )}
          <button
            className="link-button"
            type="button"
            onClick={() => setShowChangePassword(true)}
          >
            Change password
          </button>
          <span className="sidebar-footer-sep">·</span>
          <button className="link-button" type="button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}

export default Sidebar;
