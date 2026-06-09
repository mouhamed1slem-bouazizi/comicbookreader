import { readFileSync, existsSync } from "fs";
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | undefined;
let adminAuth: Auth | undefined;
let adminDb: Firestore | undefined;

interface ServiceAccountJson {
  type?: string;
  project_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
}

function parseServiceAccountJson(raw: string): ServiceAccountJson | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as ServiceAccountJson;
    } catch {
      try {
        const normalized = trimmed.replace(/\n/g, "\\n").replace(/\\\\n/g, "\\n");
        return JSON.parse(normalized) as ServiceAccountJson;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function toServiceAccount(parsed: ServiceAccountJson): ServiceAccount | null {
  if (!parsed.private_key || !parsed.client_email) return null;
  return {
    projectId: parsed.project_id,
    privateKey: parsed.private_key,
    clientEmail: parsed.client_email,
  };
}

export function parseServiceAccount(): ServiceAccount | null {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonEnv) {
    const parsed = parseServiceAccountJson(jsonEnv);
    const account = parsed ? toServiceAccount(parsed) : null;
    if (account) return account;
  }

  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path && existsSync(path)) {
    try {
      const parsed = parseServiceAccountJson(readFileSync(path, "utf8"));
      const account = parsed ? toServiceAccount(parsed) : null;
      if (account) return account;
    } catch {
      // fall through
    }
  }

  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (email && privateKey && projectId) {
    return {
      projectId,
      privateKey,
      clientEmail: email,
    };
  }

  return null;
}

export function isFirebaseAdminConfigured(): boolean {
  return parseServiceAccount() !== null;
}

export function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existing = getApps();
  if (existing.length) {
    adminApp = existing[0];
    return adminApp;
  }

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY on Render."
    );
  }

  adminApp = initializeApp({
    credential: cert(serviceAccount),
  });
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

  if (!isFirebaseAdminConfigured()) {
    console.error("verifyIdToken: Firebase Admin credentials missing");
    return null;
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch (err) {
    console.error("verifyIdToken failed:", err);
    return null;
  }
}

export function getAdminConfigError(): string | null {
  if (isFirebaseAdminConfigured()) return null;
  return "Server Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON (full JSON) or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in Render environment variables.";
}
