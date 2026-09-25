import { getEasyCMS } from '@easy-cms/next'
import Link from 'next/link'
import config from '@/easy-cms.config'

// Always render with fresh content from the CMS.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const cms = await getEasyCMS(config)
  // The Local API returns only published posts by default.
  const { docs: posts } = await cms.find('posts', { sort: '-publishedAt', limit: 20 })
  if (posts.length === 0) {
    return (
      <p>
        No posts yet. Run <code>pnpm seed</code>.
      </p>
    )
  }
  return (
    <section>
      {posts.map((post) => {
        const cover = typeof post.cover === 'object' && post.cover ? post.cover : null
        const category = typeof post.category === 'object' && post.category ? post.category : null
        return (
          <article key={String(post.id)}>
            {/* biome-ignore lint/performance/noImgElement: CMS media URLs; next/image would need remotePatterns */}
            {cover ? <img src={cover.url} alt={cover.alt ?? ''} className="cover" /> : null}
            <h2>
              <Link href={`/posts/${post.slug}`}>{post.title}</Link>
            </h2>
            {category ? <small>{category.name}</small> : null}
            <p>{post.excerpt}</p>
          </article>
        )
      })}
    </section>
  )
}
