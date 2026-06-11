import { useEffect, useState } from "react";
import axios from "axios";
import "./auth.css";
import { getAuthHeaders } from "../utils/auth";

// Use an environment variable or a clean constant for the API
const API_BASE = "https://charismatic-happiness-production-dc36.up.railway.app/api";

function AdminSettings() {
  const [settings, setSettings] = useState({
    totalQuestions: 20,
    examDuration: 30,
    passingPercentage: 50, // ✅ Added Feature 8
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API_BASE}/settings`);
      if (res.data) {
        setSettings({
          totalQuestions: parseInt(res.data.totalQuestions) || 20,
          examDuration: parseInt(res.data.examDuration) || 30,
          passingPercentage: parseInt(res.data.passingPercentage) || 50,
        });
      }
    } catch (err) {
      console.error("Fetch Settings Error:", err);
    }
  };

  const handleSave = async () => {
    // Validation
    if (settings.totalQuestions < 1) return alert("Questions must be at least 1");
    if (settings.examDuration < 1) return alert("Time must be at least 1 minute");
    if (settings.passingPercentage < 1 || settings.passingPercentage > 100) {
      return alert("Passing percentage must be between 1 and 100");
    }

    try {
      await axios.post(`${API_BASE}/settings/save`, {
        totalQuestions: parseInt(settings.totalQuestions),
        examDuration: parseInt(settings.examDuration),
        passingPercentage: parseInt(settings.passingPercentage),
      }, { headers: getAuthHeaders() });
      alert("Settings Saved Successfully");
    } catch (err) {
      console.error("Save Settings Error:", err);
      alert("Error Saving Settings");
    }
  };

  return (
    <div className="exam-settings-page">
      <img src="/Logo.png" alt="logo" className="page-logo" />

      <div className="exam-settings-container">
        <div className="settings-header">
          <div>
            <h1>Global Settings</h1>
            <p>Configure exam parameters and passing criteria</p>
          </div>
        </div>

        {/* TOTAL QUESTIONS */}
        <div className="settings-input-group">
          <label>Total Questions (Pool Size)</label>
          <input
            type="number"
            value={settings.totalQuestions}
            onChange={(e) => setSettings({ ...settings, totalQuestions: e.target.value })}
          />
        </div>

        {/* EXAM TIME */}
        <div className="settings-input-group">
          <label>Duration (Minutes)</label>
          <input
            type="number"
            value={settings.examDuration}
            onChange={(e) => setSettings({ ...settings, examDuration: e.target.value })}
          />
        </div>

        {/* PASSING PERCENTAGE ✅ FEATURE 8 */}
        <div className="settings-input-group">
          <label>Passing Percentage (%)</label>
          <input
            type="number"
            min="1"
            max="100"
            value={settings.passingPercentage}
            onChange={(e) => setSettings({ ...settings, passingPercentage: e.target.value })}
          />
          <small style={{ color: "#666", fontSize: "11px" }}>
            Candidates scoring below this will not receive a certificate.
          </small>
        </div>

        <button className="save-settings-btn" onClick={handleSave}>
          Save Configuration
        </button>
      </div>
    </div>
  );
}

export default AdminSettings;
