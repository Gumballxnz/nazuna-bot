import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIP_COMMANDS_FILE = path.join(__dirname, '../../database/dono/vipCommands.json');

function ensureVipCommandsFile() {
  const dir = path.dirname(VIP_COMMANDS_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(VIP_COMMANDS_FILE)) {
    const defaultData = {
      commands: [],
      categories: {
        download: '📥 Downloads',
        diversao: '🎮 Diversão',
        utilidade: '🛠️ Utilidade',
        ia: '🤖 Inteligência Artificial',
        editor: '✨ Editor',
        info: 'ℹ️ Informação',
        outros: '📦 Outros'
      }
    };
    fs.writeFileSync(VIP_COMMANDS_FILE, JSON.stringify(defaultData, null, 2));
  }
}

function loadVipCommands() {
  ensureVipCommandsFile();
  try {
    const data = fs.readFileSync(VIP_COMMANDS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao carregar comandos VIP:', error);
    return { commands: [], categories: {} };
  }
}

function saveVipCommands(data) {
  ensureVipCommandsFile();
  try {
    fs.writeFileSync(VIP_COMMANDS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao salvar comandos VIP:', error);
    return false;
  }
}

function addVipCommand(command, description, category = 'outros', usage = '') {
  const data = loadVipCommands();

  const normalizedCommand = command.toLowerCase().trim();

  const existingIndex = data.commands.findIndex(cmd => cmd.command === normalizedCommand);

  if (existingIndex !== -1) {
    return {
      success: false,
      message: `❌ O comando "${normalizedCommand}" já existe na lista VIP!`
    };
  }

  if (!data.categories[category]) {
    category = 'outros';
  }

  const newCommand = {
    command: normalizedCommand,
    description: description.trim(),
    category: category,
    usage: usage.trim() || `${normalizedCommand}`,
    addedAt: new Date().toISOString(),
    enabled: true
  };

  data.commands.push(newCommand);

  if (saveVipCommands(data)) {
    return {
      success: true,
      message: `✅ Comando VIP "${normalizedCommand}" adicionado com sucesso!`,
      command: newCommand
    };
  } else {
    return {
      success: false,
      message: '❌ Erro ao salvar o comando VIP.'
    };
  }
}

function removeVipCommand(command) {
  const data = loadVipCommands();
  const normalizedCommand = command.toLowerCase().trim();

  const index = data.commands.findIndex(cmd => cmd.command === normalizedCommand);

  if (index === -1) {
    return {
      success: false,
      message: `❌ O comando "${normalizedCommand}" não foi encontrado na lista VIP.`
    };
  }

  const removedCommand = data.commands[index];
  data.commands.splice(index, 1);

  if (saveVipCommands(data)) {
    return {
      success: true,
      message: `✅ Comando VIP "${normalizedCommand}" removido com sucesso!`,
      command: removedCommand
    };
  } else {
    return {
      success: false,
      message: '❌ Erro ao remover o comando VIP.'
    };
  }
}

function isVipCommand(command) {
  const data = loadVipCommands();
  const normalizedCommand = command.toLowerCase().trim();
  return data.commands.some(cmd => cmd.command === normalizedCommand && cmd.enabled);
}

function listVipCommands(category = null) {
  const data = loadVipCommands();

  if (category) {
    return data.commands.filter(cmd => cmd.category === category && cmd.enabled);
  }

  return data.commands.filter(cmd => cmd.enabled);
}

function getVipCommand(command) {
  const data = loadVipCommands();
  const normalizedCommand = command.toLowerCase().trim();
  return data.commands.find(cmd => cmd.command === normalizedCommand);
}

function groupVipCommandsByCategory() {
  const data = loadVipCommands();
  const grouped = {};

  for (const [key, label] of Object.entries(data.categories)) {
    grouped[key] = {
      label: label,
      commands: []
    };
  }

  data.commands.forEach(cmd => {
    if (cmd.enabled && grouped[cmd.category]) {
      grouped[cmd.category].commands.push(cmd);
    }
  });

  Object.keys(grouped).forEach(key => {
    if (grouped[key].commands.length === 0) {
      delete grouped[key];
    }
  });

  return grouped;
}

function toggleVipCommand(command, enabled) {
  const data = loadVipCommands();
  const normalizedCommand = command.toLowerCase().trim();

  const cmdIndex = data.commands.findIndex(cmd => cmd.command === normalizedCommand);

  if (cmdIndex === -1) {
    return {
      success: false,
      message: `❌ Comando "${normalizedCommand}" não encontrado.`
    };
  }

  data.commands[cmdIndex].enabled = enabled;

  if (saveVipCommands(data)) {
    const status = enabled ? 'ativado' : 'desativado';
    return {
      success: true,
      message: `✅ Comando VIP "${normalizedCommand}" ${status} com sucesso!`
    };
  } else {
    return {
      success: false,
      message: '❌ Erro ao atualizar o comando VIP.'
    };
  }
}

function getCategories() {
  const data = loadVipCommands();
  return data.categories;
}

function addCategory(key, label) {
  const data = loadVipCommands();

  if (data.categories[key]) {
    return {
      success: false,
      message: `❌ A categoria "${key}" já existe.`
    };
  }

  data.categories[key] = label;

  if (saveVipCommands(data)) {
    return {
      success: true,
      message: `✅ Categoria "${label}" adicionada com sucesso!`
    };
  } else {
    return {
      success: false,
      message: '❌ Erro ao adicionar categoria.'
    };
  }
}

function getVipStats() {
  const data = loadVipCommands();
  const grouped = groupVipCommandsByCategory();

  return {
    total: data.commands.length,
    active: data.commands.filter(cmd => cmd.enabled).length,
    inactive: data.commands.filter(cmd => !cmd.enabled).length,
    categories: Object.keys(grouped).length,
    byCategory: Object.entries(grouped).map(([key, value]) => ({
      category: value.label,
      count: value.commands.length
    }))
  };
}

export {
  addVipCommand,
  removeVipCommand,
  isVipCommand,
  listVipCommands,
  getVipCommand,
  groupVipCommandsByCategory,
  toggleVipCommand,
  getCategories,
  addCategory,
  getVipStats,
  loadVipCommands,
  saveVipCommands
};
