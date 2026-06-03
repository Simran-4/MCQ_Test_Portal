// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login          from "./pages/login";
import Register       from "./pages/register";
import Dashboard      from "./pages/dashboard";
import AddQuestion    from "./pages/AddQuestion";
import ViewQuestions  from "./pages/ViewQuestions";
import Test           from "./pages/Test";
import ViewResults    from "./pages/ViewResults";
import AdminSettings  from "./pages/AdminSettings";
import SuperAdmin     from "./pages/SuperAdmin";
import TestSuiteDetail from "./pages/TestSuiteDetail";

// ── NEW student pages ──
import StudentDashboard from "./pages/StudentDashboard";
import StudentTest      from "./pages/StudentTest";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Auth ── */}
        <Route path="/"         element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* ── Admin ── */}
        <Route path="/dashboard"                      element={<Dashboard />} />
        <Route path="/add-question"                   element={<AddQuestion />} />
        <Route path="/view-questions"                 element={<ViewQuestions />} />
        <Route path="/test"                           element={<Test />} />
        <Route path="/results"                        element={<ViewResults />} />
        <Route path="/view-results"                   element={<ViewResults />} />
        <Route path="/settings"                       element={<AdminSettings />} />
        <Route path="/superadmin"                     element={<SuperAdmin />} />
        <Route path="/admin/test-suites/:suiteId"     element={<TestSuiteDetail />} />

        {/* ── Student ── */}
        <Route path="/student"              element={<StudentDashboard />} />
        <Route path="/test/:suiteId"        element={<StudentTest />} />

        {/* ── Catch all ── */}
        <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
