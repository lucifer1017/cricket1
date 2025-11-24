"use client";

import { useState, FormEvent, useEffect } from "react";
import { signIn, signUp, resetPassword, signInWithGoogle, AuthError } from "@/lib/firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

interface FieldErrors {
  email?: string;
  password?: string;
  displayName?: string;
}

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  // Validation functions
  const validateEmail = (emailValue: string): string | undefined => {
    if (!emailValue.trim()) {
      return "Email is required";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailValue)) {
      return "Please enter a valid email address";
    }
    return undefined;
  };

  // Password strength checker
  const getPasswordStrength = (passwordValue: string) => {
    const checks = {
      length: passwordValue.length >= 8,
      uppercase: /[A-Z]/.test(passwordValue),
      lowercase: /[a-z]/.test(passwordValue),
      number: /[0-9]/.test(passwordValue),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(passwordValue),
    };
    const strength = Object.values(checks).filter(Boolean).length;
    return { checks, strength };
  };

  const validatePassword = (passwordValue: string, isSignUp: boolean = false): string | undefined => {
    if (!passwordValue) {
      return "Password is required";
    }
    if (isSignUp) {
      const { checks } = getPasswordStrength(passwordValue);
      if (passwordValue.length < 8) {
        return "Password must be at least 8 characters long";
      }
      if (!checks.uppercase) {
        return "Password must contain at least one uppercase letter";
      }
      if (!checks.lowercase) {
        return "Password must contain at least one lowercase letter";
      }
      if (!checks.number) {
        return "Password must contain at least one number";
      }
    } else {
      // For login, just check minimum length
      if (passwordValue.length < 6) {
        return "Password must be at least 6 characters long";
      }
    }
    return undefined;
  };

  const validateDisplayName = (name: string): string | undefined => {
    if (!isLogin && !isForgotPassword && !name.trim()) {
      return "Display name is required";
    }
    if (name.trim().length < 2) {
      return "Display name must be at least 2 characters long";
    }
    return undefined;
  };

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};
    let isValid = true;

    // Validate email
    const emailError = validateEmail(email);
    if (emailError) {
      errors.email = emailError;
      isValid = false;
    }

    // Validate password (if not forgot password mode)
    if (!isForgotPassword) {
      const passwordError = validatePassword(password, !isLogin);
      if (passwordError) {
        errors.password = passwordError;
        isValid = false;
      }
    }

    // Validate display name (if sign up)
    if (!isLogin && !isForgotPassword) {
      const nameError = validateDisplayName(displayName);
      if (nameError) {
        errors.displayName = nameError;
        isValid = false;
      }
    }

    setFieldErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setFieldErrors({});

    // Validate form before submitting
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      if (isForgotPassword) {
        await resetPassword(email);
        setSuccess("Password reset email sent! Check your inbox.");
        setIsForgotPassword(false);
      } else if (isLogin) {
        await signIn(email, password);
        setSuccess("Welcome back! Redirecting...");
        setTimeout(() => router.push("/"), 1000);
      } else {
        await signUp(email, password, displayName);
        setSuccess("Account created! Redirecting...");
        setTimeout(() => router.push("/"), 1000);
      }
    } catch (err: any) {
      console.error("Authentication error:", err);
      const authError = err as AuthError;
      // Show the actual error message, or a more helpful one
      const errorMessage = authError.message || err?.message || "An error occurred. Please check your credentials and try again.";
      setError(errorMessage);
      setLoading(false);
    }
  };

  // Real-time validation handlers
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (fieldErrors.email) {
      const error = validateEmail(value);
      setFieldErrors((prev) => ({
        ...prev,
        email: error,
      }));
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (fieldErrors.password) {
      const error = validatePassword(value, !isLogin);
      setFieldErrors((prev) => ({
        ...prev,
        password: error,
      }));
    }
  };

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDisplayName(value);
    if (fieldErrors.displayName) {
      const error = validateDisplayName(value);
      setFieldErrors((prev) => ({
        ...prev,
        displayName: error,
      }));
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setIsForgotPassword(false);
    setError("");
    setSuccess("");
    setFieldErrors({});
    setPassword("");
    setDisplayName("");
  };

  const handleForgotPassword = () => {
    setIsForgotPassword(true);
    setError("");
    setSuccess("");
    setFieldErrors({});
    setPassword("");
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await signInWithGoogle();
      setSuccess("Signed in with Google! Redirecting...");
      setTimeout(() => router.push("/"), 1000);
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      const authError = err as AuthError;
      const errorMessage = authError.message || err?.message || "Failed to sign in with Google. Please try again.";
      setError(errorMessage);
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-900 via-purple-900 to-pink-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Floating Particles */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full opacity-30"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md px-6 py-8">
        {/* Glassmorphism Card */}
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8 transform transition-all duration-500 hover:scale-[1.02]">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
              {isForgotPassword
                ? "Reset Password"
                : isLogin
                ? "Welcome Back"
                : "Create Account"}
            </h1>
            <p className="text-white/70 text-sm">
              {isForgotPassword
                ? "Enter your email to receive a reset link"
                : isLogin
                ? "Sign in to continue your journey"
                : "Start your adventure with us"}
            </p>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-100 text-sm animate-shake">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-xl text-green-100 text-sm animate-fadeIn">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && !isForgotPassword && (
              <div className="space-y-2">
                <label className="block text-white/90 text-sm font-medium">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={handleDisplayNameChange}
                  onBlur={() => {
                    const error = validateDisplayName(displayName);
                    setFieldErrors((prev) => ({ ...prev, displayName: error }));
                  }}
                  className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 transition-all duration-300 backdrop-blur-sm ${
                    fieldErrors.displayName
                      ? "border-red-400 focus:ring-red-400 focus:border-transparent"
                      : "border-white/20 focus:ring-purple-400 focus:border-transparent"
                  }`}
                  placeholder="Enter your name"
                />
                {fieldErrors.displayName && (
                  <p className="text-red-300 text-xs mt-1 animate-fadeIn">
                    {fieldErrors.displayName}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-white/90 text-sm font-medium">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                onBlur={() => {
                  const error = validateEmail(email);
                  setFieldErrors((prev) => ({ ...prev, email: error }));
                }}
                className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 transition-all duration-300 backdrop-blur-sm ${
                  fieldErrors.email
                    ? "border-red-400 focus:ring-red-400 focus:border-transparent"
                    : "border-white/20 focus:ring-purple-400 focus:border-transparent"
                }`}
                placeholder="you@example.com"
              />
              {fieldErrors.email && (
                <p className="text-red-300 text-xs mt-1 animate-fadeIn">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {!isForgotPassword && (
              <div className="space-y-2">
                <label className="block text-white/90 text-sm font-medium">
                  Password
                  {!isLogin && (
                    <span className="text-white/50 text-xs font-normal ml-1">
                      (see requirements below)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={handlePasswordChange}
                    onBlur={() => {
                      const error = validatePassword(password, !isLogin);
                      setFieldErrors((prev) => ({ ...prev, password: error }));
                    }}
                    className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 transition-all duration-300 backdrop-blur-sm pr-12 ${
                      fieldErrors.password
                        ? "border-red-400 focus:ring-red-400 focus:border-transparent"
                        : "border-white/20 focus:ring-purple-400 focus:border-transparent"
                    }`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors"
                  >
                    {showPassword ? (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                
                {/* Password Requirements (only for sign up) */}
                {!isLogin && password && (
                  <div className="mt-2 p-3 bg-white/5 rounded-lg border border-white/10">
                    <p className="text-white/70 text-xs font-medium mb-2">Password must contain:</p>
                    <div className="space-y-1.5">
                      {(() => {
                        const { checks } = getPasswordStrength(password);
                        return (
                          <>
                            <div className="flex items-center gap-2 text-xs">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                checks.length ? "bg-green-500/30 border border-green-400" : "bg-white/10 border border-white/20"
                              }`}>
                                {checks.length && (
                                  <svg className="w-2.5 h-2.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <span className={checks.length ? "text-green-300" : "text-white/50"}>
                                At least 8 characters
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                checks.uppercase ? "bg-green-500/30 border border-green-400" : "bg-white/10 border border-white/20"
                              }`}>
                                {checks.uppercase && (
                                  <svg className="w-2.5 h-2.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <span className={checks.uppercase ? "text-green-300" : "text-white/50"}>
                                One uppercase letter (A-Z)
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                checks.lowercase ? "bg-green-500/30 border border-green-400" : "bg-white/10 border border-white/20"
                              }`}>
                                {checks.lowercase && (
                                  <svg className="w-2.5 h-2.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <span className={checks.lowercase ? "text-green-300" : "text-white/50"}>
                                One lowercase letter (a-z)
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                checks.number ? "bg-green-500/30 border border-green-400" : "bg-white/10 border border-white/20"
                              }`}>
                                {checks.number && (
                                  <svg className="w-2.5 h-2.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <span className={checks.number ? "text-green-300" : "text-white/50"}>
                                One number (0-9)
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {fieldErrors.password && (
                  <p className="text-red-300 text-xs mt-1 animate-fadeIn">
                    {fieldErrors.password}
                  </p>
                )}
              </div>
            )}

            {isLogin && !isForgotPassword && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center text-white/70 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="mr-2 w-4 h-4 rounded border-white/30 bg-white/10 text-purple-500 focus:ring-purple-400 focus:ring-offset-0"
                  />
                  <span className="group-hover:text-white transition-colors">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-purple-300 hover:text-purple-200 transition-colors font-medium"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Processing...</span>
                </>
              ) : isForgotPassword ? (
                "Send Reset Link"
              ) : isLogin ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          {/* Toggle Mode */}
          {!isForgotPassword && (
            <div className="mt-6 text-center">
              <p className="text-white/70 text-sm">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-purple-300 hover:text-purple-200 font-semibold transition-colors underline decoration-2 underline-offset-2"
                >
                  {isLogin ? "Sign Up" : "Sign In"}
                </button>
              </p>
            </div>
          )}

          {isForgotPassword && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(false);
                  setError("");
                  setSuccess("");
                  setFieldErrors({});
                }}
                className="text-purple-300 hover:text-purple-200 text-sm font-medium transition-colors"
              >
                ← Back to Sign In
              </button>
            </div>
          )}

          {/* Divider */}
          {!isForgotPassword && (
            <div className="mt-6 flex items-center gap-4">
              <div className="flex-1 h-px bg-white/20"></div>
              <span className="text-white/50 text-xs">OR</span>
              <div className="flex-1 h-px bg-white/20"></div>
            </div>
          )}

          {/* Google Sign In Button */}
          {!isForgotPassword && (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="mt-6 w-full py-3.5 bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold rounded-xl shadow-lg hover:bg-white/20 hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <p className="text-center mt-6 text-white/50 text-xs">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}


