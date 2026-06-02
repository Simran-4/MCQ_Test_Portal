import { useEffect, useState } from "react";
import axios from "axios";
import "./auth.css";

function AdminSettings() {

  const [settings, setSettings] =
    useState({

      totalQuestions: 20,
      examDuration: 30,
    });

  useEffect(() => {

    fetchSettings();

  }, []);




  const fetchSettings = async () => {

    try {

      const res = await axios.get(
        "https://mcqtestportal-production.up.railway.app/api/settings"
      );

      if (res.data) {

        setSettings({

          totalQuestions:
            res.data.totalQuestions || 20,

          examDuration:
            res.data.examDuration || 30,
        });
      }

    } catch (err) {

      console.log(err);
    }
  };




  const handleSave = async () => {

    try {

      await axios.post(
        "https://mcqtestportal-production.up.railway.app/api/settings/save",
        settings
      );

      alert(
        "Settings Saved Successfully"
      );

    } catch (err) {

      console.log(err);

      alert(
        "Error Saving Settings"
      );
    }
  };




  return (

    <div className="exam-settings-page">
        <img
  src="/Logo.png"
  alt="logo"
  className="page-logo"
/>

      <div className="exam-settings-container">

        {/* HEADER */}
        <div className="settings-header">

          <div>

            <h1>
              Exam Settings
            </h1>

            <p>
              Configure exam timing and
              question limits
            </p>

          </div>

          <img
            src="/Logo.png"
            alt="logo"
            className="settings-logo"
          />

        </div>





        {/* TOTAL QUESTIONS */}
        <div className="settings-input-group">

          <label>
            Total Questions
          </label>

          <input
            type="number"

            value={
              settings.totalQuestions
            }

            placeholder="Enter total questions"

            onChange={(e) =>
              setSettings({

                ...settings,

                totalQuestions:
                  e.target.value,
              })
            }
          />

        </div>





        {/* EXAM TIME */}
        <div className="settings-input-group">

          <label>
            Total Time (Minutes)
          </label>

          <input
            type="number"

            value={
              settings.examDuration
            }

            placeholder="Enter exam duration"

            onChange={(e) =>
              setSettings({

                ...settings,

                examDuration:
                  e.target.value,
              })
            }
          />

        </div>





        {/* BUTTON */}
        <button
          className="save-settings-btn"

          onClick={handleSave}
        >
          Save Settings
        </button>

      </div>

    </div>
  );
}

export default AdminSettings;