import jsPDF from "jspdf";

const LANGUAGE_LABELS = {
  english: "English",
  marathi: "Marathi",
};

function cleanName(value) {
  return String(value || "candidate")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "candidate";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fitFontSize(text, base, min, thresholds = []) {
  const length = String(text || "").length;
  const matched = thresholds.find(item => length > item.length);
  return matched ? Math.max(min, matched.size) : base;
}

export function certificateDataFromResult(result, fallbackSuite = {}) {
  const score = Number(result?.score || 0);
  const totalMarks = Number(result?.totalMarks || 0);
  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
  return {
    candidateName: result?.CandidateName || result?.userName || "Candidate",
    candidateEmail: result?.CandidateEmail || result?.userEmail || "",
    testName: result?.testName || result?.suiteId?.name || fallbackSuite?.name || "Assessment",
    score,
    totalMarks,
    percentage,
    project: result?.project || "",
    designation: result?.designation || "",
    submittedAt: result?.submittedAt || new Date().toISOString(),
  };
}

function logoSrc() {
  return `${import.meta.env.BASE_URL || "/"}Logo.png`;
}

function signatureBlock(language, signature, name, title) {
  return `
    <div class="signature-block">
      <div class="signature">${escapeHtml(signature)}</div>
      <div class="signature-line"></div>
      <div class="sign-name">${escapeHtml(name)}</div>
      <div class="sign-title">${title.map(escapeHtml).join("<br />")}</div>
    </div>
  `;
}

function certificateMarkup(data, language) {
  const isMarathi = language === "marathi";
  const safeTestName = escapeHtml(data.testName);
  const safeCandidateName = escapeHtml(isMarathi ? data.candidateName : data.candidateName.toUpperCase());
  const testFont = fitFontSize(data.testName, 72, 42, [
    { length: 42, size: 42 },
    { length: 30, size: 50 },
    { length: 22, size: 60 },
  ]);
  const nameFont = fitFontSize(data.candidateName, isMarathi ? 72 : 64, 40, [
    { length: 45, size: 40 },
    { length: 34, size: 48 },
    { length: 24, size: 56 },
  ]);

  const englishBody = `
    This is to certify that the participant has successfully completed the "${safeTestName}" online
    assessment organized by Snehalaya, Ahilyanagar. The participant has fulfilled all the required
    procedures and demonstrated satisfactory performance. Snehalaya appreciates their active
    participation and cooperation.
  `;

  const marathiBody = `
    यांनी स्नेहालय, अहिल्यानगर यांच्या वतीने आयोजित करण्यात आलेली "${safeTestName}" ही ऑनलाइन चाचणी
    यशस्वीरीत्या पूर्ण केली आहे. सदर चाचणीमध्ये सहभागी होऊन त्यांनी सर्व आवश्यक प्रक्रिया पूर्ण केल्या असून त्यांची
    कामगिरी समाधानकारक आहे. त्यांच्या सक्रिय सहभाग व सहकार्याबद्दल स्नेहालय त्यांचे अभिनंदन करते.
  `;

  return `
    <div class="certificate ${isMarathi ? "marathi" : "english"}">
      <div class="outer-glow"></div>
      <div class="top-line"></div>
      <div class="ornament top-ornament">⌁ ❦ ⌁</div>
      <div class="corner corner-tl">❧</div>
      <div class="corner corner-tr">❧</div>
      <div class="corner corner-bl">❧</div>
      <div class="corner corner-br">❧</div>

      <div class="logo-box logo-left">
        <img src="${logoSrc()}" alt="Snehalaya" />
      </div>
      <div class="logo-box logo-right">
        <div class="logo-20-mark">☘</div>
        <strong>Snehalaya 2.0</strong>
        <span>तमसो मा ज्योतिर्गमय</span>
      </div>

      <div class="brand-title">${isMarathi ? "स्नेहालय" : "SNEHALAYA"}</div>
      <div class="test-title" style="font-size:${testFont}px">[${safeTestName}]</div>

      <div class="certificate-title-row">
        <span></span>
        <strong>${isMarathi ? "प्रमाणपत्र" : "CERTIFICATE"}</strong>
        <span></span>
      </div>

      <div class="candidate-name" style="font-size:${nameFont}px">${safeCandidateName}</div>

      <div class="body-copy">
        ${isMarathi ? marathiBody : englishBody}
      </div>

      <div class="signatures">
        ${signatureBlock(
          language,
          "Girish",
          isMarathi ? "डॉ. गिरीश कुलकर्णी" : "Dr. Girish Kulkarni",
          isMarathi ? ["संस्थापक,", "स्नेहालय, अहिल्यानगर."] : ["Founder", "Snehalaya, Ahilyanagar."]
        )}
        ${signatureBlock(
          language,
          "Anil",
          isMarathi ? "श्री. अनिल गावडे" : "Mr. Anil Gavade",
          isMarathi ? ["कार्याध्यक्ष,", "स्नेहालय, अहिल्यानगर."] : ["Executive President", "Snehalaya, Ahilyanagar."]
        )}
        ${signatureBlock(
          language,
          "Sathbhai",
          isMarathi ? "श्री. शशिकांत सातभाई" : "Mr. Shashikant Satbhai",
          isMarathi ? ["विश्वस्त,", "स्नेहालय, अहिल्यानगर."] : ["Trustee", "Snehalaya, Ahilyanagar."]
        )}
      </div>

      <div class="footer-rule">
        <span></span><b></b><span></span>
      </div>
      <div class="address">
        ${isMarathi
          ? "पत्ता: स्नेहालय, एफ - ब्लॉक, एम. आय. डी. सी., अहिल्यानगर, महा. ४१४१११."
          : "Address:Snehalaya, F-Block, M.I.D.C., Ahilyanagar, Maharashtra – 414111, India."}
      </div>
      <div class="contact-line">📧 info@snehalaya.org &nbsp; 🌐 www.snehalaya.org</div>
    </div>
  `;
}

function certificateStyles() {
  return `
    .certificate {
      position: relative;
      width: 1600px;
      height: 1131px;
      overflow: hidden;
      background: #fffdf6;
      color: #210b08;
      font-family: Georgia, "Times New Roman", serif;
      box-sizing: border-box;
      border: 30px solid transparent;
      border-image: linear-gradient(90deg, #f79b4e, #fff0a4, #f79b4e) 1;
      letter-spacing: 0;
    }
    .certificate::before {
      content: "";
      position: absolute;
      inset: 26px;
      border: 3px solid #e7c55c;
      pointer-events: none;
    }
    .certificate::after {
      content: "";
      position: absolute;
      inset: 44px;
      border: 2px solid rgba(132, 92, 18, 0.55);
      pointer-events: none;
    }
    .outer-glow {
      position: absolute;
      inset: 0;
      box-shadow: inset 0 0 42px rgba(255, 192, 77, 0.7);
      pointer-events: none;
    }
    .top-line {
      position: absolute;
      top: 36px;
      left: 390px;
      right: 390px;
      height: 2px;
      background: linear-gradient(90deg, transparent, #916318, #916318, transparent);
    }
    .top-line::before,
    .top-line::after {
      content: "";
      position: absolute;
      top: -5px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #70420a;
    }
    .top-line::before { left: -18px; }
    .top-line::after { right: -18px; }
    .ornament {
      position: absolute;
      top: 38px;
      left: 0;
      right: 0;
      text-align: center;
      color: #90610e;
      font-size: 38px;
      line-height: 1;
    }
    .corner {
      position: absolute;
      z-index: 1;
      color: #9e6d17;
      font-size: 160px;
      line-height: 1;
      opacity: 0.9;
      font-family: Georgia, serif;
    }
    .corner-tl { top: 28px; left: 30px; transform: rotate(18deg); }
    .corner-tr { top: 28px; right: 30px; transform: scaleX(-1) rotate(18deg); }
    .corner-bl { bottom: 28px; left: 30px; transform: rotate(-18deg) scaleY(-1); }
    .corner-br { bottom: 28px; right: 30px; transform: scale(-1, -1) rotate(-18deg); }
    .logo-box {
      position: absolute;
      top: 126px;
      width: 184px;
      height: 184px;
      border: 2px solid #242424;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      box-sizing: border-box;
    }
    .logo-left { left: 112px; }
    .logo-right { right: 112px; gap: 6px; }
    .logo-left img {
      width: 154px;
      height: 154px;
      object-fit: contain;
    }
    .logo-20-mark {
      color: #64913a;
      font-size: 58px;
      line-height: 0.8;
    }
    .logo-right strong {
      color: #5b7138;
      font-family: Georgia, serif;
      font-size: 28px;
    }
    .logo-right span {
      color: #66723d;
      font-family: "Noto Sans Devanagari", "Kohinoor Devanagari", sans-serif;
      font-size: 16px;
      font-weight: 700;
    }
    .brand-title {
      position: absolute;
      top: 100px;
      left: 330px;
      right: 330px;
      text-align: center;
      color: #5d84e8;
      font-size: 46px;
      font-weight: 900;
      letter-spacing: 9px;
      text-shadow: 2px 2px 2px rgba(119, 77, 44, 0.28);
    }
    .marathi .brand-title {
      font-family: "Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", sans-serif;
      font-size: 48px;
      letter-spacing: 0;
    }
    .test-title {
      position: absolute;
      top: 175px;
      left: 340px;
      right: 340px;
      text-align: center;
      color: #ef59b5;
      font-weight: 900;
      line-height: 1.08;
      text-transform: uppercase;
    }
    .certificate-title-row {
      position: absolute;
      top: 303px;
      left: 350px;
      right: 350px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 24px;
      align-items: center;
      color: #7d0902;
      font-size: 47px;
      font-weight: 900;
      text-align: center;
    }
    .marathi .certificate-title-row {
      top: 296px;
      font-family: "Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", sans-serif;
      font-size: 56px;
    }
    .certificate-title-row span {
      height: 2px;
      background: linear-gradient(90deg, transparent, #d8c48d, transparent);
      position: relative;
    }
    .certificate-title-row span::after {
      content: "◇";
      position: absolute;
      top: -18px;
      left: 50%;
      transform: translateX(-50%);
      color: #d3bd83;
      font-size: 30px;
    }
    .candidate-name {
      position: absolute;
      top: 395px;
      left: 112px;
      right: 112px;
      color: #b40428;
      text-align: center;
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 900;
      line-height: 1.08;
      text-transform: uppercase;
    }
    .marathi .candidate-name {
      top: 408px;
      font-family: "Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", Arial, sans-serif;
      text-transform: none;
    }
    .body-copy {
      position: absolute;
      top: 512px;
      left: 70px;
      right: 70px;
      font-size: 38px;
      line-height: 1.65;
      text-align: justify;
      word-spacing: 12px;
      color: #230c08;
    }
    .marathi .body-copy {
      top: 540px;
      font-family: "Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", serif;
      font-size: 37px;
      line-height: 1.65;
      word-spacing: 4px;
    }
    .signatures {
      position: absolute;
      left: 150px;
      right: 150px;
      bottom: 128px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 64px;
      align-items: end;
    }
    .signature-block {
      text-align: center;
      color: #2b2535;
    }
    .signature {
      height: 72px;
      color: #14346e;
      font-family: "Brush Script MT", "Segoe Script", cursive;
      font-size: 54px;
      line-height: 72px;
      transform: rotate(-7deg);
    }
    .signature-line {
      height: 2px;
      background: #2f2921;
      margin: 0 12px 12px;
    }
    .sign-name {
      color: #2b0704;
      font-size: 30px;
      font-weight: 900;
      line-height: 1.1;
    }
    .marathi .sign-name {
      font-family: "Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", serif;
      font-size: 28px;
    }
    .sign-title {
      margin-top: 8px;
      color: #2f2c42;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 24px;
      font-weight: 800;
      line-height: 1.25;
    }
    .marathi .sign-title {
      font-family: "Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", sans-serif;
    }
    .footer-rule {
      position: absolute;
      left: 178px;
      right: 178px;
      bottom: 92px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 62px;
      align-items: center;
    }
    .footer-rule span {
      height: 3px;
      background: #2a0d0a;
    }
    .footer-rule b {
      width: 23px;
      height: 23px;
      border-radius: 50%;
      background: #2a0d0a;
    }
    .address {
      position: absolute;
      left: 96px;
      right: 96px;
      bottom: 48px;
      color: #8b0e0a;
      text-align: center;
      font-size: 27px;
      font-weight: 900;
    }
    .marathi .address {
      font-family: "Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", serif;
      font-size: 25px;
    }
    .contact-line {
      position: absolute;
      left: 96px;
      right: 96px;
      bottom: 18px;
      color: #2182c8;
      text-align: center;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 23px;
      font-weight: 900;
    }
  `;
}

async function renderCertificateCanvas(data, language) {
  const { default: html2canvas } = await import("html2canvas");
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "1600px";
  wrapper.style.height = "1131px";
  wrapper.style.background = "#fff";
  wrapper.innerHTML = `<style>${certificateStyles()}</style>${certificateMarkup(data, language)}`;
  document.body.appendChild(wrapper);

  try {
    await Promise.all(
      Array.from(wrapper.querySelectorAll("img")).map(img => (
        img.complete
          ? Promise.resolve()
          : new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
            })
      ))
    );
    return await html2canvas(wrapper.firstElementChild, {
      backgroundColor: "#fffdf6",
      scale: 2,
      useCORS: true,
      logging: false,
    });
  } finally {
    wrapper.remove();
  }
}

