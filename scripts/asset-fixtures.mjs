import CFB from 'cfb';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function docxFixture(text='A local editable Word document'){
  const zip=CFB.utils.cfb_new();
  const escape=value=>value.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const entries={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>Paperly · Word editing</w:t></w:r></w:p><w:p><w:r><w:t>${escape(text)}</w:t></w:r></w:p><w:p><w:r><w:t>这是一个本地 Word 编辑测试，支持中文输入、基本排版和关联手写笔记。</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Research question</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Local notes</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  };
  for(const [name,content] of Object.entries(entries))CFB.utils.cfb_add(zip,name,Buffer.from(content));
  return Buffer.from(CFB.write(zip,{type:'buffer',fileType:'zip'}));
}
export async function imageFixture(format='png'){return sharp({create:{width:800,height:500,channels:4,background:{r:87,g:135,b:112,alpha:.65}}}).composite([{input:Buffer.from('<svg width="800" height="500"><circle cx="400" cy="235" r="125" fill="#e9dbc0"/><text x="400" y="445" text-anchor="middle" font-size="30" fill="#244b3a">PAPERLY LOCAL IMAGE</text></svg>')}]).toFormat(format).toBuffer();}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve('tests/fixtures/assets');await fs.mkdir(root,{recursive:true});
  await fs.writeFile(path.join(root,'editable-sample.docx'),docxFixture());
  await fs.writeFile(path.join(root,'transparent-sample.png'),await imageFixture());
  await fs.writeFile(path.join(root,'photo-sample.jpg'),await imageFixture('jpeg'));
  console.log('Created local Word and image fixtures in '+root);
}
