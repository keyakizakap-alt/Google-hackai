/**
 * 信頼できない文字列（修正指示・カレンダーの予定名・貼り付けた文章など）を
 * プロンプトのタグの中に入れる前に、タグとして読めない形にする。
 *
 * `<user_instruction>…</user_instruction>` で囲んでも、本文に `</user_instruction>` と書かれると
 * 囲みを抜け出して「システム側の文章」のように見せかけられる。タグの記号を置き換えて、
 * 囲みの外へ出られないようにする（プロンプトインジェクション対策）。
 */

/** 文字の向きを変える制御文字・ゼロ幅文字など、見た目と中身をずらす文字 */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/** 文章として埋め込む場合。< > を全角に置き換える（読み手のモデルには意味が通じる） */
export function fenceText(input: string): string {
  return input.replace(INVISIBLE, "").replace(/</g, "＜").replace(/>/g, "＞");
}

/** JSON として埋め込む場合。値の意味は変えずに < > を Unicode エスケープする */
export function fenceJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(INVISIBLE, "")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}
