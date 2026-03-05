import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Start from './pages/Start';
import Session from './pages/Session';
import Stop from './pages/Stop';
import Receipt from './pages/Receipt';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/charger/:chargePointId" element={<Landing />} />
        <Route path="/start/:chargePointId" element={<Start />} />
        <Route path="/session/:chargePointId" element={<Session />} />
        <Route path="/stop/:chargePointId" element={<Stop />} />
        <Route path="/receipt/:chargePointId" element={<Receipt />} />
        <Route path="*" element={<Navigate to="/charger/EVFLO-01" replace />} />
      </Routes>
    </BrowserRouter>
  );
}