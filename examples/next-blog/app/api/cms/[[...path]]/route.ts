import { createRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'

// The Easy CMS REST API at /api/cms (routes.api in the config).
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config)
