import { test, expect } from '@playwright/test'

test('shows the English LFOS launcher', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'ONLYOFFICE for LFOS' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New or open a file' })).toBeVisible()
})
