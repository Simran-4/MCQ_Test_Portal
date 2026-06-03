// src/pages/TestSuiteDetail.jsx  ── NEW PAGE, add this file
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Empty question form state ─────────────────────────────────────────────────
const emptyForm = {
  questionText: "",
  options: ["", "", "", ""],
  correctAnswer: 0,
  explanation: "",
  marks: 1,
};

export default function TestSuiteDetail() {
  const { suiteId }               = useParams();
  const navigate                  = useNavigate();
  const [suite, setSuite]         = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    fetchData();
  }, [suiteId]);

  const fetchData = async () => {
    try {
      const [suiteRes, qRes] = await Promise.all([
        axios.get(`${API}/api/test-suites/${suiteId}`),
        axios.get(`${API}/api/test-suites/${suiteId}/questions`),
      ]);
      setSuite(suiteRes.data);
      setQuestions(qRes.data);
    } catch (err) {
      console.error("Failed to fetch suite data:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── Form handlers ────────────────────────────────────────────────────────────
  const handleOptionChange = (index, value) => {
    const opts = [...form.options];
    opts[index] = value;
    setForm({ ...form, options: opts });
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.questionText.trim()) { setError("Question text is required"); return; }
    if (form.options.some((o) => !o.trim())) { setError("All options must be filled"); return; }

    setSaving(true);
    try {
      const res = await axios.post(`${API}/api/test-suites/${suiteId}/questions`, form);
      setQuestions((prev) => [...prev, res.data]);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await axios.delete(`${API}/api/questions/${qId}`);
      setQuestions((prev) => prev.filter((q) => q._id !== qId));
    } catch {
      alert("Failed to delete question.");
    }
  };

  if (loading) return <div className="min-h-screen bg-[#f5f2ec] flex items-center justify-center text-gray-400">Loading…</div>;
  if (!suite)  return <div className="min-h-screen bg-[#f5f2ec] flex items-center justify-center text-red-500">Test suite not found.</div>;

  return (
    <div className="min-h-screen bg-[#f5f2ec]">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl p-8 shadow-sm">

          {/* ── Breadcrumb ── */}
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-green-900 mb-6"
          >
            ← Back to dashboard
          </button>

          {/* ── Header ── */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-green-900">{suite.name}</h1>
              {suite.description && <p className="text-gray-400 text-sm mt-1">{suite.description}</p>}
            </div>
            <span className="text-xs px-3 py-1 rounded-full font-medium bg-green-100 text-green-800">
              {suite.status}
            </span>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            {questions.length} question{questions.length !== 1 ? "s" : ""}
          </p>

          <hr className="border-gray-100 mb-6" />

          {/* ── Action buttons ── */}
          <div className="flex gap-3 flex-wrap mb-6">
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-green-900 text-white text-sm rounded-xl hover:bg-green-800"
            >
              {showForm ? "Cancel" : "+ Add question"}
            </button>
            <button
              onClick={() => navigate(`/admin/results?suite=${suiteId}`)}
              className="px-4 py-2 border border-gray-200 text-sm rounded-xl text-gray-700 hover:bg-gray-50"
            >
              View results
            </button>
          </div>

          {/* ── Add Question Form ── */}
          {showForm && (
            <div className="border border-green-200 bg-green-50 rounded-xl p-5 mb-6">
              <h2 className="font-semibold text-green-900 mb-4">New question</h2>

              {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Question *</label>
                  <textarea
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-800 bg-white"
                    placeholder="Enter the question text here…"
                    value={form.questionText}
                    onChange={(e) => setForm({ ...form, questionText: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600 block mb-2">Options * (select the correct answer)</label>
                  <div className="space-y-2">
                    {form.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="correct"
                          checked={form.correctAnswer === i}
                          onChange={() => setForm({ ...form, correctAnswer: i })}
                          className="accent-green-800"
                        />
                        <input
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-800 bg-white"
                          placeholder={`Option ${i + 1}`}
                          value={opt}
                          onChange={(e) => handleOptionChange(i, e.target.value)}
                        />
                        {form.correctAnswer === i && (
                          <span className="text-xs text-green-700 font-medium">✓ Correct</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-sm text-gray-600 block mb-1">Explanation (optional)</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-800 bg-white"
                      placeholder="Why is this the correct answer?"
                      value={form.explanation}
                      onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-sm text-gray-600 block mb-1">Marks</label>
                    <input
                      type="number"
                      min={1}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-800 bg-white"
                      value={form.marks}
                      onChange={(e) => setForm({ ...form, marks: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="px-5 py-2 bg-green-900 text-white text-sm rounded-lg hover:bg-green-800 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save question"}
                </button>
              </div>
            </div>
          )}

          {/* ── Questions List ── */}
          {questions.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
              <p className="text-gray-400 text-sm">No questions yet. Click "Add question" to start.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={q._id} className="border border-gray-200 rounded-xl p-4 group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        <span className="text-gray-400 mr-2">Q{idx + 1}.</span>
                        {q.questionText}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1">
                        {q.options.map((opt, i) => (
                          <p
                            key={i}
                            className={`text-xs px-2 py-1 rounded-lg ${
                              i === q.correctAnswer
                                ? "bg-green-100 text-green-800 font-medium"
                                : "text-gray-500"
                            }`}
                          >
                            {String.fromCharCode(65 + i)}. {opt}
                          </p>
                        ))}
                      </div>
                      {q.explanation && (
                        <p className="text-xs text-gray-400 mt-2 italic">💡 {q.explanation}</p>
                      )}
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleDeleteQuestion(q._id)}
                        className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-red-500 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
