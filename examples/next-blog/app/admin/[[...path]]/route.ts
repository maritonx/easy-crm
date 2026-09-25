import { createAdminRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'

// The Easy CMS admin UI at /admin (admin.path in the config).
export const { GET, HEAD } = createAdminRouteHandlers(config)
