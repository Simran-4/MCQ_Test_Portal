import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";

import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import AddQuestion from "./pages/AddQuestion";
import ViewQuestions from "./pages/ViewQuestions";
import Test from "./pages/Test";
import Register from "./pages/register";
import ViewResults from "./pages/ViewResults";
import AdminSettings from "./pages/AdminSettings";
import Translator from "./components/Translator";

function App() {

  

  return (

    <>

      <Translator />

      <BrowserRouter>

        <Routes>

          <Route path="/" element={<Login />} />

          <Route
            path="/register"
            element={<Register />}
          />

          <Route
            path="/results"
            element={<ViewResults />}
          />

          <Route
            path="/view-results"
            element={<ViewResults />}
          />

          <Route
            path="/settings"
            element={<AdminSettings />}
          />

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/add-question"
            element={<AddQuestion />}
          />

          <Route
            path="/view-questions"
            element={<ViewQuestions />}
          />

          <Route
            path="/test"
            element={<Test />}
          />

        </Routes>

      </BrowserRouter>

    </>

  );
}

export default App;