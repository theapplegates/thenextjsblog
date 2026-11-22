import { expect, test } from '@playwright/test'

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('redirects to the posts page', async ({ page }) => {
    await expect(page).toHaveURL(/\/post$/)
    await expect(page).toHaveTitle(/All Posts/)
    await expect(page.getByRole('heading', { name: 'Sabertaz Blog', level: 1 })).toBeVisible()
  })

  test('navigates to posts page', async ({ page }) => {
    const postsLink = page.getByRole('link', { name: /post/i })
    await postsLink.click()
    await expect(page).toHaveURL(/\/post/)
  })
})
