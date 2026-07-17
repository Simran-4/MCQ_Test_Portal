// src/pages/StudentTest.jsx
import { useCallback, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { getAuthHeaders, getCurrentUser } from "../utils/auth";
import { downloadCertificatePDF } from "../utils/certificate";

const API = import.meta.env.VITE_API_URL || "";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";
const ORANGE     = "#f97316";

// ── Helper: get categories for a question (always returns array) ──
function getQuestionCats(q) {
  if (Array.isArray(q.category) && q.category.length > 0) return q.category;
  if (typeof q.category === "string" && q.category.trim()) return [q.category.trim()];
  return ["Uncategorized"];
}

// ── Scoring helpers ──────────────────────────────────────────
function getCategoryAnswerMap(q) {
  if (!q?.categoryCorrectAnswers) return {};
  if (q.categoryCorrectAnswers instanceof Map) return Object.fromEntries(q.categoryCorrectAnswers);
  return q.categoryCorrectAnswers;
}

function uniqueIndexes(indexes) {
  return [...new Set((Array.isArray(indexes) ? indexes : []).map(Number))]
    .filter(Number.isInteger);
}

function getCorrectAnswersForCategory(q, cat) {
  const fallback = uniqueIndexes(Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]);
  const map = getCategoryAnswerMap(q);
  const categoryAnswers = uniqueIndexes(map[cat]);
  return categoryAnswers.length > 0 ? categoryAnswers : fallback;
}

function scoreAnswers(selectedArr, correctArr) {
  const totalCorrect = correctArr.length;
  if (totalCorrect === 0) return { earnedFrac: 0, isRight: false, correctArr };
  const hits         = selectedArr.filter(i => correctArr.includes(i)).length;
  const wrongs       = selectedArr.filter(i => !correctArr.includes(i)).length;
  const earnedFrac   = Math.max(0, (hits - wrongs) / totalCorrect);
  return { earnedFrac, isRight: earnedFrac === 1, correctArr };
}

function scoreQuestion(q, selectedArr) {
  const cats = getQuestionCats(q);
  const categoryScores = cats.map(cat => scoreAnswers(selectedArr, getCorrectAnswersForCategory(q, cat)));
  const best = categoryScores.reduce((winner, current) =>
    current.earnedFrac > winner.earnedFrac ? current : winner,
    { earnedFrac: 0, isRight: false, correctArr: [] }
  );
  return best;
}

function getReviewCorrectOptions(q) {
  if (isTheoryQuestion(q)) return [];
  const allCorrect = new Set(uniqueIndexes(Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]));
  const answerMap = getCategoryAnswerMap(q);
  Object.values(answerMap || {}).forEach(indexes => {
    uniqueIndexes(indexes).forEach(index => allCorrect.add(index));
  });
  return [...allCorrect].sort((a, b) => a - b);
}

function getSingleSelectedOption(answer) {
  return Array.isArray(answer) && Number.isInteger(answer[0]) ? answer[0] : null;
}

function isTheoryQuestion(q) {
  return q?.questionType === "theory";
}

function isQuestionImage(value) {
  const source = String(value || "").trim();
  return source.startsWith("data:image/") || /^https?:\/\/.+/i.test(source);
}

function isQuestionVideo(value) {
  const source = String(value || "").trim();
  return source.startsWith("data:video/") || /^https?:\/\/.+\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(source);
}

function isQuestionAnswered(q, answers) {
  const answer = answers[q._id];
  if (isTheoryQuestion(q)) return typeof answer === "string" && answer.trim().length > 0;
  return Array.isArray(answer) && answer.length > 0;
}

// FIXED: each question's marks/score count toward ALL its categories
function buildCategoryStats(questions, answers) {
  const cats = {};
  questions.forEach(q => {
    if (isTheoryQuestion(q)) return;
    const questionCats = getQuestionCats(q);
    const marks        = q.marks ?? 1;
    const selectedOption = getSingleSelectedOption(answers[q._id]);
    const selectedArr = selectedOption === null ? [] : [selectedOption];

    questionCats.forEach(cat => {
      const { earnedFrac, isRight } = scoreAnswers(selectedArr, getCorrectAnswersForCategory(q, cat));
      if (!cats[cat]) cats[cat] = { total: 0, correct: 0, marks: 0, earnedMarks: 0 };
      cats[cat].total       += 1;
      cats[cat].marks       += marks;
      cats[cat].earnedMarks += earnedFrac * marks;
      if (isRight) cats[cat].correct += 1;
    });
  });
  return cats;
}

function pctColor(pct) {
  if (pct >= 75) return GREEN;
  if (pct >= 50) return "#f59e0b";
  return "#dc2626";
}

function gradeInfo(pct) {
  if (pct >= 70) {
    return {
      label: "High",
      color: GREEN,
      bg: "#ecfdf3",
      message: "Excellent performance. Keep maintaining this level and continue building consistency.",
    };
  }
  if (pct >= 40) {
    return {
      label: "Moderate",
      color: "#f59e0b",
      bg: "#fff7ed",
      message: "You have a moderate level of accuracy. Keep practicing to improve your skills and aim for a high score.",
    };
  }
  return {
    label: "Low",
    color: "#dc2626",
    bg: "#fef2f2",
    message: "More practice is recommended. Review the answers carefully and try again to improve your score.",
  };
}

function getResultSuiteId(result) {
  return String(result?.suiteId?._id || result?.suiteId || "");
}

function getResultPercentage(result) {
  return result?.totalMarks > 0 ? Math.round(((result.score || 0) / result.totalMarks) * 100) : 0;
}

function isPassedResult(result) {
  return typeof result?.passed === "boolean" ? result.passed : getResultPercentage(result) >= 50;
}

function getUserId(user) {
  return String(user?._id || user?.id || "");
}

function getAssignmentDateForUserId(suite, userId) {
  if (!userId) return null;
  const match = (suite?.assignedUsersMeta || []).find(entry =>
    String(entry?.user?._id || entry?.user || "") === userId
  );
  return match?.assignedAt ? new Date(match.assignedAt) : null;
}

function latestPassedResultForSuite(results, suiteId) {
  return (results || [])
    .filter(res => getResultSuiteId(res) === String(suiteId) && isPassedResult(res))
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0] || null;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function normalizeLanguage(value) {
  const base = String(value || "en").trim().toLowerCase().split(/[-_]/)[0];
  return ["en", "hi", "mr"].includes(base) ? base : "en";
}

function remapAnswersByQuestionId(prevAnswers, nextQuestions) {
  const nextAnswers = {};
  nextQuestions.forEach(question => {
    const answer = prevAnswers[question._id];
    if (answer !== undefined) nextAnswers[question._id] = answer;
  });
  return nextAnswers;
}

