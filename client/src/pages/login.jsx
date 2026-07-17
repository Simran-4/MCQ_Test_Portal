import { useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSafeNextPath, registerPathForNext } from "../utils/authRedirect";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const WHITE      = "#ffffff";
const API = import.meta.env.VITE_API_URL || "";
const API_AUTH = `${API}/api/auth`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStep, setResetStep] = useState("request");
  const [resetOtp, setResetOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginChoiceUser, setLoginChoiceUser] = useState(null);
  const identifierInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));

  const handleLogin = async () => {
    const loginId = (identifierInputRef.current?.value || identifier).trim();
    const loginPassword = passwordInputRef.current?.value ?? password;
    if (!loginId) return alert("Enter your username, email, or mobile number");
    if (!loginPassword) return alert("Enter your password");
    if (loginId.includes("@") && !EMAIL_RE.test(loginId.toLowerCase())) {
      return alert("Enter a valid email address, or use your username/mobile number.");
    }
    setLoginLoading(true);
    try {
      const res = await axios.post(
        `${API_AUTH}/login`,
        { identifier: loginId, email: loginId, password: loginPassword }
      );

      localStorage.setItem("token", `Bearer ${res.data.token}`);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      if (nextPath.startsWith("/test/")) {
        navigate(nextPath);
        return;
      }

      if (["admin", "superadmin"].includes(res.data.user.role)) {
        setLoginChoiceUser(res.data.user);
        return;
      }

      navigate("/candidate");
    } catch (err) {
      const message = err.response?.data?.message || err.message || "Login Failed";
      alert(message === "Network Error" ? "Login failed: unable to reach the server. Please refresh and try again." : message);
    } finally {
      setLoginLoading(false);
    }
  };

  const goToCandidateArea = () => {
    navigate(nextPath.startsWith("/test/") ? nextPath : "/candidate");
  };

  const goToAdminArea = () => {
    navigate(loginChoiceUser?.role === "superadmin" ? "/superadmin" : "/dashboard");
  };

  const cancelRoleChoice = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setLoginChoiceUser(null);
    setPassword("");
  };

  const handleForgotPassword = async () => {
    const targetIdentifier = (identifierInputRef.current?.value || identifier).trim();
    if (!targetIdentifier) {
      setResetMessage("Enter your username, email, or mobile number above, then click Forgot password.");
      return;
    }
    setResetLoading(true);
    setResetMessage("");
    try {
      const res = await axios.post(`${API_AUTH}/forgot-password`, { identifier: targetIdentifier, email: targetIdentifier });
      setResetMessage(res.data?.message || "Check WhatsApp for your six-digit OTP.");
      setResetStep("verify");
      setResetOtp("");
      setResetToken("");
    } catch (err) {
      setResetMessage(err.response?.data?.message || "Unable to send the WhatsApp OTP. Please try again shortly.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyResetOtp = async () => {
    const targetIdentifier = (identifierInputRef.current?.value || identifier).trim();
    if (!/^\d{6}$/.test(resetOtp)) {
      setResetMessage("Enter the six-digit OTP received on WhatsApp.");
      return;
    }
    setResetLoading(true);
    try {
      const res = await axios.post(`${API_AUTH}/forgot-password/verify-otp`, { identifier: targetIdentifier, otp: resetOtp });
      setResetToken(res.data.resetToken || "");
      setResetStep("password");
      setResetMessage(res.data.message || "OTP verified. Choose your new password.");
    } catch (err) {
      setResetMessage(err.response?.data?.message || "Unable to verify the OTP. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      setResetMessage("Your new password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetMessage("The new passwords do not match.");
      return;
    }
    setResetLoading(true);
    try {
      const res = await axios.post(`${API_AUTH}/forgot-password/reset`, { resetToken, password: newPassword });
      setResetMessage(res.data?.message || "Your password has been reset. You can now log in.");
      setResetStep("complete");
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setResetToken("");
    } catch (err) {
      setResetMessage(err.response?.data?.message || "Unable to reset your password. Request a new OTP and try again.");
    } finally {
      setResetLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "10px",
    padding: "10px 12px", fontSize: "14px", outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
    background: "rgba(255,255,255,0.2)", color: WHITE,
    backdropFilter: "blur(4px)",
  };

  const passwordInputStyle = {
    ...inputStyle,
    paddingRight: "44px",
  };

  const passwordToggleStyle = {
    position: "absolute",
    right: "8px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "30px",
    height: "30px",
    border: "none",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.18)",
    color: WHITE,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    fontSize: "15px",
  };

  return (
    <div className="auth-inline-page login-inline-page" style={{
      minHeight: "100vh",
      backgroundImage: `url(${import.meta.env.BASE_URL}background.png)`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif",
      position: "relative",
    }}>
      {/* Dark overlay */}
      <div className="auth-inline-overlay" style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.35)",
      }} />

      {/* Card */}
      <div className="auth-inline-card login-inline-card" style={{
        position: "relative", zIndex: 1,
        background: "rgba(255,255,255,0.15)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.3)",
        borderRadius: "24px",
        padding: "40px 36px",
        width: "calc(100% - 32px)", maxWidth: "380px",
        margin: "0 auto",
        boxSizing: "border-box",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
      }}>

        {loginChoiceUser ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "28px" }}>
              <div style={{
                width: "72px", height: "72px", borderRadius: "50%",
                background: WHITE,
                border: "0.5px solid rgba(255,255,255,0.4)",
                overflow: "hidden", display: "flex", alignItems: "center",
                justifyContent: "center", marginBottom: "12px",
              }}>
                <img
                  src={`${import.meta.env.BASE_URL}Logo.png`}
                  alt="Snehalaya"
                  style={{ width: "64px", height: "64px", objectFit: "contain" }}
                  onError={e => { e.target.style.display = "none"; }}
                />
              </div>
              <h1 style={{ fontSize: "22px", fontWeight: "700", color: WHITE, margin: 0, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
                Choose login area
              </h1>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.78)", margin: "6px 0 0", textAlign: "center", lineHeight: 1.5 }}>
                Welcome, {loginChoiceUser.name || "Admin"}. Select where you want to continue.
              </p>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <button
                type="button"
                onClick={goToCandidateArea}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.38)",
                  background: "rgba(255,255,255,0.22)",
                  color: WHITE,
                  fontWeight: "800",
                  fontSize: "15px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Attempt tests as candidate
                <span style={{ display: "block", marginTop: "4px", fontSize: "12px", fontWeight: "500", color: "rgba(255,255,255,0.75)" }}>
                  Open assigned tests and submit assessments.
                </span>
              </button>

              <button
                type="button"
                onClick={goToAdminArea}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: "16px",
                  border: "none",
                  background: GREEN,
                  color: WHITE,
                  fontWeight: "800",
                  fontSize: "15px",
                  cursor: "pointer",
                  textAlign: "left",
                  boxShadow: "0 4px 16px rgba(45,95,63,0.4)",
                }}
              >
                Go to {loginChoiceUser.role === "superadmin" ? "super admin" : "admin"} dashboard
                <span style={{ display: "block", marginTop: "4px", fontSize: "12px", fontWeight: "500", color: "rgba(255,255,255,0.78)" }}>
                  Manage test suites, reports and users.
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={cancelRoleChoice}
              style={{ width: "100%", marginTop: "16px", padding: "10px", border: "none", background: "transparent", color: WHITE, fontSize: "12px", fontWeight: "700", textDecoration: "underline", cursor: "pointer" }}
            >
              Use another account
            </button>
          </>
        ) : (
          <>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "28px" }}>
          <div style={{
            width: "72px", height: "72px", borderRadius: "50%",
            background: WHITE,
            border: "0.5px solid rgba(255,255,255,0.4)",
            overflow: "hidden", display: "flex", alignItems: "center",
            justifyContent: "center", marginBottom: "12px",
          }}>
            <img
              src={`${import.meta.env.BASE_URL}Logo.png`}
              alt="Snehalaya"
              style={{ width: "64px", height: "64px", objectFit: "contain" }}
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: WHITE, margin: 0, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>Welcome back</h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", margin: "4px 0 0" }}>Sign in to your account</p>
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.85)", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Username / Email / Mobile</label>
            <input
              ref={identifierInputRef}
              type="text"
              placeholder="username, email, or mobile"
              autoComplete="username"
              style={inputStyle}
              value={identifier}
              onChange={e => {
                setIdentifier(e.target.value);
                if (resetStep !== "request") {
                  setResetStep("request");
                  setResetToken("");
                }
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.85)", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                ref={passwordInputRef}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                style={passwordInputStyle}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(prev => !prev)}
                style={passwordToggleStyle}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetLoading}
              style={{ marginTop: "8px", padding: 0, border: "none", background: "transparent", color: WHITE, fontSize: "12px", fontWeight: "700", textDecoration: "underline", cursor: resetLoading ? "wait" : "pointer" }}
            >
              {resetLoading ? "Sending..." : "Forgot password?"}
            </button>
          </div>
        </div>

        {resetMessage && (
          <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: "rgba(255,255,255,0.18)", color: WHITE, fontSize: "12px", lineHeight: 1.5 }}>
            {resetMessage}
          </div>
        )}

        {resetStep === "verify" && (
          <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
            <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.85)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              WhatsApp OTP
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Enter 6-digit OTP"
              value={resetOtp}
              onChange={e => setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={handleVerifyResetOtp}
              disabled={resetLoading}
              style={{ width: "100%", padding: "10px", fontSize: "13px", fontWeight: "700", background: GREEN, color: WHITE, border: "none", borderRadius: "18px", cursor: resetLoading ? "wait" : "pointer", opacity: resetLoading ? 0.75 : 1 }}
            >
              {resetLoading ? "Verifying..." : "Verify OTP"}
            </button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetLoading}
              style={{ padding: 0, border: "none", background: "transparent", color: WHITE, fontSize: "12px", fontWeight: "700", textDecoration: "underline", cursor: resetLoading ? "wait" : "pointer" }}
            >
              Resend OTP on WhatsApp
            </button>
          </div>
        )}

        {resetStep === "password" && (
          <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
            <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.85)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              New password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleResetPassword()}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetLoading}
              style={{ width: "100%", padding: "10px", fontSize: "13px", fontWeight: "700", background: GREEN, color: WHITE, border: "none", borderRadius: "18px", cursor: resetLoading ? "wait" : "pointer", opacity: resetLoading ? 0.75 : 1 }}
            >
              {resetLoading ? "Updating..." : "Set new password"}
            </button>
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loginLoading}
          style={{
            width: "100%", marginTop: "20px", padding: "12px",
            fontSize: "15px", fontWeight: "700",
            background: GREEN, color: WHITE,
            border: "none", borderRadius: "22px", cursor: loginLoading ? "wait" : "pointer",
            boxShadow: "0 4px 16px rgba(45,95,63,0.4)",
            opacity: loginLoading ? 0.75 : 1,
          }}
          onMouseEnter={e => { if (!loginLoading) e.currentTarget.style.background = GREEN_DARK; }}
          onMouseLeave={e => { if (!loginLoading) e.currentTarget.style.background = GREEN; }}
        >
          {loginLoading ? "Logging in..." : "Login"}
        </button>

        <p
          style={{ textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,0.75)", marginTop: "16px", cursor: "pointer" }}
          onClick={() => navigate(registerPathForNext(nextPath))}
        >
          Don't have an account?{" "}
          <span style={{ color: WHITE, fontWeight: "700", textDecoration: "underline" }}>Register</span>
        </p>
          </>
        )}
      </div>

      {/* Contact footer */}
      <div style={{
        position: "absolute", bottom: "16px", right: "20px", zIndex: 2,
        textAlign: "right",
      }}>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.6 }}>
          For Queries Please Contact — IT Department
        </p>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.6 }}>
          📞 <a href="tel:9011020190" style={{ color: "rgba(255,255,255,0.9)", textDecoration: "none", fontWeight: "600" }}>9011020190</a>
          {" · "}
          <a href="mailto:crm@snehalaya.org" style={{ color: "rgba(255,255,255,0.9)", textDecoration: "none", fontWeight: "600" }}>crm@snehalaya.org</a>
        </p>
      </div>

    </div>
  );
}

export default Login;
