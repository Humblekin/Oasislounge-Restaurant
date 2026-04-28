import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  Utensils,
  Mail,
  Lock,
  User as UserIcon,
  ArrowRight,
} from "lucide-react";

export default function AuthPage({ session }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const navigate = useNavigate();

  if (session) {
    return <Navigate to="/" replace />;
  }

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', (await supabase.auth.getUser()).data.user.id)
          .single();
        navigate(profileData?.role === 'admin' ? '/admin' : '/menu');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setErrorMsg("Sign up successful! You can now log in.");
        setIsLogin(true);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <img
          src="https://images.unsplash.com/photo-1543353071-873f17a7a088?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"
          alt="Atmospheric"
        />
        <div className="overlay"></div>
      </div>

      <div className="auth-container fade-in">
        <div className="premium-card auth-card">
          <div className="auth-header text-center">
            <div className="auth-logo">
              <Utensils size={32} />
            </div>
            <h1 className="mb-2 text-main">
              {isLogin ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="text-muted">
              {isLogin
                ? "Login to browse delicious meals."
                : "Join us for exclusive dining perks."}
            </p>
          </div>

          {errorMsg && (
            <div
              className={`auth-alert ${errorMsg.includes("successful") ? "success" : "error"}`}
            >
              {errorMsg}
            </div>
          )}

          <form
            onSubmit={handleAuth}
            className="auth-form flex flex-col gap-4 mt-8"
          >
            {!isLogin && (
              <div className="input-group">
                <UserIcon className="input-icon" size={18} />
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={!isLogin}
                />
              </div>
            )}
            <div className="input-group">
              <Mail className="input-icon" size={18} />
              <input
                type="email"
                className="input w-full"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <Lock className="input-icon" size={18} />
              <input
                type="password"
                className="input w-full"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full mt-4"
              disabled={loading}
            >
              {loading ? "Authenticating..." : isLogin ? "Sign In" : "Sign Up"}
              {!loading && (
                <ArrowRight size={18} style={{ marginLeft: "8px" }} />
              )}
            </button>
          </form>

          <div className="auth-footer text-center mt-8">
            <p className="text-muted">
              {isLogin ? "New here? " : "Already registered? "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="toggle-btn"
              >
                {isLogin ? "Join OASISLOUNGE" : "Login Now"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
