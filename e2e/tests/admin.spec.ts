import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'

const ADMIN = { email: 'admin@e2e.test', password: 'admin-password-1' }
const EDITOR = { email: 'editor@e2e.test', password: 'editor-password-1' }
const SHOTS = process.env.E2E_SCREENSHOTS
const PHOTO = fileURLToPath(new URL('../fixtures/photo.png', import.meta.url))

// Tests build on each other: the first creates the admin, later ones use its content.
test.describe.configure({ mode: 'serial' })

// Any uncaught error in the page fails the test.
let pageErrors: string[] = []
test.beforeEach(({ page }) => {
  pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
})
test.afterEach(() => {
  expect(pageErrors, 'uncaught errors in the page').toEqual([])
})

async function english(page: Page) {
  await page.addInitScript(() => localStorage.setItem('easy-cms-locale', 'en'))
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

test('shows Thai by default and asks for the first admin (FR-ADM-02, FR-ADM-11)', async ({
  page,
}) => {
  await page.goto('/admin/')
  await expect(page).toHaveURL(/\/admin\/setup$/)
  await expect(page.getByRole('heading', { name: 'สร้างผู้ดูแลระบบคนแรก' })).toBeVisible()
  await shot(page, '01-setup-th')

  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Create the first admin' })).toBeVisible()
  await page.getByLabel('Name').fill('Ada Admin')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Create admin' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Welcome, Ada Admin')).toBeVisible()
  await shot(page, '02-dashboard')
})

