import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  User,
  UserCredential,
} from "firebase/auth";
import { auth } from "./config";

export interface AuthError {
  code: string;
  message: string;
}

// Sign up with email and password
export const signUp = async (
  email: string,
  password: string,
  displayName?: string
): Promise<UserCredential> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    
    // Update display name if provided
    if (displayName && userCredential.user) {
      await updateProfile(userCredential.user, {
        displayName: displayName,
      });
    }
    
    return userCredential;
  } catch (error: any) {
    const errorCode = error?.code || error?.error?.code || "";
    const errorMessage = error?.message || error?.error?.message || "";
    throw {
      code: errorCode,
      message: getAuthErrorMessage(errorCode, errorMessage),
    } as AuthError;
  }
};

// Sign in with email and password
export const signIn = async (
  email: string,
  password: string
): Promise<UserCredential> => {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    const errorCode = error?.code || error?.error?.code || "";
    const errorMessage = error?.message || error?.error?.message || "";
    throw {
      code: errorCode,
      message: getAuthErrorMessage(errorCode, errorMessage),
    } as AuthError;
  }
};

// Sign out
export const logOut = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error: any) {
    const errorCode = error?.code || error?.error?.code || "";
    const errorMessage = error?.message || error?.error?.message || "";
    throw {
      code: errorCode,
      message: getAuthErrorMessage(errorCode, errorMessage),
    } as AuthError;
  }
};

// Sign in with Google
export const signInWithGoogle = async (): Promise<UserCredential> => {
  try {
    const provider = new GoogleAuthProvider();
    // Add additional scopes if needed
    provider.addScope("profile");
    provider.addScope("email");
    // Set custom parameters
    provider.setCustomParameters({
      prompt: "select_account",
    });
    
    return await signInWithPopup(auth, provider);
  } catch (error: any) {
    const errorCode = error?.code || error?.error?.code || "";
    const errorMessage = error?.message || error?.error?.message || "";
    throw {
      code: errorCode,
      message: getAuthErrorMessage(errorCode, errorMessage),
    } as AuthError;
  }
};

// Send password reset email
export const resetPassword = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    const errorCode = error?.code || error?.error?.code || "";
    const errorMessage = error?.message || error?.error?.message || "";
    throw {
      code: errorCode,
      message: getAuthErrorMessage(errorCode, errorMessage),
    } as AuthError;
  }
};

// Get user-friendly error messages
export const getAuthErrorMessage = (errorCode: string, errorMessage?: string): string => {
  // If no error code, try to extract from message
  if (!errorCode && errorMessage) {
    // Check for common error patterns in the message
    if (errorMessage.includes("INVALID_EMAIL")) {
      return "Please enter a valid email address.";
    }
    if (errorMessage.includes("EMAIL_NOT_FOUND")) {
      return "No account found with this email address.";
    }
    if (errorMessage.includes("INVALID_PASSWORD") || errorMessage.includes("WRONG_PASSWORD")) {
      return "Incorrect password. Please try again.";
    }
    if (errorMessage.includes("EMAIL_EXISTS")) {
      return "This email is already registered. Please sign in instead.";
    }
    if (errorMessage.includes("WEAK_PASSWORD")) {
      return "Password should be at least 6 characters long.";
    }
    if (errorMessage.includes("INVALID_CREDENTIAL")) {
      return "Invalid email or password. Please check your credentials.";
    }
  }

  switch (errorCode) {
    case "auth/email-already-in-use":
    case "auth/email-exists":
      return "This email is already registered. Please sign in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/operation-not-allowed":
      return "Email/Password authentication is not enabled. Please contact support.";
    case "auth/weak-password":
      return "Password should be at least 6 characters long.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/user-not-found":
      return "No account found with this email address. Please check your email or sign up.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-password":
      return "Incorrect password. Please try again.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection and try again.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed. Please try again.";
    case "auth/popup-blocked":
      return "Popup was blocked by your browser. Please allow popups and try again.";
    case "auth/cancelled-popup-request":
      return "Only one popup request is allowed at a time.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with the same email address but different sign-in credentials.";
    case "auth/missing-password":
      return "Password is required.";
    case "auth/missing-email":
      return "Email is required.";
    case "auth/invalid-api-key":
      return "Firebase configuration error. Please check your environment variables.";
    case "auth/app-not-authorized":
      return "Firebase app is not authorized. Please check your configuration.";
    default:
      // Log the actual error for debugging
      console.error("Firebase Auth Error:", {
        code: errorCode,
        message: errorMessage,
        fullError: errorCode || errorMessage || "Unknown error"
      });
      return errorMessage || `Authentication failed. ${errorCode ? `Error: ${errorCode}` : "Please check your credentials and try again."}`;
  }
};


