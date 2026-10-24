import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Cache keys follow the actual dataset bytes, rather than the deployment date.
const digest=createHash('sha256');
function hashDirectory(directory:string){for(const file of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(directory,file.name);if(file.isDirectory())hashDirectory(path);else if(/\.(glb|json)$/.test(file.name)){digest.update(path);digest.update(readFileSync(path));}}}
hashDirectory('public/models');hashDirectory('public/data');
const modelVersion=digest.digest('hex').slice(0,16);
export default defineConfig({plugins:[react(),{name:'anatomy-cache-version',closeBundle(){const path='dist/sw.js';writeFileSync(path,readFileSync(path,'utf8').replace('anatomy-studio-v1',`anatomy-studio-${modelVersion}`));}}],define:{'import.meta.env.VITE_MODEL_VERSION':JSON.stringify(modelVersion)},build:{chunkSizeWarningLimit:1200,rollupOptions:{output:{manualChunks:{three:['three','@react-three/fiber','@react-three/drei']}}}}});
