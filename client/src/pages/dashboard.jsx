import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./dashboard.css";

function Dashboard() {

  const navigate = useNavigate();

  const { t } = useTranslation();

  const logout = () => {

    localStorage.clear();

    navigate("/");
  };

  return (

    <>

      {/* DASHBOARD */}
      <div className="dashboard-page">

        <div className="dashboard-card">

          <div className="dashboard-top">

            <div>

              <h1>
                {t("dashboard")}
              </h1>

              <p>
                {t("welcome")}
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

            <button
              onClick={() =>
                navigate("/add-question")
              }
            >
              {t("addQuestion")}
            </button>

            <button
              onClick={() =>
                navigate("/view-questions")
              }
            >
              {t("viewQuestions")}
            </button>

            <button
              onClick={() =>
                navigate("/view-results")
              }
            >
              {t("viewResults")}
            </button>

            <button onClick={logout}>
              {t("logout")}
            </button>

            <button
              onClick={() =>
                navigate("/settings")
              }
            >
              {t("examSettings")}
            </button>

          </div>

        </div>

      </div>

    </>

  );
}

export default Dashboard;
