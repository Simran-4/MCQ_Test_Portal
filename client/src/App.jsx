import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Auth & Layout
import Login          from "./pages/login";
import Register       from "./pages/register";

// Admin Pages
import Dashboard      from "./pages/dashboard";
import AddQuestion    from "./pages/AddQuestion";
import ViewQuestions  from "./pages/ViewQuestions";
import Test           from "./pages/Test";
import ViewResults    from "./pages/ViewResults";
import AdminSettings  from "./pages/AdminSettings";
import SuperAdmin     from "./pages/SuperAdmin";
import TestSuiteDetail from "./pages/TestSuiteDetail";
import AdminSuiteResults from "./pages/AdminSuiteResults";

// Student Pages
import StudentDashboard from "./pages/StudentDashboard";
import StudentTest from "./pages/StudentTest";

// ── PROTECTIVE WRAPPER ────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  if (!token) return <Navigate to="/" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === "candidate" ? "/candidate" : "/dashboard"} replace />;
  }
  return children;
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
          <ProtectedRoute allowedRoles={["candidate", "admin", "superadmin"]}>
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
        <Route path="/admin-results/:suiteId"     element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><AdminSuiteResults /></ProtectedRoute>} />
        
        {/* Settings & System */}
        <Route path="/settings"                   element={<ProtectedRoute allowedRoles={["admin", "superadmin"]}><AdminSettings /></ProtectedRoute>} />
        <Route path="/superadmin"                 element={<ProtectedRoute allowedRoles={["superadmin"]}><SuperAdmin /></ProtectedRoute>} />

        {/* ── Catch all ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;