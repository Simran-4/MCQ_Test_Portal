import { useNavigate } from "react-router-dom";
import { useState } from "react";
import axios from "axios";

function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleLogin = async () => {

    try {

      const res = await axios.post(
        "https://mcqtestportal-production.up.railway.app/api/auth/login",
        {
          email,
          password,
        }
      );

      localStorage.setItem(
        "token",
        res.data.token
      );

      localStorage.setItem(
        "user",
        JSON.stringify(res.data.user)
      );

      // Role Based Navigation

      if (res.data.user.role === "teacher") {

        navigate("/dashboard");

      } 
      else if (res.data.user.role === "superadmin") {

        navigate("/superadmin");

      } 
      else {

        navigate("/test");

      }

    } catch (err) {

      alert("Login Failed");

      console.log(err);

    }
  };

  return (

    <div className="login-page">

      <div className="login-card">

        <img
          src="/Logo.png"
          alt="logo"
          className="logo"
        />

        <h1>Login</h1>

        <input
          type="email"
          placeholder="Email"
          onChange={(e) =>
            setEmail(e.target.value)
          }
        />

        <input
          type="password"
          placeholder="Password"
          onChange={(e) =>
            setPassword(e.target.value)
          }
        />

        <button onClick={handleLogin}>
          Login
        </button>

        <p
          className="register-link"
          onClick={() => navigate("/register")}
        >
          Don’t have an account? Register
        </p>

      </div>

    </div>
  );
}

export default Login;