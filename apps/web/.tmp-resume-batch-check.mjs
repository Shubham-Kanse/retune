import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const mod1 = await import(pathToFileURL(path.resolve('apps/web/src/lib/profile-domain/extractors/document-text-extractor.ts')).href);
const mod2 = await import(pathToFileURL(path.resolve('apps/web/src/lib/profile-domain/extractors/openai-resume-extractor.ts')).href);
const { extractDocumentText } = mod1;
const { extractProfileFromResumeFile } = mod2;

const TEST_DIR = path.resolve('test-data');
function mediaTypeFor(file){const l=file.toLowerCase(); if(l.endsWith('.pdf')) return 'application/pdf'; if(l.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; return 'application/octet-stream';}
function firstNonEmptyLine(text){return text.split(/\r?\n/).map(s=>s.trim()).find(Boolean)||'';}
function extractExpectedFromText(text){
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const linkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[\w\-/?=&.%]+/i)?.[0] ?? text.match(/linkedin\.com\/[\w\-/?=&.%]+/i)?.[0] ?? null;
  const phone = text.match(/(?:\+?\d[\d\s()\-]{7,}\d)/)?.[0]?.trim() ?? null;
  return { email, linkedin, phone, nameGuess: firstNonEmptyLine(text)};
}

const files = fs.readdirSync(TEST_DIR).filter(f=>/\.(pdf|docx)$/i.test(f)).sort((a,b)=>a.localeCompare(b));
const results=[];
for (const file of files){
  console.log('START', file);
  const buffer=fs.readFileSync(path.join(TEST_DIR,file));
  const mediaType=mediaTypeFor(file);
  const rawText=await extractDocumentText({filename:file,mediaType,buffer});
  const expected=extractExpectedFromText(rawText);
  const st=Date.now();
  const { extracted } = await extractProfileFromResumeFile({ filename:file, mediaType, buffer, existingProfile:null});
  const ms=Date.now()-st;
  const e=extracted??{};
  results.push({file,parseMs:ms,rawTextChars:rawText.length,expected,extracted:{fullName:e.fullName,email:e.email,phone:e.phone,linkedin:e.linkedin,location:e.location,currentTitle:e.currentTitle,experienceLevel:e.experienceLevel,targetRolesCount:Array.isArray(e.targetRoles)?e.targetRoles.length:0,experienceCount:Array.isArray(e.experience)?e.experience.length:0,educationCount:Array.isArray(e.education)?e.education.length:0,skillsCount:(Array.isArray(e.skillsTier1)?e.skillsTier1.length:0)+(Array.isArray(e.skillsTier2)?e.skillsTier2.length:0)+(Array.isArray(e.skillsTier3)?e.skillsTier3.length:0)},checks:{emailMatch:expected.email?String(e.email||'').toLowerCase()===expected.email.toLowerCase():null,linkedinPresentIfExpected:expected.linkedin?Boolean(e.linkedin):null,phonePresentIfExpected:expected.phone?Boolean(e.phone):null,hasName:Boolean(e.fullName),hasRoles:Array.isArray(e.targetRoles)&&e.targetRoles.length>0}});
  console.log('DONE', file, ms);
}
fs.writeFileSync('apps/web/.tmp-resume-batch-check-output.json', JSON.stringify(results,null,2));
console.log('WROTE apps/web/.tmp-resume-batch-check-output.json');
