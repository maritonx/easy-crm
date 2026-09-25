// Uses the Local API from a host-app route; `useEasyCMS` is auto-imported.
export default defineEventHandler(async () => {
  const cms = await useEasyCMS()
  const { docs } = await cms.find('posts', {
    where: { status: { equals: 'published' } },
    sort: 'title',
  })
  return docs.map((post) => post.title)
})
