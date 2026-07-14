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

function fittedCanvasFont(ctx, text, { weight = 700, size, minSize, family, maxWidth }) {
  let nextSize = size;
  do {
    ctx.font = `${weight} ${nextSize}px ${family}`;
    if (ctx.measureText(String(text || "")).width <= maxWidth || nextSize <= minSize) {
      return nextSize;
    }
    nextSize -= 2;
  } while (nextSize >= minSize);
  return minSize;
}

function basePath() {
  return import.meta.env.BASE_URL || "/";
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
  return `${basePath()}Logo.png`;
}

function templateBaseName(language) {
  return `certificate-${language === "marathi" ? "marathi" : "english"}`;
}

function certificateFileName(data, language) {
  const normalizedLanguage = language === "marathi" ? "marathi" : "english";
  return `certificate_${cleanName(data.candidateName)}_${cleanName(data.testName)}_${normalizedLanguage}.pdf`;
}

function templateSources(language) {
  const name = templateBaseName(language);
  return ["png", "jpg", "jpeg"].map(extension => `${basePath()}${name}.${extension}`);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = `${src}${src.includes("?") ? "&" : "?"}v=${Date.now()}`;
  });
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
void certificateMarkup;

// Keep all fallback certificate copy in genuine UTF-8. The older decorative
// markup above is retained only for compatibility with existing templates.
function certificateMarkupUtf8(data, language) {
  const isMarathi = language === "marathi";
  const testName = escapeHtml(data.testName);
  const candidateName = escapeHtml(isMarathi ? data.candidateName : data.candidateName.toUpperCase());
  const testFont = fitFontSize(data.testName, 72, 42, [
    { length: 42, size: 42 }, { length: 30, size: 50 }, { length: 22, size: 60 },
  ]);
  const nameFont = fitFontSize(data.candidateName, isMarathi ? 72 : 64, 40, [
    { length: 45, size: 40 }, { length: 34, size: 48 }, { length: 24, size: 56 },
  ]);
  const body = isMarathi
    ? `यांनी स्नेहालय, अहिल्यानगर यांच्या वतीने आयोजित करण्यात आलेली "${testName}" ही ऑनलाइन चाचणी यशस्वीरित्या पूर्ण केली आहे. सदर चाचणीमध्ये सहभागी होऊन त्यांनी सर्व आवश्यक प्रक्रिया पूर्ण केल्या असून त्यांची कामगिरी समाधानकारक आहे. त्यांच्या सक्रिय सहभाग व सहकार्याबद्दल स्नेहालय त्यांचे अभिनंदन करते.`
    : `This is to certify that the participant has successfully completed the "${testName}" online assessment organized by Snehalaya, Ahilyanagar. The participant has fulfilled all the required procedures and demonstrated satisfactory performance. Snehalaya appreciates their active participation and cooperation.`;
  const people = isMarathi
    ? [
        ["Girish", "डॉ. गिरीश कुलकर्णी", ["संस्थापक,", "स्नेहालय, अहिल्यानगर."]],
        ["Anil", "श्री. अनिल गावडे", ["कार्याध्यक्ष,", "स्नेहालय, अहिल्यानगर."]],
        ["Sathbhai", "श्री. शशिकांत सातभाई", ["विश्वस्त,", "स्नेहालय, अहिल्यानगर."]],
      ]
    : [
        ["Girish", "Dr. Girish Kulkarni", ["Founder", "Snehalaya, Ahilyanagar."]],
        ["Anil", "Mr. Anil Gavade", ["Executive President", "Snehalaya, Ahilyanagar."]],
        ["Sathbhai", "Mr. Shashikant Satbhai", ["Trustee", "Snehalaya, Ahilyanagar."]],
      ];
  return `
    <div class="certificate ${isMarathi ? "marathi" : "english"}">
      <div class="outer-glow"></div><div class="top-line"></div>
      <div class="ornament top-ornament">⌁ ❦ ⌁</div>
      <div class="logo-box logo-left"><img src="${logoSrc()}" alt="Snehalaya" /></div>
      <div class="logo-box logo-right"><div class="logo-20-mark">☘</div><strong>Snehalaya 2.0</strong><span>तमसो मा ज्योतिर्गमय</span></div>
      <div class="brand-title">${isMarathi ? "स्नेहालय" : "SNEHALAYA"}</div>
      <div class="test-title" style="font-size:${testFont}px">[${testName}]</div>
      <div class="certificate-title-row"><span></span><strong>${isMarathi ? "प्रमाणपत्र" : "CERTIFICATE"}</strong><span></span></div>
      <div class="candidate-name" style="font-size:${nameFont}px">${candidateName}</div>
      <div class="body-copy">${body}</div>
      <div class="signatures">${people.map(person => signatureBlock(language, ...person)).join("")}</div>
      <div class="footer-rule"><span></span><b></b><span></span></div>
      <div class="address">${isMarathi ? "पत्ता: स्नेहालय, एफ-ब्लॉक, एम. आय. डी. सी., अहिल्यानगर, महाराष्ट्र ४१४१११." : "Address: Snehalaya, F-Block, M.I.D.C., Ahilyanagar, Maharashtra – 414111, India."}</div>
      <div class="contact-line">Email: info@snehalaya.org &nbsp; Web: www.snehalaya.org</div>
    </div>`;
}

