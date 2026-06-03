import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";


const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const STATUS_STYLES = {
  active:    "bg-green-100 text-green-800",
  draft:     "bg-gray-100 text-gray-600",
  scheduled: "bg-amber-100 text-amber-800",
};

function SuiteModal({ suite, onClose, onSave }) {
  const [name, setName]        = useState(suite?.name || "");
  const [description, setDesc] = useState(suite?.description || "");
  const [status, setStatus]    = useState(suite?.status || "draft");
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setLoading(true);
    try {
      if (suite) {
        const res = await axios.put(`${API}/api/test-suites/${suite._id}`, { name, description, status });
        onSave(res.data, "edit");
      } else {
        const res = await axios.post(`${API}/api/test-suites`, { name, description, status });
        onSave(res.data, "create");
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {suite ? "Edit test suite" : "New test suite"}
        </h2>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Name *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-800"
              placeholder="e.g. Botany — Unit 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1">Description (optional)</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-800"
              placeholder="Short description of this test"
              value={description}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1">Status</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-800"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-green-900 text-white hover:bg-green-800 disabled:opacity-50"
          >
            {loading ? "Saving..." : suite ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [suites, setSuites]        = useState([]);
  const [loading, setLoading]      = useState(true);
  const [showModal, setShowModal]  = useState(false);
  const [editingSuite, setEditing] = useState(null);

  useEffect(() => {
    fetchSuites();
  }, []);

  const fetchSuites = async () => {
    try {
      const res = await axios.get(`${API}/api/test-suites`);
      setSuites(res.data);
    } catch (err) {
      console.error("Failed to fetch test suites:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleModalSave = (suite, action) => {
    if (action === "create") {
      setSuites((prev) => [{ ...suite, questionCount: 0 }, ...prev]);
    } else {
      setSuites((prev) => prev.map((s) => (s._id === suite._id ? { ...s, ...suite } : s)));
    }
  };

  const handleDelete = async (suiteId, suiteName) => {
    if (!window.confirm(`Delete "${suiteName}" and all its questions? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/api/test-suites/${suiteId}`);
      setSuites((prev) => prev.filter((s) => s._id !== suiteId));
    } catch (err) {
      alert("Failed to delete test suite.");
    }
  };

  const openCreate = () => { setEditing(null); setShowModal(true); };
  const openEdit   = (suite) => { setEditing(suite); setShowModal(true); };

  return (
    <div className="min-h-screen bg-[#f5f2ec]">
      <div className="max-w-4xl mx-auto px-4 py-10">

        <div className="bg-white rounded-2xl p-8 shadow-sm">

          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-green-900">Admin Dashboard</h1>
              <p className="text-gray-500 mt-1">Manage your test suites and questions.</p>
            </div>
            <div className="w-14 h-14 rounded-full border border-gray-100 overflow-hidden bg-gray-50 flex items-center justify-center">
              <img src="/Logo.png" alt="Logo" className="w-full h-full object-cover" onError={(e) => { e.target.style.display='none'; }} />
            </div>
          </div>

          {/* Top actions */}
          <div className="flex gap-3 flex-wrap pb-6 border-b border-gray-100">
            <button
              onClick={() => navigate("/view-results")}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View results
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Exam settings
            </button>
            <button
              onClick={() => { localStorage.removeItem("token"); navigate("/"); }}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Logout
            </button>
          </div>

          {/* Test suites */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Test suites</p>
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-900 text-white text-sm rounded-lg hover:bg-green-800"
              >
                <span className="text-lg leading-none">+</span> New test suite
              </button>
            </div>

            {loading ? (
              <p className="text-gray-400 text-sm py-8 text-center">Loading…</p>
            ) : suites.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="text-gray-400 text-sm mb-3">No test suites yet.</p>
                <button onClick={openCreate} className="text-green-800 text-sm font-medium underline">
                  Create your first test suite →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {suites.map((suite) => (
                  <div
                    key={suite._id}
                    className="border border-gray-200 rounded-xl p-4 hover:border-green-800 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/admin/test-suites/${suite._id}`)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{suite.name}</p>
                        {suite.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{suite.description}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {suite.questionCount ?? 0} question{suite.questionCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[suite.status] || STATUS_STYLES.draft}`}>
                        {suite.status}
                      </span>
                    </div>

                    <div
                      className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => navigate(`/admin/test-suites/${suite._id}`)}
                        className="text-xs px-3 py-1 bg-green-900 text-white rounded-lg hover:bg-green-800"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => openEdit(suite)}
                        className="text-xs px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(suite._id, suite.name)}
                        className="text-xs px-3 py-1 border border-gray-200 rounded-lg hover:bg-red-50 text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <SuiteModal
          suite={editingSuite}
          onClose={() => setShowModal(false)}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}
