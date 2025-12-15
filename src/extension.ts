import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    // Register the export command
    let exportCommand = vscode.commands.registerCommand('vscode-extension-manager.exportExtensions', async () => {
        try {
            // Get the list of installed extensions
            const extensions = vscode.extensions.all;
            const extensionList = extensions
                .filter(ext => {
                    // Filter out built-in extensions and internal ones
                    // The best way to check for builtin is checking packageJSON, but strictly filtering by common prefixes 
                    // and strictly ensuring they are not system extensions is usually enough.
                    // vscode.extensions.all includes built-in extensions.
                    
                    // Basic filtering for system extensions
                    const isSystem = ext.packageJSON.isBuiltin || 
                                   ext.id.startsWith('vscode.') || 
                                   ext.id.startsWith('ms-vscode.') ||
                                   ext.id.toLowerCase().includes('cursor'); // Filter cursor built-ins if any match this pattern

                    // We only want user-installed extensions usually, or at least public ones.
                    // Some 'ms-vscode' might be user installed (e.g. Remote extensions), so we need to be careful.
                    // Use extensionKind or packageJSON.isBuiltin if reliable. 
                    // For now, let's trust the 'builtin' flag if it exists, otherwise fallback to prefix specific exclusions 
                    // that are definitely internal.
                    
                    // Actually, 'isBuiltin' is not a standard public API property on packageJSON in types.
                    // We can check `ext.extensionKind` but that's about where it runs.
                    
                    // Let's stick to the previous logic but refine it.
                    // Exclude 'vscode.' which are definitely bundled keys.
                    // Exclude 'pub.name' if it looks like a system theme or language feature not from marketplace.
                    
                    return !ext.id.startsWith('vscode.') &&
                           !ext.id.startsWith('ms-vscode.js-debug') && // internal debugger
                           !ext.id.startsWith('ms-vscode.references-view'); // internal
                })
                .map(ext => ({
                    id: ext.id,
                    version: ext.packageJSON.version,
                    displayName: ext.packageJSON.displayName,
                    publisher: ext.packageJSON.publisher,
                    description: ext.packageJSON.description
                }));

            // Ask for save location
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(process.env.HOME || '', 'vscode-extensions.json')),
                filters: {
                    'JSON': ['json']
                }
            });

            if (uri) {
                const exportData = {
                    meta: {
                        exportedAt: new Date().toISOString(),
                        source: vscode.env.appName
                    },
                    extensions: extensionList
                };
                
                // Save the extensions list to a file
                fs.writeFileSync(uri.fsPath, JSON.stringify(exportData, null, 2));
                vscode.window.showInformationMessage(`Successfully exported ${extensionList.length} extensions to ${uri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error exporting extensions: ${error}`);
        }
    });

    // Register the import command
    let importCommand = vscode.commands.registerCommand('vscode-extension-manager.importExtensions', async () => {
        try {
            // Open file picker for the extensions JSON file
            const uri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON': ['json']
                }
            });

            if (uri && uri[0]) {
                // Read the extensions list
                const fileContent = fs.readFileSync(uri[0].fsPath, 'utf8');
                const data = JSON.parse(fileContent);
                
                // Handle both old format (array) and new format (object with extensions property)
                const extensions = Array.isArray(data) ? data : data.extensions;

                if (!Array.isArray(extensions)) {
                    throw new Error('Invalid extensions file format');
                }

                // Show quick pick to confirm installation
                const confirmation = await vscode.window.showQuickPick(
                    ['Yes', 'No'],
                    { placeHolder: `Install ${extensions.length} extensions?` }
                );

                if (confirmation === 'Yes') {
                    // Determine CLI command
                    const config = vscode.workspace.getConfiguration('extensionManager');
                    let cliCommand = config.get<string>('cliCommand') || 'auto';
                    let cliPath = cliCommand;

                    if (cliCommand === 'auto') {
                        try {
                            const appRoot = vscode.env.appRoot;
                            const binDir = path.join(appRoot, 'bin');
                            
                            // Check if bin directory exists (it should in standard installs)
                            if (fs.existsSync(binDir)) {
                                const files = fs.readdirSync(binDir);
                                
                                // Look for potential CLI candidates.
                                // Exclude 'code-tunnel', helpers, etc. if we can identify them.
                                // Common names: code, code.cmd, cursor, cursor.cmd, codium, codium.cmd
                                
                                // Heuristic: valid CLIs usually don't have dashes (except maybe code-insiders) or match app name.
                                // Let's filter for known patterns or simply take the one that matches appName best.
                                const appName = vscode.env.appName || '';
                                
                                // Find best match
                                let bestMatch = '';
                                const candidates = files.filter(f => {
                                    return !f.startsWith('.') && // no hidden files
                                           !f.includes('tunnel'); // exclude tunnel
                                });

                                if (candidates.length > 0) {
                                    // 1. Try to find exact match for known editors
                                    const match = candidates.find(f => {
                                        const base = path.parse(f).name.toLowerCase();
                                        return appName.toLowerCase().includes(base);
                                    });
                                    
                                    if (match) {
                                        bestMatch = match;
                                    } else {
                                        // 2. Fallback to 'code' or 'cursor' if present
                                        const codeOrCursor = candidates.find(f => {
                                            const name = path.parse(f).name.toLowerCase();
                                            return name === 'code' || name === 'cursor' || name === 'codium';
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
                                console.warn('Bin directory not found at', binDir);
                            }
                        } catch (e) {
                            console.error('Failed to resolve CLI path dynamically:', e);
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
                        vscode.window.showInformationMessage('All extensions are already installed.');
                        return;
                    }

                    // Install extensions
                    const terminal = vscode.window.createTerminal('Extension Installer');
                    terminal.show();
                    
                    terminal.sendText(`echo "Starting installation of ${extensionsToInstall.length} extensions..."`);
                    terminal.sendText(`echo "Using command: ${cliPath}"`);

                    // Construct the command. 
                    // We can pass multiple --install-extension arguments to the code CLI to do it in one go (or fewer batches).
                    const BATCH_SIZE = 10; 
                    for (let i = 0; i < extensionsToInstall.length; i += BATCH_SIZE) {
                        const batch = extensionsToInstall.slice(i, i + BATCH_SIZE);
                        const commandParts = [cliPath];
                        
                        batch.forEach((ext: any) => {
                             const extensionId = ext.id; 
                             commandParts.push('--install-extension');
                             commandParts.push(extensionId);
                        });

                        terminal.sendText(commandParts.join(' '));
                    }

                    vscode.window.showInformationMessage(`Installing ${extensionsToInstall.length} new extensions. Check the terminal for progress.`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error importing extensions: ${error}`);
        }
    });

    context.subscriptions.push(exportCommand, importCommand);
}

export function deactivate() {}
