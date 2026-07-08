import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { getAuthHeaders } from "../utils/auth";
import { downloadCertificatePDF } from "../utils/certificate";
import "./candidateDashboard.css";

const API = import.meta.env.VITE_API_URL || "";

const getAvailability = (suite) => {
  const now = new Date();
  if (suite.startDate && now < new Date(suite.startDate)) {
    return { available: false, reason: `Opens ${new Date(suite.startDate).toLocaleString()}` };
  }
  if (suite.endDate && now > new Date(suite.endDate)) {
    return { available: false, reason: "This test has closed" };
  }
  return { available: true, reason: "" };
};

const getResultSuiteId = (result) => String(result?.suiteId?._id || result?.suiteId || "");

const getResultPercentage = (result) =>
  result?.totalMarks > 0 ? Math.round(((result.score || 0) / result.totalMarks) * 100) : 0;

const isPassedResult = (result) =>
  typeof result?.passed === "boolean" ? result.passed : getResultPercentage(result) >= 50;

const formatDateTime = (value, language) => value ? new Date(value).toLocaleString(
  language === "mr" ? "mr-IN" : language === "hi" ? "hi-IN" : "en-IN",
  {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }
) : "-";

const getUserId = (user) => String(user?._id || user?.id || "");

const getAssignmentDateForUser = (suite, user) => {
  const userId = getUserId(user);
  if (!userId) return null;
  const match = (suite.assignedUsersMeta || []).find(entry =>
    String(entry?.user?._id || entry?.user || "") === userId
  );
  return match?.assignedAt ? new Date(match.assignedAt) : null;
};

const latestPassedResultForSuite = (results, suiteId) =>
  results
    .filter(result => getResultSuiteId(result) === String(suiteId) && isPassedResult(result))
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0] || null;

const blocksRetake = (result, assignmentDate) =>
  Boolean(result && (!assignmentDate || new Date(result.submittedAt || 0) >= assignmentDate));

function MetricCard({ icon, label, value, detail, tone = "green", progress }) {
  return (
    <article className={`candidate-metric-card ${tone}`}>
      <span className="candidate-metric-icon" aria-hidden="true">{icon}</span>
      <div>
        <h3>{label}</h3>
        <strong>{value}</strong>
        <p>{detail}</p>
        {typeof progress === "number" && (
          <span className="candidate-progress" aria-hidden="true">
            <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </span>
        )}
      </div>
    </article>
  );
}

