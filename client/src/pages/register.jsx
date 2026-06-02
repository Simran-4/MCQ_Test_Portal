import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import "../pages/auth.css";

function Register() {

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");

  const navigate = useNavigate();

  const handleRegister = async () => {

    try {

      await axios.post(
        "https://mcqtestportal-production.up.railway.app/api/auth/register",
        {
          name,
          email,
          password,
          role,
        }
      );

      alert("Registration Successful");

      navigate("/");

    } catch (err) {

      alert("Registration Failed");

      console.log(err);

    }
  };

  return (

    <div className="auth-page">

      <div className="auth-overlay">

        <div className="auth-card">

          <img
            src="/Logo.png"
            alt="logo"
            className="auth-logo"
          />

          <h1 className="auth-title">
            Register
          </h1>

          <input
            type="text"
            placeholder="Name"
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            type="email"
            placeholder="Email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <select
            className="auth-select"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >

            <option value="student">
              Student
            </option>

            <option value="teacher">
              Teacher
            </option>

            <option value="superadmin">
              Super Admin
            </option>

          </select>

          <button
            className="auth-button"
            onClick={handleRegister}
          >
            Register
          </button>

          <p className="auth-link">

            Already have an account?

            <Link to="/">
              Login
            </Link>

          </p>

        </div>

      </div>

    </div>
  );
}

export default Register;