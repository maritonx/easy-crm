// One post by slug. Logged-in editors can preview drafts: the request's user is passed
// to the Local API so the collection's read access decides.
export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  const user = await useEasyCMSUser(event)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: getRouterParam(event, 'slug') } },
    limit: 1,
    overrideAccess: false,
    user,
  })
  const post = docs[0]
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  return post
})