async function renderCertificateCanvas(data, language) {
  const { default: html2canvas } = await import("html2canvas");
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "0";
  wrapper.style.top = "0";
  wrapper.style.width = "1600px";
  wrapper.style.height = "1131px";
  wrapper.style.background = "#fff";
  wrapper.style.pointerEvents = "none";
  wrapper.style.zIndex = "-1";
  wrapper.style.transform = "translateZ(0)";
  wrapper.innerHTML = `<style>${certificateStyles()}</style>${certificateMarkupUtf8(data, language)}`;
  document.body.appendChild(wrapper);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
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
      windowWidth: 1600,
      windowHeight: 1131,
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    wrapper.remove();
  }
}

function canvasLooksBlank(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  const sampleWidth = Math.min(canvas.width, 240);
  const sampleHeight = Math.min(canvas.height, 160);
  const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let nonWhitePixels = 0;
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];
    if (a > 0 && (r < 245 || g < 245 || b < 245)) {
      nonWhitePixels++;
      if (nonWhitePixels > 20) return false;
    }
  }
  return true;
}

async function tryTemplateCertificatePDF(data, language) {
  try {
    let image = null;
    for (const source of templateSources(language)) {
      try {
        image = await loadImage(source);
        break;
      } catch {
        image = null;
      }
    }
    if (!image) return null;

    const canvas = document.createElement("canvas");
    const width = image.naturalWidth || 1600;
    const height = image.naturalHeight || 1131;
    const mmX = value => (value / 297) * width;
    const mmY = value => (value / 210) * height;
    const ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const isMarathi = language === "marathi";
    const bg = "#fffdf6";
    const scale = width / 1600;
    const headingFamily = `"Noto Sans Devanagari", "Kohinoor Devanagari", Arial, sans-serif`;
    const serifFamily = `"Noto Sans Devanagari", "Kohinoor Devanagari", Georgia, "Times New Roman", serif`;
    const testName = `[${data.testName}]`;
    const displayName = isMarathi ? data.candidateName : data.candidateName.toUpperCase();

    ctx.fillStyle = bg;
    ctx.fillRect(mmX(80), mmY(31), mmX(137), mmY(22));
    ctx.fillRect(mmX(24), mmY(isMarathi ? 72 : 73), mmX(249), mmY(isMarathi ? 26 : 20));

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ef59b5";
    const topTitleSize = fittedCanvasFont(ctx, testName, {
      weight: 900,
      size: 58 * scale,
      minSize: 28 * scale,
      family: headingFamily,
      maxWidth: mmX(120),
    });
    ctx.font = `900 ${topTitleSize}px ${headingFamily}`;
    ctx.fillText(testName, mmX(148.5), mmY(42.5));

    ctx.fillStyle = "#b40428";
    const candidateSize = fittedCanvasFont(ctx, displayName, {
      weight: 900,
      size: (isMarathi ? 82 : 78) * scale,
      minSize: 42 * scale,
      family: headingFamily,
      maxWidth: mmX(230),
    });
    ctx.font = `900 ${candidateSize}px ${headingFamily}`;
    ctx.fillText(displayName, mmX(148.5), mmY(isMarathi ? 86 : 84));

    ctx.fillStyle = "#230c08";
    const bodyTestName = `"${data.testName}"`;
    ctx.textAlign = "left";
    if (isMarathi) {
      ctx.fillStyle = bg;
      ctx.fillRect(mmX(181), mmY(101), mmX(55), mmY(10));
      ctx.fillStyle = "#230c08";
      const bodySize = fittedCanvasFont(ctx, bodyTestName, {
        weight: 400,
        size: 24 * scale,
        minSize: 13 * scale,
        family: serifFamily,
        maxWidth: mmX(52),
      });
      ctx.font = `400 ${bodySize}px ${serifFamily}`;
      ctx.fillText(bodyTestName, mmX(183), mmY(106));
    } else {
      ctx.fillStyle = bg;
      ctx.fillRect(mmX(208), mmY(95), mmX(52), mmY(9));
      ctx.fillStyle = "#230c08";
      const bodySize = fittedCanvasFont(ctx, bodyTestName, {
        weight: 400,
        size: 22 * scale,
        minSize: 12 * scale,
        family: serifFamily,
        maxWidth: mmX(48),
      });
      ctx.font = `400 ${bodySize}px ${serifFamily}`;
      ctx.fillText(bodyTestName, mmX(211), mmY(99.5));
    }

    doc.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 297, 210);
    return doc;
  } catch {
    return null;
  }
}

