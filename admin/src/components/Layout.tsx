import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h1>OTP Gateway</h1>
        <nav>
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
            Dashboard
          </NavLink>
          <NavLink to="/logs" className={({ isActive }) => isActive ? 'active' : ''}>
            OTP Logs
          </NavLink>
          <NavLink to="/database" className={({ isActive }) => isActive ? 'active' : ''}>
            Database
          </NavLink>
          <NavLink to="/tester" className={({ isActive }) => isActive ? 'active' : ''}>
            UX Tester
          </NavLink>
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%' }}>
            Logout
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
