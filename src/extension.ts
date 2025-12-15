import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import {
  ExtensionTreeProvider,
  ExtensionItem,
  ExtensionStatus,
  ExtensionData,
} from "./ExtensionTreeProvider.js";
import * as jsonc from "jsonc-parser";

// Global tree provider instance
let extensionTreeProvider: ExtensionTreeProvider;

// Helper function to get CLI path
function getCLIPath(): string {
  const config = vscode.workspace.getConfiguration("extensionManager");
  let cliCommand = config.get<string>("cliCommand") || "auto";
  let cliPath = cliCommand;

  if (cliCommand === "auto") {
    try {
      const appRoot = vscode.env.appRoot;
      const binDir = path.join(appRoot, "bin");

      if (fs.existsSync(binDir)) {
        const files = fs.readdirSync(binDir);
        const appName = vscode.env.appName || "";

        let bestMatch = "";
        const candidates = files.filter(
          (f) => !f.startsWith(".") && !f.includes("tunnel")
        );

        if (candidates.length > 0) {
          const match = candidates.find((f) => {
            const base = path.parse(f).name.toLowerCase();
            return appName.toLowerCase().includes(base);
          });

          if (match) {
            bestMatch = match;
          } else {
            const codeOrCursor = candidates.find((f) => {
              const name = path.parse(f).name.toLowerCase();
              return name === "code" || name === "cursor" || name === "codium";
            });
            bestMatch = codeOrCursor || candidates[0];
          }

          if (bestMatch) {
            cliPath = `"${path.join(binDir, bestMatch)}"`;
          }
        }
      }
    } catch (e) {
      console.error("Failed to resolve CLI path:", e);
    }
  }
  return cliPath;
}

// Helper function to install a single extension
async function installExtension(
  extensionId: string,
  cliPath: string,
  outputChannel: vscode.OutputChannel
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const command = `${cliPath} --install-extension ${extensionId}`;
    cp.exec(command, (error, stdout, stderr) => {
      if (error) {
        outputChannel.appendLine(
          `Error installing ${extensionId}: ${error.message}`
        );
        if (stderr) outputChannel.appendLine(`Stderr: ${stderr}`);
        resolve({ success: false, error: error.message });
      } else {
        if (stdout) outputChannel.appendLine(stdout);
        resolve({ success: true });
      }
    });
  });
}

