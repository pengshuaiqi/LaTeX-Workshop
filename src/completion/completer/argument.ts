import * as vscode from 'vscode'
import { lw } from '../../lw'
import { EnvSnippetType } from '../../types'
import type { CompletionArgs, CompletionProvider } from '../../types'
import { CmdEnvSuggestion, filterArgumentHint } from './completerutils'

export const provider: CompletionProvider = { from }

function from(result: RegExpMatchArray, args: CompletionArgs) {
    if (result[1] === 'usepackage') {
        return providePackageOptions(args.line)
    }
    if (result[1] === 'documentclass') {
        return provideClassOptions(args.line)
    }
    const index = getArgumentIndex(result[2])
    const packages = lw.completer.package.getPackagesIncluded(args.langId)
    let candidate: CmdEnvSuggestion | undefined
    let environment: string | undefined
    if (result[1] === 'begin') {
        environment = result[2].match(/{(.*?)}/)?.[1]
    }
    for (const packageName of Object.keys(packages)) {
        if (environment) {
            const environments = lw.completion.environment.getEnvFromPkg(packageName, EnvSnippetType.AsCommand) || []
            for (const env of environments) {
                if (environment !== env.signature.name) {
                    continue
                }
                if (index !== env.keyvalpos + 1) { // Start from one.
                    continue
                }
                candidate = env
            }
        } else {
            const commands = lw.completion.macro.getPackageCmds(packageName)
            for (const command of commands) {
                if (result[1] !== command.signature.name) {
                    continue
                }
                if (index !== command.keyvalpos) {
                    continue
                }
                candidate = command
                break
            }
        }
        if (candidate !== undefined) {
            break
        }
    }
    const suggestions = candidate?.keyvals?.map(option => {
        const item = new vscode.CompletionItem(option, vscode.CompletionItemKind.Constant)
        item.insertText = new vscode.SnippetString(option)
        return item
    }) || []

    filterArgumentHint(suggestions)

    return suggestions
}

function providePackageOptions(line: string): vscode.CompletionItem[] {
    const regex = /\\usepackage.*{(.*?)}/
    const match = line.match(regex)
    if (!match) {
        return []
    }
    lw.completer.loadPackageData(match[1])
    const suggestions = lw.completer.package.getPackageOptions(match[1])
        .map(option => {
            const item = new vscode.CompletionItem(option, vscode.CompletionItemKind.Constant)
            item.insertText = new vscode.SnippetString(option)
            return item
        })

    filterArgumentHint(suggestions)

    return suggestions
}

function provideClassOptions(line: string): vscode.CompletionItem[] {
    const regex = /\\documentclass.*{(.*?)}/s
    const match = line.match(regex)
    if (!match) {
        return []
    }
    const isDefaultClass = ['article', 'report', 'book'].includes(match[1])
    lw.completer.loadPackageData(isDefaultClass ? 'latex-document' : `class-${match[1]}`)
    const suggestions = lw.completer.package.getPackageOptions(isDefaultClass ? 'latex-document' : `class-${match[1]}`)
        .map(option => {
            const item = new vscode.CompletionItem(option, vscode.CompletionItemKind.Constant)
            item.insertText = new vscode.SnippetString(option)
            return item
        })

    filterArgumentHint(suggestions)

    return suggestions
}

function getArgumentIndex(argstr: string) {
    let argumentIndex = 0
    let curlyLevel = argstr[0] === '{' ? 1 : 0
    let squareLevel = argstr[0] === '[' ? 1 : 0
    for (let index = 1; index < argstr.length; index++) {
        if (argstr[index-1] === '\\') {
            continue
        }
        switch (argstr[index]) {
            case '{':
                curlyLevel++
                break
            case '[':
                squareLevel++
                break
            case '}':
                curlyLevel--
                if (curlyLevel === 0 && squareLevel === 0) {
                    argumentIndex++
                }
                break
            case ']':
                squareLevel--
                if (curlyLevel === 0 && squareLevel === 0) {
                    argumentIndex++
                }
                break
            default:
                break
        }
    }
    return argumentIndex
}
