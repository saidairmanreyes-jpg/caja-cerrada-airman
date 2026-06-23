import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCNUcVjqsZHeRLN5nBBu6e0ZvT6NZq_O84",
  authDomain: "airman-wms-2026.firebaseapp.com",
  projectId: "airman-wms-2026",
  storageBucket: "airman-wms-2026.firebasestorage.app",
  messagingSenderId: "33920085374",
  appId: "1:33920085374:web:ccdc556d4bb78b874d172f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Set session-only persistence: users must log in again when the browser/tab is closed
setPersistence(auth, browserSessionPersistence).catch((err) =>
  console.error("Error setting auth persistence:", err)
);

// Secondary app to create users without kicking out the current user
export const secondaryApp = initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);

// Also apply session persistence to secondary auth
setPersistence(secondaryAuth, browserSessionPersistence).catch(() => {});

export default app;
