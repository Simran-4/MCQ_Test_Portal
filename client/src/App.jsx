import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import AddQuestion from "./pages/AddQuestion";
import ViewQuestions from "./pages/ViewQuestions";
import Test from "./pages/Test";
import Register from "./pages/register";
import ViewResults from "./pages/ViewResults";
import AdminSettings from "./pages/AdminSettings";
import SuperAdmin from "./pages/SuperAdmin";

function App() {

  return (

    <BrowserRouter>

      <Routes>

        {/* Login */}
        <Route
          path="/"
          element={<Login />}
        />

        {/* Register */}
        <Route
          path="/register"
          element={<Register />}
        />

        {/* Super Admin */}
        <Route
          path="/superadmin"
          element={<SuperAdmin />}
        />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

        {/* Add Question */}
        <Route
          path="/add-question"
          element={<AddQuestion />}
        />

        {/* View Questions */}
        <Route
          path="/view-questions"
          element={<ViewQuestions />}
        />

        {/* Test */}
        <Route
          path="/test"
          element={<Test />}
        />

        {/* Results */}
        <Route
          path="/results"
          element={<ViewResults />}
        />

        <Route
          path="/view-results"
          element={<ViewResults />}
        />

        {/* Settings */}
        <Route
          path="/settings"
          element={<AdminSettings />}
        />

      </Routes>

    </BrowserRouter>

  );
}

export default App;