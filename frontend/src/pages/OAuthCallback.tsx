/**
 * OAuthCallback.tsx — Phase 7
 *
 * Google redirects to /oauth-callback?access_token=...&refresh_token=...&email=...&name=...
 * This page reads those params, stores them in authStore, and forwards to /dashboard.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function OAuthCallback() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken  = params.get("access_token");
    const email        = params.get("email") ?? "";
    const name         = params.get("name") ?? email.split("@")[0];

    if (!accessToken) {
      setError("Google login failed — no token returned. Please try again.");
      return;
    }

    // Synthetic user object (matches what /auth/me returns)
    const user = { email, full_name: name, role: "professor" };
    setAuth(user, accessToken);

    // Clean the URL so tokens don't linger in browser history
    window.history.replaceState({}, document.title, "/oauth-callback");
    navigate("/dashboard", { replace: true });
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8F6F3]">
        <div className="text-center max-w-sm">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 text-sm text-[#C75B12] underline"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#F8F6F3]">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#C75B12] border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Completing Google sign-in…</p>
      </div>
    </div>
  );
}