export default function CandidateDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [suites, setSuites] = useState([]);
  const [pastResults, setPastResults] = useState([]);
  const [activeTab, setActiveTab] = useState("available");
  const [loading, setLoading] = useState(true);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const headers = getAuthHeaders();
        const userSearch = user.email || user.mobile || user.username || user.name || "";
        const [suitesRes, resultsRes] = await Promise.all([
          axios.get(`${API}/api/test-suites`, { headers }),
          axios.get(`${API}/api/results/all`, { headers, params: { search: userSearch } }),
        ]);
        setSuites(suitesRes.data.filter(suite => suite.status === "active"));
        setPastResults(resultsRes.data);
      } catch (error) {
        console.error("Dashboard Load Error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.email, user.mobile, user.username, user.name]);

  const historyResults = useMemo(
    () => [...pastResults].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)),
    [pastResults]
  );
  const passedCount = historyResults.filter(isPassedResult).length;
  const failedCount = historyResults.length - passedCount;
  const completionRate = historyResults.length ? Math.round((passedCount / historyResults.length) * 100) : 0;
  const failureRate = historyResults.length ? Math.round((failedCount / historyResults.length) * 100) : 0;

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <div className="candidate-dashboard-page">
      <header className="candidate-dashboard-header">
        <div className="candidate-identity">
          <h1>{t("candidateGreeting", { name: user.name || t("candidateFallback") })}</h1>
          <p>{[user.designation, user.project].filter(Boolean).join(" • ") || t("candidateProfileFallback")}</p>
        </div>
        <div className="candidate-header-actions">
          <LanguageSwitcher className="candidate-language-switcher" />
          <span className="candidate-action-divider" aria-hidden="true" />
          <button type="button" className="candidate-logout" onClick={logout}>
            {t("logout")}
          </button>
        </div>
      </header>

      <nav className="candidate-dashboard-tabs" aria-label={t("candidateDashboardTabs")}>
        <button
          type="button"
          className={activeTab === "available" ? "active" : ""}
          onClick={() => setActiveTab("available")}
        >
          {t("availableTests")}
        </button>
        <button
          type="button"
          className={activeTab === "history" ? "active" : ""}
          onClick={() => setActiveTab("history")}
        >
          {t("historyCertificates")}
        </button>
      </nav>

      <main className="candidate-dashboard-content">
        {loading ? (
          <p className="candidate-empty-state">{t("loading")}</p>
        ) : activeTab === "available" ? (
          <section className="candidate-test-grid">
            {suites.length === 0 ? (
              <p className="candidate-empty-state">{t("noActiveTests")}</p>
            ) : suites.map(suite => {
              const { available, reason } = getAvailability(suite);
              const latestPassedAttempt = latestPassedResultForSuite(pastResults, suite._id);
              const assignmentDate = getAssignmentDateForUser(suite, user);
              const passedAttempt = blocksRetake(latestPassedAttempt, assignmentDate)
                ? latestPassedAttempt
                : null;
              const failedAttempt = pastResults.find(result =>
                getResultSuiteId(result) === String(suite._id) && !isPassedResult(result)
              );
              const reassignedAfterPass = latestPassedAttempt && assignmentDate && !passedAttempt;

              return (
                <article
                  className={`candidate-test-card ${available && !passedAttempt ? "" : "unavailable"}`}
                  key={suite._id}
                >
                  <h3>{suite.name}</h3>
                  {suite.description && <p>{suite.description}</p>}
                  <div className="candidate-test-meta">
                    <span>◷ {suite.duration || 30} {t("minutesShort")}</span>
                    <span>• {suite.effectiveQuestionCount || suite.questionCount || 0} {t("questions")}</span>
                    {suite.questionSelectionMode === "selected" && <span>• {t("selectedSet")}</span>}
                    {(suite.questionSelectionMode === "random" || (!suite.questionSelectionMode && suite.questionsToServe)) && suite.questionsToServe && (
                      <span>• {suite.questionsToServe} {t("randomQuestions")}</span>
                    )}
                  </div>

                  {suite.startDate && (
                    <p className="candidate-test-window">
                      {new Date(suite.startDate).toLocaleString()} — {suite.endDate ? new Date(suite.endDate).toLocaleString() : t("noEndDate")}
                    </p>
                  )}

                  {!available ? (
                    <div className="candidate-test-notice neutral">🔒 {reason}</div>
                  ) : passedAttempt ? (
                    <div className="candidate-test-notice success">{t("alreadyAttempted")}</div>
                  ) : (
                    <button
                      type="button"
                      className="candidate-start-button"
                      onClick={() => navigate(`/test/${suite._id}`)}
                    >
                      {reassignedAfterPass || failedAttempt ? t("retestAssessment") : t("startAssessment")}
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        ) : (
          <>
            <section className="candidate-metrics" aria-label={t("historySummary")}>
              <MetricCard
                icon="▤"
                label={t("totalTests")}
                value={historyResults.length}
                detail={t("testsAttempted")}
              />
              <MetricCard
                icon="✓"
                label={t("completedTests")}
                value={passedCount}
                detail={t("completionRate", { rate: completionRate })}
                progress={completionRate}
              />
              <MetricCard
                icon="×"
                label={t("failedTests")}
                value={failedCount}
                detail={t("failureRate", { rate: failureRate })}
                progress={failureRate}
                tone="red"
              />
              <MetricCard
                icon="▣"
                label={t("certificatesEarned")}
                value={passedCount}
                detail={t("certificatesGenerated")}
              />
            </section>

            <section className="candidate-history-list">
              {historyResults.length === 0 ? (
                <p className="candidate-empty-state">{t("noResults")}</p>
              ) : historyResults.map(result => {
                const percentage = getResultPercentage(result);
                const historySuiteId = typeof result.suiteId === "string" ? result.suiteId : result.suiteId?._id;
                const passed = isPassedResult(result);

                return (
                  <article className="candidate-history-card" key={result._id}>
                    <div className="candidate-history-info">
                      <h4>{result.suiteId?.name || t("assessment")}</h4>
                      <time>{formatDateTime(result.submittedAt, i18n.resolvedLanguage || i18n.language)}</time>
                    </div>
                    <div className={`candidate-history-score ${passed ? "passed" : "failed"}`}>
                      <strong>{result.score} / {result.totalMarks} ({percentage}%)</strong>
                      <span>{passed ? t("passedStatus") : t("failedStatus")}</span>
                    </div>
                    <div className="candidate-history-actions">
                      {passed ? (
                        <>
                          <button
                            type="button"
                            className="primary"
                            onClick={() => downloadCertificatePDF(result, {}, "english")}
                          >
                            {t("englishCertificate")}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadCertificatePDF(result, {}, "marathi")}
                          >
                            {t("marathiCertificate")}
                          </button>
                        </>
                      ) : historySuiteId ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => navigate(`/test/${historySuiteId}`)}
                        >
                          {t("retest")}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
