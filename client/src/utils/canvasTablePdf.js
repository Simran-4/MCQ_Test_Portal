import jsPDF from "jspdf";
import { downloadPdfDocument } from "./pdfDownload";

function assetUrl(path) {
  const base = import.meta.env.BASE_URL || "/";
  return new URL(`${base}${String(path).replace(/^\/+/, "")}`, window.location.origin).href;
}

async function ensureMarathiFont() {
  const family = "Noto Sans Devanagari PDF";
  if (!document.fonts.check(`16px "${family}"`)) {
    const font = new FontFace(family, `url("${assetUrl("fonts/NotoSansDevanagari-Regular.ttf")}")`);
    document.fonts.add(await font.load());
  }
  await document.fonts.ready;
  return family;
}

function wrap(ctx, value, maxWidth) {
  const words = String(value ?? "-").split(/\s+/).filter(Boolean);
  if (!words.length) return ["-"];
  const lines = [];
  let line = words.shift();
  for (const word of words) {
    const next = `${line} ${word}`;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else { lines.push(line); line = word; }
  }
  lines.push(line);
  return lines.flatMap(item => {
    if (ctx.measureText(item).width <= maxWidth) return [item];
    const pieces = []; let piece = "";
    for (const char of item) {
      if (piece && ctx.measureText(piece + char).width > maxWidth) { pieces.push(piece); piece = char; }
      else piece += char;
    }
    if (piece) pieces.push(piece);
    return pieces;
  });
}

export async function downloadCanvasTablePdf({ title, subtitle = "", columns, rows, fileName }) {
  const family = await ensureMarathiFont();
  const width = 1600;
  const height = 1131;
  const margin = 58;
  const headerHeight = 128;
  const tableTop = 174;
  const tableHeaderHeight = 82;
  const footerSpace = 48;
  const weights = columns.map(column => Number(column.weight) || 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const available = width - margin * 2;
  const colWidths = weights.map(value => available * value / totalWeight);
  const pages = [];
  let canvas;
  let ctx;
  let y;

  const startPage = () => {
    canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f8f7f4"; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#1a3d28"; ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = "#fff"; ctx.font = `700 34px "${family}", Arial`; ctx.fillText(title, margin, 52);
    ctx.font = `400 21px "${family}", Arial`; ctx.fillText(subtitle, margin, 91);
    ctx.fillStyle = "#e8f2ec"; ctx.fillRect(margin, tableTop, available, tableHeaderHeight);
    ctx.fillStyle = "#174c32"; ctx.font = `700 19px "${family}", Arial`;
    ctx.strokeStyle = "#b9cec1";
    let x = margin;
    columns.forEach((column, index) => {
      const cellWidth = colWidths[index];
      const lines = wrap(ctx, column.label, cellWidth - 24).slice(0, 2);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, tableTop, cellWidth, tableHeaderHeight); ctx.clip();
      const firstY = tableTop + (tableHeaderHeight - lines.length * 25) / 2 + 20;
      lines.forEach((line, lineIndex) => ctx.fillText(line, x + 12, firstY + lineIndex * 25));
      ctx.restore();
      ctx.strokeRect(x, tableTop, cellWidth, tableHeaderHeight);
      x += cellWidth;
    });
    y = tableTop + tableHeaderHeight;
  };

  const finishPage = () => { pages.push(canvas); };
  startPage();
  let rowIndex = 0;
  for (const row of rows) {
    ctx.font = `400 20px "${family}", Arial`;
    const cellLines = columns.map((column, index) => wrap(ctx, row[column.key], colWidths[index] - 24));
    const rowHeight = Math.max(48, Math.max(...cellLines.map(lines => lines.length)) * 29 + 20);
    if (y + rowHeight > height - footerSpace) { finishPage(); startPage(); }
    ctx.fillStyle = rowIndex % 2 ? "#fbfaf8" : "#fff"; ctx.fillRect(margin, y, available, rowHeight);
    ctx.strokeStyle = "#dce5df";
    ctx.fillStyle = "#26332e";
    let x = margin;
    cellLines.forEach((lines, index) => {
      const cellWidth = colWidths[index];
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, cellWidth, rowHeight); ctx.clip();
      lines.forEach((line, lineIndex) => ctx.fillText(line, x + 12, y + 31 + lineIndex * 29));
      ctx.restore();
      ctx.strokeRect(x, y, cellWidth, rowHeight);
      x += cellWidth;
    });
    y += rowHeight;
    rowIndex += 1;
  }
  finishPage();

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pages.forEach((page, index) => {
    if (index) doc.addPage();
    doc.addImage(page.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 297, 210, undefined, "FAST");
  });
  downloadPdfDocument(doc, fileName);
}
