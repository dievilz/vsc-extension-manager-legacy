# VS Code Extension Manager

<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-1.60%2B-blue?logo=visualstudiocode" alt="VS Code">
  <img src="https://img.shields.io/badge/Cursor-Supported-green" alt="Cursor">
  <img src="https://img.shields.io/badge/VSCodium-Supported-purple" alt="VSCodium">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License">
</p>

**Seamlessly export and import your VS Code extensions AND settings between editors and machines.**

Migrate your complete development environment between VS Code, Cursor, and VSCodium with a single file. No more manually reinstalling extensions or reconfiguring settings on a new machine.

---

## ✨ Features

### 🎯 Unified Export/Import

Export both your **extensions** and **user settings** (`settings.json`) into a single portable JSON file.

### 🖥️ Sidebar UI

Manage your extensions visually with a dedicated sidebar panel:

- **Checkboxes** to select/deselect individual extensions
- **Status indicators** showing installation progress (✓ Success, ✗ Failed, ⟳ Installing)
- **Rich tooltips** with extension details (ID, publisher, version, description)

### 🚀 Cross-Editor Support

Works across the entire VS Code family:

- **VS Code** / **VS Code Insiders**
- **Cursor**
- **VSCodium**

Automatically detects your editor and uses the correct CLI command.

### ⚡ Smart Installation

- **Skips Already Installed**: Won't reinstall what you already have
- **Progress Tracking**: Real-time progress notifications
- **Cancellable**: Stop the installation at any time
- **Detailed Logs**: Full output in the "Extension Manager" output channel

### ⚙️ Settings Sync

- Exports your complete `settings.json` (handles comments and trailing commas)
- Imports settings by **merging** with your existing configuration
- Special "VS Code Settings" item appears in the sidebar when loading a file with settings

---

## 📖 Usage

### Exporting (Extensions + Settings)

1. Open the **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run **`Extension Manager: Export Extensions`**
3. Choose a save location
4. Your `vscode-extensions.json` now contains:
   - Metadata (timestamp, source editor)
   - All installed extensions with details
   - Your complete user settings

### Importing via Sidebar (Recommended)

1. Click the **Extension Manager** icon in the Activity Bar (sidebar)
2. Click **Load Extensions File** (or use Command Palette: `Load File`)
3. Select your exported `.json` file
4. Review the list - check/uncheck extensions and settings as needed
5. Click **Install Selected** to begin installation

### Importing via Command Palette (Quick)

1. Open the **Command Palette**
2. Run **`Extension Manager: Import Extensions`**
3. Select your file and confirm installation

---

## 🎨 Sidebar Commands

| Command                  | Description                                       |
| ------------------------ | ------------------------------------------------- |
| **Load Extensions File** | Load an exported JSON file into the sidebar       |
| **Install Selected**     | Install all checked extensions and apply settings |
| **Select All**           | Check all items                                   |
| **Deselect All**         | Uncheck all items                                 |
| **Export Extensions**    | Export current extensions and settings to a file  |

---

## ⚙️ Configuration

| Setting                       | Default  | Description                                                               |
| ----------------------------- | -------- | ------------------------------------------------------------------------- |
| `extensionManager.cliCommand` | `"auto"` | CLI command override. Options: `"auto"`, `"code"`, `"cursor"`, `"codium"` |

> **Tip**: You usually don't need to change this. The extension automatically detects the correct CLI based on your editor.

---

## 📋 Export File Format

```json
{
  "meta": {
    "exportedAt": "2025-12-15T10:00:00.000Z",
    "source": "Visual Studio Code"
  },
  "extensions": [
    {
      "id": "esbenp.prettier-vscode",
      "version": "11.0.0",
      "displayName": "Prettier - Code formatter",
      "publisher": "esbenp",
      "description": "Code formatter using prettier"
    }
  ],
  "settings": {
    "editor.fontSize": 14,
    "editor.tabSize": 2
  }
}
```

---

## 📦 Requirements

- **VS Code** 1.60.0 or higher (or compatible editor)
- Works natively with **Cursor** and **VSCodium**

---

## 📝 Release Notes

### 0.0.3

- ✨ **Settings Sync**: Export and import `settings.json` alongside extensions
- 🎨 **Sidebar UI**: New visual interface with checkboxes and status indicators
- 🔧 **Improved JSONC Parsing**: Handles comments and trailing commas in settings
- 📊 **Rich Tooltips**: See extension details on hover

### 0.0.2

- 🖥️ Sidebar TreeView for extension management
- ✅ Checkbox-based selection
- ⏳ Progress indicators during installation
- 🔍 Already-installed detection

### 0.0.1

- 🚀 Initial release
- 📦 Export/Import functionality
- 🔧 Smart CLI detection

---

## 🐛 Known Issues

- Settings export may be empty when running in **Extension Development Host** (F5 debug mode) because it uses a separate, empty profile.

---

## 🤝 Contributing

Found a bug or have a feature request? [Open an issue](https://github.com/yourusername/vscode-extension-manager/issues) on GitHub.

---

## 📄 License

MIT © [Ranjeeth Dev](https://github.com/yourusername)
