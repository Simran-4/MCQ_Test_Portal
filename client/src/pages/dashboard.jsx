import { useNavigate } from "react-router-dom";
import "./dashboard.css";

function Dashboard() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <div className="dashboard-page">

      <div className="dashboard-card">

        <div className="dashboard-top">

          <div>
            <h1>Admin Dashboard</h1>
            

            <p>
              Welcome back! Manage questions and view results.
            </p>
          </div>

          <img
            src="/Logo.png"
            alt="logo"
            className="dashboard-logo"
          />

        </div>

        <div className="dashboard-line"></div>

        <div className="dashboard-buttons">

          <button onClick={() => navigate("/add-question")}>
            Add Question
          </button>

          <button onClick={() => navigate("/view-questions")}>
            View Questions
          </button>

          <button onClick={() => navigate("/view-results")}>
            View Results
          </button>

          <button onClick={logout}>
            Logout
          </button>

          <button
  onClick={() => navigate("/settings")}
>
  Exam Settings
</button>

        </div>

      </div>

    </div>
  );
}

export default Dashboard;