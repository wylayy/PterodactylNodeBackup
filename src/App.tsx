import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet } from 'react-router-dom';
import { Home, HardDrive, Database, Clock, Settings, LogOut, Menu, X } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Nodes from './pages/Nodes.tsx';
import Backups from './pages/Backups.tsx';
import Schedules from './pages/Schedules.tsx';
import SettingsPage from './pages/Settings.tsx';
import Login from './pages/Login';

function ProtectedRoute() {
  const token = localStorage.getItem('token');
  return token ? <Layout /> : <Navigate to="/login" replace />;
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile && !sidebarOpen) setSidebarOpen(true);
      if (mobile && sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const links = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/nodes', icon: HardDrive, label: 'Nodes' },
    { to: '/backups', icon: Database, label: 'Backups' },
    { to: '/schedules', icon: Clock, label: 'Schedules' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-50 h-full
        ${sidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:w-20 md:translate-x-0'} 
        bg-slate-800 border-r border-slate-700 flex flex-col transition-all duration-300
      `}>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <span className={`font-bold text-lg whitespace-nowrap overflow-hidden transition-all ${sidebarOpen ? 'opacity-100' : 'md:opacity-0 md:hidden'}`}>
            Backup System
          </span>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => isMobile && setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                }`
              }
              title={!sidebarOpen && !isMobile ? label : ''}
            >
              <Icon size={20} className="shrink-0" />
              <span className={`transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'md:opacity-0 md:hidden'}`}>
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-700">
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 text-red-400 whitespace-nowrap">
            <LogOut size={20} className="shrink-0" />
            <span className={`transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'md:opacity-0 md:hidden'}`}>
              Logout
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto w-full relative">
        {/* Mobile Header */}
        {isMobile && !sidebarOpen && (
          <div className="absolute top-4 left-4 z-30">
            <button onClick={() => setSidebarOpen(true)} className="p-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700">
              <Menu size={20} />
            </button>
          </div>
        )}

        <div className="p-4 md:p-6 pb-24 md:pb-6 min-h-screen">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/nodes" element={<Nodes />} />
          <Route path="/backups" element={<Backups />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
