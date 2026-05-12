import { readdirSync, readFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, extname, dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

import {
  TreeSitterPlugin,
  PluginRegistry,
  builtinLanguageConfigs,
  registerAllParsers,
  GraphBuilder,
  createIgnoreFilter,
  detectLayers,
  generateHeuristicTour,
  saveGraph,
  saveMeta,
  buildFingerprintStore,
  saveFingerprints,
} from '/Users/shubhamkanse/.understand-anything-plugin/packages/core/dist/index.js';

const projectRoot = process.cwd();
const uaDir = join(projectRoot, '.understand-anything');
mkdirSync(uaDir, { recursive: true });

function gitHash() {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function listFiles(root, ignoreFilter) {
  const out = [];
  const stack = [''];

  while (stack.length > 0) {
    const relDir = stack.pop();
    const absDir = join(root, relDir);
    let entries = [];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const relPath = relDir ? `${relDir}/${ent.name}` : ent.name;
      if (ignoreFilter.isIgnored(relPath)) continue;
      const absPath = join(root, relPath);

      if (ent.isDirectory()) {
        stack.push(relPath);
      } else if (ent.isFile()) {
        out.push(relPath);
      }
    }
  }

  return out;
}

function complexityByLines(lines) {
  if (lines < 80) return 'simple';
  if (lines < 240) return 'moderate';
  return 'complex';
}

function nodeTypeForPath(p) {
  const ext = extname(p).toLowerCase();
  const base = p.split('/').pop() || p;

  if (p.endsWith('.md') || p.endsWith('.mdx') || p.endsWith('.rst') || p.endsWith('.txt')) return 'document';
  if (base === 'Dockerfile' || base === 'docker-compose.yml' || base === 'docker-compose.yaml' || p.includes('/k8s/')) return 'service';
  if (p.startsWith('.github/workflows/') || base === 'Makefile') return 'pipeline';
  if (ext === '.sql') return 'table';
  if (ext === '.tf') return 'resource';
  if (ext === '.graphql' || ext === '.gql' || ext === '.proto' || base === 'schema.prisma') return 'schema';
  if (ext === '.json' || ext === '.yaml' || ext === '.yml' || ext === '.toml' || base.startsWith('.env') || ext === '.ini') return 'config';
  return 'file';
}

function safeRead(absPath) {
  try {
    return readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

const ignoreFilter = createIgnoreFilter(projectRoot);
const allFiles = listFiles(projectRoot, ignoreFilter);

const tsConfigs = builtinLanguageConfigs.filter((c) => c.treeSitter);
const tsPlugin = new TreeSitterPlugin(tsConfigs);
await tsPlugin.init();

const registry = new PluginRegistry();
registry.register(tsPlugin);
registerAllParsers(registry);

const builder = new GraphBuilder('retune', gitHash());
const knownFiles = new Set(allFiles);
const fingerprintsInput = [];

for (const relPath of allFiles) {
  const absPath = join(projectRoot, relPath);
  const content = safeRead(absPath);
  if (content == null) continue;

  const lineCount = content.length === 0 ? 0 : content.split('\n').length;
  const complexity = complexityByLines(lineCount);
  const language = registry.getLanguageForFile(relPath) || 'unknown';

  const analysis = (() => {
    try {
      return registry.analyzeFile(relPath, content);
    } catch {
      return null;
    }
  })();

  const isCodeLike = ['javascript', 'typescript', 'python', 'go', 'java', 'rust', 'ruby', 'php', 'c', 'cpp', 'csharp'].includes(language);
  const typeHint = nodeTypeForPath(relPath);

  if (analysis && isCodeLike) {
    builder.addFileWithAnalysis(relPath, analysis, {
      fileSummary: `${language} source file`,
      summary: `${language} source file`,
      summaries: {},
      tags: [language],
      complexity,
    });
  } else if (analysis && typeHint !== 'file') {
    builder.addNonCodeFileWithAnalysis(relPath, {
      nodeType: typeHint,
      summary: `${typeHint} file`,
      tags: [language !== 'unknown' ? language : typeHint],
      complexity,
      definitions: analysis.definitions,
      services: analysis.services,
      endpoints: analysis.endpoints,
      steps: analysis.steps,
      resources: analysis.resources,
      sections: analysis.sections,
    });
  } else {
    if (typeHint === 'file') {
      builder.addFile(relPath, {
        summary: language !== 'unknown' ? `${language} source file` : 'source file',
        tags: language !== 'unknown' ? [language] : ['source'],
        complexity,
      });
    } else {
      builder.addNonCodeFile(relPath, {
        nodeType: typeHint,
        summary: `${typeHint} file`,
        tags: [language !== 'unknown' ? language : typeHint],
        complexity,
      });
    }
  }

  fingerprintsInput.push(relPath);

  if (analysis?.imports?.length) {
    for (const imp of analysis.imports) {
      if (!imp.source || (!imp.source.startsWith('./') && !imp.source.startsWith('../'))) continue;
      const targetBase = relative(projectRoot, resolve(dirname(absPath), imp.source)).replace(/\\/g, '/');
      const candidates = [
        targetBase,
        `${targetBase}.ts`, `${targetBase}.tsx`, `${targetBase}.js`, `${targetBase}.jsx`,
        `${targetBase}.mjs`, `${targetBase}.cjs`, `${targetBase}.py`, `${targetBase}.go`,
        `${targetBase}.java`, `${targetBase}.rs`,
        `${targetBase}/index.ts`, `${targetBase}/index.tsx`, `${targetBase}/index.js`, `${targetBase}/index.jsx`,
      ];
      const target = candidates.find((c) => knownFiles.has(c));
      if (target) builder.addImportEdge(relPath, target);
    }
  }
}

const graph = builder.build();
graph.project.description = 'Retune monorepo knowledge graph';

graph.layers = detectLayers(graph);
graph.tour = generateHeuristicTour(graph);

saveGraph(projectRoot, graph);
saveMeta(projectRoot, {
  lastAnalyzedAt: new Date().toISOString(),
  gitCommitHash: graph.project.gitCommitHash,
  version: graph.version,
  analyzedFiles: allFiles.length,
});

try {
  const fp = buildFingerprintStore(projectRoot, fingerprintsInput);
  saveFingerprints(projectRoot, fp);
} catch (err) {
  console.warn(`fingerprint generation skipped: ${err instanceof Error ? err.message : String(err)}`);
}

console.log(`Generated .understand-anything/knowledge-graph.json with ${graph.nodes.length} nodes and ${graph.edges.length} edges.`);
