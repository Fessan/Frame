/**
 * Frame Project Module
 * Handles Frame project initialization and detection
 */

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const { FRAME_DIR, FRAME_CONFIG_FILE, FRAME_FILES, FRAME_BIN_DIR } = require('../shared/frameConstants');
const templates = require('../shared/frameTemplates');
const workspace = require('./workspace');
const aiToolManager = require('./aiToolManager');

let mainWindow = null;

/**
 * Initialize frame project module
 */
function init(window) {
  mainWindow = window;
}

/**
 * Check if a project is a Frame project
 */
function isFrameProject(projectPath) {
  const configPath = path.join(projectPath, FRAME_DIR, FRAME_CONFIG_FILE);
  return fs.existsSync(configPath);
}

/**
 * Get Frame config from project
 */
function getFrameConfig(projectPath) {
  const configPath = path.join(projectPath, FRAME_DIR, FRAME_CONFIG_FILE);
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

/**
 * Create file if it doesn't exist
 */
function createFileIfNotExists(filePath, content) {
  if (!fs.existsSync(filePath)) {
    const contentStr = typeof content === 'string'
      ? content
      : JSON.stringify(content, null, 2);
    fs.writeFileSync(filePath, contentStr, 'utf8');
    return true;
  }
  return false;
}

/**
 * Create a symlink safely with Windows fallback
 * @param {string} target - The target file name (relative)
 * @param {string} linkPath - The full path for the symlink
 * @returns {boolean} - Whether the operation succeeded
 */
function createSymlinkSafe(target, linkPath) {
  try {
    // Check if symlink/file already exists
    if (fs.existsSync(linkPath)) {
      const stats = fs.lstatSync(linkPath);
      if (stats.isSymbolicLink()) {
        // Remove existing symlink to recreate it
        fs.unlinkSync(linkPath);
      } else {
        // Regular file exists - don't overwrite, skip
        console.warn(`${linkPath} exists and is not a symlink, skipping`);
        return false;
      }
    }

    // Create relative symlink
    fs.symlinkSync(target, linkPath);
    return true;
  } catch (error) {
    // Windows without admin/Developer Mode - copy file as fallback
    if (error.code === 'EPERM' || error.code === 'EPROTO') {
      try {
        const targetPath = path.resolve(path.dirname(linkPath), target);
        if (fs.existsSync(targetPath)) {
          fs.copyFileSync(targetPath, linkPath);
          console.warn(`Symlink not supported, copied ${target} to ${linkPath}`);
          return true;
        }
      } catch (copyError) {
        console.error('Failed to create symlink or copy file:', copyError);
      }
    } else {
      console.error('Failed to create symlink:', error);
    }
    return false;
  }
}

/**
 * Create wrapper scripts for AI tools that need them
 * @param {string} projectPath - Path to the project
 */
function createWrapperScripts(projectPath) {
  const binDirPath = path.join(projectPath, FRAME_DIR, FRAME_BIN_DIR);
  const created = [];
  const skipped = [];

  // Get tools that need wrappers
  const toolsNeedingWrapper = aiToolManager.getToolsRequiringWrapper();

  if (toolsNeedingWrapper.length === 0) {
    return { created, skipped };
  }

  // Create bin directory if it doesn't exist
  if (!fs.existsSync(binDirPath)) {
    fs.mkdirSync(binDirPath, { recursive: true });
    created.push('.frame/bin/');
  }

  // TODO: Windows support — generate .bat/.ps1 wrappers alongside bash scripts
  // Create wrapper for each tool
  for (const tool of toolsNeedingWrapper) {
    const wrapperName = tool.wrapperName || tool.command;
    const wrapperPath = path.join(binDirPath, wrapperName);

    // Don't overwrite existing wrappers
    if (fs.existsSync(wrapperPath)) {
      skipped.push(`.frame/bin/${wrapperName}`);
      continue;
    }

    // Generate wrapper script
    const wrapperContent = templates.getWrapperScriptTemplate(tool.command, tool.name);

    // Write wrapper script
    fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });
    created.push(`.frame/bin/${wrapperName}`);
  }

  return { created, skipped };
}

/**
 * Check which Frame files already exist in the project
 */
