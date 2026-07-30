/**
 * In-memory demo data. Stands in for Firestore until the backend lands.
 * Shapes follow docs/DATA_MODEL.md so swapping in the real client is a
 * matter of replacing this module, not rewriting screens.
 */
import type { FormSchema } from '@core/forms/types';
import type {
  Org, Workspace, ChallengeStatus, Stage, Challenge, Registration, Submission,
  LeaderboardEntry, Criterion, Member, CurrentUser,
} from '@shared/types/domain';

// The domain types now live in @shared/types/domain so this fixture and the
// Firestore mappers provably produce the same shapes. Re-exported for the
// screens that still import them from here.
export type {
  Org, Workspace, ChallengeStatus, Stage, Challenge, Registration, Submission,
  LeaderboardEntry, Criterion, Member, CurrentUser, FormSchema,
};
/* ------------------------------------------------------------------ */

export const currentUser = {
  id: 'u_self',
  name: 'Harshil Patel',
  email: '1080patelharshil@gmail.com',
  avatarColor: '#4f46e5',
  points: 2840,
  badges: 7,
  certificates: 4,
  streakDays: 12,
  challengesEntered: 14,
  challengesWon: 3,
};

export const orgs: Org[] = [
  { id: 'org_iiitv', name: 'IIIT Vadodara', slug: 'iiitv', type: 'education', logoColor: '#4f46e5', initials: 'IV', memberCount: 148, challengeCount: 12, plan: 'pro' },
  { id: 'org_adobe', name: 'Adobe Design Guild', slug: 'adobe-guild', type: 'company', logoColor: '#ec4899', initials: 'AG', memberCount: 62, challengeCount: 5, plan: 'enterprise' },
  { id: 'org_lens', name: 'Lens & Light Collective', slug: 'lens-light', type: 'community', logoColor: '#0ea5e9', initials: 'LL', memberCount: 930, challengeCount: 24, plan: 'free' },
];

export const workspaces: Workspace[] = [
  { id: 'ws_coding', orgId: 'org_iiitv', name: 'Coding Club', icon: 'Code', challengeCount: 4 },
  { id: 'ws_photo', orgId: 'org_iiitv', name: 'Photography Club', icon: 'PhotoCamera', challengeCount: 3 },
  { id: 'ws_hr', orgId: 'org_iiitv', name: 'Student Welfare', icon: 'Favorite', challengeCount: 3 },
  { id: 'ws_culture', orgId: 'org_iiitv', name: 'Cultural Committee', icon: 'Celebration', challengeCount: 2 },
];

const linearStages = (active: number): Stage[] =>
  ['Registration', 'Submission', 'Judging', 'Results'].map((name, i) => ({
    key: name.toLowerCase(),
    name,
    type: name.toLowerCase(),
    state: i < active ? 'done' : i === active ? 'active' : 'locked',
  }));

const multiRoundStages = (active: number): Stage[] =>
  ['Registration', 'Screening', 'Round 1', 'Round 2', 'Interview', 'Winner'].map((name, i) => ({
    key: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    type: i === 0 ? 'registration' : i === 5 ? 'announcement' : 'judging',
    state: i < active ? 'done' : i === active ? 'active' : 'locked',
  }));

