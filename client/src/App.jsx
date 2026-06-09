import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Inspections from './pages/Inspections';
import InspectionDetail from './pages/InspectionDetail';
import Templates from './pages/Templates';
import NCRs from './pages/NCRs';
import NCRDetail from './pages/NCRDetail';
import Team from './pages/Team';
import SuperAdmin from './pages/SuperAdmin';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span className="spinner" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route path="/dashboard"           element={<Dashboard />} />
            <Route path="/inspections"         element={<Inspections />} />
            <Route path="/inspections/:id"     element={<InspectionDetail />} />
            <Route path="/templates"           element={<Templates />} />
            <Route path="/ncrs"                element={<NCRs />} />
            <Route path="/ncrs/:id"            element={<NCRDetail />} />
            <Route path="/team"                element={<Team />} />
            <Route path="/admin"               element={<SuperAdmin />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
