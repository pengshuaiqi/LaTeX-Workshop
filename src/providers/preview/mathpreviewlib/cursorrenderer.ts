import { latexParser } from 'latex-utensils'
import * as vscode from 'vscode'

import type { Extension } from '../../../main'
import { TexMathEnv } from './texmathenvfinder'
import type { ITextDocumentLike } from './textdocumentlike'

export class CursorRenderer {
    private readonly extension: Extension
    private currentTeXString: string | undefined
    private currentAst: latexParser.LatexAst | undefined

    constructor(extension: Extension) {
        this.extension = extension
    }

    // Test whether cursor is in tex command strings
    // like \begin{...} \end{...} \xxxx{ \[ \] \( \) or \\
    isCursorInTeXCommand(document: ITextDocumentLike): boolean {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return false
        }
        const cursor = editor.selection.active
        const r = document.getWordRangeAtPosition(cursor, /\\(?:begin|end|label)\{.*?\}|\\[a-zA-Z]+\{?|\\[()[\]]|\\\\/)
        if (r && r.start.isBefore(cursor) && r.end.isAfter(cursor) ) {
            return true
        }
        return false
    }

    getContentRange(node: latexParser.Node): vscode.Range | undefined {
        if (latexParser.hasContentArray(node) && node.content.length > 0) {
            const sloc = node.content[0].location
            const eloc = node.content[node.content.length-1].location
            if (sloc && eloc) {
                const start = { line: sloc.start.line - 1, character: sloc.start.column - 1 }
                const end = { line: eloc.end.line - 1, character: eloc.end.column - 1 }
                return new vscode.Range(start.line, start.character, end.line, end.character)
            } else {
                return
            }
        }
        if (latexParser.isSubscript(node) || latexParser.isSuperscript(node)) {
            const start = { line: node.location.start.line - 1, character: node.location.start.column }
            const end = { line: node.location.end.line - 1, character: node.location.end.column - 1 }
            return new vscode.Range(start.line, start.character, end.line, end.character)
        } else {
            if (node.location) {
                const start = { line: node.location.start.line - 1, character: node.location.start.column - 1 }
                const end = { line: node.location.end.line - 1, character: node.location.end.column - 1 }
                return new vscode.Range(start.line, start.character, end.line, end.character)
            } else {
                return
            }
        }
    }

    cursorPosInSnippet(texMath: TexMathEnv, cursorPos: vscode.Position): { line: number, character: number } {
        const line = cursorPos.line - texMath.range.start.line
        const character = line === 0 ? cursorPos.character - texMath.range.start.character : cursorPos.character
        return {line, character}
    }

    isInAmsMathTextCommand(findResult: latexParser.FindResult<latexParser.Node, latexParser.Node> | undefined): boolean {
        let parent = findResult?.parent
        while (parent) {
            if (latexParser.isAmsMathTextCommand(parent.node)) {
                return true
            }
            parent = parent.parent
        }
        return false
    }

    async insertCursor(texMath: TexMathEnv, cursorPos: vscode.Position, cursor: string): Promise<string> {
        const cursorPosInSnippet = this.cursorPosInSnippet(texMath, cursorPos)
        const arry = texMath.texString.split('\n')
        const findResult = await this.findNodeAt(texMath, cursorPos)
        const cursorNode = findResult?.node
        if (this.isInAmsMathTextCommand(findResult)){
            return texMath.texString
        }
        if (cursorNode) {
            if (latexParser.isCommand(cursorNode)) {
                return texMath.texString
            }
        }
        if (!cursorNode || !cursorNode.location) {
            const {line, character} = this.cursorPosInSnippet(texMath, cursorPos)
            const curLine = arry[line]
            arry[line] = curLine.substring(0, character) + cursor + curLine.substring(character, curLine.length)
            return arry.join('\n')
        }
        const cursorNodeContentRangeInSnippet = this.getContentRange(cursorNode)
        if (!cursorNodeContentRangeInSnippet) {
            return texMath.texString
        }
        const nodeStart = cursorNodeContentRangeInSnippet.start
        const nodeEnd = cursorNodeContentRangeInSnippet.end
        const line = cursorPosInSnippet.line
        const curLine = arry[line]
        arry[line] =
        curLine.substring(0, nodeStart.character)
        + (curLine[nodeStart.character - 1] === '{' ? '~' : '{~')
        + curLine.substring(nodeStart.character, cursorPosInSnippet.character)
        + cursor
        + curLine.substring(cursorPosInSnippet.character, nodeEnd.character)
        + (curLine[nodeEnd.character] === '}' ? '~' : '~}')
        + curLine.substring(nodeEnd.character, curLine.length)
        return arry.join('\n')
    }

    async findNodeAt(texMath: TexMathEnv, cursorPos: vscode.Position) {
        let ast: latexParser.LatexAst | undefined
        if (texMath.texString === this.currentTeXString && this.currentAst) {
            ast = this.currentAst
        } else {
            ast = await this.extension.pegParser.parseLatex(texMath.texString, {enableMathCharacterLocation: true})
            this.currentAst = ast
            this.currentTeXString = texMath.texString
        }
        if (!ast) {
            return
        }
        const cursorPosInSnippet = this.cursorPosInSnippet(texMath, cursorPos)
        const cursorLocInSnippet = {line: cursorPosInSnippet.line + 1, column: cursorPosInSnippet.character + 1}
        const result = latexParser.findNodeAt(ast.content, cursorLocInSnippet)
        return result
    }

    async renderCursor(document: ITextDocumentLike, texMath: TexMathEnv, thisColor: string): Promise<string> {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const cursorEnabled = configuration.get('hover.preview.cursor.enabled') as boolean
        if (!cursorEnabled) {
            return texMath.texString
        }
        const texMathRange = texMath.range
        const cursorPos = vscode.window.activeTextEditor?.selection.active
        if (!cursorPos) {
            return texMath.texString
        }
        if (!this.isCursorInsideTexMath(texMathRange, cursorPos)) {
            return texMath.texString
        }
        if (this.isCursorInTeXCommand(document)) {
            return texMath.texString
        }
        const symbol = configuration.get('hover.preview.cursor.symbol') as string
        const color = configuration.get('hover.preview.cursor.color') as string
        const cursorString = color === 'auto' ? `{\\color{${thisColor}}${symbol}}` : `{\\color{${color}}${symbol}}`
        return this.insertCursor(texMath, cursorPos, cursorString)
    }

    isCursorInsideTexMath(texMathRange: vscode.Range, cursorPos: vscode.Position): boolean {
        return texMathRange.contains(cursorPos) && !texMathRange.start.isEqual(cursorPos) && !texMathRange.end.isEqual(cursorPos)
    }

}
