import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import { ArchivePage } from '@/pages/ArchivePage';
import { ChatPage } from '@/pages/ChatPage';
import { KinoPage } from '@/pages/KinoPage';
import { BussPage } from '@/pages/BussPage';
import { BryggeriPage } from '@/pages/BryggeriPage';
import { SpinPage } from '@/pages/SpinPage';
import { LampaPage } from '@/pages/LampaPage';
import { ArrangementerPage } from '@/pages/ArrangementerPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { CommunityEventDetailPage } from '@/pages/CommunityEventDetailPage';
import { CommunityEventEditorPage } from '@/pages/CommunityEventEditorPage';
import { GalleriPage } from '@/pages/GalleriPage';
import { ValheimServerPage } from '@/pages/ValheimServerPage';
import { AlbumPage } from '@/pages/AlbumPage';
import { TournamentPage } from '@/pages/TournamentPage';
import { PigsPage } from '@/pages/PigsPage';
import { SitaterPage } from '@/pages/SitaterPage';
import { DevPage } from '@/pages/DevPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/kino" element={<KinoPage />} />
          <Route path="/valheim" element={<ValheimServerPage />} />
          <Route path="/buss" element={<BussPage />} />
          <Route path="/bryggeri" element={<BryggeriPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/spin" element={<SpinPage />} />
          <Route path="/lampa" element={<LampaPage />} />
          <Route path="/arrangementer" element={<ArrangementerPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/calender" element={<CalendarPage />} />
          <Route path="/arrangementer/ny" element={<CommunityEventEditorPage />} />
          <Route path="/arrangementer/:eventId/rediger" element={<CommunityEventEditorPage />} />
          <Route path="/arrangementer/:eventId" element={<CommunityEventDetailPage />} />
          <Route path="/galleri" element={<GalleriPage />} />
          <Route path="/galleri/album/:albumId" element={<AlbumPage />} />
          <Route path="/turnering" element={<TournamentPage />} />
          <Route path="/kast-grisene" element={<PigsPage />} />
          <Route path="/sitater" element={<SitaterPage />} />
          <Route path="/dev" element={<DevPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
