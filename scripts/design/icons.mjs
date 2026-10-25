// PWA icons from the approved wordmark on the brand paper color (--seda-paper). Rerun after the
// merchant supplies a vector logo or icon source; the output is committed.
import {mkdir} from 'node:fs/promises';
import sharp from 'sharp';

const PAPER='#fcfcfc';
const SOURCE='public/brand/seda-wordmark.png';
// Maskable icons keep the mark inside the central 80% safe zone.
const ICONS=[['icon-192.png',192,0.78],['icon-512.png',512,0.78],['icon-maskable-512.png',512,0.6],['apple-touch-icon.png',180,0.74]];

await mkdir('public/icons',{recursive:true});
for(const [name,size,share] of ICONS) {
 const mark=await sharp(SOURCE).resize({width:Math.round(size*share),fit:'inside'}).png().toBuffer();
 await sharp({create:{width:size,height:size,channels:4,background:PAPER}}).composite([{input:mark,gravity:'centre'}]).png({compressionLevel:9}).toFile(`public/icons/${name}`);
 console.log(`public/icons/${name}`);
}
