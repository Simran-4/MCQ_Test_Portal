import { useTranslation } from "react-i18next";
import "./LanguageSwitcher.css";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "mr", label: "मराठी" },
];

export default function LanguageSwitcher({ className = "" }) {
  const { i18n, t } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage || i18n.language || "en";

  const changeLanguage = async (event) => {
    const language = event.target.value;
    await i18n.changeLanguage(language);
    localStorage.setItem("selectedLang", language);
    document.documentElement.lang = language;
  };

  return (
    <label className={`language-switcher ${className}`.trim()}>
      <span className="language-switcher-icon" aria-hidden="true">◎</span>
      <span className="sr-only">{t("language")}</span>
      <select value={currentLanguage} onChange={changeLanguage} aria-label={t("language")}>
        {LANGUAGES.map((language) => (
          <option key={language.value} value={language.value}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
