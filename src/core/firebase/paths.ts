import {
  collection, doc, type CollectionReference, type DocumentReference,
  type FirestoreDataConverter, type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { db } from './app';
import type {
  OrgDoc, ChallengeDoc, RegistrationDoc, SubmissionDoc, ReviewDoc,
  LeaderboardPageDoc, FormSchemaDoc, MemberDoc, AuditLogDoc, WorkspaceDoc,
  UserDoc, CertificateDoc, BadgeDoc, RubricDoc,
} from './types';

/**
 * Typed Firestore references.
 *
 * **Every tenant-scoped helper takes `orgId` as its first argument.** That is
 * CLAUDE.md hard rule 2 made structural: there is no way to address a
 * collection of tenant data without naming the tenant, so a forgotten filter
 * cannot leak across orgs — the path itself cannot express it.
 *
 * See DATA_MODEL.md §1 for the collection map and §3 for the five global
 * collections that are deliberate exceptions.
 */

/** Passes documents through unchanged but stamps the doc id onto the object. */
function converter<T>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (value) => value as DocumentData,
    fromFirestore: (snap: QueryDocumentSnapshot) => ({ ...snap.data(), id: snap.id }) as T,
  };
}

const typedCollection = <T>(path: string): CollectionReference<T> =>
  collection(db(), path).withConverter(converter<T>());

const typedDoc = <T>(path: string, id: string): DocumentReference<T> =>
  doc(db(), path, id).withConverter(converter<T>());

/* ---------------------------------------------------------------- *
 * Global collections — DATA_MODEL.md §3. Adding to this list
 * requires an ADR.
 * ---------------------------------------------------------------- */

export const usersCol = () => typedCollection<UserDoc>('users');
export const userDoc = (userId: string) => typedDoc<UserDoc>('users', userId);
export const certificatesCol = () => typedCollection<CertificateDoc>('certificates');
export const certificateDoc = (id: string) => typedDoc<CertificateDoc>('certificates', id);
export const publicChallengesCol = () => typedCollection<ChallengeDoc>('publicChallenges');

/* ---------------------------------------------------------------- *
 * Tenant-scoped collections. orgId first, always.
 * ---------------------------------------------------------------- */

export const orgsCol = () => typedCollection<OrgDoc>('organizations');
export const orgDoc = (orgId: string) => typedDoc<OrgDoc>('organizations', orgId);

const orgPath = (orgId: string) => `organizations/${orgId}`;

export const workspacesCol = (orgId: string) =>
  typedCollection<WorkspaceDoc>(`${orgPath(orgId)}/workspaces`);

export const membersCol = (orgId: string) =>
  typedCollection<MemberDoc>(`${orgPath(orgId)}/members`);
export const memberDoc = (orgId: string, userId: string) =>
  typedDoc<MemberDoc>(`${orgPath(orgId)}/members`, userId);

export const formSchemasCol = (orgId: string) =>
  typedCollection<FormSchemaDoc>(`${orgPath(orgId)}/formSchemas`);
export const formSchemaDoc = (orgId: string, schemaId: string) =>
  typedDoc<FormSchemaDoc>(`${orgPath(orgId)}/formSchemas`, schemaId);

export const badgesCol = (orgId: string) =>
  typedCollection<BadgeDoc>(`${orgPath(orgId)}/badges`);

export const auditLogsCol = (orgId: string) =>
  typedCollection<AuditLogDoc>(`${orgPath(orgId)}/auditLogs`);

export const challengesCol = (orgId: string) =>
  typedCollection<ChallengeDoc>(`${orgPath(orgId)}/challenges`);
export const challengeDoc = (orgId: string, cid: string) =>
  typedDoc<ChallengeDoc>(`${orgPath(orgId)}/challenges`, cid);

const challengePath = (orgId: string, cid: string) => `${orgPath(orgId)}/challenges/${cid}`;

export const registrationsCol = (orgId: string, cid: string) =>
  typedCollection<RegistrationDoc>(`${challengePath(orgId, cid)}/registrations`);
export const registrationDoc = (orgId: string, cid: string, rid: string) =>
  typedDoc<RegistrationDoc>(`${challengePath(orgId, cid)}/registrations`, rid);

export const submissionsCol = (orgId: string, cid: string) =>
  typedCollection<SubmissionDoc>(`${challengePath(orgId, cid)}/submissions`);
export const submissionDoc = (orgId: string, cid: string, sid: string) =>
  typedDoc<SubmissionDoc>(`${challengePath(orgId, cid)}/submissions`, sid);

export const reviewsCol = (orgId: string, cid: string) =>
  typedCollection<ReviewDoc>(`${challengePath(orgId, cid)}/reviews`);
/** `reviewId` = `${submissionId}_${judgeId}` — one review per judge, no query needed. */
export const reviewDoc = (orgId: string, cid: string, submissionId: string, judgeId: string) =>
  typedDoc<ReviewDoc>(`${challengePath(orgId, cid)}/reviews`, `${submissionId}_${judgeId}`);

export const rubricCol = (orgId: string, cid: string) =>
  typedCollection<RubricDoc>(`${challengePath(orgId, cid)}/rubric`);

export const leaderboardCol = (orgId: string, cid: string) =>
  typedCollection<LeaderboardPageDoc>(`${challengePath(orgId, cid)}/leaderboard`);
export const leaderboardPageDoc = (orgId: string, cid: string, page: number) =>
  typedDoc<LeaderboardPageDoc>(`${challengePath(orgId, cid)}/leaderboard`, `page_${page}`);
