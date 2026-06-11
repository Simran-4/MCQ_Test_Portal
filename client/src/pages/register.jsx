import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { apiProjectsToMap, defaultOrgOptions, mergeOrgOptions, readLocalOrgOptions } from "../utils/orgOptions";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const WHITE      = "#ffffff";

const API = import.meta.env.VITE_API_URL ||
  "https://charismatic-happiness-production-dc36.up.railway.app";

function Row({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
      {children}
    </div>
  );
}

function Register() {
  const [name,        setName]        = useState("");
  const [username,    setUsername]    = useState("");
  const [contactType, setContactType] = useState("email");
  const [email,       setEmail]       = useState("");
  const [mobile,      setMobile]      = useState("");
  const [password,    setPassword]    = useState("");
  const [role,        setRole]        = useState("candidate"); // Normalized to lowercase
  const [age,         setAge]         = useState("");
  const [gender,      setGender]      = useState("");
  const [project,     setProject]     = useState("");
  const [designation, setDesignation] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [orgOptions, setOrgOptions]   = useState(defaultOrgOptions);

  const navigate = useNavigate();
  const projectNames = Object.keys(orgOptions).sort((a, b) => a.localeCompare(b));
  const departmentOptions = project ? orgOptions[project] || [] : [];

  useEffect(() => {
    let ignore = false;
    axios.get(`${API}/api/auth/org-options`)
      .then(res => {
        if (!ignore) {
          setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data)));
        }
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  const handleRegister = async () => {
    // ── Validation ──────────────────────────────────────────
    if (!name || name.trim().length < 2)
      return alert("Please enter a valid full name (at least 2 characters)");
    if (!username || username.trim().replace(/\s+/g, "").length < 3)
      return alert("Please enter a username with at least 3 characters");
    if (contactType === "email" && (!email || !email.includes("@") || !email.includes(".")))
      return alert("Please enter a valid email address");
    if (contactType === "mobile" && mobile.replace(/\D/g, "").length < 10)
      return alert("Please enter a valid mobile number");
    if (!password || password.length < 6)
      return alert("Password must be at least 6 characters");
    if (!age || isNaN(age) || parseInt(age) < 10 || parseInt(age) > 100)
      return alert("Please enter a valid age (10–100)");
    if (!gender)
      return alert("Please select your gender");
    if (!project)
      return alert("Please select your project");
    if (!designation)
      return alert("Please select your department");

    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/register`, {
        name:        name.trim(),
        username:    username.trim(),
        email:       contactType === "email" ? email.trim().toLowerCase() : "",
        mobile:      contactType === "mobile" ? mobile.trim() : "",
        password,
        role,
        age:         parseInt(age),
        gender,
        project,
        designation,
      });
      alert("Registration Successful");
      navigate("/");
    } catch (err) {
      alert(err.response?.data?.message || "Registration Failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Styles ───────────────────────────────────────────────
  const inputStyle = {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.4)",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: "rgba(255,255,255,0.2)",
    color: WHITE,
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  };

  const labelStyle = {
    fontSize: "11px",
    color: "rgba(255,255,255,0.85)",
    display: "block",
    marginBottom: "5px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  const selectStyle = {
    ...inputStyle,
    color: WHITE,
  };

  const disabledSelectStyle = {
    ...selectStyle,
    opacity: 0.62,
    cursor: "not-allowed",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: `url(${import.meta.env.BASE_URL}background.png)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', sans-serif",
        padding: "24px 16px",
      }}
    >
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.40)", zIndex: 0 }} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "rgba(255,255,255,0.15)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: "24px",
          padding: "36px 32px 32px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "24px" }}>
          <div style={{ width: "68px", height: "68px", borderRadius: "50%", background: WHITE, border: "0.5px solid rgba(255,255,255,0.4)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="Snehalaya" style={{ width: "62px", height: "62px", objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; }} />
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: WHITE, margin: 0, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
            Create Account
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)", margin: "4px 0 0" }}>
            Fill in all details to get started
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(255,255,255,0.50)", margin: "4px 0 0" }}>
            Personal Info
          </p>

          <div>
            <label style={labelStyle}>Full Name *</label>
            <input type="text" placeholder="Your full name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <Row>
            <div>
              <label style={labelStyle}>Age *</label>
              <input type="number" placeholder="e.g. 25" min="10" max="100" style={inputStyle} value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Gender *</label>
              <select style={selectStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="" style={{ color: "#333", background: WHITE }}>Select</option>
                <option value="Male"   style={{ color: "#333", background: WHITE }}>Male</option>
                <option value="Female" style={{ color: "#333", background: WHITE }}>Female</option>
                <option value="Other"  style={{ color: "#333", background: WHITE }}>Other</option>
              </select>
            </div>
          </Row>

          <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(255,255,255,0.50)", margin: "6px 0 0" }}>
            Work Info
          </p>

          <div>
            <label style={labelStyle}>Project *</label>
            <select
              style={selectStyle}
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setDesignation("");
              }}
            >
              <option value="" style={{ color: "#333", background: WHITE }}>Select project</option>
              {projectNames.map(projectName => (
                <option key={projectName} value={projectName} style={{ color: "#333", background: WHITE }}>
                  {projectName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Department *</label>
            <select
              style={project ? selectStyle : disabledSelectStyle}
              value={designation}
              disabled={!project}
              onChange={(e) => setDesignation(e.target.value)}
            >
              <option value="" style={{ color: "#333", background: WHITE }}>
                {project ? "Select department" : "Select project first"}
              </option>
              {departmentOptions.map(department => (
                <option key={department} value={department} style={{ color: "#333", background: WHITE }}>
                  {department}
                </option>
              ))}
            </select>
          </div>

          <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(255,255,255,0.50)", margin: "6px 0 0" }}>
            Account
          </p>

          <div>
            <label style={labelStyle}>Username *</label>
            <input
              type="text"
              placeholder="Choose a username"
              style={inputStyle}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <Row>
            <div>
              <label style={labelStyle}>Login Contact *</label>
              <select
                style={selectStyle}
                value={contactType}
                onChange={(e) => {
                  setContactType(e.target.value);
                  setEmail("");
                  setMobile("");
                }}
              >
                <option value="email" style={{ color: "#333", background: WHITE }}>Email</option>
                <option value="mobile" style={{ color: "#333", background: WHITE }}>Mobile number</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{contactType === "email" ? "Email *" : "Mobile Number *"}</label>
              <input
                type={contactType === "email" ? "email" : "tel"}
                placeholder={contactType === "email" ? "you@example.com" : "10 digit mobile"}
                style={inputStyle}
                value={contactType === "email" ? email : mobile}
                onChange={(e) => contactType === "email" ? setEmail(e.target.value) : setMobile(e.target.value)}
              />
            </div>
          </Row>

          <div>
            <p style={{ margin: "-2px 0 0", color: "rgba(255,255,255,0.66)", fontSize: "11px", lineHeight: 1.4 }}>
              You can log in later with your username, {contactType === "email" ? "email" : "mobile number"}, and password.
            </p>
          </div>

          <div>
            <label style={labelStyle}>Password *</label>
            <input type="password" placeholder="Min 6 characters" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Role *</label>
            <select style={selectStyle} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="candidate" style={{ color: "#333", background: WHITE }}>Candidate</option>
              <option value="admin" style={{ color: "#333", background: WHITE }}>Admin</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleRegister}
          disabled={loading}
          style={{
            width: "100%", marginTop: "20px", padding: "13px", fontSize: "15px", fontWeight: "700",
            background: loading ? "rgba(45,95,63,0.6)" : GREEN, color: WHITE, border: "none",
            borderRadius: "22px", cursor: loading ? "not-allowed" : "pointer",
            boxShadow: loading ? "none" : "0 4px 16px rgba(45,95,63,0.45)",
            transition: "background 0.2s, box-shadow 0.2s", letterSpacing: "0.02em",
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = GREEN_DARK; }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = GREEN; }}
        >
          {loading ? "Registering…" : "Register"}
        </button>

        <p style={{ textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,0.72)", marginTop: "14px" }}>
          Already have an account?{" "}
          <Link to="/" style={{ color: WHITE, fontWeight: "700", textDecoration: "underline" }}>Login</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
