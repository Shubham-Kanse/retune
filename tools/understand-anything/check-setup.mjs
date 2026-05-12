import { existsSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const home = homedir();
const pluginRoot = join(home, '.understand-anything-plugin');
const projectRoot = process.cwd();

const requiredSkills = [
  'understand',
  'understand-chat',
  'understand-dashboard',
  'understand-diff',
  'understand-domain',
  'understand-explain',
  'understand-knowledge',
  'understand-onboard',
];

let failed = false;

function ok(msg) {
  console.log(`OK  ${msg}`);
}

function fail(msg) {
  console.error(`ERR ${msg}`);
  failed = true;
}

function checkPath(path, description) {
  if (existsSync(path)) {
    ok(description);
    return true;
  }
  fail(`${description} (missing: ${path})`);
  return false;
}

checkPath(pluginRoot, 'Plugin root exists');
checkPath(join(pluginRoot, 'packages', 'core', 'dist', 'index.js'), 'Core package is built');
checkPath(join(projectRoot, '.understand-anything'), 'Project .understand-anything directory exists');
checkPath(join(projectRoot, '.understand-anything', '.understandignore'), 'Project .understandignore exists');

for (const skill of requiredSkills) {
  const skillPath = join(home, '.agents', 'skills', skill);
  if (!existsSync(skillPath)) {
    fail(`Skill link exists: ${skillPath}`);
    continue;
  }
  try {
    const st = lstatSync(skillPath);
    if (st.isSymbolicLink()) {
      ok(`Skill link exists: ${skill}`);
    } else {
      ok(`Skill exists (non-symlink): ${skill}`);
    }
  } catch {
    fail(`Skill check failed: ${skill}`);
  }
}

if (existsSync(join(projectRoot, '.understand-anything', 'knowledge-graph.json'))) {
  ok('Knowledge graph exists (.understand-anything/knowledge-graph.json)');
} else {
  console.log('WARN Knowledge graph not generated yet. Run the /understand skill to create it.');
}

if (failed) {
  console.error('\nUnderstand Anything setup is incomplete.');
  process.exit(1);
}

console.log('\nUnderstand Anything setup looks complete.');
