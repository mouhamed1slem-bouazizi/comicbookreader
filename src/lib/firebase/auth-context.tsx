"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from "./client";
import {
  DEFAULT_USER_SETTINGS,
  type UserSettings,
} from "@/types/user";

interface AuthContextValue {
  user: User | null;
  settings: UserSettings;
  loading: boolean;
  firebaseEnabled: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_USER_KEY = "comicreader_demo_user";

function getDemoUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(DEMO_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { uid: string; email: string; displayName?: string };
    return {
      uid: parsed.uid,
      email: parsed.email,
      displayName: parsed.displayName ?? "Demo User",
    } as User;
  } catch {
    return null;
  }
}

function setDemoUser(email: string, uid?: string) {
  const user = {
    uid: uid ?? `demo-${email.replace(/[^a-z0-9]/gi, "")}`,
    email,
    displayName: email.split("@")[0],
  };
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
  return user as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const firebaseEnabled = isFirebaseConfigured();

  const loadSettings = useCallback(async (uid: string) => {
    if (!firebaseEnabled) {
      const raw = localStorage.getItem(`settings_${uid}`);
      if (raw) {
        setSettings({ ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) });
      }
      return;
    }
    const snap = await getDoc(doc(getFirebaseDb(), "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      setSettings({ ...DEFAULT_USER_SETTINGS, ...(data.settings as UserSettings) });
    }
  }, [firebaseEnabled]);

  useEffect(() => {
    if (!firebaseEnabled) {
      setUser(getDemoUser());
      const demo = getDemoUser();
      if (demo) void loadSettings(demo.uid);
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(getFirebaseAuth(), async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        await loadSettings(nextUser.uid);
        const ref = doc(getFirebaseDb(), "users", nextUser.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            email: nextUser.email,
            displayName: nextUser.displayName ?? "",
            createdAt: new Date().toISOString(),
            settings: DEFAULT_USER_SETTINGS,
          });
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [firebaseEnabled, loadSettings]);

  const signUp = async (email: string, password: string) => {
    if (!firebaseEnabled) {
      setDemoUser(email);
      setUser(getDemoUser());
      return;
    }
    await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  };

  const signIn = async (email: string, password: string) => {
    if (!firebaseEnabled) {
      setDemoUser(email);
      setUser(getDemoUser());
      await loadSettings(getDemoUser()!.uid);
      return;
    }
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  };

  const signInWithGoogle = async () => {
    if (!firebaseEnabled) throw new Error("Google sign-in requires Firebase configuration.");
    await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  };

  const logout = async () => {
    if (!firebaseEnabled) {
      localStorage.removeItem(DEMO_USER_KEY);
      setUser(null);
      return;
    }
    await signOut(getFirebaseAuth());
  };

  const updateSettings = async (partial: Partial<UserSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    if (!user) return;
    if (!firebaseEnabled) {
      localStorage.setItem(`settings_${user.uid}`, JSON.stringify(next));
      return;
    }
    await setDoc(
      doc(getFirebaseDb(), "users", user.uid),
      { settings: next },
      { merge: true }
    );
  };

  const getIdToken = async () => {
    if (!user) return null;
    if (!firebaseEnabled) return "demo-token";
    return user.getIdToken();
  };

  const value = useMemo(
    () => ({
      user,
      settings,
      loading,
      firebaseEnabled,
      signUp,
      signIn,
      signInWithGoogle,
      logout,
      updateSettings,
      getIdToken,
    }),
    [user, settings, loading, firebaseEnabled]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
