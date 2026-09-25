// Published posts, newest first. The Local API skips access rules, so filter explicitly.
export default defineEventHandler(async () => {
  const cms = await useEasyCMS()
  const { docs } = await cms.find('posts', {
    where: { status: { equals: 'published' } },
    sort: '-publishedAt',
    limit: 20,
  })
  return docs.map((post) => ({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    publishedAt: post.publishedAt,
    category: typeof post.category === 'object' ? post.category?.name : null,
  }))
})
