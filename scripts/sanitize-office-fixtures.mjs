// Only the two synthetic presentation fixtures are touched; never user documents.
import { promises as fs } from 'node:fs';
import CFB from 'cfb';

const root = new URL('../tests/fixtures/assets/', import.meta.url);
const pptxFile = new URL('presentation-sample.pptx', root);
const pptx = CFB.read(await fs.readFile(pptxFile), { type: 'buffer' });
for (let index = 0; index < pptx.FileIndex.length; index++) {
  const name = pptx.FullPaths[index], entry = pptx.FileIndex[index];
  if (!/docProps\/(core|app)\.xml$/.test(name)) continue;
  const text = Buffer.from(entry.content).toString('utf8').replace(/<(dc:creator|cp:lastModifiedBy|Company|Manager)>[^<]*<\/\1>/g, '<$1>Paperly Fixtures</$1>');
  CFB.utils.cfb_add(pptx, name, Buffer.from(text));
}
await fs.writeFile(pptxFile, CFB.write(pptx, { type: 'buffer', fileType: 'zip' }));

const pptFile = new URL('legacy-presentation.ppt', root);
const ppt = CFB.read(await fs.readFile(pptFile), { type: 'buffer' });
for (const name of [...ppt.FullPaths]) if (/\x05(?:Document)?SummaryInformation$/.test(name)) CFB.utils.cfb_del(ppt, name);
const currentUserPath = ppt.FullPaths.find(name => name.endsWith('/Current User'));
const currentUser = currentUserPath && CFB.find(ppt, currentUserPath);
if (!currentUser) throw new Error('Synthetic PPT is missing its Current User record');
const original = Buffer.from(currentUser.content);
// MS-PPT CurrentUserAtom: preserve the edit pointer and release version, replace
// both user-name encodings, and discard padding that may contain previous data.
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-ppt/940d5700-e4d7-4fc0-ab48-fed5dbc48bc1
if (original.length < 32 || original.readUInt32LE(8) !== 20) throw new Error('Unexpected CurrentUserAtom structure');
const oldNameLength = original.readUInt16LE(20), username = 'Paperly';
if (32 + oldNameLength > original.length) throw new Error('Invalid CurrentUserAtom name length');
const record = Buffer.concat([original.subarray(0, 28), Buffer.from(username), original.subarray(28 + oldNameLength, 32 + oldNameLength), Buffer.from(username, 'utf16le')]);
record.writeUInt16LE(username.length, 20); record.writeUInt32LE(record.length - 8, 4);
CFB.utils.cfb_add(ppt, currentUserPath, record);
await fs.writeFile(pptFile, CFB.write(ppt, { type: 'buffer', fileType: 'cfb' }));
console.log('Anonymized the synthetic PPT/PPTX fixture metadata.');
