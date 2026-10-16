import { mkdir, writeFile } from 'node:fs/promises';
const stream='BT /F1 24 Tf 70 730 Td (Connected Knowledge: A Research Note) Tj /F1 12 Tf 0 -35 Td (Paperly Test Author - 2024) Tj 0 -45 Td (Abstract) Tj 0 -25 Td (A local PDF fixture for validating import, metadata and persistence.) Tj 0 -25 Td (No network request or personal document is needed for this test.) Tj ET';
const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  '<< /Title (Connected Knowledge: A Research Note) /Author (Paperly Test Author) >>'
];
let pdf='%PDF-1.4\n';const offsets=[0];
objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
const start=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
offsets.slice(1).forEach(offset=>pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`);
pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${start}\n%%EOF\n`;
await mkdir('tests/fixtures',{recursive:true});await writeFile('tests/fixtures/research-note.pdf',pdf);
console.log('Created tests/fixtures/research-note.pdf');
