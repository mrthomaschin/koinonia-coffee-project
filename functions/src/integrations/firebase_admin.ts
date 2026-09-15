import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

/** Returns the default Firestore instance, initializing Admin when needed. */
export const getDatabase = (): Firestore => {
  const defaultApp = getApps().find((app) => app.name === "[DEFAULT]") || initializeApp();
  return getFirestore(defaultApp);
};
