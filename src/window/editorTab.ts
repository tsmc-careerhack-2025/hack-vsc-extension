import { v4 as uuidv4 } from "uuid";
import { postData, ApiResponse } from '../utils/web-api';
import { hackPanel } from '../panels/default';
import * as vscode from "vscode";

const convertPrompt: string = 'convert this java code to python code, or vice versa if it is a python code';
const optmizePrompt: string = 'optmize this code to improve the performance';
const upgradePrompt: string = 'upgrade this java code to newer version, or upgrade this python code to newer version. Depend on the original file type';

let prompt: string = '';

export async function showEditorTab(
  context: vscode.ExtensionContext,
  endPoint: string,
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
      vscode.window.showErrorMessage("沒有開啟任何檔案！");
      return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText) {
      vscode.window.showWarningMessage("請先選取一段程式碼！");
      return;
  }

  if (endPoint == 'convert') {
    prompt = convertPrompt;
  } else if (endPoint == 'upgrade') {
    prompt = upgradePrompt;
  } else if (endPoint == 'optmize') {
    prompt = optmizePrompt;
  }

  console.log(`selectedText: ${selectedText}`);

  hackPanel.updatePanel({state: 'loading'});

  const response = await postData<ApiResponse>(endPoint, { code: selectedText, prompt: prompt });
  
  hackPanel.updatePanel({state: "code", data: {task: endPoint}});

  const suggestedEdit = await response.code;

  console.log(`suggestedEdit: ${suggestedEdit}`)

  let tempDocId = context.workspaceState.get<string>("tempDocId");
  let tempDocUri = context.workspaceState.get<string>("tempDocUri");
  let tempDoc: vscode.TextDocument;

  if (tempDocUri) {
      const existingDocs = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === tempDocUri);
      if (existingDocs) {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(existingDocs.uri, new vscode.Range(0, 0, existingDocs.lineCount, 0), suggestedEdit);
          await vscode.workspace.applyEdit(edit);
          tempDoc = existingDocs;
      } else {
          tempDoc = await createNewTempDoc(suggestedEdit, editor.document.languageId);
          context.workspaceState.update("tempDocId", uuidv4());
          context.workspaceState.update("tempDocUri", tempDoc.uri.toString());
      }
  } else {
      tempDoc = await createNewTempDoc(suggestedEdit, editor.document.languageId);
      context.workspaceState.update("tempDocId", uuidv4());
      context.workspaceState.update("tempDocUri", tempDoc.uri.toString());
  }

  const tempEditor = await vscode.window.showTextDocument(tempDoc, vscode.ViewColumn.Beside);

  context.subscriptions.push(
      vscode.commands.registerCommand("hack-vsc-extension.applySuggestedEdit", async () => {
          const modifiedEditor = vscode.window.visibleTextEditors.find(
              (e) => e.document.uri.toString() === tempDoc.uri.toString()
          );
          
          if (!modifiedEditor) {
              vscode.window.showErrorMessage("未找到建議修改的 Editor！");
              return;
          }

          const modifiedText = modifiedEditor.document.getText();


          const res = await editor.edit((editBuilder) => {
              editBuilder.delete(editor.selection);
              editBuilder.insert(editor.selection.start, modifiedText);
          });

          await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");

          vscode.commands.executeCommand("setContext", "showApplyEditButton", false);
          vscode.window.showInformationMessage("已成功套用修改！");

          context.workspaceState.update("tempDocId", undefined);
          context.workspaceState.update("tempDocUri", undefined);
      })
  );

  vscode.commands.executeCommand("setContext", "showApplyEditButton", true);
};

async function createNewTempDoc(content: string, languageId: string): Promise<vscode.TextDocument> {
    return await vscode.workspace.openTextDocument({ 
        language: languageId, 
        content 
    });
}
