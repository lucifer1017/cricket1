import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate Firebase configuration
const validateFirebaseConfig = () => {
  const missing: string[] = [];
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "your_api_key_here") {
    missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  }
  if (!firebaseConfig.authDomain || firebaseConfig.authDomain.includes("your_project_id")) {
    missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  }
  if (!firebaseConfig.projectId || firebaseConfig.projectId === "your_project_id") {
    missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  }
  if (missing.length > 0) {
    console.error("Firebase configuration is missing or incomplete. Missing:", missing);
    console.error("Please check your .env.local file and ensure all Firebase environment variables are set.");
  }
  return missing.length === 0;
};

// Initialize Firebase
let app: FirebaseApp;
if (getApps().length === 0) {
  validateFirebaseConfig();
  try {
    app = initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error:", error);
    throw new Error("Failed to initialize Firebase. Please check your configuration.");
  }
} else {
  app = getApps()[0];
}

// Initialize Auth
export const auth: Auth = getAuth(app);

// Initialize Firestore
export const db: Firestore = getFirestore(app);

export default app;


