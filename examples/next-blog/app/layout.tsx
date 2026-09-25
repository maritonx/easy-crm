import { getEasyCMS } from '@easy-cms/next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import config from '@/easy-cms.config'
import './globals.css'

// Every page reads from the CMS at request time; nothing is prerendered at build.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const cms = await getEasyCMS(config)
  const site = await cms.findGlobal('site')
  return { title: site.siteName ?? 'Blog' }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cms = await getEasyCMS(config)
  const site = await cms.findGlobal('site')
  return (
    <html lang="en">
      <body>
        <div className="page">
          <header>
            <Link href="/" className="brand">
              {site.siteName}
            </Link>
            {site.tagline ? <p>{site.tagline}</p> : null}
          </header>
          <main>{children}</main>
          <footer>
            Powered by Easy CMS · <a href="/api/cms/posts">REST API</a>
          </footer>
        </div>
      </body>
    </html>
  )
}
