import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache,
  persistentMultipleTabManager, type Firestore,
} from 'firebase/firestore';
import { env } from '@config/env';

/**
 * The single Firebase entry point. Nothing outside `core/firebase/` may import
 * the Firebase SDK directly — see AGENT.md hard rule 4's sibling principle for
 * storage, applied here to the data layer.
 */

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;

function getApp(): FirebaseApp {
  if (!app) {
    app = initializeApp({
      apiKey: env().VITE_FIREBASE_API_KEY,
      authDomain: env().VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env().VITE_FIREBASE_PROJECT_ID,
      storageBucket: env().VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env().VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env().VITE_FIREBASE_APP_ID,
    });
  }
  return app;
}

export function auth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getApp());
    if (env().VITE_USE_EMULATOR) {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
  }
  return authInstance;
}

export function db(): Firestore {
  if (!dbInstance) {
    // IndexedDB cache, shared across tabs. A repeat visitor or a second tab
    // costs zero document reads, which is the difference between surviving a
    // 700-person demo on the free tier and not. See core/firebase/snapshot.ts.
    dbInstance = initializeFirestore(getApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (env().VITE_USE_EMULATOR) {
      connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
    }
  }
  return dbInstance;
}

/**
 * The org the public demo reads from. See ADR-016.
 * A function, not a constant: env is parsed lazily so a missing variable
 * surfaces as a rendered error rather than a module-scope throw.
 */
export const demoOrgId = () => env().VITE_DEMO_ORG_ID;
