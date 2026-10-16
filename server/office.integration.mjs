import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { createLocalServer } from './index.mjs';
import { once } from 'node:events';
import { identifyFile } from './file-types.mjs';
import { officeCapabilities } from './office-converter.mjs';

const capability=await officeCapabilities();
for(const [file,kind] of [['legacy-sample.doc','word'],['presentation-sample.pptx','presentation'],['legacy-presentation.ppt','presentation']]){
  test(`real local conversion: ${file} → ${kind==='word'?'editable DOCX':'continuous PDF'}`,{skip:!capability[kind],timeout:150000},async t=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'paperly-office-')),opened=[],{server,store}=await createLocalServer({directory,openFile:async file=>opened.push(file)});server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
    t.after(async()=>{await store.conversions;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));const target=path.resolve(directory);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('paperly-office-'));await fs.rm(target,{recursive:true,force:true});});
    const original=await fs.readFile(new URL('../tests/fixtures/assets/'+file,import.meta.url));
    const initial=await store.uploadFile('sample',original,file,'application/octet-stream');assert.equal(initial.previewStatus,'queued');
    await store.conversions;const info=await store.info('sample');assert.equal(info.previewStatus,'ready',info.previewError);assert.equal(info.kind,kind);
    const current=await fs.readFile(await store.filePath('sample'));assert.deepEqual(await fs.readFile(await store.filePath('sample',true)),original);
    const external=await fetch(url+'/api/files/sample/open',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(external.status,200);assert.equal(opened[0],await store.filePath('sample',kind==='presentation'));
    if(kind==='word'){assert.equal((await identifyFile(current,'editable.docx')).kind,'word');assert.match(await store.filePath('sample'),/document\.docx$/);assert.equal((await fetch(url+'/api/files/sample/base')).status,415);}
    else{
      assert.equal((await PDFDocument.load(current)).getPageCount(),3);assert.equal(Object.keys((await store.annotations('sample')).pages).length,0);
      const base=await fetch(url+'/api/files/sample/base');assert.equal(base.headers.get('content-type'),'application/pdf');assert.equal((await PDFDocument.load(await base.arrayBuffer())).getPageCount(),3);
      const source=await fetch(url+'/api/files/sample/original');assert.deepEqual(Buffer.from(await source.arrayBuffer()),original);
      const saved=await store.saveAnnotations('sample',{version:1,revision:info.revision,pages:{}});assert.notEqual(saved.revision,info.revision);assert.equal((await PDFDocument.load(await fs.readFile(await store.filePath('sample')))).getPageCount(),3);
    }
  });
}
