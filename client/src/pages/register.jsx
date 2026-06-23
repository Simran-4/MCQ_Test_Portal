import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiProjectsToMap, defaultOrgOptions, mergeOrgOptions, readLocalOrgOptions } from "../utils/orgOptions";
import { getSafeNextPath, loginPathForNext } from "../utils/authRedirect";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const WHITE      = "#ffffff";

const API = import.meta.env.VITE_API_URL ||
  "https://charismatic-happiness-production-dc36.up.railway.app";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Row({ children }) {
  return (
    <div className="auth-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
      {children}
    </div>
  );
}

function capitalizeFirst(value) {
  const trimmed = String(value || "").replace(/^\s+/, "");
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
}

function basicEmailMessage(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "Please enter your email address";
  if (!EMAIL_RE.test(email)) return "Please enter a valid email address";
  return "";
}

function Register() {
  const [firstName,   setFirstName]   = useState("");
  const [middleName,  setMiddleName]  = useState("");
  const [lastName,    setLastName]    = useState("");
  const [username,    setUsername]    = useState("");
  const [contactType, setContactType] = useState("email");
  const [email,       setEmail]       = useState("");
  const [emailCheck,  setEmailCheck]  = useState({ status: "idle", message: "" });
  const [emailOtp,    setEmailOtp]    = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerificationToken, setEmailVerificationToken] = useState("");
  const [otpSending, setOtpSending]   = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [mobile,      setMobile]      = useState("");
  const [password,    setPassword]    = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [age,         setAge]         = useState("");
  const [gender,      setGender]      = useState("");
  const [project,     setProject]     = useState("");
  const [designation, setDesignation] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [orgOptions, setOrgOptions]   = useState(defaultOrgOptions);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));
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

  const resetEmailOtp = () => {
    setEmailOtp("");
    setEmailOtpSent(false);
    setEmailVerificationToken("");
  };

  const sendEmailOtp = async () => {
    const normalized = email.trim().toLowerCase();
    const basicMessage = basicEmailMessage(normalized);
    if (basicMessage) {
      setEmailCheck({ status: "invalid", message: basicMessage });
      return;
    }
    setOtpSending(true);
    setEmailCheck({ status: "checking", message: "Sending OTP..." });
    try {
      const res = await axios.post(`${API}/api/auth/request-email-otp`, { email: normalized });
      setEmailOtpSent(true);
      setEmailVerificationToken("");
      setEmailCheck({ status: "valid", message: res.data?.message || "OTP sent to your email." });
    } catch (err) {
      setEmailOtpSent(false);
      setEmailCheck({
        status: "invalid",
        message: err.response?.data?.message || "Unable to send OTP. Please try again.",
      });
    } finally {
      setOtpSending(false);
    }
  };

  const verifyEmailOtp = async () => {
    const normalized = email.trim().toLowerCase();
    if (!/^\d{6}$/.test(emailOtp.trim())) {
      setEmailCheck({ status: "invalid", message: "Enter the 6 digit OTP sent to your email." });
      return;
    }
    setOtpVerifying(true);
    setEmailCheck({ status: "checking", message: "Verifying OTP..." });
    try {
      const res = await axios.post(`${API}/api/auth/verify-email-otp`, {
        email: normalized,
        otp: emailOtp.trim(),
      });
      setEmailVerificationToken(res.data?.emailVerificationToken || "");
      setEmailCheck({ status: "valid", message: res.data?.message || "Email verified successfully." });
    } catch (err) {
      setEmailVerificationToken("");
      setEmailCheck({
        status: "invalid",
        message: err.response?.data?.message || "Unable to verify OTP.",
      });
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleRegister = async () => {
    // ── Validation ──────────────────────────────────────────
    const fullName = [firstName, middleName, lastName]
      .map(part => part.trim())
      .filter(Boolean)
      .join(" ");
    if (!firstName.trim())
      return alert("Please enter your first name");
    if (!middleName.trim())
      return alert("Please enter your middle name");
    if (!lastName.trim())
      return alert("Please enter your last name");
    if (!username || username.trim().replace(/\s+/g, "").length < 3)
      return alert("Please enter a username with at least 3 characters");
    if (contactType === "email") {
      const basicMessage = basicEmailMessage(email);
      if (basicMessage) return alert(basicMessage);
      if (!emailVerificationToken) return alert("Please verify your email OTP before registration");
    }
    if (contactType === "mobile" && mobile.replace(/\D/g, "").length < 10)
      return alert("Please enter a valid mobile number");
    if (!password || password.length < 6)
      return alert("Password must be at least 6 characters");
    if (!age || isNaN(age) || parseInt(age) < 10 || parseInt(age) > 100)
      return alert("Please enter a valid age (10–100)");
    if (!gender)
      return alert("Please select your gender");
    if (!project)
      return alert("Please select your project/department");
    if (!designation)
      return alert("Please select your designation");

    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/auth/register`, {
        name:        fullName,
        username:    username.trim(),
        email:       contactType === "email" ? email.trim().toLowerCase() : "",
        emailVerificationToken: contactType === "email" ? emailVerificationToken : "",
        mobile:      contactType === "mobile" ? mobile.trim() : "",
        password,
        role: "candidate",
        age:         parseInt(age),
        gender,
        project,
        designation,
      });
      if (nextPath.startsWith("/test/") && res.data?.token && res.data?.user) {
        localStorage.setItem("token", `Bearer ${res.data.token}`);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        alert("Registration Successful. Starting your test now.");
        navigate(nextPath);
        return;
      }
      alert("Registration Successful. Please login to start the test.");
      navigate(loginPathForNext(nextPath));
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
    <div
      className="auth-inline-page"
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
        className="auth-inline-card register-card"
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

          <Row>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input
                type="text"
                placeholder="First name"
                style={inputStyle}
                value={firstName}
                onChange={(e) => setFirstName(capitalizeFirst(e.target.value))}
              />
            </div>
            <div>
              <label style={labelStyle}>Middle Name *</label>
              <input
                type="text"
                placeholder="Middle name"
                style={inputStyle}
                value={middleName}
                onChange={(e) => setMiddleName(capitalizeFirst(e.target.value))}
              />
            </div>
          </Row>

          <div>
            <label style={labelStyle}>Last Name *</label>
            <input
              type="text"
              placeholder="Last name"
              style={inputStyle}
              value={lastName}
              onChange={(e) => setLastName(capitalizeFirst(e.target.value))}
            />
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
            <label style={labelStyle}>Project/Department *</label>
            <select
              style={selectStyle}
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setDesignation("");
              }}
            >
              <option value="" style={{ color: "#333", background: WHITE }}>Select project/department</option>
              {projectNames.map(projectName => (
                <option key={projectName} value={projectName} style={{ color: "#333", background: WHITE }}>
                  {projectName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Designation *</label>
            <select
              style={project ? selectStyle : disabledSelectStyle}
              value={designation}
              disabled={!project}
              onChange={(e) => setDesignation(e.target.value)}
            >
              <option value="" style={{ color: "#333", background: WHITE }}>
                {project ? "Select designation" : "Select project/department first"}
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
                  setEmailCheck({ status: "idle", message: "" });
                  resetEmailOtp();
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
                onChange={(e) => {
                  if (contactType === "email") {
                    setEmail(e.target.value);
                    setEmailCheck({ status: "idle", message: "" });
                    resetEmailOtp();
                  } else {
                    setMobile(e.target.value);
                  }
                }}
              />
              {contactType === "email" && emailCheck.message && (
                <p style={{
                  margin: "5px 0 0",
                  color: emailCheck.status === "valid" ? "#bbf7d0" : emailCheck.status === "checking" ? "rgba(255,255,255,0.75)" : "#fecaca",
                  fontSize: "11px",
                  fontWeight: 700,
                }}>
                  {emailCheck.message}
                </p>
              )}
              {contactType === "email" && (
                <div style={{ display: "grid", gridTemplateColumns: emailOtpSent ? "1fr auto auto" : "auto", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                  {emailOtpSent && (
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Enter 6 digit OTP"
                      style={{ ...inputStyle, minHeight: "40px", padding: "9px 12px" }}
                      value={emailOtp}
                      onChange={(e) => {
                        setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setEmailVerificationToken("");
                      }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={sendEmailOtp}
                    disabled={otpSending || Boolean(emailVerificationToken)}
                    style={{ minHeight: "40px", padding: "0 12px", border: "1px solid rgba(255,255,255,0.42)", borderRadius: "10px", background: emailVerificationToken ? "rgba(187,247,208,0.25)" : "rgba(255,255,255,0.16)", color: WHITE, fontWeight: 800, cursor: otpSending || emailVerificationToken ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                  >
                    {emailVerificationToken ? "Verified" : otpSending ? "Sending..." : emailOtpSent ? "Resend OTP" : "Send OTP"}
                  </button>
                  {emailOtpSent && !emailVerificationToken && (
                    <button
                      type="button"
                      onClick={verifyEmailOtp}
                      disabled={otpVerifying || emailOtp.length !== 6}
                      style={{ minHeight: "40px", padding: "0 12px", border: "none", borderRadius: "10px", background: GREEN, color: WHITE, fontWeight: 800, cursor: otpVerifying || emailOtp.length !== 6 ? "not-allowed" : "pointer", opacity: otpVerifying || emailOtp.length !== 6 ? 0.65 : 1, whiteSpace: "nowrap" }}
                    >
                      {otpVerifying ? "Verifying..." : "Verify"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </Row>

          <div>
            <p style={{ margin: "-2px 0 0", color: "rgba(255,255,255,0.66)", fontSize: "11px", lineHeight: 1.4 }}>
              You can log in later with your username, {contactType === "email" ? "email" : "mobile number"}, and password.
            </p>
          </div>

          <div>
            <label style={labelStyle}>Password *</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Min 6 characters"
                style={passwordInputStyle}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          </div>

          <p style={{ margin: "-2px 0 0", color: "rgba(255,255,255,0.66)", fontSize: "11px", lineHeight: 1.4 }}>
            Public registration creates candidate accounts. Admin accounts are created by Super Admin.
          </p>
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
          <Link to={loginPathForNext(nextPath)} style={{ color: WHITE, fontWeight: "700", textDecoration: "underline" }}>Login</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