export default function StudentTest() {
  const { suiteId } = useParams();
  const navigate    = useNavigate();
  const { t, i18n } = useTranslation();
  const selectedLanguage = normalizeLanguage(i18n.resolvedLanguage || i18n.language);

  const [suite, setSuite]           = useState(null);
  const [questions, setQuestions]   = useState([]);
  const [answers, setAnswers]       = useState({});
  const [loading, setLoading]       = useState(true);
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [instructionTranslationLoading, setInstructionTranslationLoading] = useState(false);
  const [translatedInstructions, setTranslatedInstructions] = useState("");
  const [instructionTranslationError, setInstructionTranslationError] = useState("");
  const [testStarted, setTestStarted] = useState(false);
  const [instructionsAccepted, setInstructionsAccepted] = useState(false);
  const [startingTest, setStartingTest] = useState(false);
  const [startError, setStartError] = useState("");
  const [showReviewAnswers, setShowReviewAnswers] = useState(false);
  const [blockedResult, setBlockedResult] = useState(null);

  const [markedForReview, setMarkedForReview] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passingPct, setPassingPct]   = useState(50);
  const [currentQuestion, setCurrentQuestion] = useState(0);

  const [timeLeft, setTimeLeft]       = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const timerRef                      = useRef(null);
  const autoSubmitRef                 = useRef(() => {});
  const answersRef                    = useRef(answers);
  const loadedLanguageRef             = useRef("");
  const lastAttemptedLanguageRef       = useRef("");
  const languageRequestRef            = useRef(0);
  const languageAbortRef              = useRef(null);
  const questionSelectionTokenRef     = useRef("");
  const testStartedAtRef              = useRef(null);
  const startingTestRef               = useRef(false);

  useEffect(() => { answersRef.current = answers; }, [answers]);

  const loadQuestionsForLanguage = useCallback(async (language) => {
    const requestedLanguage = normalizeLanguage(language);
    const requestId = languageRequestRef.current + 1;
    languageRequestRef.current = requestId;
    lastAttemptedLanguageRef.current = requestedLanguage;
    languageAbortRef.current?.abort();
    const controller = new AbortController();
    languageAbortRef.current = controller;
    setTranslationLoading(true);
    setTranslationError("");

    try {
      const qRes = await axios.get(`${API}/api/questions/${suiteId}/random`, {
        headers: getAuthHeaders(),
        signal: controller.signal,
        params: {
          language: requestedLanguage,
          ...(questionSelectionTokenRef.current
            ? { selectionToken: questionSelectionTokenRef.current }
            : {}),
        },
      });
      if (requestId !== languageRequestRef.current) return null;

      const nextQuestions = Array.isArray(qRes.data) ? qRes.data : [];
      questionSelectionTokenRef.current =
        nextQuestions[0]?._questionSelectionToken || "";
      const translationStatus = nextQuestions[0]?._translationStatus || "ready";
      setQuestions(nextQuestions);
      setAnswers(prevAnswers =>
        remapAnswersByQuestionId(prevAnswers, nextQuestions)
      );

      if (translationStatus === "failed") {
        setTranslationError(
          "Translation is temporarily unavailable. The original questions are shown; select Retry to translate them."
        );
      } else {
        loadedLanguageRef.current = requestedLanguage;
        if (translationStatus === "partial") {
          setTranslationError(
            "Some question text could not be translated. You can retry without losing your answers."
          );
        }
      }
      return nextQuestions;
    } catch (err) {
      if (axios.isCancel(err) || err.code === "ERR_CANCELED") return null;
      if (requestId === languageRequestRef.current) {
        setTranslationError(
          err.response?.data?.message ||
          "Could not translate the questions. Check your connection and retry."
        );
      }
      throw err;
    } finally {
      if (languageAbortRef.current === controller) {
        languageAbortRef.current = null;
      }
      if (requestId === languageRequestRef.current) {
        setTranslationLoading(false);
      }
    }
  }, [suiteId]);

  useEffect(() => {
    setAnswers(prev => {
      const normalized = {};
      Object.entries(prev).forEach(([questionId, selected]) => {
        const q = questions.find(item => item._id === questionId);
        if (isTheoryQuestion(q)) {
          if (typeof selected === "string" && selected.trim()) normalized[questionId] = selected;
          return;
        }
        const selectedOption = getSingleSelectedOption(selected);
        if (selectedOption !== null) normalized[questionId] = [selectedOption];
      });
      const alreadyNormalized = Object.keys(normalized).length === Object.keys(prev).length &&
        Object.entries(normalized).every(([questionId, selected]) => {
          const previous = prev[questionId];
          if (typeof selected === "string") return selected === previous;
          return Array.isArray(previous) && previous.length === 1 && selected[0] === previous[0];
        });
      return alreadyNormalized ? prev : normalized;
    });
  }, [questions]);

  const user = getCurrentUser();
  const userId = getUserId(user);
  const userSearch = user.email || user.mobile || user.username || user.name || "";
  const shouldCheckPreviousAttempt = user.role === "candidate" && Boolean(userSearch);

  useEffect(() => {
    let cancelled = false;
    languageRequestRef.current += 1;
    languageAbortRef.current?.abort();
    questionSelectionTokenRef.current = "";
    loadedLanguageRef.current = "";
    lastAttemptedLanguageRef.current = "";
    startingTestRef.current = false;
    testStartedAtRef.current = null;
    clearInterval(timerRef.current);
    setLoading(true);
    setSuite(null);
    setError("");
    setStartError("");
    setTestStarted(false);
    setInstructionsAccepted(false);
    setStartingTest(false);
    setSubmitted(false);
    setSubmitting(false);
    setResult(null);
    setBlockedResult(null);
    setTranslationLoading(false);
    setTranslationError("");
    setInstructionTranslationLoading(false);
    setTranslatedInstructions("");
    setInstructionTranslationError("");
    setQuestions([]);
    setAnswers({});
    setMarkedForReview([]);
    setCurrentQuestion(0);
    setTimeLeft(null);

    const fetchData = async () => {
      try {
        const headers = getAuthHeaders();

        const [suiteRes, resultsRes] = await Promise.all([
          axios.get(`${API}/api/test-suites/${suiteId}`, { headers }),
          shouldCheckPreviousAttempt
            ? axios.get(`${API}/api/results/all`, { headers, params: { search: userSearch } })
            : Promise.resolve({ data: [] }),
        ]);

        if (cancelled) return;
        setSuite(suiteRes.data);

        const passing      = suiteRes.data?.passingPercentage ?? 50;
        setPassingPct(passing);

        const passedAttempt = shouldCheckPreviousAttempt
          ? latestPassedResultForSuite(resultsRes.data, suiteId)
          : null;
        const assignmentDate = shouldCheckPreviousAttempt
          ? getAssignmentDateForUserId(suiteRes.data, userId)
          : null;

        if (passedAttempt && (!assignmentDate || new Date(passedAttempt.submittedAt || 0) >= assignmentDate)) {
          setBlockedResult(passedAttempt);
          setQuestions([]);
          setTimeLeft(null);
          return;
        }
      } catch (err) {
        if (cancelled || axios.isCancel(err) || err.code === "ERR_CANCELED") return;
        console.error("Failed to load test:", err);
        setError("Could not load this test. Please go back and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
      startingTestRef.current = false;
      languageRequestRef.current += 1;
      languageAbortRef.current?.abort();
    };
  }, [loadQuestionsForLanguage, suiteId, shouldCheckPreviousAttempt, userId, userSearch]);

  useEffect(() => {
    if (!suite || testStarted) return;
    const sourceInstructions = String(suite.instructions || "").trim();
    setInstructionTranslationError("");

    if (!sourceInstructions) {
      setTranslatedInstructions("");
      setInstructionTranslationLoading(false);
      return;
    }

    if (selectedLanguage === "en") {
      setTranslatedInstructions(sourceInstructions);
      setInstructionTranslationLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setInstructionTranslationLoading(true);

    axios.get(`${API}/api/test-suites/${suiteId}/instructions`, {
      headers: getAuthHeaders(),
      signal: controller.signal,
      params: { language: selectedLanguage },
    }).then(res => {
      if (cancelled) return;
      setTranslatedInstructions(String(res.data?.instructions || sourceInstructions));
      if (res.data?._translationStatus === "failed") {
        setInstructionTranslationError(t("instructionTranslationFailed"));
      }
    }).catch(err => {
      if (cancelled || axios.isCancel(err) || err.code === "ERR_CANCELED") return;
      setTranslatedInstructions(sourceInstructions);
      setInstructionTranslationError(
        err.response?.data?.message || t("instructionTranslationFailed")
      );
    }).finally(() => {
      if (!cancelled) setInstructionTranslationLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedLanguage, suite, suiteId, t, testStarted]);

  useEffect(() => {
    if (loading || !testStarted || submitted || blockedResult || !suite) return;
    if (selectedLanguage === loadedLanguageRef.current) {
      const returnedToLoadedLanguage =
        lastAttemptedLanguageRef.current !== selectedLanguage;
      languageRequestRef.current += 1;
      languageAbortRef.current?.abort();
      setTranslationLoading(false);
      if (returnedToLoadedLanguage) {
        lastAttemptedLanguageRef.current = selectedLanguage;
        setTranslationError("");
      }
      return;
    }
    if (selectedLanguage === lastAttemptedLanguageRef.current) return;
    let cancelled = false;
    loadQuestionsForLanguage(selectedLanguage).catch(err => {
      if (!cancelled) console.error("Failed to switch question language:", err);
    });
    return () => { cancelled = true; };
  }, [blockedResult, loadQuestionsForLanguage, loading, selectedLanguage, submitted, suite, testStarted]);

  useEffect(() => {
    if (!testStarted || timeLeft === null || submitted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); autoSubmitRef.current(); return 0; }
        if (prev === 61) setShowWarning(true);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [testStarted, timeLeft, submitted]);

  const handleStartTest = async () => {
    if (
      !suite ||
      !instructionsAccepted ||
      startingTestRef.current ||
      testStarted
    ) {
      return;
    }

    startingTestRef.current = true;
    setStartingTest(true);
    setStartError("");
    try {
      const nextQuestions = await loadQuestionsForLanguage(
        selectedLanguage
      );
      if (!nextQuestions?.length) return;

      testStartedAtRef.current = new Date();
      setTimeLeft((Number(suite.duration) || 30) * 60);
      setTestStarted(true);
    } catch (err) {
      setStartError(
        err.response?.data?.message ||
        t("prepareTestError")
      );
    } finally {
      startingTestRef.current = false;
      setStartingTest(false);
    }
  };

  const handleSelect = (questionId, optionIndex) => {
    if (submitted || blockedResult) return;
    setAnswers(prev => {
      return { ...prev, [questionId]: [optionIndex] };
    });
  };

  const handleTheoryAnswer = (questionId, value) => {
    if (submitted || blockedResult) return;
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleMarkForReview = (idx) => {
    setMarkedForReview(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const jumpToQuestion = (idx) => {
    setCurrentQuestion(idx);
    document.getElementById(`question-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSubmitClick = () => {
    if (!testStarted) return;
    const durationSeconds = (Number(suite?.duration) || 30) * 60;
    const submitDelaySeconds = Math.max(0, Math.min(durationSeconds, (Number(suite?.submitDelayMinutes) || 0) * 60));
    const elapsedSeconds = timeLeft === null ? 0 : Math.max(0, durationSeconds - timeLeft);
    if (submitDelaySeconds > 0 && elapsedSeconds < submitDelaySeconds) {
      alert(`The submit button will unlock after ${formatTime(submitDelaySeconds - elapsedSeconds)}.`);
      return;
    }
    const unanswered = questions.filter(q => !isQuestionAnswered(q, answers)).length;
    if (unanswered > 0) {
      const firstIdx = questions.findIndex(q => !isQuestionAnswered(q, answers));
      document.getElementById(`question-${firstIdx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      alert(`Please answer all questions before submitting.\n\n${unanswered} question(s) still unanswered.`);
      return;
    }
    setShowConfirm(true);
  };

  const handleSubmitInternal = async (isAuto = false) => {
    if (blockedResult || !testStarted) return;
    setShowConfirm(false);
    clearInterval(timerRef.current);
    languageRequestRef.current += 1;
    languageAbortRef.current?.abort();
    setTranslationLoading(false);
    setSubmitting(true);
    try {
      const currentAnswers = isAuto ? answersRef.current : answers;

      let finalScore = 0, totalMarksCount = 0;
      questions.forEach(q => {
        if (isTheoryQuestion(q)) return;
        const marks = q.marks ?? 1;
        const selectedOption = getSingleSelectedOption(currentAnswers[q._id]);
        const selectedArr = selectedOption === null ? [] : [selectedOption];
        const { earnedFrac } = scoreQuestion(q, selectedArr);
        totalMarksCount += marks;
        finalScore      += earnedFrac * marks;
      });
      const pct    = totalMarksCount > 0 ? Math.round((finalScore / totalMarksCount) * 100) : 0;
      const passed = pct >= passingPct;
      const durationSeconds = (Number(suite?.duration) || 30) * 60;
      const elapsedFromTimer = timeLeft === null ? null : durationSeconds - timeLeft;
      const elapsedFromClock = testStartedAtRef.current
        ? Math.round((Date.now() - testStartedAtRef.current.getTime()) / 1000)
        : null;
      const timeTakenSeconds = Math.max(0, Math.min(
        durationSeconds,
        Number.isFinite(elapsedFromTimer) ? elapsedFromTimer : elapsedFromClock || 0
      ));

      const payload = {
        suiteId,
        testName:       suite?.name || "",
        CandidateName:  user.name,
        CandidateEmail: user.email || user.mobile || user.username || "",
        project:        user.project     || "General",
        designation:    user.designation || "",
        passed,
        startedAt:      testStartedAtRef.current?.toISOString(),
        timeTakenSeconds,
        answers: questions.map(q => ({
          questionId:      q._id,
          selectedOptions: isTheoryQuestion(q) ? [] : (() => {
            const selectedOption = getSingleSelectedOption(currentAnswers[q._id]);
            return selectedOption === null ? [] : [selectedOption];
          })(),
          textAnswer: isTheoryQuestion(q) ? String(currentAnswers[q._id] || "").trim() : "",
        })),
      };

      const res = await axios.post(`${API}/api/results`, payload, {
        headers: getAuthHeaders(),
      });
      setResult(res.data);
      setSubmitted(true);
    } catch (err) {
      console.error("Submit error:", err);
      alert(err.response?.data?.message || "Failed to submit. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    autoSubmitRef.current = () => {
      setShowWarning(false);
      handleSubmitInternal(true);
    };
  });

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "grid", placeItems: "center", color: GREEN_DARK, fontFamily: "'Segoe UI', sans-serif" }}>
        {t("loadingTest")}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "grid", placeItems: "center", padding: "20px", fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ background: WHITE, borderRadius: "16px", padding: "28px", maxWidth: "420px", textAlign: "center" }}>
          <h2 style={{ color: GREEN_DARK }}>{t("unableToLoadTest")}</h2>
          <p style={{ color: "#666" }}>{error}</p>
          <button onClick={() => navigate("/candidate")} style={{ padding: "10px 18px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", cursor: "pointer" }}>
            {t("backToTests")}
          </button>
        </div>
      </div>
    );
  }

  if (blockedResult) {
    const blockedPct = getResultPercentage(blockedResult);
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "grid", placeItems: "center", padding: "20px", fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ background: WHITE, borderRadius: "18px", padding: "30px", maxWidth: "460px", width: "100%", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "42px", marginBottom: "8px" }}>✓</div>
          <h2 style={{ color: GREEN_DARK, margin: "0 0 8px" }}>{t("alreadyAttemptedTitle")}</h2>
          <p style={{ color: "#666", margin: "0 0 18px", lineHeight: 1.5 }}>
            {t("alreadyAttemptedMessage")}
          </p>
          <div style={{ background: "#eef8f1", border: "1px solid #c6e2d0", borderRadius: "12px", padding: "14px", marginBottom: "18px", color: GREEN_DARK, fontWeight: "800" }}>
            {t("scoreLabel")}: {blockedResult.score || 0} / {blockedResult.totalMarks || 0} ({blockedPct}%)
          </div>
          <button onClick={() => navigate("/candidate")} style={{ width: "100%", padding: "12px 18px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "800" }}>
            {t("backToTests")}
          </button>
        </div>
      </div>
    );
  }

  if (!testStarted) {
    const instructions = translatedInstructions || String(suite?.instructions || "").trim();
    const configuredQuestionCount = suite?.questionSelectionMode === "selected"
      ? (suite.selectedQuestionIds || []).length
      : suite?.questionSelectionMode === "random" || suite?.questionsToServe
        ? Number(suite.questionsToServe) || null
        : null;

    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #eee9e0 0%, #f8f5ef 100%)", padding: "28px 16px", fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ maxWidth: "820px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px", marginBottom: "18px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => navigate("/candidate")}
              disabled={startingTest}
              style={{ padding: "10px 15px", border: "1px solid #cad7ce", borderRadius: "10px", background: WHITE, color: GREEN_DARK, cursor: startingTest ? "not-allowed" : "pointer", fontWeight: "800" }}
            >
              ← {t("backToTests")}
            </button>
            <div style={{ pointerEvents: startingTest ? "none" : "auto", opacity: startingTest ? 0.6 : 1 }}>
              <LanguageSwitcher className="student-test-language-switcher" />
            </div>
          </div>

          <section style={{ overflow: "hidden", border: "1px solid #d8e5db", borderRadius: "24px", background: WHITE, boxShadow: "0 20px 55px rgba(31, 77, 48, 0.10)" }}>
            <div style={{ padding: "30px clamp(22px, 5vw, 48px)", background: "linear-gradient(135deg, #1a3d28, #2d5f3f)", color: WHITE }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 11px", borderRadius: "999px", background: "rgba(255,255,255,0.12)", fontSize: "12px", fontWeight: "800", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {t("beforeYouBegin")}
              </div>
              <h1 style={{ margin: "15px 0 8px", fontSize: "clamp(28px, 5vw, 42px)", lineHeight: 1.15 }}>
                {suite?.name || t("testInstructions")}
              </h1>
              {suite?.description && (
                <p style={{ maxWidth: "650px", margin: 0, color: "rgba(255,255,255,0.82)", lineHeight: 1.55 }}>
                  {suite.description}
                </p>
              )}
            </div>

            <div style={{ padding: "clamp(22px, 5vw, 44px)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "26px" }}>
                <div style={{ padding: "14px 16px", border: "1px solid #e0e9e2", borderRadius: "12px", background: "#f8fbf8" }}>
                  <span style={{ display: "block", color: "#7a857e", fontSize: "11px", fontWeight: "800", textTransform: "uppercase" }}>{t("duration")}</span>
                  <strong style={{ display: "block", marginTop: "5px", color: GREEN_DARK, fontSize: "18px" }}>{suite?.duration || 30} {t("minutesUnit")}</strong>
                </div>
                <div style={{ padding: "14px 16px", border: "1px solid #e0e9e2", borderRadius: "12px", background: "#f8fbf8" }}>
                  <span style={{ display: "block", color: "#7a857e", fontSize: "11px", fontWeight: "800", textTransform: "uppercase" }}>{t("passingCriteria")}</span>
                  <strong style={{ display: "block", marginTop: "5px", color: GREEN_DARK, fontSize: "18px" }}>{suite?.passingPercentage ?? 50}%</strong>
                </div>
                {configuredQuestionCount ? (
                  <div style={{ padding: "14px 16px", border: "1px solid #e0e9e2", borderRadius: "12px", background: "#f8fbf8" }}>
                    <span style={{ display: "block", color: "#7a857e", fontSize: "11px", fontWeight: "800", textTransform: "uppercase" }}>{t("questions")}</span>
                    <strong style={{ display: "block", marginTop: "5px", color: GREEN_DARK, fontSize: "18px" }}>{configuredQuestionCount}</strong>
                  </div>
                ) : null}
              </div>

              <h2 style={{ margin: "0 0 12px", color: GREEN_DARK, fontSize: "21px" }}>{t("instructionsTitle")}</h2>
              <div
                style={{
                  minHeight: "130px",
                  padding: "20px",
                  border: "1px solid #d9e5dc",
                  borderRadius: "14px",
                  background: "#fbfcfa",
                  color: "#33423a",
                  fontSize: "15px",
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {instructions || t("defaultTestInstructions")}
              </div>
              {(instructionTranslationLoading || instructionTranslationError) && (
                <div role={instructionTranslationError ? "alert" : "status"} style={{ marginTop: "10px", color: instructionTranslationError ? "#b45309" : "#5f6f64", fontSize: "13px", fontWeight: "700" }}>
                  {instructionTranslationError || t("loading")}
                </div>
              )}

              <div style={{ marginTop: "18px", padding: "14px 16px", borderRadius: "12px", background: "#fff8e8", color: "#76520b", fontSize: "13px", lineHeight: 1.55 }}>
                {t("instructionStartNotice")}
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginTop: "22px", padding: "16px", border: `1px solid ${instructionsAccepted ? "#6fb187" : "#d8e2da"}`, borderRadius: "13px", background: instructionsAccepted ? "#f0faf4" : WHITE, color: GREEN_DARK, cursor: startingTest ? "wait" : "pointer", fontWeight: "800", lineHeight: 1.45 }}>
                <input
                  type="checkbox"
                  checked={instructionsAccepted}
                  disabled={startingTest}
                  onChange={event => {
                    setInstructionsAccepted(event.target.checked);
                    setStartError("");
                  }}
                  style={{ width: "20px", height: "20px", marginTop: "1px", flex: "0 0 auto", accentColor: GREEN }}
                />
                <span>{t("instructionAcceptance")}</span>
              </label>

              {startError && (
                <div role="alert" style={{ marginTop: "14px", padding: "11px 14px", border: "1px solid #fecaca", borderRadius: "10px", background: "#fef2f2", color: "#b91c1c", fontSize: "13px", fontWeight: "700" }}>
                  {startError}
                </div>
              )}

              <button
                type="button"
                disabled={!instructionsAccepted || startingTest}
                onClick={handleStartTest}
                style={{
                  width: "100%",
                  marginTop: "18px",
                  padding: "15px 20px",
                  border: "none",
                  borderRadius: "12px",
                  background: !instructionsAccepted || startingTest ? "#aab4ad" : "linear-gradient(180deg, #2d6d47, #1a5333)",
                  color: WHITE,
                  cursor: !instructionsAccepted || startingTest ? "not-allowed" : "pointer",
                  fontSize: "16px",
                  fontWeight: "900",
                  boxShadow: !instructionsAccepted || startingTest ? "none" : "0 12px 24px rgba(31, 107, 58, 0.18)",
                }}
              >
                {startingTest ? t("preparingTest") : t("startTest")}
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (submitted && result && suite?.showResultsAfterSubmission === false) {
    const displayName = user.name || user.username || "Candidate";
    const suiteName = suite?.name || "assessment";
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f4efe6 0%, #fbfaf6 100%)", display: "grid", placeItems: "center", padding: "26px 16px", fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ position: "relative", overflow: "hidden", background: "rgba(255,255,255,0.96)", border: "1px solid #eee7dc", borderRadius: "26px", padding: "48px 42px", maxWidth: "720px", width: "100%", textAlign: "center", boxShadow: "0 24px 70px rgba(31, 77, 48, 0.12)" }}>
          <div style={{ position: "absolute", inset: "-30% auto auto -18%", width: "260px", height: "260px", borderRadius: "50%", background: "rgba(45,95,63,0.06)" }} />
          <div style={{ position: "absolute", right: "-70px", bottom: "-90px", width: "240px", height: "240px", borderRadius: "50%", background: "rgba(245,158,11,0.08)" }} />
          <div style={{ position: "relative", width: "158px", height: "158px", borderRadius: "50%", display: "grid", placeItems: "center", margin: "0 auto 22px", background: "#eaf3e8", color: GREEN_DARK, fontSize: "76px", boxShadow: "inset 0 0 0 1px rgba(31,107,58,0.08)" }}>
            🏆
          </div>
          <h1 style={{ position: "relative", color: GREEN_DARK, margin: "0 0 12px", fontSize: "clamp(42px, 8vw, 72px)", lineHeight: 1, fontWeight: 900 }}>
            Great Job!
          </h1>
          <p style={{ position: "relative", color: "#26372e", margin: "0 auto 28px", maxWidth: "560px", fontSize: "clamp(20px, 3vw, 30px)", lineHeight: 1.45 }}>
            <strong>{displayName}</strong>, you did an excellent job attempting the{" "}
            <strong style={{ color: GREEN }}>{suiteName}</strong>.
          </p>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: "20px", margin: "0 auto 28px", maxWidth: "460px", padding: "26px 28px", borderRadius: "22px", background: "linear-gradient(135deg, #edf6ec, #f7fbf6)", color: GREEN_DARK }}>
            <div style={{ width: "70px", height: "70px", flex: "0 0 auto", borderRadius: "50%", display: "grid", placeItems: "center", background: GREEN, color: WHITE, fontSize: "42px", fontWeight: 900 }}>
              ✓
            </div>
            <div style={{ textAlign: "left", fontSize: "clamp(24px, 4vw, 34px)", lineHeight: 1.18, fontWeight: 900 }}>
              Submitted<br />successfully!
            </div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: "18px", color: "#9ca3a0", margin: "0 auto 24px", maxWidth: "420px" }}>
            <span style={{ height: "1px", flex: 1, background: "#d8d6ce" }} />
            <span style={{ color: GREEN, fontSize: "26px" }}>★</span>
            <span style={{ height: "1px", flex: 1, background: "#d8d6ce" }} />
          </div>
          <p style={{ position: "relative", color: "#33423a", margin: "0 auto 28px", maxWidth: "520px", fontSize: "20px", lineHeight: 1.55 }}>
            Your answers have been saved. Results for this test will be shared by the administrator when available.
          </p>
          <button onClick={() => navigate("/candidate")} style={{ position: "relative", width: "100%", maxWidth: "420px", padding: "17px 22px", background: "linear-gradient(180deg, #237047, #165a35)", color: WHITE, border: "none", borderRadius: "15px", cursor: "pointer", fontSize: "20px", fontWeight: "900", boxShadow: "0 14px 28px rgba(31, 107, 58, 0.18)" }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (submitted && result && suite?.showResultsAfterSubmission === false) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "grid", placeItems: "center", padding: "20px", fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ background: WHITE, borderRadius: "20px", padding: "32px", maxWidth: "460px", width: "100%", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <div style={{ width: "58px", height: "58px", borderRadius: "50%", display: "grid", placeItems: "center", margin: "0 auto 14px", background: "#ecfdf3", color: GREEN_DARK, fontSize: "30px", fontWeight: "900" }}>✓</div>
          <h2 style={{ color: GREEN_DARK, margin: "0 0 8px" }}>Test submitted successfully</h2>
          <p style={{ color: "#66736a", margin: "0 0 20px", lineHeight: 1.5 }}>
            Your answers have been saved. Result visibility is disabled for this test suite.
          </p>
          <button onClick={() => navigate("/candidate")} style={{ width: "100%", padding: "12px 18px", background: GREEN, color: WHITE, border: "none", borderRadius: "12px", cursor: "pointer", fontWeight: "800" }}>
            Back to Tests
          </button>
        </div>
      </div>
    );
  }

  // Results Screen
  if (submitted && result) {
    const pct    = Math.round((result.score / result.totalMarks) * 100) || 0;
    const passed = typeof result.passed === "boolean" ? result.passed : pct >= passingPct;
    const overallGrade = gradeInfo(pct);
    const catStats   = buildCategoryStats(questions, answers);
    const savedCategoryRows = Array.isArray(result.categoryResults) ? result.categoryResults : [];
    const catEntries = savedCategoryRows.length > 0 ? savedCategoryRows : Object.entries(catStats);

    const handleDownloadCertificate = (language) => {
      downloadCertificatePDF({
        ...result,
        CandidateName: user.name,
        CandidateEmail: user.email || user.mobile || user.username || "",
        testName: suite?.name || "",
        project: user.project || "",
        designation: user.designation || "",
        submittedAt: new Date().toISOString(),
      }, suite, language);
    };

    return (
      <div style={{ minHeight:"100vh", background: BG, padding:"24px 16px" }}>
        <div style={{ maxWidth:"980px", margin:"0 auto" }}>
          <div className="student-result-card" style={{ background: WHITE, borderRadius:"20px", padding:"32px", boxShadow:"0 8px 32px rgba(0,0,0,0.08)" }}>
            <div className="student-result-layout" style={{ display:"grid", gridTemplateColumns:"minmax(260px, 1fr) minmax(260px, 0.9fr)", gap:"22px", alignItems:"stretch" }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:"48px" }}>{passed ? "🎉" : "📚"}</div>
                <h1 style={{ color: GREEN_DARK }}>{passed ? "Passed!" : "Try Again"}</h1>
                <div style={{ margin:"-8px auto 18px", maxWidth:"420px" }}>
                  <p style={{ margin:"0 0 6px", color: overallGrade.color, fontSize:"18px", fontWeight:"900" }}>
                    Recommendation: {overallGrade.label}
                  </p>
                  <p style={{ margin:0, color: GREEN_DARK, fontSize:"14px", lineHeight:1.5 }}>
                    {overallGrade.message}
                  </p>
                </div>
                <div style={{ background: BG, borderRadius:"14px", padding:"20px", margin:"20px 0" }}>
                  <p style={{ fontSize:"12px", color:"#888", textTransform:"uppercase" }}>Your Result</p>
                  <p style={{ fontSize:"40px", fontWeight:"800", color: GREEN_DARK, margin:0 }}>{result.score} / {result.totalMarks}</p>
                  <p style={{ fontSize:"24px", color: pctColor(pct), margin:0 }}>{pct}%</p>
                </div>
              </div>

              <div style={{ background:"#f8faf8", border:"1px solid #e5eee8", borderRadius:"16px", padding:"18px", display:"flex", flexDirection:"column", justifyContent:"center", gap:"10px" }}>
                <button
                  type="button"
                  onClick={() => setShowReviewAnswers(prev => !prev)}
                  style={{ width:"100%", padding:"12px", background: showReviewAnswers ? GREEN_DARK : GREEN, color: WHITE, border:"none", borderRadius:"12px", cursor:"pointer", fontWeight:"800" }}
                >
                  {showReviewAnswers ? "Hide Review" : "Review Answers"}
                </button>

                {passed && (
                  <div className="student-certificate-actions" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                    <button onClick={() => handleDownloadCertificate("english")} style={{ width:"100%", padding:"12px", background: GREEN, color: WHITE, border:"none", borderRadius:"12px", cursor:"pointer", fontWeight:"800" }}>
                      English Certificate
                    </button>
                    <button onClick={() => handleDownloadCertificate("marathi")} style={{ width:"100%", padding:"12px", background: WHITE, color: GREEN_DARK, border:`1px solid ${GREEN}`, borderRadius:"12px", cursor:"pointer", fontWeight:"800" }}>
                      Marathi Certificate
                    </button>
                  </div>
                )}

                <button onClick={() => navigate("/candidate")} style={{ width:"100%", padding:"12px", background:"#eef1ef", color:"#555", border:"none", borderRadius:"12px", cursor:"pointer", fontWeight:"700" }}>
                  Back to Tests
                </button>
              </div>
            </div>

            {/* Category breakdown */}
            {catEntries.length > 0 && (
              <div style={{ marginBottom:"20px", textAlign:"left" }}>
                <p style={{ fontSize:"12px", color:"#888", textTransform:"uppercase", marginBottom:"10px", textAlign:"center" }}>Category Breakdown</p>
                {catEntries.map((entry) => {
                  const fromServer = !Array.isArray(entry);
                  const cat = fromServer ? entry.category : entry[0];
                  const s = fromServer ? entry : entry[1];
                  const catPct = fromServer
                    ? Number(s.percentage || 0)
                    : s.marks > 0 ? Math.round((s.earnedMarks / s.marks) * 100) : 0;
                  const catGrade = s.scaleLabel
                    ? { label: s.scaleLabel, color: pctColor(catPct), bg: "", message: s.description || "" }
                    : gradeInfo(catPct);
                  return (
                    <div key={cat} style={{ marginBottom:"10px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:"13px", marginBottom:"4px" }}>
                        <span style={{ fontWeight:"600", color: GREEN_DARK }}>{cat}</span>
                        <span style={{ color: catGrade.color, fontWeight:"800" }}>
                          {s.scaleScore ? `${catGrade.label} · ${s.scaleScore}/10` : `${catGrade.label} (${catPct}% ${s.correct}/${s.total})`}
                        </span>
                      </div>
                      <div style={{ height:"6px", background:"#eee", borderRadius:"99px" }}>
                        <div style={{ height:"6px", width:`${catPct}%`, background: catGrade.color, borderRadius:"99px", transition:"width 0.6s ease" }} />
                      </div>
                      {s.description && (
                        <p style={{ margin: "5px 0 0", color: "#66736a", fontSize: "12px", lineHeight: 1.4 }}>{s.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {showReviewAnswers && (
              <div style={{ marginTop:"22px", borderTop:"1px solid #edf0ed", paddingTop:"20px" }}>
                <h2 style={{ margin:"0 0 14px", color: GREEN_DARK, fontSize:"22px" }}>Answer Review</h2>
                <div style={{ display:"grid", gap:"14px", textAlign:"left" }}>
                  {questions.map((q, idx) => {
                    const theory = isTheoryQuestion(q);
                    const selectedOption = getSingleSelectedOption(answers[q._id]);
                    const correctOptions = getReviewCorrectOptions(q);
                    const selectedText = theory
                      ? String(answers[q._id] || "").trim() || "No answer"
                      : selectedOption === null ? "Not answered" : q.options[selectedOption] || `Option ${selectedOption + 1}`;

                    return (
                      <div key={q._id} style={{ border:"1px solid #e5eee8", borderRadius:"14px", padding:"16px", background:"#fff" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", gap:"12px", marginBottom:"10px", flexWrap:"wrap" }}>
                          <strong style={{ color: GREEN_DARK }}>Q{idx + 1}. {q.questionText}</strong>
                          <span style={{ background: theory ? "#dbeafe" : "#dcfce7", color: theory ? "#1d4ed8" : "#166534", padding:"3px 10px", borderRadius:"999px", fontSize:"12px", fontWeight:"800" }}>
                            {theory ? "Theory" : "MCQ"}
                          </span>
                        </div>

                        {theory ? (
                          <div style={{ display:"grid", gap:"8px" }}>
                            <div style={{ padding:"10px 12px", borderRadius:"10px", background:"#f8faf8", color:"#333" }}>
                              <strong>Your answer: </strong>{selectedText}
                            </div>
                            <div style={{ padding:"10px 12px", borderRadius:"10px", background:"#fff7ed", color:"#9a3412" }}>
                              Theory answers are reviewed manually by the admin.
                            </div>
                          </div>
                        ) : (
                          <div style={{ display:"grid", gap:"8px" }}>
                            {q.options.map((opt, optionIdx) => {
                              const isSelected = selectedOption === optionIdx;
                              const isCorrect = correctOptions.includes(optionIdx);
                              let background = "#f9fafb";
                              let border = "1px solid #e5e7eb";
                              let label = "";
                              if (isCorrect) {
                                background = "#ecfdf3";
                                border = "1px solid #22c55e";
                                label = "Correct";
                              }
                              if (isSelected && !isCorrect) {
                                background = "#fef2f2";
                                border = "1px solid #ef4444";
                                label = "Your answer";
                              }
                              if (isSelected && isCorrect) label = "Your answer • Correct";

                              return (
                                <div key={optionIdx} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"12px", padding:"10px 12px", borderRadius:"10px", background, border }}>
                                  <span>{opt}</span>
                                  {label && <span style={{ fontSize:"12px", fontWeight:"800", color: isCorrect ? "#166534" : "#b91c1c", whiteSpace:"nowrap" }}>{label}</span>}
                                </div>
                              );
                            })}
                            <div style={{ fontSize:"12px", color:"#6b7280", marginTop:"2px" }}>
                              Selected: {selectedText}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main Test Screen
  const answeredCount  = questions.filter(q => isQuestionAnswered(q, answers)).length;
  const isLowTime      = timeLeft !== null && timeLeft <= 60;
  const attemptedCount = answeredCount;
  const reviewCount    = markedForReview.length;
  const totalCount     = questions.length;
  const durationSeconds = (Number(suite?.duration) || 30) * 60;
  const submitDelaySeconds = Math.max(0, Math.min(durationSeconds, (Number(suite?.submitDelayMinutes) || 0) * 60));
  const elapsedSeconds = timeLeft === null ? 0 : Math.max(0, durationSeconds - timeLeft);
  const submitLocked = submitDelaySeconds > 0 && elapsedSeconds < submitDelaySeconds;
  const submitUnlockText = submitLocked ? `Submit unlocks in ${formatTime(submitDelaySeconds - elapsedSeconds)}` : "";

  return (
    <div className="student-test-page" style={{ minHeight:"100vh", background: BG, fontFamily:"'Segoe UI', sans-serif" }}>

      {/* Timer Warning */}
      {showWarning && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background: WHITE, padding:"30px", borderRadius:"20px", textAlign:"center" }}>
            <h2>⚠️ 1 Minute Left</h2>
            <p>Complete your answers quickly!</p>
            <button onClick={() => setShowWarning(false)} style={{ background: GREEN, color: WHITE, padding:"10px 20px", border:"none", borderRadius:"8px" }}>OK</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div className="student-confirm-card" style={{ background: WHITE, padding:"32px", borderRadius:"24px", maxWidth:"400px", textAlign:"center" }}>
            <h3>Submit Assessment?</h3>
            <p>{answeredCount} of {questions.length} answered.</p>
            {markedForReview.length > 0 && <p style={{ color: ORANGE }}>⚠️ {markedForReview.length} items still marked for review.</p>}
            <div style={{ display:"flex", gap:"12px", marginTop:"20px" }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex:1, padding:"12px", borderRadius:"10px", border:"1px solid #ddd" }}>Review</button>
              <button onClick={() => handleSubmitInternal(false)} style={{ flex:1, padding:"12px", borderRadius:"10px", background: GREEN, color: WHITE, border:"none" }}>Submit Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="student-test-header" style={{ background: WHITE, padding:"16px 28px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:"14px", flexWrap:"wrap", position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
        <div>
          <h2 style={{ margin:0, fontSize:"18px", color: GREEN_DARK }}>{suite?.name}</h2>
          <span style={{ fontSize:"12px", color:"#888" }}>{answeredCount} / {questions.length} Answered</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap", justifyContent:"flex-end" }}>
          {translationLoading && (
            <span role="status" style={{ color:"#6b7280", fontSize:"12px", fontWeight:"700" }}>
              Translating questions...
            </span>
          )}
          <LanguageSwitcher className="student-test-language-switcher" />
          <div style={{ background: isLowTime ? "#fee2e2" : "#f0faf5", padding:"8px 16px", borderRadius:"999px", color: isLowTime ? "#dc2626" : GREEN, fontWeight:"bold" }}>
            {formatTime(timeLeft)}
          </div>
        </div>
      </div>

      {translationError && (
        <div
          role="alert"
          style={{
            maxWidth: "1100px",
            margin: "14px auto 0",
            padding: "11px 16px",
            border: "1px solid #f1c27d",
            borderRadius: "12px",
            background: "#fff7e6",
            color: "#7c4a03",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <span>{translationError}</span>
          <button
            type="button"
            disabled={translationLoading}
            onClick={() => {
              loadQuestionsForLanguage(selectedLanguage).catch(err => {
                console.error("Failed to retry question translation:", err);
              });
            }}
            style={{
              padding: "7px 12px",
              border: "1px solid #c57a13",
              borderRadius: "8px",
              background: WHITE,
              color: "#7c4a03",
              cursor: translationLoading ? "wait" : "pointer",
              fontWeight: "800",
            }}
          >
            {translationLoading ? "Retrying..." : "Retry translation"}
          </button>
        </div>
      )}

      {/* Main Layout */}
      <div className="student-test-layout" style={{ maxWidth:"1100px", margin:"24px auto", padding:"0 16px 120px", display:"flex", gap:"24px", alignItems:"flex-start" }}>

        {/* Question Navigation Panel */}
        <div className="student-question-nav" style={{ width:"220px", flexShrink:0, background: WHITE, borderRadius:"16px", padding:"20px", boxShadow:"0 4px 16px rgba(0,0,0,0.06)", position:"sticky", top:"80px", maxHeight:"calc(100vh - 160px)", overflowY:"auto" }}>
          <h3 style={{ margin:"0 0 16px", fontSize:"15px", fontWeight:"700", color: GREEN_DARK }}>Questions</h3>
          <div className="student-question-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"8px", marginBottom:"20px" }}>
            {questions.map((q, idx) => {
              const isAnswered = isQuestionAnswered(q, answers);
              const isReview   = markedForReview.includes(idx);
              const isCurrent  = currentQuestion === idx;

              let bg = WHITE, color = "#555", border = "1.5px solid #ddd";
              if (isCurrent)       { bg = GREEN_DARK; color = WHITE; border = `1.5px solid ${GREEN_DARK}`; }
              else if (isReview)   { bg = ORANGE;     color = WHITE; border = `1.5px solid ${ORANGE}`; }
              else if (isAnswered) { bg = GREEN;      color = WHITE; border = `1.5px solid ${GREEN}`; }

              return (
                <button key={q._id} onClick={() => jumpToQuestion(idx)} style={{ width:"36px", height:"36px", borderRadius:"8px", background: bg, color, border, fontWeight:"600", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}>
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"8px", borderTop:"1px solid #eee", paddingTop:"16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"12px", color:"#555" }}>
              <span style={{ width:"16px", height:"16px", borderRadius:"4px", background: GREEN, display:"inline-block", flexShrink:0 }} />
              Attempted ({attemptedCount})
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"12px", color:"#555" }}>
              <span style={{ width:"16px", height:"16px", borderRadius:"4px", background: ORANGE, display:"inline-block", flexShrink:0 }} />
              Marked for Review ({reviewCount})
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"12px", color:"#555" }}>
              <span style={{ width:"16px", height:"16px", borderRadius:"4px", background: WHITE, border:"1.5px solid #ddd", display:"inline-block", flexShrink:0 }} />
              Not Attempted ({Math.max(0, totalCount - attemptedCount)})
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"12px", color:"#555" }}>
              <span style={{ width:"16px", height:"16px", borderRadius:"4px", background: GREEN_DARK, display:"inline-block", flexShrink:0 }} />
              Current
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="student-question-list" style={{ flex:1 }}>
          {questions.map((q, idx) => {
            const isMarked   = markedForReview.includes(idx);
            const isSelected = isQuestionAnswered(q, answers);
            const theory     = isTheoryQuestion(q);

            return (
              <div
                id={`question-${idx}`}
                key={q._id}
                className="student-question-card"
                onClick={() => setCurrentQuestion(idx)}
                style={{ background: WHITE, borderRadius:"16px", padding:"24px", marginBottom:"16px", border:`2px solid ${isMarked ? ORANGE : isSelected ? "#c6e2d0" : "transparent"}`, cursor:"default" }}
              >
                {/* Progress bar */}
                <div style={{ marginBottom:"12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"#aaa", marginBottom:"4px" }}>
                    <span>QUESTION {idx + 1} OF {questions.length}</span>
                    <span>{Math.round(((idx + 1) / questions.length) * 100)}% COMPLETE</span>
                  </div>
                  <div style={{ height:"4px", background:"#eee", borderRadius:"99px" }}>
                    <div style={{ height:"4px", width:`${((idx + 1) / questions.length) * 100}%`, background: GREEN, borderRadius:"99px" }} />
                  </div>
                </div>

                <div className="student-question-meta" style={{ display:"flex", justifyContent:"space-between", marginBottom:"12px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
                    <span style={{ fontWeight:"bold", color:"#aaa" }}>Q{idx + 1}</span>
                    <span style={{ background: theory ? "#dbeafe" : "#dcfce7", color: theory ? "#1d4ed8" : "#166534", padding:"2px 10px", borderRadius:"999px", fontSize:"11px", fontWeight:"700", border:`1px solid ${theory ? "#bfdbfe" : "#bbf7d0"}` }}>
                      {theory ? "Theory" : "MCQ"}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMarkForReview(idx); }}
                    style={{ background:"none", border:"none", cursor:"pointer", color: isMarked ? ORANGE : "#ccc", fontSize:"13px", whiteSpace:"nowrap" }}
                  >
                    {isMarked ? "★ Marked for Review" : "☆ Mark for Review"}
                  </button>
                </div>

                <p style={{ fontSize:"16px", fontWeight:"600", marginBottom:"16px" }}>{q.questionText}</p>
                {isQuestionImage(q.imageUrl) && (
                  <img
                    src={q.imageUrl}
                    alt={`Question ${idx + 1}`}
                    style={{ width:"100%", maxHeight:"360px", objectFit:"contain", background:"#f8faf9", border:"1px solid #e5e7eb", borderRadius:"12px", padding:"8px", marginBottom:"16px" }}
                  />
                )}
                {isQuestionVideo(q.videoUrl) && (
                  <video
                    src={q.videoUrl}
                    controls
                    playsInline
                    style={{ width:"100%", maxHeight:"380px", background:"#111", border:"1px solid #e5e7eb", borderRadius:"12px", padding:"8px", marginBottom:"16px" }}
                  />
                )}

                {theory ? (
                  <textarea
                    rows={5}
                    value={typeof answers[q._id] === "string" ? answers[q._id] : ""}
                    onChange={(e) => handleTheoryAnswer(q._id, e.target.value)}
                    placeholder="Write your answer here..."
                    style={{
                      width: "100%",
                      border: `1px solid ${isSelected ? GREEN : "#ddd"}`,
                      borderRadius: "10px",
                      padding: "12px",
                      fontSize: "14px",
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "inherit",
                      background: isSelected ? "#f0faf5" : "#f9fafb",
                    }}
                  />
                ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  {q.options.map((opt, oIdx) => {
                    const checked = getSingleSelectedOption(answers[q._id]) === oIdx;
                    return (
                      <label key={oIdx} style={{ display:"flex", alignItems:"center", padding:"12px", borderRadius:"10px", background: checked ? "#f0faf5" : "#f9fafb", cursor:"pointer", border: checked ? `1px solid ${GREEN}` : "1px solid #eee", transition:"all 0.15s" }}>
                        <input
                          type="radio"
                          name={`question-${q._id}`}
                          checked={checked}
                          onChange={() => handleSelect(q._id, oIdx)}
                          style={{ marginRight:"12px", accentColor: GREEN }}
                        />
                        {opt}
                      </label>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Submit Footer */}
      <div className="student-submit-footer" style={{ position:"fixed", bottom:0, left:0, right:0, background: WHITE, padding:"20px", textAlign:"center", borderTop:"1px solid #eee" }}>
        {submitLocked && (
          <div style={{ color:"#6b7280", fontSize:"13px", fontWeight:"700", marginBottom:"8px" }}>
            {submitUnlockText}
          </div>
        )}
        <button className="student-submit-button" onClick={handleSubmitClick} disabled={submitting || submitLocked} style={{ padding:"14px 60px", background: submitLocked ? "#9ca3af" : GREEN, color: WHITE, border:"none", borderRadius:"999px", fontSize:"16px", fontWeight:"bold", cursor: submitLocked ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
          {submitting ? "Submitting..." : submitLocked ? "Submit locked" : "Finish & Submit"}
        </button>
      </div>
    </div>
  );
}
