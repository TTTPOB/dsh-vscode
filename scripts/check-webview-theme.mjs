import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

// Run from an isolated CI directory containing Playwright, without changing the extension dependencies.
const source = await readFile(resolve(process.argv[2]), 'utf8')
const javascript = stripTypeScriptTypes(source)
const { chatHtml } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)
const outputDirectory = resolve(process.argv[3])
await mkdir(outputDirectory, { recursive: true })
const html = chatHtml({ cspSource: 'https://example.invalid' }, { toString: () => 'mark.svg' }, {
  script: { toString: () => 'markdown.js' }, style: { toString: () => 'markdown.css' },
})
const css = /<style nonce="[^"]+">([\s\S]*?)<\/style>/.exec(html)?.[1]
assert.ok(css, 'Generated webview must contain its theme stylesheet')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 420 } })
  // Deliberately disagree with the VS Code theme to catch native system-theme fallback.
  for (const osScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: osScheme })
    for (const [theme, scheme] of [
      ['vscode-dark', 'dark'], ['vscode-light', 'light'],
      ['vscode-high-contrast', 'dark'], ['vscode-high-contrast-light', 'light'],
    ]) {
      for (const dropdownTokens of [true, false]) {
        const dark = scheme === 'dark'
        const background = dark ? '#282a36' : '#ffffff'
        const foreground = dark ? '#f8f8f2' : '#202020'
        await page.setContent(`<style>${css}</style><style>
          body { --vscode-foreground: ${foreground}; --vscode-editor-background: ${background};
            --vscode-sideBar-background: ${background}; --vscode-descriptionForeground: ${foreground};
            --vscode-font-family: sans-serif;
            ${dropdownTokens ? `--vscode-dropdown-background: ${dark ? '#44475a' : '#eeeeee'}; --vscode-dropdown-foreground: ${foreground};` : ''}
          }
        </style><body class="${theme}">
          <select id="models" class="model-select"><option>GPT-5.6 Sol</option><option>DeepSeek-V4-Pro</option></select>
          <select id="efforts" class="effort-select"><option>Medium</option><option>High</option></select>
          <select class="preset-select"><option>Standard mode</option><option>Plan mode</option></select>
        </body>`)
        const styles = await page.locator('select').evaluateAll(selects => selects.map(select => {
          const option = getComputedStyle(select.options[0])
          return { scheme: getComputedStyle(select).colorScheme, background: option.backgroundColor, foreground: option.color }
        }))
        const expectedBackground = dropdownTokens
          ? dark ? 'rgb(68, 71, 90)' : 'rgb(238, 238, 238)'
          : dark ? 'rgb(40, 42, 54)' : 'rgb(255, 255, 255)'
        assert.equal(styles.length, 3)
        for (const style of styles) {
          assert.equal(style.scheme, scheme, `${theme} on OS ${osScheme}`)
          assert.equal(style.background, expectedBackground)
          assert.equal(style.foreground, dark ? 'rgb(248, 248, 242)' : 'rgb(32, 32, 32)')
        }
        // Exercise the native model select's keyboard interaction as well as its computed styles.
        await page.locator('#models').focus()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        assert.equal(await page.locator('#models').inputValue(), 'DeepSeek-V4-Pro')
        if (theme === 'vscode-dark' && osScheme === 'light' && dropdownTokens) {
          await page.locator('#models').evaluate(select => { select.size = 2 })
          await page.screenshot({ path: resolve(outputDirectory, 'dracula-options.png') })
        }
      }
    }
  }
  console.log('Passed: 16 theme/OS/token combinations, all three native selects, and keyboard selection.')
} finally {
  await browser.close()
}
