import path from 'node:path';
import { defineConfig,normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
const dataDirectory=normalizePath(path.resolve(process.env.PAPERLY_DATA_DIR||'data'));
export default defineConfig({
  plugins:[react()],
  server:{
    port:5173,strictPort:true,
    proxy:{'/api':{target:'http://127.0.0.1:4317'}},
    // Office briefly locks its temporary files. They are local data, not HMR sources.
    watch:{ignored:[`${dataDirectory}/**`,'**/artifacts/**','**/test-results/**','**/coverage/**','**/*.tmp']},
  },
});
