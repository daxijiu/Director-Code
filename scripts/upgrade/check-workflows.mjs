#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot, writeJson } from './reference-manifest-lib.mjs';

const PROFILE = '112-stable-win32-x64-client';
const WORKFLOW_DIR = '.github/workflows';
const REPORT = `docs/upgrade/reports/${PROFILE}/workflow-docs-report.json`;
const ACTIVE_DOCS = ['README.md', 'README_EN.md', 'CLAUDE.md', 'docs/howto-build.md'];

const BUILD_WORKFLOW_RE = /^(stable|insider)-(linux|macos|windows|spearhead)\.ya?ml$/;
const LEGACY_WORKFLOW_PATTERNS = [
  ['get-repo', /(?:^|\s)(?:\.|bash)?\s*get_repo\.sh\b|\.\/get_repo\.sh\b/],
  ['find-reference-vscode', /\bfind\s+vscode\b/],
  ['assets-artifact-path', /\bpath:\s*assets\/|\boutput-artifact-directory:\s*assets\/|assets\/\*/],
  ['release-side-effect', /\brun:\s*\.\/release\.sh\b/],
];

const LEGACY_DOC_PATTERNS = [
  ['direct-vscode-cd', /\bcd\s+vscode(?!\.generated)(?:\b|\/)/],
  ['clone-into-vscode', /\bDirector-Code\/vscode\b/],
  ['legacy-sub-projects-tree', /\bsub-projects\//],
  ['legacy-root-build-output', /\bVSCode-win32-x64\b/],
  ['legacy-get-repo', /\bget_repo\.sh\b/],
  ['legacy-assets-output', /\bpackages\/assets\b/],
];

function main() {
  const root = getWorkspaceRoot();
  const generatedAt = new Date().toISOString();
  const workflowResults = checkWorkflows(root);
  const docResults = checkDocs(root);
  const failures = [
    ...workflowResults.flatMap((entry) => entry.failures.map((failure) => `${entry.path}: ${failure}`)),
    ...docResults.flatMap((entry) => entry.failures.map((failure) => `${entry.path}: ${failure}`)),
  ];

  const report = {
    schemaVersion: 1,
    profile: PROFILE,
    phase: 'P1',
    batch: 'workflow-docs',
    status: failures.length > 0 ? 'failed' : 'passed',
    generatedAt,
    checks: {
      workflowLegacyEntrypoints: workflowResults.every((entry) => !entry.legacyHits.length) ? 'passed' : 'failed',
      workflowMaterializeEntrypoints: workflowResults
        .filter((entry) => entry.buildWorkflow)
        .every((entry) => entry.materializeReady) ? 'passed' : 'failed',
      activeDocsCanonicalSource: docResults.every((entry) => entry.canonicalReady) ? 'passed' : 'failed',
      activeDocsLegacyCommands: docResults.every((entry) => !entry.legacyHits.length) ? 'passed' : 'failed',
    },
    summary: {
      workflowsChecked: workflowResults.length,
      buildWorkflowsChecked: workflowResults.filter((entry) => entry.buildWorkflow).length,
      docsChecked: docResults.length,
      failures: failures.length,
    },
    workflows: workflowResults,
    docs: docResults,
    failures,
  };

  writeJson(path.join(root, REPORT), report);

  if (failures.length > 0) {
    throw new Error(`Workflow/doc migration check failed\n${failures.join('\n')}`);
  }

  console.log(`workflow/doc migration check passed (${workflowResults.length} workflows, ${docResults.length} docs)`);
}

function checkWorkflows(root) {
  const workflowRoot = path.join(root, WORKFLOW_DIR);
  return fs.readdirSync(workflowRoot)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort()
    .map((name) => {
      const relativePath = `${WORKFLOW_DIR}/${name}`;
      const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
      const legacyHits = LEGACY_WORKFLOW_PATTERNS
        .filter(([, pattern]) => pattern.test(content))
        .map(([id]) => id);
      const buildWorkflow = BUILD_WORKFLOW_RE.test(name);
      const requiredHits = {
        materialize: content.includes('scripts/upgrade/materialize-vscode.sh'),
        vscodeDir: content.includes('VSCODE_DIR:'),
        artifactsOut: content.includes('ARTIFACTS_OUT:'),
        dryRunOffline: content.includes('DRY_RUN: offline'),
        bashShell: content.includes('shell: bash'),
      };
      const materializeReady = !buildWorkflow || Object.values(requiredHits).every(Boolean);
      const failures = [];

      if (legacyHits.length > 0) {
        failures.push(`legacy workflow tokens remain: ${legacyHits.join(', ')}`);
      }
      if (!materializeReady) {
        const missing = Object.entries(requiredHits)
          .filter(([, present]) => !present)
          .map(([id]) => id);
        failures.push(`missing P1 materialize workflow controls: ${missing.join(', ')}`);
      }

      return {
        path: relativePath,
        buildWorkflow,
        materializeReady,
        legacyHits,
        requiredHits,
        failures,
      };
    });
}

function checkDocs(root) {
  return ACTIVE_DOCS.map((relativePath) => {
    const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const legacyHits = LEGACY_DOC_PATTERNS
      .filter(([, pattern]) => pattern.test(content))
      .map(([id]) => id);
    const requiredHits = {
      materialize: content.includes('materialize-vscode.sh'),
      generatedWorkspace: content.includes('vscode.generated/layers/director/vscode'),
      referenceReadonly: /read-only reference|frozen read-only reference/i.test(content),
    };
    const canonicalReady = Object.values(requiredHits).every(Boolean);
    const failures = [];

    if (legacyHits.length > 0) {
      failures.push(`legacy active-doc tokens remain: ${legacyHits.join(', ')}`);
    }
    if (!canonicalReady) {
      const missing = Object.entries(requiredHits)
        .filter(([, present]) => !present)
        .map(([id]) => id);
      failures.push(`missing P1 canonical source docs: ${missing.join(', ')}`);
    }

    return {
      path: relativePath,
      canonicalReady,
      legacyHits,
      requiredHits,
      failures,
    };
  });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