function checkExistingFrameFiles(projectPath) {
  const existingFiles = [];
  const filesToCheck = [
    { name: 'AGENTS.md', path: path.join(projectPath, FRAME_FILES.AGENTS) },
    { name: 'CLAUDE.md', path: path.join(projectPath, FRAME_FILES.CLAUDE_SYMLINK) },
    { name: 'STRUCTURE.json', path: path.join(projectPath, FRAME_FILES.STRUCTURE) },
    { name: 'PROJECT_NOTES.md', path: path.join(projectPath, FRAME_FILES.NOTES) },
    { name: 'tasks.json', path: path.join(projectPath, FRAME_FILES.TASKS) },
    { name: 'QUICKSTART.md', path: path.join(projectPath, FRAME_FILES.QUICKSTART) },
    { name: '.frame/', path: path.join(projectPath, FRAME_DIR) },
    { name: '.frame/bin/', path: path.join(projectPath, FRAME_DIR, FRAME_BIN_DIR) }
  ];

  for (const file of filesToCheck) {
    if (fs.existsSync(file.path)) {
      existingFiles.push(file.name);
    }
  }

  return existingFiles;
}

/**
 * Show confirmation dialog before initializing Frame project
 */
async function showInitializeConfirmation(projectPath) {
  const existingFiles = checkExistingFrameFiles(projectPath);

  // Check which AI tools need wrappers
  const toolsNeedingWrapper = aiToolManager.getToolsRequiringWrapper();
  const wrapperNames = toolsNeedingWrapper.map(t => t.wrapperName || t.command);

  let message = 'This will create the following files in your project:\n\n';
  message += '  • .frame/ (config directory)\n';
  message += '  • AGENTS.md (AI instructions)\n';
  message += '  • CLAUDE.md (symlink to AGENTS.md)\n';
  message += '  • STRUCTURE.json (module map)\n';
  message += '  • PROJECT_NOTES.md (session notes)\n';
  message += '  • tasks.json (task tracking)\n';
  message += '  • QUICKSTART.md (getting started)\n';

  if (wrapperNames.length > 0) {
    message += `  • .frame/bin/ (wrapper scripts for: ${wrapperNames.join(', ')})\n`;
  }

  if (existingFiles.length > 0) {
    message += '\n⚠️ These files already exist and will NOT be overwritten:\n';
    message += existingFiles.map(f => `  • ${f}`).join('\n');
  }

  message += '\n\nDo you want to continue?';

  const result = await dialog.showMessageBox(mainWindow, {
    type: existingFiles.length > 0 ? 'warning' : 'question',
    buttons: ['Cancel', 'Initialize'],
    defaultId: 0,
    cancelId: 0,
    title: 'Initialize as Frame Project',
    message: 'Initialize as Frame Project?',
    detail: message
  });

  return result.response === 1; // 1 = "Initialize" button
}

/**
 * Initialize a project as Frame project
 */
function initializeFrameProject(projectPath, projectName) {
  const name = projectName || path.basename(projectPath);
  const frameDirPath = path.join(projectPath, FRAME_DIR);

  // Create .frame directory
  if (!fs.existsSync(frameDirPath)) {
    fs.mkdirSync(frameDirPath, { recursive: true });
  }

  // Create .frame/config.json
  const config = templates.getFrameConfigTemplate(name);
  fs.writeFileSync(
    path.join(frameDirPath, FRAME_CONFIG_FILE),
    JSON.stringify(config, null, 2),
    'utf8'
  );

  // Create root-level Frame files (only if they don't exist)

  // AGENTS.md - Main instructions file for AI assistants
  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.AGENTS),
    templates.getAgentsTemplate(name)
  );

  // CLAUDE.md - Symlink to AGENTS.md for Claude Code compatibility
  createSymlinkSafe(
    FRAME_FILES.AGENTS,
    path.join(projectPath, FRAME_FILES.CLAUDE_SYMLINK)
  );

  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.STRUCTURE),
    templates.getStructureTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.NOTES),
    templates.getNotesTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.TASKS),
    templates.getTasksTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.QUICKSTART),
    templates.getQuickstartTemplate(name)
  );

  // Create wrapper scripts for non-Claude AI tools
  createWrapperScripts(projectPath);

  // Update workspace to mark as Frame project
  workspace.updateProjectFrameStatus(projectPath, true);

  return config;
}

/**
 * Upgrade an existing Frame project
 * Creates missing files and wrapper scripts without overwriting existing ones
 * @param {string} projectPath - Path to the project
 * @returns {object} Upgrade result with list of created files
 */
