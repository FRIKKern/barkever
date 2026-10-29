import {expect, test} from '@playwright/test'
import {ACCOUNT, SESSION_FILE} from './account'

test('sign in as the test account and keep its session for the specs', async ({page}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2F$/)
  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByLabel('Password').fill(ACCOUNT.password)
  await page.getByRole('button', {name: 'Sign in'}).click()
  await expect(page.getByTestId('note-row').first()).toBeVisible()
  await page.context().storageState({path: SESSION_FILE})
})
