/**
 * AI Tool Manager
 * Manages switching between different AI coding tools (Claude Code, Codex CLI, etc.)
 */

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { IPC } = require('../shared/ipcChannels');

let mainWindow = null;
let configPath = null;

// Default AI tools configuration
const AI_TOOLS = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    description: 'Anthropic Claude Code CLI',
    commands: {
      init: { cmd: '/init', label: 'Initialize Project' },
      commit: { cmd: '/commit', label: 'Commit Changes' },
      review: { cmd: '/review-pr', label: 'Review' },
      help: { cmd: '/help', label: 'Help' }
    },
    menuLabel: 'Claude Commands',
    supportsPlugins: true,
    // Claude Code natively reads CLAUDE.md, no wrapper needed
    needsWrapper: false
  },
  codex: {
    id: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    description: 'OpenAI Codex CLI',
    commands: {
      review: { cmd: '/review', label: 'Review' },
      model: { cmd: '/model', label: 'Switch Model' },
      permissions: { cmd: '/permissions', label: 'Permissions' },
      help: { cmd: '/help', label: 'Help' }
    },
    menuLabel: 'Codex Commands',
    supportsPlugins: false,
    // Codex doesn't read instruction files, needs wrapper
    needsWrapper: true,
    wrapperName: 'codex'
  }
};

// Current configuration
let config = {
  activeTool: 'claude',
  customTools: {}
};

/**
 * Initialize the AI Tool Manager
 */
function init(window, app) {
  mainWindow = window;
  configPath = path.join(app.getPath('userData'), 'ai-tool-config.json');
  loadConfig();
  setupIPC();
}

/**
 * Load configuration from file
 */
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const loaded = JSON.parse(data);
      config = { ...config, ...loaded };
    }
  } catch (error) {
    console.error('Error loading AI tool config:', error);
  }
}

/**
 * Save configuration to file
 */
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving AI tool config:', error);
  }
}

/**
 * Get all available AI tools
 */
function getAvailableTools() {
  return { ...AI_TOOLS, ...config.customTools };
}

/**
 * Get the currently active tool
 */
function getActiveTool() {
  const tools = getAvailableTools();
  return tools[config.activeTool] || tools.claude;
}

/**
 * Set the active AI tool
 */
function setActiveTool(toolId) {
  const tools = getAvailableTools();
  if (tools[toolId]) {
    config.activeTool = toolId;
    saveConfig();

    // Notify renderer about the change
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.AI_TOOL_CHANGED, getActiveTool());
    }

    return true;
  }
  return false;
}

/**
 * Get full configuration for renderer
 */
function getConfig() {
  return {
    activeTool: getActiveTool(),
    availableTools: getAvailableTools()
  };
}

/**
 * Setup IPC handlers
 */
function setupIPC() {
  ipcMain.handle(IPC.GET_AI_TOOL_CONFIG, () => {
    return getConfig();
  });

  ipcMain.handle(IPC.SET_AI_TOOL, (event, toolId) => {
    return setActiveTool(toolId);
  });

  ipcMain.handle(IPC.GET_AI_TOOL_EXECUTABLE, (event, { toolId, projectPath }) => {
    const id = toolId || config.activeTool;
    return getExecutableCommand(id, projectPath);
  });
}

/**
 * Get command for specific action
 */
function getCommand(action) {
  const tool = getActiveTool();
  const command = tool.commands[action];
  if (!command) return null;
  return command.cmd || command;
}

/**
 * Get the start command for active tool
 */
function getStartCommand() {
  return getActiveTool().command;
}

/**
 * Get all tools that require wrapper scripts
 * @returns {Array} Array of tool configs that need wrappers
 */
function getToolsRequiringWrapper() {
  const allTools = getAvailableTools();
  return Object.values(allTools).filter(tool => tool.needsWrapper);
}

/**
 * Get the executable command for a tool
 * Returns wrapper path if exists in project, otherwise original command
 * @param {string} toolId - Tool ID
 * @param {string} projectPath - Path to the project
 * @returns {string} Command to execute
 */
function getExecutableCommand(toolId, projectPath) {
  const tools = getAvailableTools();
  const tool = tools[toolId] || tools.claude;

  // If tool doesn't need wrapper, return original command
  if (!tool.needsWrapper) {
    return tool.command;
  }

  // Check if wrapper exists in project
  if (projectPath) {
    const { FRAME_DIR, FRAME_BIN_DIR } = require('../shared/frameConstants');
    const wrapperPath = path.join(projectPath, FRAME_DIR, FRAME_BIN_DIR, tool.wrapperName || tool.command);

    if (fs.existsSync(wrapperPath)) {
      return wrapperPath;
    }
  }

  // Fallback to original command
  return tool.command;
}

/**
 * Get executable command for currently active tool
 * @param {string} projectPath - Path to the project
 * @returns {string} Command to execute
 */
function getActiveToolCommand(projectPath) {
  const tool = getActiveTool();
  return getExecutableCommand(tool.id, projectPath);
}

module.exports = {
  init,
  getAvailableTools,
  getActiveTool,
  setActiveTool,
  getConfig,
  getCommand,
  getStartCommand,
  getToolsRequiringWrapper,
  getExecutableCommand,
  getActiveToolCommand,
  AI_TOOLS
};
