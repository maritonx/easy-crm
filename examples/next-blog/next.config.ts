import { withEasyCMS } from '@easy-cms/next/config'
import type { NextConfig } from 'next'

// Typed like create-next-app's template, so the example also checks that withEasyCMS accepts it.
const nextConfig: NextConfig = {}

export default withEasyCMS(nextConfig)
