const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const INSTALL_SCRIPT = path.join(REPO_ROOT, 'bin', 'install.js');

function runInstall(args, options = {}) {
  const env = { ...process.env, ...options.env };
  const result = spawnSync(process.execPath, [INSTALL_SCRIPT, ...args], {
    cwd: options.cwd || REPO_ROOT,
    env,
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

describe('codex installer support', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-install-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('installs codex commands as skills globally with transformed references', () => {
    const codexHome = path.join(tmpDir, '.codex-home');
    const result = runInstall(['--codex', '--global', '--config-dir', codexHome], {
      env: { HOME: tmpDir },
    });

    assert.strictEqual(result.status, 0, `installer failed:\n${result.stderr}`);

    const skillPath = path.join(tmpDir, '.agents', 'skills', 'gsd-new-project', 'SKILL.md');
    const workflowPath = path.join(codexHome, 'get-shit-done', 'workflows', 'plan-phase.md');
    const roleConfigPath = path.join(codexHome, 'get-shit-done', 'codex', 'roles', 'gsd-planner.toml');
    const codexConfigPath = path.join(codexHome, 'config.toml');
    const manifestPath = path.join(codexHome, 'gsd-file-manifest.json');

    assert.ok(fs.existsSync(skillPath), 'expected skill file to be installed');
    assert.ok(fs.existsSync(workflowPath), 'expected workflow files to be installed');
    assert.ok(fs.existsSync(roleConfigPath), 'expected codex role config to be installed');
    assert.ok(fs.existsSync(codexConfigPath), 'expected codex config.toml registration file');
    assert.ok(fs.existsSync(manifestPath), 'expected manifest file to be installed');

    const skillContent = fs.readFileSync(skillPath, 'utf8');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    const codexConfig = fs.readFileSync(codexConfigPath, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.match(skillContent, /name:\s*gsd-new-project/);
    assert.doesNotMatch(skillContent, /name:\s*gsd:new-project/i);
    assert.doesNotMatch(skillContent, /\/prompts:gsd-/i);
    assert.doesNotMatch(skillContent, /~\/\.claude/);

    assert.match(workflowContent, /Task\(/, 'expected Task() compatibility content');
    assert.match(workflowContent, /Codex compatibility|codex compatibility/i);
    assert.match(codexConfig, /\[agents\.gsd-planner\]/);
    assert.ok(
      Object.keys(manifest.files).some(key => key.startsWith('.agents/skills/gsd-new-project/')),
      'expected codex skill files to be tracked in manifest'
    );
  });

  test('installs codex commands as repo skills locally in .agents/skills', () => {
    const projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    const result = runInstall(['--codex', '--local'], {
      cwd: projectDir,
      env: { HOME: tmpDir },
    });

    assert.strictEqual(result.status, 0, `local installer failed:\n${result.stderr}`);

    const localCodexDir = path.join(projectDir, '.codex');
    const skillPath = path.join(projectDir, '.agents', 'skills', 'gsd-help', 'SKILL.md');
    const roleConfigPath = path.join(localCodexDir, 'get-shit-done', 'codex', 'roles', 'gsd-planner.toml');
    const codexConfigPath = path.join(localCodexDir, 'config.toml');

    assert.ok(fs.existsSync(skillPath), 'expected local skill file to be installed');
    assert.ok(fs.existsSync(roleConfigPath), 'expected local codex role config to be installed');
    assert.ok(fs.existsSync(codexConfigPath), 'expected local codex config.toml registration file');
  });

  test('uninstall removes codex skills and managed role artifacts', () => {
    const codexHome = path.join(tmpDir, '.codex-home');

    const installResult = runInstall(['--codex', '--global', '--config-dir', codexHome], {
      env: { HOME: tmpDir },
    });
    assert.strictEqual(installResult.status, 0, `install failed:\n${installResult.stderr}`);

    const uninstallResult = runInstall(
      ['--codex', '--global', '--config-dir', codexHome, '--uninstall'],
      { env: { HOME: tmpDir } }
    );
    assert.strictEqual(uninstallResult.status, 0, `uninstall failed:\n${uninstallResult.stderr}`);

    const skillPath = path.join(tmpDir, '.agents', 'skills', 'gsd-help', 'SKILL.md');
    const roleConfigPath = path.join(codexHome, 'get-shit-done', 'codex', 'roles', 'gsd-planner.toml');
    const codexConfig = readIfExists(path.join(codexHome, 'config.toml')) || '';

    assert.ok(!fs.existsSync(skillPath), 'expected codex skill to be removed');
    assert.ok(!fs.existsSync(roleConfigPath), 'expected codex role config to be removed');
    assert.doesNotMatch(codexConfig, /\[agents\.gsd-planner\]/);
  });
});