export const challenges: Challenge[] = [
  {
    id: 'ch_monsoon',
    orgId: 'org_iiitv',
    workspaceId: 'ws_photo',
    title: 'Monsoon Photography Contest',
    slug: 'monsoon-photography',
    description:
      'Capture the character of the monsoon on campus — rain, light, reflection, mood. Single frame, no composites. Judged on composition, technical quality and storytelling.',
    category: 'Photography',
    tags: ['photography', 'campus', 'open'],
    status: 'judging',
    visibility: 'public',
    cover: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
    formSchemaId: 'fs_photo',
    stages: linearStages(2),
    timeline: { registrationClosesAt: '2026-07-10', submissionClosesAt: '2026-07-24', resultsAt: '2026-08-05' },
    counters: { registrations: 184, submissions: 142, reviewsCompleted: 318, reviewsPending: 108 },
    leaderboardMode: 'afterClose',
    prize: '₹25,000 pool + exhibition slot',
  },
  {
    id: 'ch_hack',
    orgId: 'org_iiitv',
    workspaceId: 'ws_coding',
    title: 'BuildFest 36-Hour Hackathon',
    slug: 'buildfest-hackathon',
    description:
      'Thirty-six hours, four tracks, one working prototype. Teams of 2–4. Screening round filters to the top 40 teams before the on-site build.',
    category: 'Hackathon',
    tags: ['coding', 'teams', 'on-site'],
    status: 'running',
    visibility: 'public',
    cover: 'linear-gradient(135deg,#8b5cf6,#ec4899)',
    formSchemaId: 'fs_hack',
    stages: multiRoundStages(2),
    timeline: { registrationClosesAt: '2026-08-02', submissionClosesAt: '2026-08-18', resultsAt: '2026-08-20' },
    counters: { registrations: 312, submissions: 96, reviewsCompleted: 84, reviewsPending: 204 },
    leaderboardMode: 'live',
    prize: '₹1,50,000 + incubation interview',
  },
  {
    id: 'ch_steps',
    orgId: 'org_iiitv',
    workspaceId: 'ws_hr',
    title: 'Campus Step Challenge — August',
    slug: 'step-challenge-august',
    description:
      'A repeating weekly challenge. Log your step count every Sunday; the leaderboard aggregates across all four weeks. Departments ranked separately.',
    category: 'Wellness',
    tags: ['fitness', 'weekly', 'recurring'],
    status: 'running',
    visibility: 'organization',
    cover: 'linear-gradient(135deg,#10b981,#0ea5e9)',
    formSchemaId: 'fs_steps',
    stages: linearStages(1),
    timeline: { registrationClosesAt: '2026-08-01', submissionClosesAt: '2026-08-31', resultsAt: '2026-09-02' },
    counters: { registrations: 96, submissions: 71, reviewsCompleted: 0, reviewsPending: 0 },
    leaderboardMode: 'live',
    prize: 'Fitness vouchers + department trophy',
  },
  {
    id: 'ch_meme',
    orgId: 'org_iiitv',
    workspaceId: 'ws_culture',
    title: 'Placement Season Meme Contest',
    slug: 'meme-contest',
    description: 'Community-voted. One entry per person. Keep it kind — moderation is on.',
    category: 'Community',
    tags: ['fun', 'voting'],
    status: 'completed',
    visibility: 'public',
    cover: 'linear-gradient(135deg,#f59e0b,#ef4444)',
    formSchemaId: 'fs_meme',
    stages: linearStages(4),
    timeline: { registrationClosesAt: '2026-06-05', submissionClosesAt: '2026-06-15', resultsAt: '2026-06-20' },
    counters: { registrations: 240, submissions: 228, reviewsCompleted: 228, reviewsPending: 0 },
    leaderboardMode: 'public',
    prize: 'Campus cafe credit for a semester',
  },
  {
    id: 'ch_design',
    orgId: 'org_iiitv',
    workspaceId: 'ws_culture',
    title: 'Fest Identity Design Challenge',
    slug: 'fest-identity-design',
    description: 'Design the visual identity for this year’s cultural fest. Deliver a logo, colour system and one poster mock.',
    category: 'Design',
    tags: ['design', 'branding'],
    status: 'published',
    visibility: 'public',
    cover: 'linear-gradient(135deg,#ec4899,#8b5cf6)',
    formSchemaId: 'fs_design',
    stages: linearStages(0),
    timeline: { registrationClosesAt: '2026-08-20', submissionClosesAt: '2026-09-05', resultsAt: '2026-09-15' },
    counters: { registrations: 41, submissions: 0, reviewsCompleted: 0, reviewsPending: 0 },
    leaderboardMode: 'hidden',
    prize: '₹20,000 + credited on all fest material',
  },
  {
    id: 'ch_pitch',
    orgId: 'org_iiitv',
    workspaceId: 'ws_coding',
    title: 'Startup Pitch Day (Draft)',
    slug: 'startup-pitch-day',
    description: 'Five-minute pitch, three-minute Q&A. Screening on written deck first.',
    category: 'Entrepreneurship',
    tags: ['pitch', 'startup'],
    status: 'draft',
    visibility: 'invite',
    cover: 'linear-gradient(135deg,#64748b,#334155)',
    formSchemaId: 'fs_design',
    stages: multiRoundStages(0),
    timeline: { registrationClosesAt: '2026-09-10', submissionClosesAt: '2026-09-25', resultsAt: '2026-10-01' },
    counters: { registrations: 0, submissions: 0, reviewsCompleted: 0, reviewsPending: 0 },
    leaderboardMode: 'hidden',
    prize: 'Seed grant ₹2,00,000',
  },
];

