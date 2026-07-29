import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import AppShell from './layouts/AppShell';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { c } from '@shared/design/tokens';

/**
 * Routes are lazy so a viewer downloads the screen they asked for, not all
 * fourteen. At 700 concurrent viewers on a cold CDN cache this is the
 * difference between one large parse on first paint and a small one.
 *
 * AppShell is eager: it is on every route, so splitting it would only add a
 * round-trip.
 */
const Landing = lazy(() => import('@modules/discovery/Landing'));
const Welcome = lazy(() => import('@modules/onboarding/Welcome'));
const Discover = lazy(() => import('@modules/discovery/Discover'));
const ChallengePublic = lazy(() => import('@modules/challenges/ChallengePublic'));
const ChallengesList = lazy(() => import('@modules/challenges/ChallengesList'));
const ChallengeControlRoom = lazy(() => import('@modules/challenges/ChallengeControlRoom'));
const ChallengeEditor = lazy(() => import('@modules/challenges/ChallengeEditor'));
const Leaderboard = lazy(() => import('@modules/challenges/Leaderboard'));
const PublishResults = lazy(() => import('@modules/challenges/PublishResults'));
const AdminDashboard = lazy(() => import('@modules/organizations/AdminDashboard'));
const Members = lazy(() => import('@modules/organizations/Members'));
const Workspaces = lazy(() => import('@modules/organizations/Workspaces'));
const CreateOrganization = lazy(() => import('@modules/organizations/CreateOrganization'));
const AuditLog = lazy(() => import('@modules/organizations/AuditLog'));
const Analytics = lazy(() => import('@modules/organizations/Analytics'));
const Settings = lazy(() => import('@modules/organizations/Settings'));
const SubmitScreen = lazy(() => import('@modules/submissions/SubmitScreen'));
const VerifyCertificate = lazy(() => import('@modules/participants/VerifyCertificate'));
const FormBuilder = lazy(() => import('@modules/forms/FormBuilder'));
const RegisterScreen = lazy(() => import('@modules/registrations/RegisterScreen'));
const ParticipantDashboard = lazy(() => import('@modules/participants/ParticipantDashboard'));
const MyEntries = lazy(() => import('@modules/participants/MyEntries'));
const Awards = lazy(() => import('@modules/participants/Awards'));
// `shared/ui/NotBuiltYet` is no longer routed anywhere — every route in this
// file now resolves to a real screen. The component is kept for the next
// unfinished screen rather than deleted.
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
  // Keyed on the path so navigating away from a failed screen clears the error
  // rather than pinning it over the next healthy route.
  const { pathname } = useLocation();

  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Landing and onboarding are the two screens outside the shell: the
            shell's nav assumes you have already chosen a surface. */}
        <Route path="/" element={<Landing />} />
        <Route path="/welcome" element={<Welcome />} />

        <Route element={<AppShell />}>
          {/* For you */}
          <Route path="/home" element={<ParticipantDashboard />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/c/:slug" element={<ChallengePublic />} />
          <Route path="/c/:slug/register" element={<RegisterScreen />} />
          <Route path="/c/:slug/submit" element={<SubmitScreen />} />
          <Route path="/c/:slug/leaderboard" element={<Leaderboard />} />
          <Route path="/me/registrations" element={<MyEntries />} />
          <Route path="/me/achievements" element={<Awards />} />
          <Route path="/verify/:certId" element={<VerifyCertificate />} />

          {/* Organizing */}
          <Route path="/org" element={<AdminDashboard />} />
          <Route path="/org/challenges" element={<ChallengesList />} />
          {/* `new` is matched before `:cid` so it is not read as an id. */}
          <Route path="/org/challenges/new" element={<ChallengeEditor />} />
          <Route path="/org/challenges/:cid" element={<ChallengeControlRoom />} />
          <Route path="/org/challenges/:cid/edit" element={<ChallengeEditor />} />
          <Route path="/org/challenges/:cid/publish" element={<PublishResults />} />
          <Route path="/org/challenges/:cid/form" element={<FormBuilder />} />
          {/* `new` before any future /org/:orgId route. */}
          <Route path="/org/new" element={<CreateOrganization />} />
          <Route path="/org/workspaces" element={<Workspaces />} />
          <Route path="/org/members" element={<Members />} />
          <Route path="/org/audit" element={<AuditLog />} />
          <Route path="/org/analytics" element={<Analytics />} />
          <Route path="/org/settings" element={<Settings />} />

          {/* Judging */}
          <Route path="/judge" element={<JudgeQueue />} />
          <Route path="/judge/score/:sid" element={<ScoringScreen />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