async function buildCertificatePDFDocument(result, fallbackSuite = {}, language = "english") {
  const normalizedLanguage = language === "marathi" ? "marathi" : "english";
  const data = certificateDataFromResult(result, fallbackSuite);

  const templateDoc = await tryTemplateCertificatePDF(data, normalizedLanguage);
  if (templateDoc) return { doc: templateDoc, data, language: normalizedLanguage };

  const canvas = await renderCertificateCanvas(data, normalizedLanguage);
  if (!canvas.width || !canvas.height || canvasLooksBlank(canvas)) {
    throw new Error("Certificate preview could not be rendered. Please try again after refreshing the page.");
  }
  const image = canvas.toDataURL("image/jpeg", 0.98);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.addImage(image, "JPEG", 0, 0, 297, 210);
  return { doc, data, language: normalizedLanguage };
}

async function buildCertificatePDFFile(result, fallbackSuite = {}, language = "english") {
  const built = await buildCertificatePDFDocument(result, fallbackSuite, language);
  const fileName = certificateFileName(built.data, built.language);
  const blob = built.doc.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });
  return { ...built, file, fileName };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCertificatePDF(result, fallbackSuite = {}, language = "english") {
  const { doc, data, language: normalizedLanguage } = await buildCertificatePDFDocument(result, fallbackSuite, language);
  doc.save(certificateFileName(data, normalizedLanguage));
}

function certificateEmailBody(data, fileName, language) {
  if (language === "marathi") {
    return [
      `प्रिय ${data.candidateName},`,
      "",
      `${data.testName} ही चाचणी यशस्वीरित्या पूर्ण केल्याबद्दल अभिनंदन.`,
      `गुण: ${data.score}/${data.totalMarks} (${data.percentage}%)`,
      "",
      `आपले प्रमाणपत्र PDF जोडले आहे. ते आपोआप जोडले नसल्यास डाउनलोड केलेली फाइल जोडा: ${fileName}`,
      "",
      "सस्नेह,",
      "स्नेहालय",
    ].join("\n");
  }
  return [
    `Dear ${data.candidateName},`,
    "",
    `Congratulations on successfully completing ${data.testName}.`,
    `Score: ${data.score}/${data.totalMarks} (${data.percentage}%)`,
    "",
    `Your certificate PDF is attached. If it is not attached automatically, please attach the downloaded file: ${fileName}`,
    "",
    "Regards,",
    "Snehalaya",
  ].join("\n");
}

export async function openCertificateEmail(result, fallbackSuite = {}, language = "english") {
  const normalizedLanguage = language === "marathi" ? "marathi" : "english";
  const { data, file, fileName } = await buildCertificatePDFFile(result, fallbackSuite, normalizedLanguage);
  if (!data.candidateEmail || !data.candidateEmail.includes("@")) {
    throw new Error("Candidate email is not available.");
  }

  const subject = `Certificate - ${data.testName} (${LANGUAGE_LABELS[normalizedLanguage]})`;
  const legacyBody = normalizedLanguage === "marathi"
    ? [
        `प्रिय ${data.candidateName},`,
        "",
        `${data.testName} ही चाचणी यशस्वीरित्या पूर्ण केल्याबद्दल अभिनंदन.`,
        `Score: ${data.score}/${data.totalMarks} (${data.percentage}%)`,
        "",
        `आपले प्रमाणपत्र PDF जोडले आहे. जर ते जोडले नसेल, तर डाउनलोड केलेली फाइल जोडा: ${fileName}`,
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
        `Your certificate PDF is attached. If it is not attached automatically, please attach the downloaded file: ${fileName}`,
        "",
        "Regards,",
        "Snehalaya",
      ].join("\n");
  const body = certificateEmailBody(data, fileName, normalizedLanguage);
  void legacyBody;

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: subject,
        text: `${body}\n\nTo: ${data.candidateEmail}`,
      });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }

  downloadBlob(file, fileName);
  window.location.href = `mailto:${data.candidateEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