/* ---------------------------- form schemas -------------------------- */

export const formSchemas: Record<string, FormSchema> = {
  fs_photo: {
    id: 'fs_photo',
    orgId: 'org_iiitv',
    version: 3,
    status: 'published',
    title: 'Monsoon Photography — Entry Form',
    description: 'One entry per participant. Original work only.',
    settings: { allowDrafts: true, showProgressBar: true, confirmationMessage: 'Entry received. Good luck!' },
    sections: [
      {
        id: 'sec_1',
        title: 'About you',
        description: null,
        order: 0,
        visibleWhen: null,
        fields: [
          { id: 'f1', key: 'full_name', type: 'shortText', label: 'Full name', help: null, placeholder: 'As it should appear on the certificate', required: true, order: 0, defaultValue: '', options: null, validation: { minLength: 2, maxLength: 80 }, config: {}, visibleWhen: null, width: 'half', piiLevel: 'high' },
          { id: 'f2', key: 'email', type: 'email', label: 'Email', help: 'Results are sent here', placeholder: 'you@example.com', required: true, order: 1, defaultValue: '', options: null, validation: {}, config: {}, visibleWhen: null, width: 'half', piiLevel: 'high' },
          { id: 'f3', key: 'department', type: 'dropdown', label: 'Department', help: 'Used to group the leaderboard', placeholder: null, required: true, order: 2, defaultValue: '', options: [
            { id: 'o1', label: 'Computer Science', value: 'cse' },
            { id: 'o2', label: 'Electronics', value: 'ece' },
            { id: 'o3', label: 'Mechanical', value: 'me' },
            { id: 'o4', label: 'Not a student', value: 'external' },
          ], validation: {}, config: {}, visibleWhen: null, width: 'half', piiLevel: 'low' },
          { id: 'f4', key: 'external_org', type: 'shortText', label: 'Which organization?', help: 'Shown only because you selected "Not a student" — this is the condition engine.', placeholder: 'Organization name', required: true, order: 3, defaultValue: '', options: null, validation: {}, config: {}, visibleWhen: { field: 'department', op: 'eq', value: 'external' }, width: 'half', piiLevel: 'low' },
        ],
      },
      {
        id: 'sec_2',
        title: 'Your entry',
        description: 'JPEG or PNG, max 15 MB, minimum 2000px on the long edge.',
        order: 1,
        visibleWhen: null,
        fields: [
          { id: 'f5', key: 'title', type: 'shortText', label: 'Photograph title', help: null, placeholder: 'Give it a name', required: true, order: 0, defaultValue: '', options: null, validation: { maxLength: 60 }, config: {}, visibleWhen: null, width: 'full', piiLevel: 'none' },
          { id: 'f6', key: 'photo', type: 'file', label: 'Upload your photograph', help: 'Uploads go straight to the organization’s Google Drive.', placeholder: null, required: true, order: 1, defaultValue: null, options: null, validation: { maxFileSizeMB: 15, acceptedMimeTypes: ['image/jpeg', 'image/png'] }, config: {}, visibleWhen: null, width: 'full', piiLevel: 'none' },
          { id: 'f7', key: 'statement', type: 'longText', label: 'Artist statement', help: 'What were you going for? Max 400 characters.', placeholder: 'Two or three sentences is plenty', required: true, order: 2, defaultValue: '', options: null, validation: { maxLength: 400 }, config: { rows: 4 }, visibleWhen: null, width: 'full', piiLevel: 'none' },
          { id: 'f8', key: 'shot_on', type: 'radio', label: 'Shot on', help: null, placeholder: null, required: true, order: 3, defaultValue: '', options: [
            { id: 'o5', label: 'Phone', value: 'phone' },
            { id: 'o6', label: 'DSLR / Mirrorless', value: 'camera' },
            { id: 'o7', label: 'Film', value: 'film' },
          ], validation: {}, config: {}, visibleWhen: null, width: 'half', piiLevel: 'none' },
          { id: 'f9', key: 'camera_model', type: 'shortText', label: 'Camera model', help: 'Appears only for DSLR/Mirrorless and Film entries.', placeholder: 'e.g. Fujifilm X-T30', required: false, order: 4, defaultValue: '', options: null, validation: {}, config: {}, visibleWhen: { any: [{ field: 'shot_on', op: 'eq', value: 'camera' }, { field: 'shot_on', op: 'eq', value: 'film' }] }, width: 'half', piiLevel: 'none' },
        ],
      },
      {
        id: 'sec_3',
        title: 'Declaration',
        description: null,
        order: 2,
        visibleWhen: null,
        fields: [
          { id: 'f10', key: 'original_work', type: 'checkbox', label: 'This is my own original work and has not been published elsewhere', help: null, placeholder: null, required: true, order: 0, defaultValue: false, options: null, validation: {}, config: { mustBeTrue: true }, visibleWhen: null, width: 'full', piiLevel: 'none' },
        ],
      },
    ],
  },

  fs_hack: {
    id: 'fs_hack',
    orgId: 'org_iiitv',
    version: 2,
    status: 'published',
    title: 'BuildFest — Team Registration',
    description: null,
    settings: { allowDrafts: true, showProgressBar: true, confirmationMessage: 'Team registered.' },
    sections: [
      {
        id: 'h_sec1',
        title: 'Team',
        description: null,
        order: 0,
        visibleWhen: null,
        fields: [
          { id: 'h1', key: 'team_name', type: 'shortText', label: 'Team name', help: null, placeholder: null, required: true, order: 0, defaultValue: '', options: null, validation: { maxLength: 40 }, config: {}, visibleWhen: null, width: 'half', piiLevel: 'none' },
          { id: 'h2', key: 'team_size', type: 'number', label: 'Team size', help: '2 to 4 members', placeholder: null, required: true, order: 1, defaultValue: 2, options: null, validation: { min: 2, max: 4 }, config: {}, visibleWhen: null, width: 'half', piiLevel: 'none' },
          { id: 'h3', key: 'track', type: 'dropdown', label: 'Track', help: null, placeholder: null, required: true, order: 2, defaultValue: '', options: [
            { id: 't1', label: 'AI / ML', value: 'ai' },
            { id: 't2', label: 'Developer tooling', value: 'devtools' },
            { id: 't3', label: 'Social impact', value: 'social' },
            { id: 't4', label: 'Open innovation', value: 'open' },
          ], validation: {}, config: {}, visibleWhen: null, width: 'half', piiLevel: 'none' },
          { id: 'h4', key: 'needs_hardware', type: 'checkbox', label: 'We need hardware from the lab', help: null, placeholder: null, required: false, order: 3, defaultValue: false, options: null, validation: {}, config: {}, visibleWhen: null, width: 'half', piiLevel: 'none' },
          { id: 'h5', key: 'hardware_list', type: 'longText', label: 'What hardware?', help: 'Conditional on the checkbox above.', placeholder: 'List the components', required: true, order: 4, defaultValue: '', options: null, validation: {}, config: { rows: 3 }, visibleWhen: { field: 'needs_hardware', op: 'eq', value: true }, width: 'full', piiLevel: 'none' },
        ],
      },
      {
        id: 'h_sec2',
        title: 'Screening submission',
        description: 'Judged before the on-site round.',
        order: 1,
        visibleWhen: null,
        fields: [
          { id: 'h6', key: 'idea', type: 'longText', label: 'The idea, in 150 words', help: null, placeholder: null, required: true, order: 0, defaultValue: '', options: null, validation: { maxLength: 1200 }, config: { rows: 6 }, visibleWhen: null, width: 'full', piiLevel: 'none' },
          { id: 'h7', key: 'repo', type: 'githubRepo', label: 'GitHub repository', help: 'Must be public at judging time.', placeholder: 'https://github.com/team/project', required: true, order: 1, defaultValue: '', options: null, validation: {}, config: { requirePublic: true }, visibleWhen: null, width: 'full', piiLevel: 'none' },
          { id: 'h8', key: 'demo_url', type: 'url', label: 'Live demo URL', help: 'Optional', placeholder: 'https://', required: false, order: 2, defaultValue: '', options: null, validation: {}, config: {}, visibleWhen: null, width: 'full', piiLevel: 'none' },
          { id: 'h9', key: 'tech', type: 'multiSelect', label: 'Primary technologies', help: 'Pick up to 4', placeholder: null, required: true, order: 3, defaultValue: [], options: [
            { id: 'x1', label: 'React', value: 'react' },
            { id: 'x2', label: 'Python', value: 'python' },
            { id: 'x3', label: 'Rust', value: 'rust' },
            { id: 'x4', label: 'Go', value: 'go' },
            { id: 'x5', label: 'Flutter', value: 'flutter' },
            { id: 'x6', label: 'Firebase', value: 'firebase' },
          ], validation: { maxSelections: 4, minSelections: 1 }, config: {}, visibleWhen: null, width: 'full', piiLevel: 'none' },
        ],
      },
    ],
  },

  fs_steps: {
    id: 'fs_steps',
    orgId: 'org_iiitv',
    version: 1,
    status: 'published',
    title: 'Weekly Step Log',
    description: 'Submit once per week.',
    settings: { allowDrafts: false, showProgressBar: false, confirmationMessage: 'Logged.' },
    sections: [
      {
        id: 's_sec1',
        title: 'This week',
        description: null,
        order: 0,
        visibleWhen: null,
        fields: [
          { id: 's1', key: 'week_ending', type: 'date', label: 'Week ending', help: null, placeholder: null, required: true, order: 0, defaultValue: '', options: null, validation: {}, config: {}, visibleWhen: null, width: 'half', piiLevel: 'none' },
          { id: 's2', key: 'steps', type: 'number', label: 'Total steps', help: null, placeholder: '0', required: true, order: 1, defaultValue: '', options: null, validation: { min: 0, max: 500000 }, config: {}, visibleWhen: null, width: 'half', piiLevel: 'none' },
          { id: 's3', key: 'screenshot', type: 'file', label: 'Screenshot from your tracker', help: 'Any fitness app', placeholder: null, required: true, order: 2, defaultValue: null, options: null, validation: { maxFileSizeMB: 5 }, config: {}, visibleWhen: null, width: 'full', piiLevel: 'none' },
        ],
      },
    ],
  },

  fs_meme: {
    id: 'fs_meme', orgId: 'org_iiitv', version: 1, status: 'published', title: 'Meme Entry', description: null,
    settings: { allowDrafts: false, showProgressBar: false, confirmationMessage: 'Entry in.' },
    sections: [{ id: 'm_sec', title: 'Your meme', description: null, order: 0, visibleWhen: null, fields: [
      { id: 'm1', key: 'caption', type: 'shortText', label: 'Caption', help: null, placeholder: null, required: true, order: 0, defaultValue: '', options: null, validation: { maxLength: 120 }, config: {}, visibleWhen: null, width: 'full', piiLevel: 'none' },
      { id: 'm2', key: 'image', type: 'file', label: 'Image', help: null, placeholder: null, required: true, order: 1, defaultValue: null, options: null, validation: { maxFileSizeMB: 8 }, config: {}, visibleWhen: null, width: 'full', piiLevel: 'none' },
    ] }],
  },

  fs_design: {
    id: 'fs_design', orgId: 'org_iiitv', version: 1, status: 'draft', title: 'Design Challenge Entry', description: null,
    settings: { allowDrafts: true, showProgressBar: true, confirmationMessage: null },
    sections: [{ id: 'd_sec', title: 'Deliverables', description: null, order: 0, visibleWhen: null, fields: [
      { id: 'd1', key: 'concept', type: 'longText', label: 'Concept rationale', help: null, placeholder: null, required: true, order: 0, defaultValue: '', options: null, validation: { maxLength: 800 }, config: { rows: 5 }, visibleWhen: null, width: 'full', piiLevel: 'none' },
      { id: 'd2', key: 'figma', type: 'url', label: 'Figma link', help: 'Set sharing to "anyone with the link".', placeholder: 'https://figma.com/file/...', required: true, order: 1, defaultValue: '', options: null, validation: {}, config: {}, visibleWhen: null, width: 'full', piiLevel: 'none' },
      { id: 'd3', key: 'assets', type: 'files', label: 'Export bundle', help: 'PNG + SVG', placeholder: null, required: true, order: 2, defaultValue: [], options: null, validation: { maxFiles: 6, maxFileSizeMB: 20 }, config: {}, visibleWhen: null, width: 'full', piiLevel: 'none' },
    ] }],
  },
};

