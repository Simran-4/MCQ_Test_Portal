import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const WHITE      = "#ffffff";

function Register() {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole]         = useState("Candidate");
  const navigate = useNavigate();

  const handleRegister = async () => {
    if (!name || name.trim().length < 2)                        return alert("Please enter a valid full name (at least 2 characters)");
    if (!email || !email.includes("@") || !email.includes(".")) return alert("Please enter a valid email address");
    if (!password || password.length < 6)                       return alert("Password must be at least 6 characters");

    try {
      await axios.post(
        "https://charismatic-happiness-production-dc36.up.railway.app/api/auth/register",
        { name: name.trim(), email: email.trim().toLowerCase(), password, role }
      );
      alert("Registration Successful");
      navigate("/");
    } catch (err) {
      alert(err.response?.data?.message || "Registration Failed. Please try again.");
    }
  };

  const inputStyle = {
    width: "100%", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "10px",
    padding: "10px 12px", fontSize: "14px", outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
    background: "rgba(255,255,255,0.2)", color: WHITE,
    backdropFilter: "blur(4px)",
  };

  const labelStyle = {
    fontSize: "12px", color: "rgba(255,255,255,0.85)", display: "block",
    marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em",
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
}}>
      {/* Dark overlay */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />

      {/* Card */}
      <div style={{
        position: "relative", zIndex: 1,
        background: "rgba(255,255,255,0.15)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.3)",
        borderRadius: "24px",
        padding: "40px 36px",
        width: "100%", maxWidth: "400px",
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
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: WHITE, margin: 0, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>Create account</h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", margin: "4px 0 0" }}>Register to get started</p>
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input type="text" placeholder="Your full name" style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" placeholder="you@example.com" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input type="password" placeholder="Min 6 characters" style={inputStyle} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select
              style={{ ...inputStyle, color: role ? WHITE : "rgba(255,255,255,0.5)" }}
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="Candidate" style={{ color: "#333", background: WHITE }}>Candidate</option>
              <option value="admin"   style={{ color: "#333", background: WHITE }}>Admin</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleRegister}
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
          Register
        </button>

        <p style={{ textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,0.75)", marginTop: "16px" }}>
          Already have an account?{" "}
          <Link to="/" style={{ color: WHITE, fontWeight: "700", textDecoration: "underline" }}>Login</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;