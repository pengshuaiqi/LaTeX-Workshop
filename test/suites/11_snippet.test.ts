import * as vscode from 'vscode'
import * as path from 'path'
import * as assert from 'assert'
import * as test from './utils'
import { SurroundCommand } from '../../src/providers/completer/commandlib/surround'
import { ICompletionItem } from '../../src/providers/completion'
import { DocumentChanged } from '../../src/components/eventbus'

suite('Snippet test suite', () => {

    const suiteName = path.basename(__filename).replace('.test.js', '')
    const fixtureName = 'testground'

    suiteSetup(async () => {
        await vscode.commands.executeCommand('latex-workshop.activate')
    })

    teardown(async () => {
        await test.reset()
    })

    test.run(suiteName, fixtureName, '#3716 Too many braces', async (fixture: string) => {
        await test.load(fixture, [
            {src: 'base.tex', dst: 'main.tex'}
        ], {skipCache: true, open: 0})
        const active = vscode.window.activeTextEditor
        assert.ok(active)
        active.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 1))
        const items: ICompletionItem[] = [{
            label: '\\fbox{}',
            detail: '\\fbox{${1:${TM_SELECTED_TEXT:text}}}',
            documentation: 'Command \\fbox{}.',
            filterText: 'fbox{}',
            insertText: new vscode.SnippetString('fbox{${1:${TM_SELECTED_TEXT:text}}}'),
            kind: 2
        }]
        SurroundCommand.surround(items)
        const promise = test.wait(DocumentChanged)
        await test.sleep(500)
        await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
        await vscode.commands.executeCommand('editor.action.formatDocument')
        await promise
        const changed = vscode.window.activeTextEditor?.document.getText()
        assert.ok(changed?.includes('\\fbox{a}bc'))
    })
})
