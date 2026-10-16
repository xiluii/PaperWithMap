import { PDFDocument,StandardFonts,rgb,degrees } from 'pdf-lib';
import { promises as fs } from 'node:fs';
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
pdf.setTitle('Continuous Reading Verification');pdf.setAuthor('Paperly Test Fixture');
for(let i=1;i<=6;i++){
  const page=pdf.addPage(i===3?[792,612]:[612,792]);
  page.drawText(`Continuous Reading - Page ${i} of 6`,{x:50,y:page.getHeight()-70,size:22,font,color:rgb(.15,.25,.18)});
  page.drawText(i===6?'END OF ARTICLE - last page':'Scroll down to continue to the next page.',{x:50,y:page.getHeight()-110,size:14,font});
  page.drawText(`Annotation target: page ${i}`,{x:50,y:page.getHeight()/2,size:16,font});
  if(i===4)page.setRotation(degrees(90));
}
await fs.mkdir('tests/fixtures',{recursive:true});
await fs.writeFile('tests/fixtures/continuous-reading.pdf',await pdf.save());
console.log('Created six-page mixed-size/rotated PDF fixture.');
