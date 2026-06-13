import jsPDF from "jspdf";

function cleanName(value) {
  return String(value || "candidate")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "candidate";
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

export function downloadCertificatePDF(result, fallbackSuite = {}) {
  const data = certificateDataFromResult(result, fallbackSuite);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = 297;
  const pageHeight = 210;

  doc.setFillColor(249, 250, 247);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(45, 95, 63);
  doc.setLineWidth(2.2);
  doc.rect(14, 14, pageWidth - 28, pageHeight - 28);
  doc.setLineWidth(0.6);
  doc.rect(20, 20, pageWidth - 40, pageHeight - 40);

  doc.setTextColor(26, 61, 40);
  doc.setFont("times", "bold");
  doc.setFontSize(30);
  doc.text("Certificate of Completion", pageWidth / 2, 46, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(95, 105, 100);
  doc.text("This certifies that", pageWidth / 2, 66, { align: "center" });

  doc.setFont("times", "bold");
  doc.setFontSize(28);
  doc.setTextColor(26, 61, 40);
  doc.text(data.candidateName, pageWidth / 2, 84, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(95, 105, 100);
  doc.text("has successfully passed", pageWidth / 2, 101, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(45, 95, 63);
  doc.text(data.testName, pageWidth / 2, 116, { align: "center", maxWidth: 220 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(`Score: ${data.score}/${data.totalMarks} (${data.percentage}%)`, pageWidth / 2, 138, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(95, 105, 100);
  if (data.project || data.designation) {
    doc.text([data.project, data.designation].filter(Boolean).join(" | "), pageWidth / 2, 150, { align: "center" });
  }
  doc.text(`Date: ${new Date(data.submittedAt).toLocaleDateString("en-IN")}`, pageWidth / 2, 162, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 61, 40);
  doc.text("Snehalaya", pageWidth / 2, 181, { align: "center" });

  doc.save(`certificate_${cleanName(data.candidateName)}_${cleanName(data.testName)}.pdf`);
}

export function openCertificateEmail(result, fallbackSuite = {}) {
  const data = certificateDataFromResult(result, fallbackSuite);
  if (!data.candidateEmail || !data.candidateEmail.includes("@")) {
    throw new Error("Candidate email is not available.");
  }

  downloadCertificatePDF(result, fallbackSuite);

  const subject = `Certificate - ${data.testName}`;
  const body = [
    `Dear ${data.candidateName},`,
    "",
    `Congratulations on passing ${data.testName}.`,
    `Score: ${data.score}/${data.totalMarks} (${data.percentage}%)`,
    "",
    "Your certificate PDF has been prepared by Snehalaya.",
    "",
    "Regards,",
    "Snehalaya",
  ].join("\n");

  window.location.href = `mailto:${data.candidateEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
