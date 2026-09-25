// Test-only: creates an admin and two posts through the Local API.
export default defineEventHandler(async () => {
  const cms = await useEasyCMS()
  if ((await cms.count('users')) === 0) {
    await cms.create('users', {
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin',
    })
    await cms.create('posts', { title: 'Hello Nuxt', status: 'published' })
    await cms.create('posts', { title: 'Secret draft' })
  }
  return { ok: true }
})
