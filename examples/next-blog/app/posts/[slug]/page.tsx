import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import { renderRichText } from '@easy-cms/richtext'
import { notFound } from 'next/navigation'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  // Logged-in editors can preview drafts: access rules decide, drafts included for them.
  const user = await getEasyCMSUser(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    overrideAccess: false,
    user,
    draft: user !== null,
  })
  const post = docs[0]
  if (!post) notFound()
  const cover = typeof post.cover === 'object' && post.cover ? post.cover : null
  return (
    <article>
      {post.status === 'draft' ? (
        <p>
          <strong>Draft preview</strong>
        </p>
      ) : null}
      {/* biome-ignore lint/performance/noImgElement: CMS media URLs; next/image would need remotePatterns */}
      {cover ? <img src={cover.url} alt={cover.alt ?? ''} className="cover" /> : null}
      <h1>{post.title}</h1>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: renderRichText escapes text and drops unsafe URLs */}
      <div className="body" dangerouslySetInnerHTML={{ __html: renderRichText(post.body) }} />
    </article>
  )
}
