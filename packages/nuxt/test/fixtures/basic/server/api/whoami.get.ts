export default defineEventHandler(async (event) => {
  const user = await useEasyCMSUser(event)
  return { email: user?.email ?? null }
})
