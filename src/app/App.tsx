import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import AppShell from './layouts/AppShell';
import { c } from './tokens';

/**
 * Routes are lazy so a viewer downloads the screen they asked for, not all
 * fourteen. At 700 concurrent viewers on a cold CDN cache this is the
 * difference between one large parse on first paint and a small one.
 *
 * AppShell is eager: it is on every route, so splitting it would only add a
 * round-trip.
 */
const Landing = lazy(() => import('@modules/discovery/Landing'));
const Discover = lazy(() => import('@modules/discovery/Discover'));
const ChallengePublic = lazy(() => import('@modules/challenges/ChallengePublic'));
const ChallengesList = lazy(() => import('@modules/challenges/ChallengesList'));
const ChallengeControlRoom = lazy(() => import('@modules/challenges/ChallengeControlRoom'));
const AdminDashboard = lazy(() => import('@modules/organizations/AdminDashboard'));
const FormBuilder = lazy(() => import('@modules/forms/FormBuilder'));
const RegisterScreen = lazy(() => import('@modules/registrations/RegisterScreen'));
const ParticipantDashboard = lazy(() => import('@modules/participants/ParticipantDashboard'));
const MyEntries = lazy(() => import('@modules/participants/MyEntries'));
const Awards = lazy(() => import('@modules/participants/Awards'));
const NotBuiltYet = lazy(() => import('@shared/ui/NotBuiltYet'));
const JudgeQueue = lazy(() =>
  import('@modules/judging/JudgeScreens').then((m) => ({ default: m.JudgeQueue })),
);
const ScoringScreen = lazy(() =>
  import('@modules/judging/JudgeScreens').then((m) => ({ default: m.ScoringScreen })),
);

function RouteFallback() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
      <CircularProgress sx={{ color: c.accent }} />
    </Box>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
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
    </Suspense>
  );
}