/* --------------------------- participants --------------------------- */

const NAMES = [
  'Ananya Sharma', 'Rohit Verma', 'Priya Nair', 'Kabir Singh', 'Meera Iyer', 'Arjun Desai',
  'Sneha Reddy', 'Vikram Joshi', 'Aisha Khan', 'Dev Malhotra', 'Riya Kapoor', 'Nikhil Rao',
  'Tanvi Bhatt', 'Aditya Menon', 'Ishita Ghosh', 'Karan Chawla', 'Neha Pillai', 'Sameer Qureshi',
];
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];

export const registrations: Registration[] = NAMES.map((name, i) => ({
  id: `reg_${i}`,
  challengeId: 'ch_monsoon',
  userId: `u_${i}`,
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@iiitv.ac.in`,
  avatarColor: COLORS[i % COLORS.length]!,
  status: i < 2 ? 'pending' : i > 15 ? 'eliminated' : 'active',
  currentStageKey: i > 15 ? 'submission' : 'judging',
  registeredAt: `2026-07-${String((i % 9) + 1).padStart(2, '0')}`,
  checkedIn: i % 3 !== 0,
  answers: {
    full_name: name,
    email: `${name.split(' ')[0]!.toLowerCase()}@iiitv.ac.in`,
    department: ['cse', 'ece', 'me', 'external'][i % 4]!,
    title: ['First Light', 'Petrichor', 'Wet Tarmac', 'Umbrella Study', 'Overflow', 'Grey Morning'][i % 6]!,
    shot_on: ['phone', 'camera', 'film'][i % 3]!,
    statement: 'Shot near the academic block just after the first heavy shower of the season.',
    original_work: true,
  },
}));

export const submissions: Submission[] = registrations
  .filter((r) => r.status !== 'pending')
  .map((r, i) => {
    const reviewsTotal = 3;
    const reviewsDone: number = i % 7 === 0 ? 1 : i % 5 === 0 ? 2 : 3;
    const provisional = reviewsDone < reviewsTotal;
    return {
      id: `sub_${i}`,
      challengeId: 'ch_monsoon',
      registrationId: r.id,
      participant: r.name,
      anonymizedLabel: `Entry #${String(i + 1).padStart(4, '0')}`,
      stageKey: 'judging',
      status: reviewsDone === reviewsTotal ? 'reviewed' : 'underReview',
      submittedAt: `2026-07-${String(18 + (i % 6)).padStart(2, '0')} 14:${String(10 + i).padStart(2, '0')}`,
      isLate: i === 3 || i === 11,
      clientSubmittedAt: i === 3 ? '2026-07-24 23:58' : undefined,
      serverReceivedAt: i === 3 ? '2026-07-25 00:04' : undefined,
      fileCount: 1,
      reviewsDone,
      reviewsTotal,
      score: reviewsDone === 0 ? null : Math.round((92 - i * 2.4 + (i % 3) * 3) * 10) / 10,
      isProvisional: provisional,
      variance: i % 4 === 0 ? 18.4 : i % 3 === 0 ? 9.1 : 2.7,
      answers: r.answers,
    };
  });

