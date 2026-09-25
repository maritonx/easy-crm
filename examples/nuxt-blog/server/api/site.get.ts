export default defineEventHandler(async () => {
  const cms = await useEasyCMS()
  return cms.findGlobal('site')
})