export function activate(context: vscode.ExtensionContext) {
  // Initialize TreeDataProvider
  extensionTreeProvider = new ExtensionTreeProvider();
  const treeView = vscode.window.createTreeView("extensionManagerView", {
    treeDataProvider: extensionTreeProvider,
    manageCheckboxStateManually: true,
  });

  // Handle checkbox changes
  treeView.onDidChangeCheckboxState((e) => {
    e.items.forEach(([item, state]) => {
      extensionTreeProvider.handleCheckboxChange(item, state);
    });
  });

  // Helper to get settings path
  function getSettingsPath(): string {
    const appName = vscode.env.appName || "";
    let settingsPath = "";

    // Standard VS Code paths
    if (process.platform === "darwin") {
      // Mac: ~/Library/Application Support/Code/User/settings.json
      // We can use context.globalStorageUri to find User dir
      // context.globalStorageUri: .../User/globalStorage/publisher.ext
      // So User dir is 2 levels up
      settingsPath = path.join(
        context.globalStorageUri.fsPath,
        "../../settings.json"
      );
    } else if (process.platform === "win32") {
      // Windows: %APPDATA%\Code\User\settings.json
      settingsPath = path.join(
        context.globalStorageUri.fsPath,
        "../../settings.json"
      );
    } else {
      // Linux: ~/.config/Code/User/settings.json
      settingsPath = path.join(
        context.globalStorageUri.fsPath,
        "../../settings.json"
      );
    }
    return settingsPath;
  }

  // Register loadFile command (UPDATED for settings)
  const loadFileCommand = vscode.commands.registerCommand(
    "vscode-extension-manager.loadFile",
    async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { JSON: ["json"] },
      });

      if (uri && uri[0]) {
        try {
          const fileContent = fs.readFileSync(uri[0].fsPath, "utf8");
          const data = jsonc.parse(fileContent); // Load File is standard JSON (the export file)
          const extensions: ExtensionData[] = Array.isArray(data)
            ? data
            : data.extensions || [];

          if (!Array.isArray(extensions)) {
            throw new Error("Invalid extensions file format");
          }

          // Load extensions into tree
          extensionTreeProvider.loadExtensions(extensions);

          // Handle Settings
          if (data.settings) {
            extensionTreeProvider.addSettingsItem(data.settings);
          }

          vscode.window.showInformationMessage(
            `Loaded ${extensions.length} extensions${
              data.settings ? " and settings" : ""
            }.`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Error loading file: ${error}`);
        }
      }
    }
  );

  // Register installSelected command (UPDATED for settings)
  const installSelectedCommand = vscode.commands.registerCommand(
    "vscode-extension-manager.installSelected",
    async () => {
      const selected = extensionTreeProvider.getSelectedExtensions();
      if (selected.length === 0) {
        vscode.window.showWarningMessage("No items selected.");
        return;
      }

      const cliPath = getCLIPath();
      const outputChannel =
        vscode.window.createOutputChannel("Extension Manager");
      outputChannel.show();
      outputChannel.appendLine(`Starting installation...`);

      // Check for Settings item
      const settingsItem = selected.find((item) => item.id === "settings");
      const extensionItems = selected.filter((item) => item.id !== "settings");

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Installing Extensions & Settings",
          cancellable: true,
        },
        async (progress, token) => {
          // 1. Install Settings if selected
          if (settingsItem && settingsItem.settingsData) {
            progress.report({ message: `Applying Settings...`, increment: 10 });
            try {
              const settingsPath = getSettingsPath();
              let currentSettings = {};
              if (fs.existsSync(settingsPath)) {
                try {
                  const currentContent = fs.readFileSync(settingsPath, "utf8");
                  // Parse current settings using robust parser
                  currentSettings = jsonc.parse(currentContent);
                } catch (e) {
                  outputChannel.appendLine(
                    `Warning: Could not parse current settings.json: ${e}`
                  );
                }
              }

              // Merge new settings on top of current
              const newSettings = {
                ...currentSettings,
                ...settingsItem.settingsData,
              };

              // Write back
              fs.writeFileSync(
                settingsPath,
                JSON.stringify(newSettings, null, 4)
              );

              extensionTreeProvider.updateExtensionStatus(
                "settings",
                ExtensionStatus.Success
              );
              outputChannel.appendLine(`Successfully applied settings.`);
            } catch (e: any) {
              extensionTreeProvider.updateExtensionStatus(
                "settings",
                ExtensionStatus.Failed,
                e.message
              );
              outputChannel.appendLine(
                `Failed to apply settings: ${e.message}`
              );
            }
          }

          // 2. Install Extensions
          const total = extensionItems.length;
          let installedCount = 0;
          let errorCount = 0;

          for (let i = 0; i < total; i++) {
            if (token.isCancellationRequested) {
              outputChannel.appendLine("Operation cancelled.");
              break;
            }

            const ext = extensionItems[i];
            const extensionId = ext.extensionData.id;

            // Check if already installed
            if (vscode.extensions.getExtension(extensionId)) {
              extensionTreeProvider.updateExtensionStatus(
                extensionId,
                ExtensionStatus.AlreadyInstalled
              );
              continue;
            }

            progress.report({
              message: `Installing ${extensionId} (${i + 1}/${total})...`,
              increment: (1 / total) * 90,
            });
            extensionTreeProvider.updateExtensionStatus(
              extensionId,
              ExtensionStatus.Installing
            );

            outputChannel.appendLine(`Installing ${extensionId}...`);
            const result = await installExtension(
              extensionId,
              cliPath,
              outputChannel
            );

            if (result.success) {
              installedCount++;
              extensionTreeProvider.updateExtensionStatus(
                extensionId,
                ExtensionStatus.Success
              );
              outputChannel.appendLine(`Successfully installed ${extensionId}`);
            } else {
              errorCount++;
              extensionTreeProvider.updateExtensionStatus(
                extensionId,
                ExtensionStatus.Failed,
                result.error
              );
              outputChannel.appendLine(`Failed to install ${extensionId}`);
            }
          }

          vscode.window.showInformationMessage(
            `Process complete. Installed: ${installedCount} extensions. Settings applied: ${
              settingsItem ? "Yes" : "No"
            }.`
          );
        }
      );
    }
  );

  // ... (Select All, Deselect All, Show Error remain mostly same, mostly logic in provider) ...
  // ... Register export command logic to include settings ...

  // Register selectAll command
  const selectAllCommand = vscode.commands.registerCommand(
    "vscode-extension-manager.selectAll",
    () => {
      extensionTreeProvider.selectAll();
    }
  );

  // Register deselectAll command
  const deselectAllCommand = vscode.commands.registerCommand(
    "vscode-extension-manager.deselectAll",
    () => {
      extensionTreeProvider.deselectAll();
    }
  );

  // Register showError command
  const showErrorCommand = vscode.commands.registerCommand(
    "vscode-extension-manager.showError",
    (item: ExtensionItem) => {
      if (item.errorMessage) {
        vscode.window.showErrorMessage(`Error: ${item.errorMessage}`);
      }
    }
  );

  context.subscriptions.push(
    treeView,
    loadFileCommand,
    installSelectedCommand,
    selectAllCommand,
    deselectAllCommand,
    showErrorCommand
  );

  // Register the export command
  let exportCommand = vscode.commands.registerCommand(
    "vscode-extension-manager.exportExtensions",
    async () => {
      try {
        // Get the list of installed extensions
        const extensions = vscode.extensions.all;
        const extensionList = extensions
          .filter((ext) => {
            const isSystem =
              ext.packageJSON.isBuiltin ||
              ext.id.startsWith("vscode.") ||
              ext.id.startsWith("ms-vscode.") ||
              ext.id.toLowerCase().includes("cursor");

            return (
              !ext.id.startsWith("vscode.") &&
              !ext.id.startsWith("ms-vscode.js-debug") &&
              !ext.id.startsWith("ms-vscode.references-view")
            );
          })
          .map((ext) => ({
            id: ext.id,
            version: ext.packageJSON.version,
            displayName: ext.packageJSON.displayName,
            publisher: ext.packageJSON.publisher,
            description: ext.packageJSON.description,
          }));

        // Get Settings
        let settingsData = {};
        const settingsPath = getSettingsPath();
        console.log(`Debug: calculated settingsPath: ${settingsPath}`);
        const outputChannel = vscode.window.createOutputChannel(
          "Extension Manager Debug"
        );

        try {
          if (fs.existsSync(settingsPath)) {
            outputChannel.appendLine(`Found settings.json at: ${settingsPath}`);
            const content = fs.readFileSync(settingsPath, "utf8");
            settingsData = jsonc.parse(content);
            outputChannel.appendLine(
              `Read ${Object.keys(settingsData).length} settings.`
            );
          } else {
            outputChannel.appendLine(
              `WARNING: settings.json NOT found at: ${settingsPath}`
            );
            vscode.window.showWarningMessage(
              `Could not find settings.json at: ${settingsPath}. If you are in Debug mode, this is expected (separate profile).`
            );
          }
        } catch (e) {
          console.error("Failed to read settings.json", e);
          outputChannel.appendLine(`Error reading settings.json: ${e}`);
          vscode.window.showErrorMessage(`Error reading settings.json: ${e}`);
        }
        // Show output channel briefly if empty
        if (Object.keys(settingsData).length === 0) {
          outputChannel.show();
        }

        // Ask for save location
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(
            path.join(process.env.HOME || "", "vscode-extensions.json")
          ),
          filters: { JSON: ["json"] },
        });

        if (uri) {
          const exportData = {
            meta: {
              exportedAt: new Date().toISOString(),
              source: vscode.env.appName,
            },
            extensions: extensionList,
            settings: settingsData, // Include settings!
          };

          // Save the extensions list to a file
          fs.writeFileSync(uri.fsPath, JSON.stringify(exportData, null, 2));
          vscode.window.showInformationMessage(
            `Successfully exported ${extensionList.length} extensions and settings to ${uri.fsPath}`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error exporting extensions: ${error}`);
      }
    }
  );

  // Register the import command
  let importCommand = vscode.commands.registerCommand(
    "vscode-extension-manager.importExtensions",
    async () => {
      try {
        // Open file picker for the extensions JSON file
        const uri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            JSON: ["json"],
          },
        });

        if (uri && uri[0]) {
          // Read the extensions list
          const fileContent = fs.readFileSync(uri[0].fsPath, "utf8");
          const data = jsonc.parse(fileContent);

          // Handle both old format (array) and new format (object with extensions property)
          const extensions = Array.isArray(data) ? data : data.extensions || [];

          if (!Array.isArray(extensions)) {
            throw new Error("Invalid extensions file format");
          }

          // Show quick pick to confirm installation
          const confirmation = await vscode.window.showQuickPick(
            ["Yes", "No"],
            { placeHolder: `Install ${extensions.length} extensions?` }
          );

          if (confirmation === "Yes") {
            // Determine CLI command
            const config =
              vscode.workspace.getConfiguration("extensionManager");
            let cliCommand = config.get<string>("cliCommand") || "auto";
            let cliPath = cliCommand;

            if (cliCommand === "auto") {
              try {
                const appRoot = vscode.env.appRoot;
                const binDir = path.join(appRoot, "bin");

                // Check if bin directory exists (it should in standard installs)
                if (fs.existsSync(binDir)) {
                  const files = fs.readdirSync(binDir);

                  // Look for potential CLI candidates.
                  // Exclude 'code-tunnel', helpers, etc. if we can identify them.
                  // Common names: code, code.cmd, cursor, cursor.cmd, codium, codium.cmd

                  // Heuristic: valid CLIs usually don't have dashes (except maybe code-insiders) or match app name.
                  // Let's filter for known patterns or simply take the one that matches appName best.
                  const appName = vscode.env.appName || "";

                  // Find best match
                  let bestMatch = "";
                  const candidates = files.filter((f) => {
                    return (
                      !f.startsWith(".") && // no hidden files
                      !f.includes("tunnel")
                    ); // exclude tunnel
                  });

                  if (candidates.length > 0) {
                    // 1. Try to find exact match for known editors
                    const match = candidates.find((f) => {
                      const base = path.parse(f).name.toLowerCase();
                      return appName.toLowerCase().includes(base);
                    });

                    if (match) {
                      bestMatch = match;
                    } else {
                      // 2. Fallback to 'code' or 'cursor' if present
                      const codeOrCursor = candidates.find((f) => {
                        const name = path.parse(f).name.toLowerCase();
                        return (
                          name === "code" ||
                          name === "cursor" ||
                          name === "codium"
                        );
                      });
                      // 3. Last resort: just take the first candidate
                      bestMatch = codeOrCursor || candidates[0];
                    }

                    if (bestMatch) {
                      cliPath = `"${path.join(binDir, bestMatch)}"`; // Quote for safety
                    }
                  }
                } else {
                  // If bin dir not found (e.g. dev environment sometimes?), fallback to PATH
                  // But dev env usually has 'code' in path.
                  console.warn("Bin directory not found at", binDir);
                }
              } catch (e) {
                console.error("Failed to resolve CLI path dynamically:", e);
              }
            }

            // Filter out already installed extensions
            const extensionsToInstall = extensions.filter((ext: any) => {
              const isInstalled = vscode.extensions.getExtension(ext.id);
              if (isInstalled) {
                // console.log(`Skipping ${ext.id}: already installed.`);
              }
              return !isInstalled;
            });

            if (extensionsToInstall.length === 0) {
              vscode.window.showInformationMessage(
                "All extensions are already installed."
              );
              return;
            }

            // Create output channel for logging
            const outputChannel =
              vscode.window.createOutputChannel("Extension Manager");
            outputChannel.show();
            outputChannel.appendLine(
              `Starting installation of ${extensionsToInstall.length} extensions...`
            );
            outputChannel.appendLine(`CLI Command: ${cliPath}`);

            // Use Progress API
            await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "Installing Extensions",
                cancellable: true,
              },
              async (progress, token) => {
                const total = extensionsToInstall.length;
                let installedCount = 0;
                let errorCount = 0;

                for (let i = 0; i < total; i++) {
                  if (token.isCancellationRequested) {
                    outputChannel.appendLine("Operation cancelled by user.");
                    break;
                  }

                  const ext = extensionsToInstall[i];
                  const extensionId = ext.id;

                  progress.report({
                    message: `Installing ${extensionId} (${i + 1}/${total})...`,
                    increment: (1 / total) * 100,
                  });

                  try {
                    outputChannel.appendLine(`Installing ${extensionId}...`);

                    // Execute command
                    const command = `${cliPath} --install-extension ${extensionId} --force`; // Force to ensure fresh install or update if needed? Maybe not force by default to avoid issues.
                    // Removing --force to be safe, standard install is fine.
                    const cleanCommand = `${cliPath} --install-extension ${extensionId}`;

                    await new Promise<void>((resolve, reject) => {
                      cp.exec(cleanCommand, (error, stdout, stderr) => {
                        if (error) {
                          outputChannel.appendLine(
                            `Error installing ${extensionId}: ${error.message}`
                          );
                          if (stderr)
                            outputChannel.appendLine(`Stderr: ${stderr}`);
                          reject(error);
                        } else {
                          if (stdout) outputChannel.appendLine(stdout);
                          resolve();
                        }
                      });
                    });

                    installedCount++;
                    outputChannel.appendLine(
                      `Successfully installed ${extensionId}`
                    );
                  } catch (err) {
                    errorCount++;
                    outputChannel.appendLine(
                      `Failed to install ${extensionId}`
                    );
                  }
                }

                vscode.window.showInformationMessage(
                  `Installation complete. Installed: ${installedCount}, Failed: ${errorCount}. Check 'Extension Manager' output for details.`
                );
              }
            );
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error importing extensions: ${error}`);
      }
    }
  );

  context.subscriptions.push(exportCommand, importCommand);
}

export function deactivate() {}
