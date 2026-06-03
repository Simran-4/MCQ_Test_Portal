import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

function Login() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await axios.post(
        "https://mcqtestportal-production.up.railway.app/api/auth/login",
        { email, password }
      );
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      if (res.data.user.role === "admin")           navigate("/dashboard");
      else if (res.data.user.role === "superadmin") navigate("/superadmin");
      else                                          navigate("/test");

    } catch (err) {
      alert(err.response?.data?.message || "Login Failed");
      console.log(err);
    }
  };

  const inputStyle = {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: WHITE,
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: WHITE, borderRadius: "20px", padding: "36px 32px", width: "100%", maxWidth: "380px", margin: "0 16px", boxShadow: "0 20px 60px rgba(0,0,0,0.1)" }}>

        {/* ── Logo ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "28px" }}>
          <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: BG, border: "0.5px solid rgba(0,0,0,0.1)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <img
              src={`${import.meta.env.BASE_URL}Logo.png`}
              alt="Snehalaya"
              style={{ width: "64px", height: "64px", objectFit: "contain" }}
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: "700", color: GREEN_DARK, margin: 0 }}>Welcome back</h1>
          <p style={{ fontSize: "13px", color: "#6B6B5E", margin: "4px 0 0" }}>Sign in to your account</p>
        </div>

        {/* ── Fields ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</label>
            <input type="email" placeholder="you@example.com" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</label>
            <input type="password" placeholder="••••••••" style={inputStyle} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
        </div>

        <button
          onClick={handleLogin}
          style={{ width: "100%", marginTop: "20px", padding: "11px", fontSize: "15px", fontWeight: "600", background: GREEN, color: WHITE, border: "none", borderRadius: "22px", cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.background = GREEN_DARK}
          onMouseLeave={e => e.currentTarget.style.background = GREEN}
        >
          Login
        </button>

        <p style={{ textAlign: "center", fontSize: "13px", color: "#888", marginTop: "16px", cursor: "pointer" }} onClick={() => navigate("/register")}>
          Don't have an account? <span style={{ color: GREEN, fontWeight: "600" }}>Register</span>
        </p>
      </div>
    </div>
  );
}

export default Login;