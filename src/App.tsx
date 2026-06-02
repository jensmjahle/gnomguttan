import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import { ArchivePage } from '@/pages/ArchivePage';
import { ChatPage } from '@/pages/ChatPage';
import { KinoPage } from '@/pages/KinoPage';
import { BussPage } from '@/pages/BussPage';
import { SpinPage } from '@/pages/SpinPage';
import { LampaPage } from '@/pages/LampaPage';
import { ArrangementerPage } from '@/pages/ArrangementerPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { GalleriPage } from '@/pages/GalleriPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/kino" element={<KinoPage />} />
          <Route path="/buss" element={<BussPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/spin" element={<SpinPage />} />
          <Route path="/lampa" element={<LampaPage />} />
          <Route path="/arrangementer" element={<ArrangementerPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/galleri" element={<GalleriPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