export async function downloadCertificatePDF(result, fallbackSuite = {}, language = "english") {
  const normalizedLanguage = language === "marathi" ? "marathi" : "english";
  const data = certificateDataFromResult(result, fallbackSuite);
  const canvas = await renderCertificateCanvas(data, normalizedLanguage);
  const image = canvas.toDataURL("image/jpeg", 0.98);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.addImage(image, "JPEG", 0, 0, 297, 210);
  doc.save(`certificate_${cleanName(data.candidateName)}_${cleanName(data.testName)}_${normalizedLanguage}.pdf`);
}

export async function openCertificateEmail(result, fallbackSuite = {}, language = "english") {
  const normalizedLanguage = language === "marathi" ? "marathi" : "english";
  const data = certificateDataFromResult(result, fallbackSuite);
  if (!data.candidateEmail || !data.candidateEmail.includes("@")) {
    throw new Error("Candidate email is not available.");
  }

  await downloadCertificatePDF(result, fallbackSuite, normalizedLanguage);

  const subject = `Certificate - ${data.testName} (${LANGUAGE_LABELS[normalizedLanguage]})`;
  const body = normalizedLanguage === "marathi"
    ? [
        `प्रिय ${data.candidateName},`,
        "",
        `${data.testName} ही चाचणी यशस्वीरित्या पूर्ण केल्याबद्दल अभिनंदन.`,
        `Score: ${data.score}/${data.totalMarks} (${data.percentage}%)`,
        "",
        "आपले प्रमाणपत्र PDF तयार करण्यात आले आहे.",
        "",
        "Regards,",
        "Snehalaya",
      ].join("\n")
    : [
        `Dear ${data.candidateName},`,
        "",
        `Congratulations on successfully completing ${data.testName}.`,
        `Score: ${data.score}/${data.totalMarks} (${data.percentage}%)`,
        "",
        "Your certificate PDF has been prepared by Snehalaya.",
        "",
        "Regards,",
        "Snehalaya",
      ].join("\n");

  window.location.href = `mailto:${data.candidateEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
