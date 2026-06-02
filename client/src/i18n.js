import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        dashboard: "Admin Dashboard",
        welcome:
          "Welcome back! Manage questions and view results.",
        addQuestion: "Add Question",
        viewQuestions: "View Questions",
        viewResults: "View Results",
        logout: "Logout",
        examSettings: "Exam Settings",
      },
    },

    hi: {
      translation: {
        dashboard: "एडमिन डैशबोर्ड",
        welcome:
          "वापस स्वागत है! प्रश्न प्रबंधित करें और परिणाम देखें।",
        addQuestion: "प्रश्न जोड़ें",
        viewQuestions: "प्रश्न देखें",
        viewResults: "परिणाम देखें",
        logout: "लॉगआउट",
        examSettings: "परीक्षा सेटिंग्स",
      },
    },

    mr: {
      translation: {
        dashboard: "अॅडमिन डॅशबोर्ड",
        welcome:
          "पुन्हा स्वागत आहे! प्रश्न व्यवस्थापित करा आणि निकाल पहा.",
        addQuestion: "प्रश्न जोडा",
        viewQuestions: "प्रश्न पहा",
        viewResults: "निकाल पहा",
        logout: "लॉगआउट",
        examSettings: "परीक्षा सेटिंग्ज",
      },
    },
  },

  lng: "en",
  fallbackLng: "en",

  interpolation: {
    escapeValue: false,
  },
});

export default i18n;