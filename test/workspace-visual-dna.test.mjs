import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkspaceKind, resolveWorkspaceVisualDNA, workspaceVisualCssVariables, WORKSPACE_VISUAL_DNA_POLICY } from '../workspace-visual-dna.js';

test('workspace kinds normalize without changing route semantics',()=>{
  assert.equal(normalizeWorkspaceKind('personal'),'person');
  assert.equal(normalizeWorkspaceKind('institution'),'institution');
  assert.equal(normalizeWorkspaceKind('group'),'organization');
  assert.equal(normalizeWorkspaceKind('project'),'project');
  assert.equal(WORKSPACE_VISUAL_DNA_POLICY.routeInvariant,'ekodi.kr/{slug}');
  assert.equal(WORKSPACE_VISUAL_DNA_POLICY.structuralInvariant,true);
});

test('same workspace identity is deterministic',()=>{
  const a=resolveWorkspaceVisualDNA({kind:'person',workspaceId:'ws_123'});
  const b=resolveWorkspaceVisualDNA({kind:'person',workspaceId:'ws_123'});
  assert.deepEqual(a,b);
});

test('different workspaces receive distinct visual identities while structure remains shared',()=>{
  const ids=['person-anna','institution-school','organization-association','project-harvest'];
  const kinds=['person','institution','organization','project'];
  const dna=ids.map((workspaceId,i)=>resolveWorkspaceVisualDNA({kind:kinds[i],workspaceId}));
  assert.equal(new Set(dna.map(x=>x.identityHash)).size,dna.length);
  assert.equal(new Set(dna.map(x=>x.family)).size,dna.length);
  assert.ok(dna.every(x=>x.palette.accent&&x.palette.canvas&&x.typography&&x.geometry));
});

test('different ids within the same kind still vary atmosphere',()=>{
  const a=resolveWorkspaceVisualDNA({kind:'organization',workspaceId:'ws_alpha'});
  const b=resolveWorkspaceVisualDNA({kind:'organization',workspaceId:'ws_beta'});
  assert.notEqual(a.identityHash,b.identityHash);
  assert.notEqual(a.palette.accent,b.palette.accent);
});

test('css variables expose only visual tokens, not layout structure',()=>{
  const dna=resolveWorkspaceVisualDNA({kind:'project',workspaceId:'ws_project'});
  const vars=workspaceVisualCssVariables(dna);
  assert.deepEqual(Object.keys(vars).sort(),[
    '--ekodi-workspace-accent','--ekodi-workspace-canvas','--ekodi-workspace-ink','--ekodi-workspace-radius','--ekodi-workspace-secondary','--ekodi-workspace-spacing-scale'
  ].sort());
});