function upgradeFrameProject(projectPath) {
  const created = [];
  const skipped = [];

  // Check if it's a Frame project
  if (!isFrameProject(projectPath)) {
    throw new Error('Not a Frame project. Use Initialize instead.');
  }

  const config = getFrameConfig(projectPath);
  const name = config?.name || path.basename(projectPath);

  // Create wrapper scripts (won't overwrite existing)
  const wrapperResult = createWrapperScripts(projectPath);
  created.push(...wrapperResult.created);
  skipped.push(...wrapperResult.skipped);

  // Create missing root files
  const filesToCreate = [
    { path: path.join(projectPath, FRAME_FILES.AGENTS), template: () => templates.getAgentsTemplate(name), name: 'AGENTS.md' },
    { path: path.join(projectPath, FRAME_FILES.STRUCTURE), template: () => templates.getStructureTemplate(name), name: 'STRUCTURE.json' },
    { path: path.join(projectPath, FRAME_FILES.NOTES), template: () => templates.getNotesTemplate(name), name: 'PROJECT_NOTES.md' },
    { path: path.join(projectPath, FRAME_FILES.TASKS), template: () => templates.getTasksTemplate(name), name: 'tasks.json' },
    { path: path.join(projectPath, FRAME_FILES.QUICKSTART), template: () => templates.getQuickstartTemplate(name), name: 'QUICKSTART.md' }
  ];

  for (const file of filesToCreate) {
    if (fs.existsSync(file.path)) {
      skipped.push(file.name);
    } else {
      const content = file.template();
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      fs.writeFileSync(file.path, contentStr, 'utf8');
      created.push(file.name);
    }
  }

  // Ensure CLAUDE.md symlink exists
  const symlinkPath = path.join(projectPath, FRAME_FILES.CLAUDE_SYMLINK);
  if (!fs.existsSync(symlinkPath)) {
    createSymlinkSafe(FRAME_FILES.AGENTS, symlinkPath);
    created.push('CLAUDE.md (symlink)');
  } else {
    skipped.push('CLAUDE.md');
  }

  return { created, skipped };
}

/**
 * Show upgrade confirmation dialog
 */
async function showUpgradeConfirmation(projectPath) {
  const toolsNeedingWrapper = aiToolManager.getToolsRequiringWrapper();
  const wrapperNames = toolsNeedingWrapper.map(t => t.wrapperName || t.command);

  let message = 'This will create missing Frame files:\n\n';
  message += '  • Wrapper scripts for: ' + wrapperNames.join(', ') + '\n';
  message += '  • Any missing Frame files (AGENTS.md, etc.)\n';
  message += '\nExisting files will NOT be overwritten.\n';
  message += '\nDo you want to continue?';

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Cancel', 'Upgrade'],
    defaultId: 1,
    cancelId: 0,
    title: 'Upgrade Frame Project',
    message: 'Upgrade Frame Project?',
    detail: message
  });

  return result.response === 1;
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  ipcMain.on(IPC.CHECK_IS_FRAME_PROJECT, (event, projectPath) => {
    const isFrame = isFrameProject(projectPath);
    event.sender.send(IPC.IS_FRAME_PROJECT_RESULT, { projectPath, isFrame });
  });

  ipcMain.on(IPC.INITIALIZE_FRAME_PROJECT, async (event, { projectPath, projectName }) => {
    try {
      // Show confirmation dialog first
      const confirmed = await showInitializeConfirmation(projectPath);

      if (!confirmed) {
        // User cancelled
        event.sender.send(IPC.FRAME_PROJECT_INITIALIZED, {
          projectPath,
          success: false,
          cancelled: true
        });
        return;
      }

      const config = initializeFrameProject(projectPath, projectName);
      event.sender.send(IPC.FRAME_PROJECT_INITIALIZED, {
        projectPath,
        config,
        success: true
      });

      // Also send updated workspace
      const projects = workspace.getProjects();
      event.sender.send(IPC.WORKSPACE_UPDATED, projects);
    } catch (err) {
      console.error('Error initializing Frame project:', err);
      event.sender.send(IPC.FRAME_PROJECT_INITIALIZED, {
        projectPath,
        success: false,
        error: err.message
      });
    }
  });

  ipcMain.on(IPC.GET_FRAME_CONFIG, (event, projectPath) => {
    const config = getFrameConfig(projectPath);
    event.sender.send(IPC.FRAME_CONFIG_DATA, { projectPath, config });
  });

  ipcMain.on(IPC.UPGRADE_FRAME_PROJECT, async (event, { projectPath }) => {
    try {
      const confirmed = await showUpgradeConfirmation(projectPath);

      if (!confirmed) {
        event.sender.send(IPC.FRAME_PROJECT_UPGRADED, {
          projectPath,
          success: false,
          cancelled: true
        });
        return;
      }

      const result = upgradeFrameProject(projectPath);
      event.sender.send(IPC.FRAME_PROJECT_UPGRADED, {
        projectPath,
        success: true,
        created: result.created,
        skipped: result.skipped
      });
    } catch (err) {
      console.error('Error upgrading Frame project:', err);
      event.sender.send(IPC.FRAME_PROJECT_UPGRADED, {
        projectPath,
        success: false,
        error: err.message
      });
    }
  });
}

module.exports = {
  init,
  isFrameProject,
  getFrameConfig,
  initializeFrameProject,
  upgradeFrameProject,
  setupIPC
};
