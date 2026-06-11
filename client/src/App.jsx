import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Inspections from './pages/Inspections';
import InspectionDetail from './pages/InspectionDetail';
import InspectionOrders from './pages/InspectionOrders';
import InspectionExecute from './pages/InspectionExecute';
import Templates from './pages/Templates';
import NCRs from './pages/NCRs';
import NCRDetail from './pages/NCRDetail';
import Team from './pages/Team';
import SuperAdmin from './pages/SuperAdmin';
import Parts from './pages/Parts';
import ControlPlans from './pages/ControlPlans';
import ControlPlanDetail from './pages/ControlPlanDetail';
import Documents from './pages/Documents';
import ExtractionReview from './pages/ExtractionReview';
import Suppliers from './pages/Suppliers';
import Gauges from './pages/Gauges';
import QualityTools from './pages/QualityTools';
import CharacteristicChart from './pages/CharacteristicChart';
import XbarRChart from './pages/XbarRChart';
import ParetoAnalysis from './pages/ParetoAnalysis';
import ScatterPlot from './pages/ScatterPlot';
import FishboneBuilder from './pages/FishboneBuilder';
import FMEABuilder from './pages/FMEABuilder';
import CheckSheet from './pages/CheckSheet';
import GaugeRR from './pages/GaugeRR';

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
            <Route path="/dashboard"                    element={<Dashboard />} />

            {/* Measurement-based inspections */}
            <Route path="/inspection-orders"            element={<InspectionOrders />} />
            <Route path="/inspection-orders/:id"        element={<InspectionExecute />} />

            {/* Control plans */}
            <Route path="/control-plans"                element={<ControlPlans />} />
            <Route path="/control-plans/:id"            element={<ControlPlanDetail />} />

            {/* Documents & AI parsing */}
            <Route path="/documents"                    element={<Documents />} />
            <Route path="/documents/:id/review"         element={<ExtractionReview />} />

            {/* Quality events */}
            <Route path="/ncrs"                         element={<NCRs />} />
            <Route path="/ncrs/:id"                     element={<NCRDetail />} />

            {/* Quality tools + analytics */}
            <Route path="/quality-tools"                element={<QualityTools />} />
            <Route path="/quality-tools/pareto"         element={<ParetoAnalysis />} />
            <Route path="/quality-tools/scatter"        element={<ScatterPlot />} />
            <Route path="/quality-tools/chart/:id"      element={<CharacteristicChart />} />
            <Route path="/quality-tools/xbar-r/:id"     element={<XbarRChart />} />
            <Route path="/quality-tools/fishbone"       element={<FishboneBuilder />} />
            <Route path="/quality-tools/fmea"           element={<FMEABuilder />} />
            <Route path="/quality-tools/check-sheet"    element={<CheckSheet />} />
            <Route path="/quality-tools/gauge-rr"       element={<GaugeRR />} />

            {/* Masters */}
            <Route path="/parts"                        element={<Parts />} />
            <Route path="/suppliers"                    element={<Suppliers />} />
            <Route path="/gauges"                       element={<Gauges />} />

            {/* Legacy checklist inspections (kept for backward compat) */}
            <Route path="/inspections"                  element={<Inspections />} />
            <Route path="/inspections/:id"              element={<InspectionDetail />} />
            <Route path="/templates"                    element={<Templates />} />

            <Route path="/team"                         element={<Team />} />
            <Route path="/admin"                        element={<SuperAdmin />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
