import { cloneElement, isValidElement, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

// Auth & Layout
import Login          from "./pages/login";
import Register       from "./pages/register";

// Admin Pages
import Dashboard      from "./pages/dashboard";
import AddQuestion    from "./pages/AddQuestion";
import ViewQuestions  from "./pages/ViewQuestions";
import Test           from "./pages/Test";
import ViewResults    from "./pages/ViewResults";
import SuperAdmin     from "./pages/SuperAdmin";
import TestSuiteDetail from "./pages/TestSuiteDetail";
import AdminSuiteResults from "./pages/AdminSuiteResults";

// Student Pages
import StudentDashboard from "./pages/StudentDashboard";
import StudentTest from "./pages/StudentTest";
import { refreshCurrentUser } from "./utils/auth";
import { loginPathForNext } from "./utils/authRedirect";

// ── PROTECTIVE WRAPPER ────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem("token");
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  });
  const [checkingUser, setCheckingUser] = useState(Boolean(token));
  const [userVersion, setUserVersion] = useState(0);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setCheckingUser(false);
      return () => {
        cancelled = true;
      };
    }

    const applyFreshUser = (freshUser) => {
      if (cancelled) return;
      setUser(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(freshUser)) {
          setUserVersion(version => version + 1);
        }
        return freshUser;
      });
    };

    const syncUser = (showLoading = false) => {
      if (showLoading) setCheckingUser(true);
      refreshCurrentUser()
        .then(applyFreshUser)
        .catch(err => {
          if (err.status === 401 || err.status === 403) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            if (!cancelled) setUser({});
          }
        })
        .finally(() => {
          if (showLoading && !cancelled) setCheckingUser(false);
        });
    };

    const syncWhenVisible = () => {
      if (!document.hidden) syncUser(false);
    };

    syncUser(true);
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    const intervalId = window.setInterval(() => syncUser(false), 30000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.clearInterval(intervalId);
    };
  }, [token, location.pathname]);

  if (!token) {
    return <Navigate to={loginPathForNext(`${location.pathname}${location.search}`)} replace />;
  }

  if (checkingUser) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" }}>
        Loading...
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (location.pathname.startsWith("/test/")) {
      return <Navigate to={loginPathForNext(`${location.pathname}${location.search}`)} replace />;
    }
    return <Navigate to={user.role === "candidate" ? "/candidate" : "/"} replace />;
  }

  return isValidElement(children)
    ? cloneElement(children, { key: `${user._id || "user"}-${userVersion}` })
    : children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public Routes ── */}
        <Route path="/"         element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* ── Candidate Routes ── */}
        <Route path="/candidate" element={
          <ProtectedRoute allowedRoles={["candidate", "admin", "superadmin"]}>
            <StudentDashboard />
          </ProtectedRoute>
        } />
        <Route path="/test/:suiteId" element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <StudentTest />
          </ProtectedRoute>
        } />

        {/* ── Admin Routes ── */}
        <Route path="/dashboard" element={
          <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
            <Dashboard />
          </ProtectedRoute>
        } />

        {/* Management & Questions */}
        <Route path="/add-question"               element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><AddQuestion /></ProtectedRoute>} />
        <Route path="/view-questions"             element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><ViewQuestions /></ProtectedRoute>} />
        <Route path="/test"                       element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><Test /></ProtectedRoute>} />
        <Route path="/admin/test-suites/:suiteId" element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><TestSuiteDetail /></ProtectedRoute>} />

        {/* Results & Stats */}
        <Route path="/view-results"               element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><ViewResults /></ProtectedRoute>} />
        <Route path="/admin/results"              element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><AdminSuiteResults /></ProtectedRoute>} />
        <Route path="/admin-results/:suiteId"     element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><AdminSuiteResults /></ProtectedRoute>} />

        {/* System */}
        <Route path="/superadmin"                 element={<ProtectedRoute allowedRoles={["superadmin"]}><SuperAdmin /></ProtectedRoute>} />

        {/* ── Catch all ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
