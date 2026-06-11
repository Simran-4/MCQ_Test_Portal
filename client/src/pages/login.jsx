import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const WHITE      = "#ffffff";
const API_AUTH = "https://charismatic-happiness-production-dc36.up.railway.app/api/auth";

function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
  try {
    const res = await axios.post(
      `${API_AUTH}/login`,
      { identifier, email: identifier, password }
    );

    // ✅ Save token WITH Bearer prefix so all API calls work
    localStorage.setItem("token", `Bearer ${res.data.token}`);
    localStorage.setItem("user", JSON.stringify(res.data.user));

    if (res.data.user.role === "admin")           navigate("/dashboard");
    else if (res.data.user.role === "superadmin") navigate("/superadmin");
    else                                          navigate("/candidate");
  } catch (err) {
    alert(err.response?.data?.message || "Login Failed");
  }
};

  const handleForgotPassword = async () => {
    const targetIdentifier = identifier.trim();
    if (!targetIdentifier) {
      setResetMessage("Enter your username, email, or mobile number above, then click Forgot password.");
      return;
    }
    setResetLoading(true);
    setResetMessage("");
    try {
      const res = await axios.post(`${API_AUTH}/forgot-password`, { identifier: targetIdentifier, email: targetIdentifier });
      setResetMessage(res.data?.message || "Please contact the IT Department to reset your password.");
    } catch (err) {
      if (err.response?.status === 404) {
        setResetMessage("Please contact the IT Department to reset your password: 9011020190 or crm@snehalaya.org.");
      } else {
        setResetMessage(err.response?.data?.message || "Please contact the IT Department to reset your password.");
      }
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

  return (
    <div style={{
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
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.35)",
      }} />

      {/* Card */}
      <div style={{
        position: "relative", zIndex: 1,
        background: "rgba(255,255,255,0.15)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.3)",
        borderRadius: "24px",
        padding: "40px 36px",
        width: "100%", maxWidth: "380px",
        margin: "0 16px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
      }}>

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
              type="text"
              placeholder="username, email, or mobile"
              style={inputStyle}
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.85)", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              style={inputStyle}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
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

        <button
          onClick={handleLogin}
          style={{
            width: "100%", marginTop: "20px", padding: "12px",
            fontSize: "15px", fontWeight: "700",
            background: GREEN, color: WHITE,
            border: "none", borderRadius: "22px", cursor: "pointer",
            boxShadow: "0 4px 16px rgba(45,95,63,0.4)",
          }}
          onMouseEnter={e => e.currentTarget.style.background = GREEN_DARK}
          onMouseLeave={e => e.currentTarget.style.background = GREEN}
        >
          Login
        </button>

        <p
          style={{ textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,0.75)", marginTop: "16px", cursor: "pointer" }}
          onClick={() => navigate("/register")}
        >
          Don't have an account?{" "}
          <span style={{ color: WHITE, fontWeight: "700", textDecoration: "underline" }}>Register</span>
        </p>
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
