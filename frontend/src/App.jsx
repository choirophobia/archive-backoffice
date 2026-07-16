import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { FiltersProvider } from './filters.jsx';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import Data from './pages/Data.jsx';
import Statistics from './pages/Statistics.jsx';

function RequireAuth() {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <FiltersProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/data" element={<Data />} />
            <Route path="/statistics" element={<Statistics />} />
          </Route>
          <Route path="*" element={<Navigate to="/data" replace />} />
        </Routes>
      </FiltersProvider>
    </BrowserRouter>
  );
}

export default App;