export const leaderboard: LeaderboardEntry[] = [...submissions]
  .filter((s) => s.score !== null)
  .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  .map((s, i) => {
    const reg = registrations.find((r) => r.id === s.registrationId)!;
    return {
      rank: i + 1,
      registrationId: s.registrationId,
      name: reg.name,
      avatarColor: reg.avatarColor,
      score: s.score ?? 0,
      change: [0, 1, -1, 2, 0, -2, 3][i % 7]!,
      isProvisional: s.isProvisional,
      reviewsDone: s.reviewsDone,
      reviewsTotal: s.reviewsTotal,
    };
  });

export const rubric: Criterion[] = [
  { id: 'c1', name: 'Composition', description: 'Framing, balance, use of negative space', weight: 0.35, max: 10 },
  { id: 'c2', name: 'Technical quality', description: 'Exposure, focus, noise handling', weight: 0.25, max: 10 },
  { id: 'c3', name: 'Storytelling', description: 'Does the frame say something about the monsoon?', weight: 0.3, max: 10 },
  { id: 'c4', name: 'Originality', description: 'Fresh perspective on a familiar subject', weight: 0.1, max: 10 },
];

export const members: Member[] = [
  { id: 'm0', name: 'Harshil Patel', email: '1080patelharshil@gmail.com', avatarColor: '#4f46e5', roles: ['Owner'], status: 'active', joinedAt: '2025-11-02' },
  { id: 'm1', name: 'Dr. Anjali Menon', email: 'anjali@iiitv.ac.in', avatarColor: '#0ea5e9', roles: ['Admin'], status: 'active', joinedAt: '2025-11-14' },
  { id: 'm2', name: 'Rahul Bhatia', email: 'rahul@iiitv.ac.in', avatarColor: '#22c55e', roles: ['Organizer'], status: 'active', joinedAt: '2026-01-08' },
  { id: 'm3', name: 'Fatima Sheikh', email: 'fatima@lens.co', avatarColor: '#ec4899', roles: ['Judge'], status: 'active', joinedAt: '2026-06-20' },
  { id: 'm4', name: 'Gaurav Tiwari', email: 'gaurav@studio.in', avatarColor: '#f59e0b', roles: ['Judge'], status: 'active', joinedAt: '2026-06-20' },
  { id: 'm5', name: 'Simran Kaur', email: 'simran@iiitv.ac.in', avatarColor: '#a855f7', roles: ['Volunteer'], status: 'active', joinedAt: '2026-07-01' },
  { id: 'm6', name: 'Yash Agarwal', email: 'yash@iiitv.ac.in', avatarColor: '#06b6d4', roles: ['Reviewer'], status: 'invited', joinedAt: '—' },
];

