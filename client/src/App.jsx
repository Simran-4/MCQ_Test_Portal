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

function App() {

  useEffect(() => {

    const addScript = document.createElement("script");

    addScript.src =
      "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";

    addScript.async = true;

    document.body.appendChild(addScript);

    window.googleTranslateElementInit = () => {

      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "en,hi,mr",
          layout:
            window.google.translate.TranslateElement.InlineLayout.SIMPLE,
        },
        "google_translate_element"
      );
    };

  }, []);

  return (

    <>

      <div id="google_translate_element"></div>

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