import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import "./dashboard.css";

function Dashboard() {

  const navigate = useNavigate();

  useEffect(() => {

    const script = document.createElement("script");

    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";

    script.async = true;

    document.body.appendChild(script);

    window.googleTranslateElementInit = () => {

      if (
        window.google &&
        window.google.translate
      ) {

        new window.google.translate.TranslateElement(
          {
            pageLanguage: "en",
            includedLanguages: "en,hi,mr",
            layout:
              window.google.translate.TranslateElement.InlineLayout.SIMPLE,
          },
          "google_translate_element"
        );
      }
    };

  }, []);

  const logout = () => {

    localStorage.clear();

    navigate("/");
  };

  return (

    <>

      {/* GOOGLE TRANSLATE */}
      <div
        id="google_translate_element"
        style={{
          position: "fixed",
          top: "20px",
          left: "20px",
          zIndex: 999999,
          background: "white",
          padding: "10px",
          borderRadius: "10px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        }}
      ></div>

      {/* DASHBOARD */}
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

            <button
              onClick={() =>
                navigate("/add-question")
              }
            >
              Add Question
            </button>

            <button
              onClick={() =>
                navigate("/view-questions")
              }
            >
              View Questions
            </button>

            <button
              onClick={() =>
                navigate("/view-results")
              }
            >
              View Results
            </button>

            <button onClick={logout}>
              Logout
            </button>

            <button
              onClick={() =>
                navigate("/settings")
              }
            >
              Exam Settings
            </button>

          </div>

        </div>

      </div>

    </>

  );
}

export default Dashboard;