export const auditLog = [
  { id: 'a1', actor: 'Harshil Patel', action: 'result.publish', target: 'Placement Season Meme Contest', at: '2026-06-20 18:04' },
  { id: 'a2', actor: 'Dr. Anjali Menon', action: 'member.manage', target: 'Fatima Sheikh → Judge', at: '2026-06-20 09:31' },
  { id: 'a3', actor: 'Rahul Bhatia', action: 'challenge.publish', target: 'Monsoon Photography Contest', at: '2026-06-18 11:12' },
  { id: 'a4', actor: 'Harshil Patel', action: 'storage.connect', target: 'Google Drive — iiitv.media@gmail.com', at: '2026-06-15 16:45' },
  { id: 'a5', actor: 'Dr. Anjali Menon', action: 'score.override', target: 'Entry #0007 · Composition 6 → 8', at: '2026-07-26 10:02' },
];

export const badges = [
  { id: 'b1', name: 'First Submission', color: '#22c55e', earned: true },
  { id: 'b2', name: 'Three in a Row', color: '#0ea5e9', earned: true },
  { id: 'b3', name: 'Podium Finish', color: '#f59e0b', earned: true },
  { id: 'b4', name: 'Peer Favourite', color: '#ec4899', earned: true },
  { id: 'b5', name: 'Early Bird', color: '#8b5cf6', earned: true },
  { id: 'b6', name: 'Marathoner', color: '#06b6d4', earned: true },
  { id: 'b7', name: 'Perfect Score', color: '#ef4444', earned: true },
  { id: 'b8', name: 'Ten Challenges', color: '#64748b', earned: false },
  { id: 'b9', name: 'Champion', color: '#64748b', earned: false },
];

export const certificates = [
  { id: 'cert_a1b2c3', challenge: 'Placement Season Meme Contest', org: 'IIIT Vadodara', award: 'Winner', rank: 1, issuedAt: '2026-06-20' },
  { id: 'cert_d4e5f6', challenge: 'Winter Code Sprint', org: 'IIIT Vadodara', award: 'Runner-up', rank: 2, issuedAt: '2026-02-11' },
  { id: 'cert_g7h8i9', challenge: 'Street Photography Walk', org: 'Lens & Light Collective', award: 'Participant', rank: null, issuedAt: '2026-04-02' },
  { id: 'cert_j1k2l3', challenge: 'Design Systems Jam', org: 'Adobe Design Guild', award: 'Top 10', rank: 8, issuedAt: '2025-12-19' },
];

/* ------------------------------ helpers ----------------------------- */

export const getChallenge = (id: string) => challenges.find((c) => c.id === id);
export const getChallengeBySlug = (slug: string) => challenges.find((c) => c.slug === slug);
export const getOrg = (id: string) => orgs.find((o) => o.id === id);
export const getWorkspace = (id: string) => workspaces.find((w) => w.id === id);
export const activeOrg = orgs[0]!;