test.describe('logged in as admin', () => {
  test.beforeEach(async ({ page }) => {
    await english(page)
    await login(page, ADMIN)
  })

  test('redirects to login after logout and rejects a wrong password (FR-ADM-01)', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)
    await page.goto('/admin/collections/posts')
    await expect(page).toHaveURL(/\/admin\/login\?redirect=/)
    await page.getByLabel('Email').fill(ADMIN.email)
    await page.getByLabel('Password').fill('wrong password')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
    await page.getByLabel('Password').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    // Back where we were going.
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible()
  })

  test('shows collections and globals in the sidebar (FR-ADM-03)', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const name of ['Users', 'Media', 'Categories', 'Posts', 'Site']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }
  })

  test('creates documents with every kind of input (FR-ADM-05/06/07/10, FR-RTX)', async ({
    page,
  }) => {
    // A category to relate to.
    await page.goto('/admin/collections/categories/new')
    await page.getByLabel('Name').fill('Guides')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Created')

    await page.goto('/admin/collections/posts')
    await page.getByRole('link', { name: 'Create new' }).click()
    await expect(page.getByRole('heading', { name: 'Create Post' })).toBeVisible()

    // Server-side validation errors appear on the field.
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByRole('status')).toHaveText('Please fix the highlighted fields.')
    const title = page.getByRole('textbox', { name: 'Title', exact: true })
    await expect(title).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('is required')).toBeVisible()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('x')
    await expect(page.getByText('is required')).toHaveCount(0)

    await title.fill('Hello from Playwright')
    await page.getByLabel('Excerpt').fill('Written by an end-to-end test.')

    // Rich text: type, then bold a word with the toolbar.
    const editor = page.locator('.rte-content')
    await editor.click()
    await page.keyboard.type('Rich ')
    await page.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type('bold')
    await page.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type(' text.')
    await expect(editor.locator('strong')).toHaveText('bold')

    // Relationship picker: search and choose.
    await page.getByLabel('Category').fill('Gui')
    await page.getByRole('option', { name: 'Guides' }).click()
    await expect(page.getByRole('link', { name: 'Guides' })).toBeVisible()

    await page.getByRole('checkbox', { name: 'nuxt' }).check()
    await page.getByRole('checkbox', { name: 'thai' }).check()
    await page.getByLabel('Published at').fill('2026-09-01T10:30')
    await shot(page, '03-post-form')

    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
    await expect(page).toHaveURL(/\/admin\/collections\/posts\/\d+$/)
    await expect(page.getByText('Published', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Slug')).toHaveValue('hello-from-playwright')

    // Reload: everything was stored.
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
      'Hello from Playwright',
    )
    await expect(page.locator('.rte-content strong')).toHaveText('bold')
    await expect(page.getByRole('link', { name: 'Guides' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'thai' })).toBeChecked()

    // The public site shows it.
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Hello from Playwright' })).toBeVisible()
  })

  test('saves drafts that the public site does not show (FR-ADM-07)', async ({ page }) => {
    await page.goto('/admin/collections/posts/new')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Secret draft')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
    await expect(page.getByText('Draft', { exact: true })).toBeVisible()
    await page.goto('/')
    await expect(page.getByText('Secret draft')).toHaveCount(0)
  })

  test('uploads to the media library and uses a file as a cover (FR-UPL, FR-ADM-09)', async ({
    page,
  }) => {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Media' })
      .click()
    await page.getByLabel('Upload files').setInputFiles(PHOTO)
    await expect(page.getByText('Uploaded 1 file(s)')).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: /photo-[0-9a-f]{8}\.png/ })
    await expect(row.locator('img')).toBeVisible()
    await shot(page, '05-media-library')

    // Alt text is editable; file metadata is not.
    await row.getByRole('link').click()
    await expect(page.locator('.thumb.large img')).toBeVisible()
    await expect(page.getByText(/640 × 360 px/)).toBeVisible()
    await page.getByLabel('Alternative text').fill('A green circle')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')

    // Pick it as the cover of the published post.
    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    await page.getByRole('button', { name: 'Choose from media library' }).click()
    const picker = page.getByRole('dialog', { name: 'Choose a file' })
    await picker.getByRole('button', { name: 'A green circle' }).click()
    await expect(picker).toBeHidden()
    await expect(page.getByRole('link', { name: 'A green circle' })).toBeVisible()

    // Insert the same image into the body from the toolbar.
    await page.locator('.rte-content').click()
    await page.keyboard.press('End')
    await page.getByRole('button', { name: 'Image' }).click()
    await picker.getByRole('button', { name: 'A green circle' }).click()
    await expect(page.locator('.rte-content img')).toHaveAttribute('alt', 'A green circle')
    await shot(page, '06-post-with-media')

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')

    await page.goto('/')
    const cover = page.getByRole('img', { name: 'A green circle' })
    await expect(cover).toBeVisible()
    await expect(cover).toHaveAttribute('src', /\/api\/cms\/media\/file\/photo-[0-9a-f]{8}\.png$/)
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    await expect(page.locator('.body img')).toHaveAttribute('alt', 'A green circle')
  })

  test('unpublishes and republishes (FR-DRF-05)', async ({ page }) => {
    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    await page.getByRole('button', { name: 'Unpublish' }).click()
    await expect(page.getByRole('status')).toHaveText('Unpublished')
    await expect(page.getByText('Draft', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible()

    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Hello from Playwright' })).toHaveCount(0)

    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('Published', { exact: true })).toBeVisible()
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Hello from Playwright' })).toBeVisible()
  })

  test('lists, searches, sorts and bulk-deletes (FR-ADM-04)', async ({ page }) => {
    for (const title of ['Alpha note', 'Beta note', 'Gamma note']) {
      await page.goto('/admin/collections/posts/new')
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title)
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect(page.getByRole('status')).toHaveText('Created')
    }
    await page.goto('/admin/collections/posts')
    await expect(page.getByRole('row')).toHaveCount(6) // header + 5 posts
    await shot(page, '04-list')

    await page.getByPlaceholder('Search Title').fill('note')
    await expect(page.getByRole('row')).toHaveCount(4)
    await expect(page).toHaveURL(/q=note/)

    await page.getByRole('button', { name: /^Title/ }).click()
    await expect(page.getByRole('row').nth(1)).toContainText('Alpha note')
    await page.getByRole('button', { name: /^Title/ }).click()
    await expect(page.getByRole('row').nth(1)).toContainText('Gamma note')

    await page.getByRole('checkbox', { name: 'Select Alpha note' }).check()
    await page.getByRole('checkbox', { name: 'Select Beta note' }).check()
    await expect(page.getByText('2 selected')).toBeVisible()
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('row')).toHaveCount(2)
    await expect(page.getByRole('row').nth(1)).toContainText('Gamma note')
  })

  test('deletes from the edit page and warns about unsaved changes (FR-ADM-08)', async ({
    page,
  }) => {
    await page.goto('/admin/collections/posts?q=Gamma')
    await page.getByRole('link', { name: 'Gamma note' }).click()
    await expect(page.getByRole('heading', { name: 'Gamma note' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Gamma note (edited)')

    // Leaving with unsaved changes asks first; dismissing stays on the page.
    page.once('dialog', (dialog) => dialog.dismiss())
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Categories' })
      .click()
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
      'Gamma note (edited)',
    )

    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/posts$/)
    await expect(page.getByRole('link', { name: /Gamma note/ })).toHaveCount(0)
  })

  test('edits a global', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Site' }).click()
    await page.getByLabel('Tagline').fill('Tested end to end')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')
    await page.goto('/')
    await expect(page.getByText('Tested end to end')).toBeVisible()
  })

  test('creates an editor account', async ({ page }) => {
    await page.goto('/admin/collections/users/new')
    await page.getByLabel('Email').fill(EDITOR.email)
    await page.getByLabel('Name').fill('Eddie Editor')
    await page.getByLabel('Role').selectOption('editor')
    await page.getByLabel('Password').fill(EDITOR.password)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
  })
})

test.describe('logged in as editor', () => {
  test.beforeEach(async ({ page }) => {
    await english(page)
    await login(page, EDITOR)
  })

  test('hides actions the editor may not take (FR-ACL-06)', async ({ page }) => {
    await page.goto('/admin/collections/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create new' })).toHaveCount(0)

    await page.getByRole('link', { name: ADMIN.email }).click()
    await expect(page.getByText('You can view but not change this document.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  })

  test('changes their own password (FR-ADM-13)', async ({ page }) => {
    await page.getByRole('link', { name: /Account/ }).click()
    await page.getByLabel('Change password').fill('a-brand-new-password')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toHaveText('Password changed')
    // Still logged in with the new cookie.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
    await page.getByRole('button', { name: 'Log out' }).click()
    await login(page, { email: EDITOR.email, password: 'a-brand-new-password' })
  })
})
