export function downloadBlobFile(blob, fileName) {
  if (!blob?.size) throw new Error("The generated file is empty.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Safari may start reading the Blob after the click handler returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadPdfDocument(doc, fileName) {
  if (!doc || typeof doc.output !== "function") {
    throw new Error("The PDF document could not be prepared.");
  }
  downloadBlobFile(doc.output("blob"), fileName);
}

export function downloadExcelWorkbook(XLSX, workbook, fileName) {
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBlobFile(
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    fileName
  );
}
