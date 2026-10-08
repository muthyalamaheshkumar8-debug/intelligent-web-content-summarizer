import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'

test.beforeEach(async ({ context }, testInfo) => {
  // Every browser workflow has an independent rate-limit identity, including
  // worker restarts. Keep the production limiter active in the test server.
  const bytes = createHash('sha256').update(testInfo.testId).digest()
  await context.setExtraHTTPHeaders({
    'X-Forwarded-For': `10.${bytes[0]}.${bytes[1]}.${bytes[2]}`,
  })
})

async function summarize(page, url = 'https://example.com/article') {
  await page.getByLabel('Article URL', { exact: true }).fill(url)
  await page.getByRole('button', { name: 'Summarize article' }).click()
  await expect(page.getByRole('heading', { name: 'Building thoughtful software', exact: true })).toBeVisible()
}

test('complete reading workflow, actual SSE, browser reload, copy, download and deletion', async ({ page, context }) => {
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.getByText('Live updates connected')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Make room for the big ideas.' })).toBeVisible()
  await page.getByLabel('Article URL', { exact: true }).fill('https://example.com/article')
  await page.getByRole('button', { name: 'Summarize article' }).click()
  await expect(page.getByRole('heading', { name: 'Reading the article' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Building thoughtful software', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'example.com' })).toHaveAttribute('href', 'https://example.com/article')
  await expect(page.locator('.takeaways li')).toHaveCount(3)
  await page.getByRole('button', { name: 'Copy summary', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Key takeaways')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe('article-summary.txt')
  await page.reload()
  await expect(page.locator('.history-item')).toHaveCount(1)
  await page.locator('.history-item').click()
  await expect(page.getByRole('heading', { name: 'Building thoughtful software', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Keep summary' }).click()
  await expect(page.getByRole('heading', { name: 'Building thoughtful software', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete summary', exact: true }).click()
  await expect(page.locator('.history-item')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('private history, library navigation and search', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Live updates connected')).toBeVisible()
  await summarize(page)
  await page.getByRole('button', { name: 'My library' }).click()
  await expect(page.getByRole('heading', { name: 'Your summary library' })).toBeVisible()
  await page.getByRole('searchbox').fill('missing topic')
  await expect(page.getByRole('heading', { name: 'No matching summaries' })).toBeVisible()
  await page.getByRole('searchbox').fill('software')
  await expect(page.locator('.history-item')).toHaveCount(1)
  await context.clearCookies()
  await page.reload()
  await expect(page.getByText('Live updates connected')).toBeVisible()
  await expect(page.locator('.history-item')).toHaveCount(0)
})

test('provider outage shows a labelled source summary, including after reload and copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByLabel('Article URL', { exact: true }).fill('https://example.com/outage')
  await page.getByRole('button', { name: 'Summarize article' }).click()
  await expect(page.getByRole('heading', { name: 'Provider outage article', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Source-based summary:' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.takeaways li')).toHaveCount(1)
  await page.reload()
  await page.locator('.history-item').click()
  await expect(page.getByRole('status').filter({ hasText: 'Source-based summary:' })).toBeVisible()
  await page.getByRole('button', { name: 'Copy summary', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Source-based summary:')
})

test('upstream failure and retry, live history synchronization between tabs', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Live updates connected')).toBeVisible()
  await page.getByLabel('Article URL', { exact: true }).fill('https://example.com/protected')
  await page.getByRole('button', { name: 'Summarize article' }).click()
  await expect(page.getByRole('alert')).toContainText('This page is protected.')
  await expect(page.getByRole('button', { name: 'Summarize article' })).toBeEnabled()
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByText('Live updates connected')).toBeVisible()
  await summarize(page)
  await expect(second.locator('.history-item')).toHaveCount(1)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const [width, height] of [[1440, 960], [768, 1024], [390, 844]]) {
  test(`responsive layout at ${width}px has no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByText('Live updates connected')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
    await summarize(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
    await page.screenshot({ path: `test-results/workspace-${width}.png`, fullPage: true })
  })
}

test('keyboard focus and reduced motion remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.getByLabel('Article URL', { exact: true }).focus()
  await page.keyboard.type('https://example.com/article')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Building thoughtful software', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Summary result' })).toBeFocused()
})


test('workspace and generated summary meet automated WCAG A/AA checks', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Live updates connected')).toBeVisible()
  const scan = () => new AxeBuilder({ page }).setLegacyMode(true).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect((await scan()).violations).toEqual([])
  await summarize(page)
  expect((await scan()).violations).toEqual([])
})
