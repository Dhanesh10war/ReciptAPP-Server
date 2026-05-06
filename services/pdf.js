import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";

export async function svgToPdfBuffer(svg) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [1400, 760], margin: 0 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    SVGtoPDF(doc, svg, 0, 0, {
      preserveAspectRatio: "xMidYMid meet",
      useCSS: true
    });

    doc.end();
  });
}
