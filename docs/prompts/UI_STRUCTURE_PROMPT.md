# Prompt — ChallengeOS Screen Structure (Mobile + Desktop)

Paste the block below into a fresh session. It produces `docs/UI_SCREENS.md`.

---

You are designing the complete screen structure for **ChallengeOS**, a
multi-tenant SaaS platform where organizations create, run, judge and reward
challenges (competitions, hackathons, campaigns, employee engagement, creator
contests, assignment submissions).

Read `CLAUDE.md` and `docs/BRAIN.md` §6–7 for the domain model and vocabulary.
Read `docs/SPEC_RBAC.md` §2–3 only for role names. Do not read other docs.

Output a single file: `docs/UI_SCREENS.md`.

## THE MOST IMPORTANT RULE — STRUCTURE ONLY

Produce **layout structure only**. This is a wireframe skeleton, not an
implementation. Every token spent on anything below is wasted:

**DO NOT produce:**
- Any code — no JSX, no TSX, no HTML, no CSS, no `sx` props, no imports
- Colors, hex values, spacing values, font sizes, breakpoint pixel values
- UI copy, microcopy, labels beyond a 1–3 word placeholder, error messages
- Prose descriptions, rationale, "this screen allows users to…", intros
- Accessibility notes, animation notes, SEO notes, user personas
- Repeated navigation chrome on every screen (define shells once, then reference)
- A summary, conclusion, or next-steps section

**DO produce:** MUI component names arranged in hierarchy, per screen, for two
viewports. That is the entire deliverable.

## Style

Material UI (MUI v6) vocabulary. Name real components: `AppBar`, `Drawer`,
`BottomNavigation`, `Card`, `DataGrid`, `List`, `ListItem`, `Tabs`, `Stepper`,
`Accordion`, `Dialog`, `Drawer(bottom)`, `Chip`, `Avatar`, `Fab`, `Skeleton`,
`Alert`, `Snackbar`, `SpeedDial`, `Autocomplete`, `TextField`, `Select`,
`ToggleButtonGroup`, `LinearProgress`, `Badge`, `Menu`, `Breadcrumbs`,
`TablePagination`, `Divider`, `Tooltip`, `Rating`, `Timeline`.

Mobile-first Material patterns: bottom nav for primary destinations, FAB for the
single primary action, bottom sheets instead of dialogs, full-screen dialogs for
forms, swipeable tabs, sticky action bars.

## Output format — copy this exactly

Section 1: **Shells** (define once, reference by letter afterwards)

```
SHELL A — Admin/Org
  Desktop: AppBar(OrgSwitcher, Search, Badge>IconButton:notifications, Avatar>Menu)
           + Drawer(permanent, 260px)[nav groups] + main + optional right Drawer
  Mobile:  AppBar(IconButton:menu, title, IconButton:notifications)
           + Drawer(temporary) + main + Fab

SHELL B — Participant
SHELL C — Judge
SHELL D — Public/Unauth
SHELL E — Fullscreen (builder, wizard, scoring — no shell nav)
```

Section 2: **Screens**, one block each, in this exact template:

```
### S-01 · Challenge List · [admin]
Route:   /org/:orgId/challenges
Shell:   A
Desktop: PageHeader(Breadcrumbs, Typography:h5, Button:primary) > Tabs(status) >
         Toolbar(TextField:search, Select:workspace, Select:category, ToggleButtonGroup:grid|table) >
         DataGrid[title | workspace | Chip:status | dates | count:registrations |
         count:submissions | IconButton:menu] > TablePagination
Mobile:  Tabs(scrollable) > TextField:search > List of Card[Typography:title,
         Chip:status, Typography:caption:dates, LinearProgress, IconButton:menu] >
         infinite scroll > Fab:add
States:  loading=Skeleton x6 | empty=EmptyState(icon, 3-word title, Button) |
         error=Alert+Button:retry | offline=Alert:banner
Perms:   challenge.create hides Fab/Button
```

Nothing else per screen. No paragraphs. If a screen is trivial, three lines is
correct.

Section 3: **Shared components** — a flat list of reusable blocks referenced
above (ChallengeCard, StatTile, EmptyState, FileUploadField, StageStepper,
RubricScorer, LeaderboardRow, PermissionGate, SyncStatusBanner, …), each one line
with its composition. No code.

## Screens to produce — all of them

**Public / unauthenticated (Shell D)**
1. Landing
2. Sign in
3. Challenge discovery (browse + filter)
4. Public challenge detail
5. Public organization page
6. Public user profile / portfolio
7. Certificate verification
8. 404 / error

**Onboarding**
9. Create organization (Stepper)
10. Accept invite / join organization
11. Connect storage (Google Drive OAuth)
12. Organization switcher

**Admin — org level (Shell A)**
13. Admin dashboard
14. Workspaces list
15. Workspace detail
16. Members list
17. Member detail + role assignment
18. Roles & permissions editor
19. Org settings — branding
20. Org settings — storage
21. Org settings — notifications
22. Org settings — billing/plan
23. Audit log
24. Analytics dashboard
25. Challenge templates library

**Admin — challenge level (Shell A)**
26. Challenges list
27. Challenge create wizard (Stepper: basics → workflow → form → judging → review)
28. Challenge overview / control room
29. Challenge settings (edit)
30. **Form builder** (Shell E — palette / canvas / config panel)
31. Form preview
32. **Workflow designer** (Shell E — stage list + stage config)
33. Registrations table
34. Registration detail
35. Submissions table
36. Submission detail (admin)
37. Judging setup — rubric editor
38. Judging setup — judge assignment
39. Leaderboard management
40. Publish results (confirmation flow)
41. Certificate template editor
42. Certificate bulk issuance
43. Rewards & badges
44. Notification composer / broadcast
45. Announcements

**Judge (Shell C)**
46. Judge queue
47. Scoring screen (Shell E — submission viewer + rubric)
48. My completed reviews

**Volunteer**
49. QR check-in scanner
50. Check-in list

**Participant (Shell B)**
51. Participant dashboard
52. Challenge discovery (authenticated)
53. Challenge detail (participant view, with stage progress)
54. Registration form (dynamic, rendered from schema)
55. My registrations
56. Submission form (dynamic, drafts, file upload progress)
57. My submissions
58. Submission detail (participant)
59. Leaderboard (participant view)
60. Results / winners
61. My profile (edit)
62. My achievements — badges, points, certificates
63. Notifications
64. Account settings

**Global / cross-cutting**
65. Offline sync queue panel
66. Global search / command palette
67. Permission denied
68. PWA install prompt
69. Empty / loading / error state patterns (define once, referenced everywhere)

## Cross-cutting requirements

- Every screen gets **both** Desktop and Mobile. If identical, write
  `Mobile: same, single column`.
- Mark the single primary action per screen.
- Dynamic form screens (54, 56) must show the field-renderer slot, not specific
  fields — the form is generated from JSON at runtime.
- Screens gated by a permission get a one-line `Perms:` note.
- Every list screen names its empty state.

Go straight to the file. No preamble, no commentary, no closing summary.
