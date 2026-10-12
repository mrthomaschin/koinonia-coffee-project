import { App, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const DEFAULT_STORAGE_BUCKET = "koinonia-coffee-project.firebasestorage.app";

const defaultApp = (): App => getApps().find((app) => app.name === "[DEFAULT]") || initializeApp();

/** Returns the default Firestore instance, initializing Admin when needed. */
export const getDatabase = (): Firestore => getFirestore(defaultApp());

/** Returns the project's Cloud Storage bucket (the one product images live in). */
export const getStorageBucket = () =>
  getStorage(defaultApp()).bucket(process.env.STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET);
