import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './layouts/AppShell';
import Landing from '@modules/discovery/Landing';
import Discover from '@modules/discovery/Discover';
import ChallengePublic from '@modules/challenges/ChallengePublic';
import ChallengesList from '@modules/challenges/ChallengesList';
import ChallengeControlRoom from '@modules/challenges/ChallengeControlRoom';
import AdminDashboard from '@modules/organizations/AdminDashboard';
import FormBuilder from '@modules/forms/FormBuilder';
import RegisterScreen from '@modules/registrations/RegisterScreen';
import { JudgeQueue, ScoringScreen } from '@modules/judging/JudgeScreens';
import ParticipantDashboard from '@modules/participants/ParticipantDashboard';
import MyEntries from '@modules/participants/MyEntries';
import Awards from '@modules/participants/Awards';
import NotBuiltYet from '@shared/ui/NotBuiltYet';

export default function App() {
  return (
    <Routes>
      {/* The marketing landing page is the only screen outside the shell —
          it is not part of the design system's screen set. */}
      <Route path="/" element={<Landing />} />

      <Route element={<AppShell />}>
        {/* For you */}
        <Route path="/home" element={<ParticipantDashboard />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/c/:slug" element={<ChallengePublic />} />
        <Route path="/c/:slug/register" element={<RegisterScreen />} />
        <Route path="/c/:slug/leaderboard" element={<NotBuiltYet screen="S-59 Leaderboard" />} />
        <Route path="/me/registrations" element={<MyEntries />} />
        <Route path="/me/achievements" element={<Awards />} />
        <Route path="/verify/:certId" element={<NotBuiltYet screen="S-07 Certificate verification" />} />

        {/* Organizing */}
        <Route path="/org" element={<AdminDashboard />} />
        <Route path="/org/challenges" element={<ChallengesList />} />
        <Route path="/org/challenges/:cid" element={<ChallengeControlRoom />} />
        <Route path="/org/challenges/:cid/form" element={<FormBuilder />} />
        <Route path="/org/workspaces" element={<NotBuiltYet screen="S-14 Workspaces" />} />
        <Route path="/org/members" element={<NotBuiltYet screen="S-16 Members" />} />
        <Route path="/org/audit" element={<NotBuiltYet screen="S-23 Audit log" />} />
        <Route path="/org/analytics" element={<NotBuiltYet screen="S-24 Analytics" />} />
        <Route path="/org/settings" element={<NotBuiltYet screen="S-19..22 Settings" />} />

        {/* Judging */}
        <Route path="/judge" element={<JudgeQueue />} />
        <Route path="/judge/score/:sid" element={<ScoringScreen />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
