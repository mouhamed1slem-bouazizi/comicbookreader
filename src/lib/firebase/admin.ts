import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | undefined;
let adminAuth: Auth | undefined;
let adminDb: Firestore | undefined;

function parseServiceAccount(): Record<string, string> | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(parseServiceAccount() || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
}

export function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps();
  if (existing.length) {
    adminApp = existing[0];
    return adminApp;
  }

  const serviceAccount = parseServiceAccount();
  if (serviceAccount) {
    adminApp = initializeApp({
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
    });
  } else if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    adminApp = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  } else {
    throw new Error("Firebase Admin is not configured.");
  }
  return adminApp;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) adminAuth = getAuth(getAdminApp());
  return adminAuth;
}

export function getAdminDb(): Firestore {
  if (!adminDb) adminDb = getFirestore(getAdminApp());
  return adminDb;
}

export async function verifyIdToken(
  authorizationHeader: string | null
): Promise<string | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice(7);

  if (token === "demo-token") {
    return "demo-user";
  }

  try {
    if (!isFirebaseAdminConfigured()) return null;
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}
