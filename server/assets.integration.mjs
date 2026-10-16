import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import sharp from 'sharp';
import { createLocalServer } from './index.mjs';
import { LocalStore } from './storage.mjs';
import { FILE_TYPES } from './file-types.mjs';
import { docxFixture,imageFixture } from '../scripts/asset-fixtures.mjs';

async function setup(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'paperly-assets-')),opened=[];
  const {server,store}=await createLocalServer({directory,openFile:async file=>opened.push(file)});server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await store.conversions;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));const target=path.resolve(directory);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('paperly-assets-'));await fs.rm(target,{recursive:true,force:true});});
  const upload=(id,name,bytes,mime='application/octet-stream')=>fetch(`${url}/api/files/${id}?name=${encodeURIComponent(name)}`,{method:'PUT',headers:{'Content-Type':mime},body:bytes});
  return {directory,opened,url,store,upload};
}
test('images preserve originals, decode orientation, and expose thumbnails with real MIME types',async t=>{
  const {upload,url,store}=await setup(t),bytes=await imageFixture();let response=await upload('image','透明 图片.PNG',bytes);assert.equal(response.status,200);
  const info=await response.json();assert.equal(info.kind,'image');assert.equal(info.width,800);assert.equal(info.height,500);
  response=await fetch(url+'/api/files/image/content');assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  response=await fetch(url+'/api/files/image/thumbnail');assert.equal(response.headers.get('content-type'),'image/webp');assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width,512);
  const rotated=await sharp({create:{width:80,height:40,channels:3,background:'#668866'}}).withMetadata({orientation:6}).jpeg().toBuffer();
  const second=await (await upload('rotated','photo.JPEG',rotated)).json();assert.equal(second.width,40);assert.equal(second.height,80);
  assert.deepEqual(await fs.readFile(await store.filePath('image',true)),bytes);
});
test('Word edits save as real DOCX revisions, survive restart, and leave the imported original intact',async t=>{
  const {upload,url,store,directory,opened}=await setup(t),original=docxFixture('Original document'),edited=docxFixture('Saved edited document');
  const response=await upload('word','研究 文档.DOCX',original,FILE_TYPES.docx.mimeType);assert.equal(response.status,200);const info=await response.json();assert.equal(info.kind,'word');assert.equal(info.previewStatus,'ready');
  const save=await fetch(url+'/api/files/word/document',{method:'PUT',headers:{'Content-Type':FILE_TYPES.docx.mimeType,'If-Match':info.revision},body:edited});assert.equal(save.status,200);const saved=await save.json();assert.notEqual(saved.revision,info.revision);
  const restart=new LocalStore(directory);assert.deepEqual(await fs.readFile(await restart.filePath('word')),edited);assert.deepEqual(await fs.readFile(await restart.filePath('word',true)),original);
  const content=await fetch(url+'/api/files/word/content');assert.equal(content.headers.get('content-type'),FILE_TYPES.docx.mimeType);assert.deepEqual(Buffer.from(await content.arrayBuffer()),edited);
  assert.equal((await fetch(url+'/api/files/word/open',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,200);assert.equal(opened[0],await store.filePath('word'));
});
test('Word revision conflicts and external edits never overwrite a newer file',async t=>{
  const {upload,url,store}=await setup(t),original=docxFixture('Original');const info=await (await upload('word','a.docx',original)).json();
  const save=(revision,bytes)=>fetch(url+'/api/files/word/document',{method:'PUT',headers:{'Content-Type':FILE_TYPES.docx.mimeType,'If-Match':revision},body:bytes});
  assert.equal((await save('stale',docxFixture('Stale'))).status,409);assert.deepEqual(await fs.readFile(await store.filePath('word')),original);
  const external=docxFixture('Edited by external software');await fs.writeFile(await store.filePath('word'),external);assert.equal((await save(info.revision,docxFixture('Overwrite'))).status,409);assert.deepEqual(await fs.readFile(await store.filePath('word')),external);
  const reopened=await (await fetch(url+'/api/files/word/info')).json();assert.notEqual(reopened.revision,info.revision);assert.equal((await save(reopened.revision,docxFixture('Continue editing external version'))).status,200);
});
test('mixed-file uploads reject disguised contents, unsupported formats, traversal, and invalid replacements',async t=>{
  const {upload,url}=await setup(t);assert.equal((await upload('bad','fake.png',docxFixture())).status,400);assert.equal((await upload('bad','app.exe',Buffer.from('exe'))).status,415);
  assert.equal((await upload('bad','fake.docx',Buffer.from('not a zip'))).status,400);assert.equal((await upload('bad','a.png',await imageFixture(),'application/pdf')).status,415);
  const info=await (await upload('word','a.docx',docxFixture())).json();assert.equal((await fetch(url+'/api/files/word/document',{method:'PUT',headers:{'Content-Type':FILE_TYPES.docx.mimeType,'If-Match':info.revision},body:await imageFixture()})).status,400);
  assert.equal((await fetch(url+'/api/files/word/annotations')).status,415);assert.equal((await fetch(url+'/api/files/..%2Fworkspace/content')).status,404);
});
